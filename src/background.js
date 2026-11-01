// background.js - 初始化管理员预置数据 + 插件图标点击行为

// 导航主页地址
const NAV_PAGE = chrome.runtime.getURL("pages/popup.html");

// 打开导航主页（新标签页）；若已打开则直接聚焦。
// pendingLink：可选，收藏来源的 { title, url, favicon }；autoBookmark：是否让导航页自动弹出收藏弹窗
async function openNavPage(pendingLink, autoBookmark) {
  const hasPendingLink = Boolean(pendingLink && pendingLink.url);
  const { navTabId } = await chrome.storage.local.get("navTabId");
  if (navTabId != null) {
    try {
      const tab = await chrome.tabs.get(navTabId);
      if (tab && tab.id != null) {
        if (hasPendingLink) {
          await chrome.storage.local.set({ _pendingLink: pendingLink, _autoBookmark: false });
        }
        await chrome.tabs.update(navTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        if (hasPendingLink) {
          await chrome.storage.local.set({ _autoBookmark: !!autoBookmark });
        }
        return;
      }
    } catch (e) { /* 标签已关闭，重新创建 */ }
  }
  const tab = await chrome.tabs.create({ url: NAV_PAGE });
  const state = { navTabId: tab.id };
  if (hasPendingLink) {
    state._pendingLink = pendingLink;
    state._autoBookmark = !!autoBookmark;
  }
  await chrome.storage.local.set(state);
}

// 从标签页读取网站标准名称（og:site_name / application-name）
async function extractSiteNameFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const og = document.querySelector('meta[property="og:site_name"]');
        if (og && og.content && og.content.trim()) return og.content.trim();
        const app = document.querySelector('meta[name="application-name"]');
        if (app && app.content && app.content.trim()) return app.content.trim();
        return '';
      }
    });
    if (results && results[0] && results[0].result) return results[0].result;
  } catch (e) { /* 忽略：无权限或页面不可访问 */ }
  return '';
}

// 捕获当前活动标签页（若非扩展页面本身）
async function captureCurrentTab() {
  try {
    const [curTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const extUrl = chrome.runtime.getURL("");
    if (curTab && curTab.url && !curTab.url.startsWith(extUrl)) {
      const siteName = await extractSiteNameFromTab(curTab.id);
      return { title: curTab.title || "", url: curTab.url, favicon: curTab.favIconUrl || "", siteName };
    }
  } catch (e) { /* 忽略：无标签页或权限不足 */ }
  return null;
}

// 点击插件图标：打开导航主页（清除可能残留的收藏标记，避免误弹注册/收藏框）
chrome.action.onClicked.addListener(async () => {
  await chrome.storage.local.remove(["_autoBookmark", "_pendingLink"]);
  await openNavPage(null, false);
});

// 右键菜单标题（跟随插件内切换的语言）
const CONTEXT_MENU_TITLES = {
  zh_CN: "收藏到鲸波导航",
  en: "Save to Whale Navigation",
  ja: "くじらナビに保存",
  ko: "웨일 내비게이션에 저장",
  es: "Guardar en Navegación Ballena",
  ar: "حفظ في ملاحة الحوت",
  id: "Simpan ke Navigasi Paus"
};

function getContextMenuTitle(lang) {
  return CONTEXT_MENU_TITLES[lang] || CONTEXT_MENU_TITLES.zh_CN;
}

// 更新右键菜单标题（语言切换后调用）
async function updateContextMenuTitle(lang) {
  try {
    await chrome.contextMenus.update("save-to-nav", { title: getContextMenuTitle(lang) });
  } catch (e) { /* 菜单不存在则忽略 */ }
}

// 右键菜单：收藏到导航（安装时创建，标题跟随插件语言）
chrome.runtime.onInstalled.addListener(async () => {
  const { uiLanguage } = await chrome.storage.local.get("uiLanguage");
  chrome.contextMenus.create({
    id: "save-to-nav",
    title: getContextMenuTitle(uiLanguage || "zh_CN"),
    contexts: ["page", "link", "selection"]
  });
});

// 语言切换时同步更新右键菜单标题
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.uiLanguage && changes.uiLanguage.newValue) {
    updateContextMenuTitle(changes.uiLanguage.newValue);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-nav") return;
  const url = info.linkUrl || info.pageUrl;
  const title = info.selectionText || tab.title || "";
  const siteName = await extractSiteNameFromTab(tab.id);
  await openNavPage({ title, url, favicon: tab.favIconUrl || "", siteName }, true);
});

// 快捷键：收藏当前页到导航
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-to-nav") return;
  const pending = await captureCurrentTab();
  if (pending) await openNavPage(pending, true);
});

// 从 data/adminData.json 加载预置数据
async function loadDefaultAdminData() {
  try {
    const url = chrome.runtime.getURL("data/adminData.json");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to fetch: " + resp.status);
    const data = await resp.json();
    console.log(`加载预置数据完成: ${data.categories.length} 个分类, ${data.links.length} 条网址`);
    return data;
  } catch (err) {
    console.error("加载预置数据失败:", err);
    // 返回最小兜底数据
    return {
      categories: [{
        id: "cat_01",
        name: chrome.i18n.getMessage("defaultCategory") || "Default",
        icon: "🌐",
        order: 1
      }],
      links: []
    };
  }
}

// 确保预置数据存在（安装、浏览器启动、数据被清除后都会检查）
async function ensureAdminData() {
  const existing = await chrome.storage.local.get("adminData");
  let adminData = existing.adminData || { categories: [], links: [] };
  let shouldSave = false;

  if (!Array.isArray(adminData.categories) || adminData.categories.length === 0) {
    const defaultData = await loadDefaultAdminData();
    const merged = mergePresetData(adminData, defaultData);
    adminData = merged.data;
    shouldSave = merged.categoriesAdded > 0 || merged.linksAdded > 0;
  }

  const deduped = dedupePublicLinks(adminData);
  if (deduped.removed > 0) {
    adminData = deduped.data;
    shouldSave = true;
    console.log(`已清理 ${deduped.removed} 条跨分类重复网址`);
  }

  if (shouldSave) {
    await chrome.storage.local.set({ adminData });
    console.log("初始化或整理管理员数据完成");
  }
}

function mergePresetData(current, preset) {
  const data = {
    ...current,
    categories: Array.isArray(current.categories) ? [...current.categories] : [],
    links: Array.isArray(current.links) ? [...current.links] : []
  };
  const categoryIds = new Set(data.categories.map(category => category.id));
  const addedCategoryIds = new Set();

  for (const category of (preset.categories || [])) {
    if (categoryIds.has(category.id)) continue;
    data.categories.push(category);
    categoryIds.add(category.id);
    addedCategoryIds.add(category.id);
  }

  const publicUrls = new Set(
    data.links
      .filter(link => link.categoryId !== "cat_personal")
      .map(link => publicUrlKey(link.url))
  );
  let linksAdded = 0;
  for (const link of (preset.links || [])) {
    if (!addedCategoryIds.has(link.categoryId)) continue;
    const key = publicUrlKey(link.url);
    if (publicUrls.has(key)) continue;
    data.links.push(link);
    publicUrls.add(key);
    linksAdded++;
  }

  return {
    data,
    categoriesAdded: addedCategoryIds.size,
    linksAdded
  };
}

function dedupePublicLinks(data) {
  const seen = new Set();
  const links = [];
  let removed = 0;

  for (const link of (data.links || [])) {
    if (link.categoryId === "cat_personal") {
      links.push(link);
      continue;
    }

    const key = publicUrlKey(link.url);
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    links.push(link);
  }

  return { data: { ...data, links }, removed };
}

function publicUrlKey(raw) {
  const value = String(raw || "").trim();
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return host + path + url.search;
  } catch (e) {
    return value;
  }
}

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAdminData();
});

// 浏览器启动时也检查（应对本地数据被清除的情况）
chrome.runtime.onStartup.addListener(async () => {
  await ensureAdminData();
});

// 监听来自页面的消息：强制重新加载预置数据
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "reloadAdminData") {
    Promise.all([
      chrome.storage.local.get("adminData"),
      loadDefaultAdminData()
    ]).then(([stored, preset]) => {
      const current = stored.adminData || { categories: [], links: [] };
      const merged = mergePresetData(current, preset);
      return chrome.storage.local.set({ adminData: merged.data }).then(() => {
        sendResponse({
          success: true,
          categories: merged.data.categories.length,
          links: merged.data.links.length,
          categoriesAdded: merged.categoriesAdded,
          linksAdded: merged.linksAdded
        });
      });
    }).catch(error => {
      console.error("合并预置数据失败:", error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // 异步 sendResponse
  }
});
