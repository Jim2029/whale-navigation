// background.js - 初始化管理员预置数据 + 插件图标点击行为

// 点击插件图标时，打开导航主页（新标签页）；若已打开则直接聚焦
const NAV_PAGE = chrome.runtime.getURL("pages/popup.html");

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: NAV_PAGE });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: NAV_PAGE });
  }
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
