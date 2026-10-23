// background.js - 初始化管理员预置数据 + 插件图标点击行为

// 导航主页地址
const NAV_PAGE = chrome.runtime.getURL("pages/popup.html");

// 打开导航主页（新标签页）；若已打开则直接聚焦。
// pendingLink：可选，收藏来源的 { title, url, favicon }；autoBookmark：是否让导航页自动弹出收藏弹窗
async function openNavPage(pendingLink, autoBookmark) {
  if (pendingLink && pendingLink.url) {
    await chrome.storage.local.set({ _pendingLink: pendingLink, _autoBookmark: !!autoBookmark });
  }
  const { navTabId } = await chrome.storage.local.get("navTabId");
  if (navTabId != null) {
    try {
      const tab = await chrome.tabs.get(navTabId);
      if (tab && tab.id != null) {
        await chrome.tabs.update(navTabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch (e) { /* 标签已关闭，重新创建 */ }
  }
  const tab = await chrome.tabs.create({ url: NAV_PAGE });
  await chrome.storage.local.set({ navTabId: tab.id });
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

// 右键菜单：收藏到导航
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-nav",
    title: chrome.i18n.getMessage("contextMenuTitle"),
    contexts: ["page", "link", "selection"]
  });
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
      categories: [{ id: "cat_01", name: "默认分类", icon: "🌐", order: 1 }],
      links: []
    };
  }
}

// 确保预置数据存在（安装、浏览器启动、数据被清除后都会检查）
async function ensureAdminData() {
  const existing = await chrome.storage.local.get("adminData");
  if (!existing.adminData || !existing.adminData.categories || existing.adminData.categories.length === 0) {
    const defaultData = await loadDefaultAdminData();
    await chrome.storage.local.set({ adminData: defaultData });
    console.log("初始化管理员数据完成");
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
    loadDefaultAdminData().then(data => {
      chrome.storage.local.set({ adminData: data }).then(() => {
        sendResponse({ success: true, categories: data.categories.length, links: data.links.length });
      });
    });
    return true; // 异步 sendResponse
  }
});
