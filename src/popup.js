// popup.js - 主页面逻辑（含用户系统）

// ─── Theme ──────────────────────────────────────────────────
let currentTheme = "bright";

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  const sel = document.getElementById("themeSelect");
  if (sel) sel.value = theme;
}

async function initTheme() {
  const res = await chrome.storage.local.get("themePreference");
  applyTheme(res.themePreference || "bright");
}

function bindThemeSelect() {
  const sel = document.getElementById("themeSelect");
  if (!sel) return;
  renderThemeOptions();
  sel.addEventListener("change", async () => {
    const theme = sel.value;
    applyTheme(theme);
    await chrome.storage.local.set({ themePreference: theme });
  });
}

// 渲染配色下拉选项（切语言时调用以同步翻译）
function renderThemeOptions() {
  const sel = document.getElementById("themeSelect");
  if (!sel) return;
  const cur = (typeof getCurrentLang === "function") ? getCurrentLang() : "bright";
  const themes = [
    ["bright", "theme_bright"], ["deep", "theme_deep"], ["bamboo", "theme_bamboo"],
    ["sunset", "theme_sunset"], ["ink", "theme_ink"], ["dark", "theme_dark"],
  ];
  sel.innerHTML = `<option value="" disabled selected style="color:#888;">${_t("theme_label", {}, "Theme")}</option>`;
  themes.forEach(([val, key]) => {
    sel.innerHTML += `<option value="${val}" style="color:#222;">${_t(key, {}, key)}</option>`;
  });
  // 不自动设 sel.value，让下拉框默认停留在 "Theme" 提示项
}

// ─── State ─────────────────────────────────────────────────
let adminData = { categories: [], links: [] };
let userLinksData = [];  // 当前用户的个人网址列表
let currentUser = null;  // { username, createdAt }
let currentView = "all";
let searchQuery = "";
let activeCatId = null;
const PERSONAL_CAT_ID = "cat_personal";
let currentEngine = "local";

const SEARCH_ENGINES = {
  local:  { labelKey: "engineLocal",    placeholderKey: "searchPlaceholder",       url: null },
  bing:   { labelKey: "engineBing",     placeholderKey: "bingPlaceholder",         url: q => "https://www.bing.com/search?q=" + encodeURIComponent(q) },
  google: { labelKey: "engineGoogle",   placeholderKey: "googlePlaceholder",       url: q => "https://www.google.com/search?q=" + encodeURIComponent(q) },
};

// ─── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  await loadData();
  // i18n：根据 storage 覆盖或浏览器语言初始化，并把 [data-i18n] 属性挂载到静态元素上
  if (typeof initI18n === "function") {
    await initI18n();
    applyI18n();
  }
  renderUserStatus();
  renderEngineTabs();
  updateSearchPlaceholder();
  updateLogoByLang();

  // 监听语言变化（后台切语言后首页自动同步）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.uiLanguage) {
      // 重新初始化 i18n 并刷新
      if (typeof initI18n === "function") {
        initI18n().then(() => {
          applyI18n();
          renderUserStatus();
          renderEngineTabs();
          updateSearchPlaceholder();
          updateLogoByLang();
          renderSidebar();
          renderContent();
          if (typeof renderThemeOptions === "function") renderThemeOptions();
        });
      }
    }
    // 监听头像变化（后台选头像后自动刷新）
    if (area === "local" && changes.userAvatar) {
      renderUserStatus();
    }
    // 监听个人网址变化（后台导入/删除后自动刷新）
    if (area === "local") {
      for (const key in changes) {
        if (key.startsWith("userLinks_")) {
          // 重新加载个人网址并刷新
          loadUserLinks().then(() => {
            renderSidebar();
            renderContent();
          });
          break;
        }
      }
    }
  });
  renderSidebar();
  renderContent();
  bindEvents();
  bindLangSwitcher();
});

// ─── Language Switcher ─────────────────────────────────────
// 语言 → logo 直接按语言代码取文件 logo-{lang}.png
function updateLogoByLang() {
  const cur = (typeof getCurrentLang === "function") ? getCurrentLang() : "zh_CN";
  const img = document.getElementById("mainLogo");
  // 简体中文用新版 logo
  const logoFile = `logo-${cur}.png`;
  if (img) img.src = `../icons/${logoFile}`;
}

function bindLangSwitcher() {
  const sel = document.getElementById("langSelect");
  if (!sel) return;
  // 下拉框默认显示 "Language" 提示（不自动选当前语言）
  // 用户点开下拉后手动选语言；选完后记住选择，但下拉框仍显示 "Language"
  sel.addEventListener("change", () => {
    const code = sel.value;
    setLanguage(code).then(() => {
      renderUserStatus();
      renderSidebar();
      renderContent();
      renderEngineTabs();
      updateLogoByLang();
      renderThemeOptions();  // 重新渲染配色下拉（同步翻译）
      applyI18n();
    });
  });
}

// 渲染搜索引擎标签（本站检索/必应/Google）
function renderEngineTabs() {
  const tabs = document.getElementById("engineTabs");
  if (!tabs) return;
  tabs.innerHTML = `
    <button class="engine-tab ${currentEngine === "local" ? "active" : ""}" data-engine="local">${_t("engineLocal")}</button>
    <button class="engine-tab ${currentEngine === "bing" ? "active" : ""}" data-engine="bing">${_t("engineBing")}</button>
    <button class="engine-tab ${currentEngine === "google" ? "active" : ""}" data-engine="google">${_t("engineGoogle")}</button>
  `;
  tabs.querySelectorAll(".engine-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      currentEngine = btn.dataset.engine;
      renderEngineTabs();
      updateSearchPlaceholder();
    });
  });
}

function updateSearchPlaceholder() {
  const input = document.getElementById("searchInput");
  const btn = document.getElementById("searchSubmitBtn");
  if (!input) return;
  const eng = SEARCH_ENGINES[currentEngine];
  input.placeholder = _t(eng.placeholderKey);
  btn.textContent = currentEngine === "local" ? _t("searchBtnLocal") : _t("engineLocal");
}

async function loadData() {
  const res = await chrome.storage.local.get(["adminData", "currentUser"]);
  adminData = res.adminData || { categories: [], links: [] };
  currentUser = res.currentUser || null;

  // 本地预置数据缺失（如 storage 被清除）时，向 background 请求恢复
  if (!adminData.categories || adminData.categories.length === 0) {
    try {
      const r = await chrome.runtime.sendMessage({ type: "reloadAdminData" });
      if (r && r.success) {
        const res2 = await chrome.storage.local.get("adminData");
        adminData = res2.adminData || adminData;
      }
    } catch (e) { /* 忽略：background 不可用时保持现状 */ }
  }

  if (currentUser) {
    await loadUserLinks();
  }
}

async function loadUserLinks() {
  if (!currentUser) { userLinksData = []; return; }
  const key = "userLinks_" + currentUser.username;
  const res = await chrome.storage.local.get(key);
  userLinksData = res[key] || [];
}

async function saveUserLinks() {
  if (!currentUser) return;
  const key = "userLinks_" + currentUser.username;
  await chrome.storage.local.set({ [key]: userLinksData });
}

// ─── Auth helpers ───────────────────────────────────────────
function hashPassword(password) {
  // 简单哈希（本地存储足够用）
  let hash = 0;
  const str = password + "_nav_salt_2026";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "h_" + Math.abs(hash).toString(36);
}

// ─── Data helpers ───────────────────────────────────────────
function getVisibleCategories() {
  // 返回所有分类（含个人网址），但个人网址分类仅在登录后显示内容
  return (adminData.categories || []).slice().sort((a, b) => (a.order || 999) - (b.order || 999));
}

function getLinksForView(catId) {
  // 管理员预置网址（排除隐藏的）
  let adminLinks = adminData.links
    .filter(l => !l.hidden)
    .filter(l => !catId || l.categoryId === catId)
    .map(l => ({ ...l, _source: "admin" }));

  // 个人网址分类：未登录时不显示；登录后只显示当前用户自己的
  if (catId === PERSONAL_CAT_ID) {
    if (!currentUser) return [];
    // 只返回当前用户自己添加的个人网址（互不可见）
    return userLinksData
      .filter(l => l.categoryId === PERSONAL_CAT_ID)
      .map(l => ({ ...l, _source: "user" }));
  }

  // 其他分类也可能有用户添加的网址（catId 为空=全部/搜索时，含个人网址）
  if (currentUser) {
    const userCatLinks = userLinksData
      .filter(l => !catId || l.categoryId === catId)
      .map(l => ({ ...l, _source: "user" }));
    adminLinks = [...adminLinks, ...userCatLinks];
  }

  if (currentView === "all")  return adminLinks;
  if (currentView === "mine") {
    if (!currentUser) return [];
    return userLinksData
      .filter(l => !catId || l.categoryId === catId)
      .map(l => ({ ...l, _source: "user" }));
  }
  return [];
}

function filterBySearch(links) {
  if (!searchQuery) return links;
  const q = searchQuery.toLowerCase();
  return links.filter(l =>
    l.title.toLowerCase().includes(q) ||
    l.url.toLowerCase().includes(q) ||
    (l.desc || "").toLowerCase().includes(q)
  );
}

// ─── Render User Status ─────────────────────────────────────
function _t(key, params, fallback) {
  if (typeof t === "function") {
    const v = t(key, params);
    return v === key ? (fallback || v) : v;  // 查不到时返回 fallback
  }
  return fallback || key;
}
async function renderUserStatus() {
  const avatar = document.getElementById("userAvatar");
  const nameEl = document.getElementById("userNameDisplay");
  const adminBtn = document.getElementById("openAdminBtn");

  if (currentUser) {
    // 读用户选择的头像
    const res = await chrome.storage.local.get("userAvatar");
    const avatarFile = res.userAvatar || "";
    
    if (avatarFile) {
      // 显示头像图片
      avatar.textContent = "";
      avatar.style.background = "none";
      avatar.style.backgroundImage = `url(../icons/avatars/${avatarFile})`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    } else {
      // 默认：首字母圆圈
      avatar.textContent = currentUser.username[0].toUpperCase();
      avatar.style.background = "rgba(255,255,255,0.35)";
      avatar.style.backgroundImage = "none";
    }
    nameEl.textContent = currentUser.username;
    adminBtn.disabled = false;
    adminBtn.title = _t("adminBtnTitle");
  } else {
    avatar.textContent = "?";
    avatar.style.background = "rgba(255,255,255,0.4)";
    avatar.style.backgroundImage = "none";
    nameEl.textContent = _t("notLoggedIn");
    adminBtn.disabled = true;
    adminBtn.title = _t("needLogin");
  }
}

// ─── Render Sidebar ─────────────────────────────────────────
function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  const cats = getVisibleCategories();

  let html = `<div class="sidebar-section-title">${_t("sidebarSectionTitle")}</div>`;

  // "全部" item
  const totalLinks = getLinksForView(null);
  const totalFiltered = filterBySearch(totalLinks).length;
  html += `
    <div class="sidebar-item ${!activeCatId ? "active" : ""}" data-catid="">
      <span class="item-icon">🌐</span>
      <span class="item-name">${_t("viewAll")}</span>
      <span class="item-count">${totalFiltered}</span>
    </div>
    <div class="sidebar-divider"></div>`;

  cats.forEach(cat => {
    const links = filterBySearch(getLinksForView(cat.id));
    if (currentView === "mine" && links.length === 0) return;
    const isActive = activeCatId === cat.id;
    const isPersonal = cat.id === PERSONAL_CAT_ID;
    const countDisplay = isPersonal && !currentUser ? "🔒" : links.length;
    // 分类名优先翻译（预置分类），否则用原始名（用户自定义分类）
    const displayName = _t("catName_" + cat.id, {}, cat.name);
    html += `
      <div class="sidebar-item ${isActive ? "active" : ""}" data-catid="${cat.id}">
        <span class="item-icon">${cat.icon || "📁"}</span>
        <span class="item-name">${escHtml(displayName)}</span>
        <span class="item-count">${countDisplay}</span>
      </div>`;
  });

  sidebar.innerHTML = html;

  sidebar.querySelectorAll(".sidebar-item").forEach(el => {
    el.addEventListener("click", () => {
      const cid = el.dataset.catid || null;
      if (cid) {
        const sec = document.getElementById("cat_" + cid);
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveCategory(cid);
      } else {
        setActiveCategory(null);
        document.getElementById("content").scrollTop = 0;
      }
    });
  });
}

function setActiveCategory(id) {
  activeCatId = id;
  document.querySelectorAll(".sidebar-item").forEach(el => {
    const cid = el.dataset.catid || null;
    el.classList.toggle("active", cid === id);
  });
}

// ─── Render Content ─────────────────────────────────────────
function renderContent() {
  const content = document.getElementById("content");
  const cats = getVisibleCategories();
  let hasAny = false;
  let html = "";

  if (searchQuery) {
    const allLinks = filterBySearch(getLinksForView(null));
    if (allLinks.length === 0) {
      html = `<div class="search-empty"><div class="si">🔍</div><p>${_t("noResults", { query: searchQuery })}</p></div>`;
    } else {
      hasAny = true;
      html += `<div class="category-section">
        <div class="category-header">
          <div class="category-title"><span class="cat-icon">🔍</span> ${_t("searchResultsTitle", { count: allLinks.length })}</div>
        </div>
        <div class="link-grid">${allLinks.map(renderCard).join("")}</div>
      </div>`;
    }
  } else {
    cats.forEach(cat => {
      const links = getLinksForView(cat.id);
      const isPersonal = cat.id === PERSONAL_CAT_ID;
      const catDisplayName = _t("catName_" + cat.id, {}, cat.name);

      // 未登录时：个人网址分类仅显示一行紧凑标注
      if (isPersonal && !currentUser) {
        hasAny = true;
        html += `
          <div class="category-section" id="cat_${cat.id}" style="margin-bottom:14px;">
            <div class="category-header" style="margin-bottom:6px;padding-bottom:6px;">
              <div class="category-title">
                <span class="cat-icon">${cat.icon || "📁"}</span>
                ${escHtml(catDisplayName)}
              </div>
            </div>
            <div style="color:var(--text-muted);font-size:13px;padding:0 0 2px;">
              ${_t("personalLoginHint")}
            </div>
          </div>`;
        return;
      }

      if (currentView === "mine" && links.length === 0) return;
      hasAny = true;
      html += `
        <div class="category-section" id="cat_${cat.id}">
          <div class="category-header">
            <div class="category-title">
              <span class="cat-icon">${cat.icon || "📁"}</span>
              ${escHtml(catDisplayName)}
            </div>
            <span style="font-size:12px;color:var(--text-muted);">${_t("linksCount", { count: links.length })}</span>
          </div>
          <div class="link-grid">
            ${links.length ? links.map(renderCard).join("") : `<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">${_t("noLinks")}</p>`}
          </div>
        </div>`;
    });

    if (!hasAny) {
      const emptyKey = currentView === "mine" ? "emptyMine" : "emptyAll";
      html = `<div class="empty-state">
        <div class="empty-icon">🗂️</div>
        <p>${_t(emptyKey)}</p>
      </div>`;
    }
  }

  content.innerHTML = html;
  bindDragSort(content);

  content.querySelectorAll(".link-card").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".link-card-actions")) return;
      const url = el.dataset.url;
      if (!url) return;
      // 用户添加的网址：新标签打开（保留导航页不被覆盖）
      chrome.tabs.create({ url, active: false });
    });
  });

  // Delete user link
  content.querySelectorAll(".btn-del-user").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      userLinksData = userLinksData.filter(l => l.id !== id);
      await saveUserLinks();
      renderSidebar();
      renderContent();
      showToast("已删除");
    });
  });

  renderSidebar();
}

function renderCard(link) {
  // 所有卡片样式完全一致，不区分来源
  return `
    <div class="link-card" data-url="${escAttr(link.url)}" data-id="${link.id}" title="${escAttr(link.url)}">
      <div class="link-title">${escHtml(link.title)}</div>
      ${link.desc ? `<div class="link-desc" title="${escAttr(link.desc)}">${escHtml(link.desc)}</div>` : ""}
    </div>`;
}

// ─── Drag Sort ─────────────────────────────────────────────
function bindDragSort(container) {
  const grids = container.querySelectorAll(".link-grid");
  grids.forEach(grid => {
    let draggedCard = null;

    grid.querySelectorAll(".link-card").forEach(card => {
      card.setAttribute("draggable", "true");

      card.addEventListener("dragstart", (e) => {
        draggedCard = card;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.id);
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        grid.querySelectorAll(".drag-over").forEach(c => c.classList.remove("drag-over"));
        draggedCard = null;
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (card !== draggedCard) card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

      card.addEventListener("drop", async (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (!draggedCard || draggedCard === card) return;

        const dragId = draggedCard.dataset.id;
        const dropId = card.dataset.id;

        // 优先在 userLinksData 中排序
        await reorderUserLinks(dragId, dropId);
        // 再尝试 adminData
        await reorderAdminLinks(dragId, dropId);

        renderContent();
      });
    });
  });
}

async function reorderUserLinks(dragId, dropId) {
  const dragIdx = userLinksData.findIndex(l => l.id === dragId);
  const dropIdx = userLinksData.findIndex(l => l.id === dropId);
  if (dragIdx === -1 || dropIdx === -1) return;
  const [moved] = userLinksData.splice(dragIdx, 1);
  userLinksData.splice(dropIdx, 0, moved);
  await saveUserLinks();
}

async function reorderAdminLinks(dragId, dropId) {
  const links = adminData.links;
  const dragIdx = links.findIndex(l => l.id === dragId);
  const dropIdx = links.findIndex(l => l.id === dropId);
  if (dragIdx === -1 || dropIdx === -1) return;
  const [moved] = links.splice(dragIdx, 1);
  links.splice(dropIdx, 0, moved);
  await chrome.storage.local.set({ adminData });
}

// ─── Events ─────────────────────────────────────────────────
function bindEvents() {
  // View tabs
  document.querySelectorAll(".view-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".view-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentView = tab.dataset.view;
      activeCatId = null;
      renderSidebar();
      renderContent();
    });
  });

  // Search
  const searchInputEl = document.getElementById("searchInput");
  searchInputEl.addEventListener("input", (e) => {
    if (currentEngine !== "local") return;
    searchQuery = e.target.value.trim();
    renderSidebar();
    renderContent();
  });

  // Search engine tabs
  const engineTabs = document.getElementById("engineTabs");
  const searchSubmitBtn = document.getElementById("searchSubmitBtn");
  engineTabs.querySelectorAll(".engine-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentEngine = tab.dataset.engine;
      engineTabs.querySelectorAll(".engine-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const engine = SEARCH_ENGINES[currentEngine];
      searchSubmitBtn.textContent = currentEngine === "local" ? "本站检索" : engine.label + "搜索";
      searchInputEl.placeholder = engine.placeholder;
      // 离开本站模式时清空搜索结果
      if (currentEngine !== "local" && searchQuery) {
        searchQuery = "";
        renderSidebar();
        renderContent();
      }
    });
  });

  // Search submit button
  searchSubmitBtn.addEventListener("click", () => {
    const query = searchInputEl.value.trim();
    if (!query) return;
    if (currentEngine === "local") {
      searchQuery = query;
      renderSidebar();
      renderContent();
    } else {
      const urlFn = SEARCH_ENGINES[currentEngine].url;
      if (urlFn) window.location.href = urlFn(query);  // 当前标签导航
    }
  });

  // Enter key search
  searchInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = searchInputEl.value.trim();
      if (!query) return;
      if (currentEngine === "local") {
        searchQuery = query;
        renderSidebar();
        renderContent();
      } else {
        const urlFn = SEARCH_ENGINES[currentEngine].url;
        if (urlFn) window.location.href = urlFn(query);  // 当前标签导航
      }
    }
  });

  // Admin button —— 复用已有后台标签，避免重复开标签
  document.getElementById("openAdminBtn").addEventListener("click", async () => {
    if (!currentUser) { showToast(_t("needLogin")); return; }
    const adminUrl = chrome.runtime.getURL("pages/admin.html");
    const tabs = await chrome.tabs.query({ url: adminUrl });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: adminUrl, active: true });
    }
  });

  bindThemeSelect();

  // User status -> open auth or show menu
  document.getElementById("userStatusBtn").addEventListener("click", () => {
    if (currentUser) {
      if (confirm(_t("logoutConfirmCurrent", {}) + "：" + currentUser.username + "\n\n" + _t("logoutConfirm"))) {
        doLogout();
      }
    } else {
      openAuthModal();
    }
  });

  // FAB -> open add modal (需要登录)
  document.getElementById("fabBtn").addEventListener("click", () => {
    if (!currentUser) { openAuthModal(); return; }
    openAddModal();
  });
  document.getElementById("cancelAdd").addEventListener("click", closeAddModal);
  document.getElementById("confirmAdd").addEventListener("click", saveUserLink);
  document.getElementById("addModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("addModal")) closeAddModal();
  });

  // Auth modal events
  bindAuthEvents();
}

// ─── Auth ───────────────────────────────────────────────────
function openAuthModal() {
  document.getElementById("authModal").classList.add("show");
  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginError").textContent = "";
  document.getElementById("regUsername").value = "";
  document.getElementById("regPassword").value = "";
  document.getElementById("regPassword2").value = "";
  document.getElementById("registerError").textContent = "";
  switchAuthTab("login");
  document.getElementById("loginUsername").focus();
}

function closeAuthModal() {
  document.getElementById("authModal").classList.remove("show");
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.auth === tab));
  document.getElementById("authPanelLogin").classList.toggle("active", tab === "login");
  document.getElementById("authPanelRegister").classList.toggle("active", tab === "register");
}

function bindAuthEvents() {
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => switchAuthTab(tab.dataset.auth));
  });
  document.getElementById("cancelAuth").addEventListener("click", closeAuthModal);
  document.getElementById("cancelAuth2").addEventListener("click", closeAuthModal);
  document.getElementById("authModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("authModal")) closeAuthModal();
  });
  document.getElementById("doLogin").addEventListener("click", doLogin);
  document.getElementById("doRegister").addEventListener("click", doRegister);
  // Enter 键提交
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("regPassword2").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doRegister();
  });
}

async function doLogin() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");

  if (!username) { errEl.textContent = "请输入用户名"; return; }
  if (!password) { errEl.textContent = "请输入密码"; return; }

  const res = await chrome.storage.local.get("accounts");
  const accounts = res.accounts || {};
  const account = accounts[username];

  if (!account) { errEl.textContent = "用户不存在"; return; }
  if (account.passwordHash !== hashPassword(password)) { errEl.textContent = "密码错误"; return; }

  currentUser = { username: account.username, createdAt: account.createdAt };
  await chrome.storage.local.set({ currentUser });
  await loadUserLinks();

  closeAuthModal();
  renderUserStatus();
  renderSidebar();
  renderContent();
  showToast("✅ 欢迎回来，" + currentUser.username);
}

async function doRegister() {
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;
  const password2 = document.getElementById("regPassword2").value;
  const errEl = document.getElementById("registerError");

  if (!username || username.length < 3 || username.length > 20) {
    errEl.textContent = "用户名需要3-20个字符"; return;
  }
  if (/[^a-zA-Z0-9_\u4e00-\u9fff]/.test(username)) {
    errEl.textContent = "用户名只允许中文、字母、数字和下划线"; return;
  }
  if (!password || password.length < 6) {
    errEl.textContent = "密码至少6位"; return;
  }
  if (password !== password2) {
    errEl.textContent = "两次密码不一致"; return;
  }

  const res = await chrome.storage.local.get("accounts");
  const accounts = res.accounts || {};
  if (accounts[username]) { errEl.textContent = "用户名已被注册"; return; }

  accounts[username] = {
    username,
    passwordHash: hashPassword(password),
    createdAt: Date.now()
  };
  await chrome.storage.local.set({ accounts });

  // 自动登录
  currentUser = { username, createdAt: accounts[username].createdAt };
  await chrome.storage.local.set({ currentUser });
  await loadUserLinks();

  closeAuthModal();
  renderUserStatus();
  renderSidebar();
  renderContent();
  showToast("✅ 注册成功，已自动登录");
}

async function doLogout() {
  currentUser = null;
  userLinksData = [];
  await chrome.storage.local.remove("currentUser");
  renderUserStatus();
  renderSidebar();
  renderContent();
  showToast("已退出登录");
}

// ─── Add user link modal ─────────────────────────────────────
function openAddModal() {
  if (!currentUser) { openAuthModal(); return; }

  const cats = getVisibleCategories();
  const sel = document.getElementById("addCategory");
  sel.innerHTML = cats.map(c =>
    `<option value="${c.id}">${c.icon || ""} ${escHtml(c.name)}</option>`
  ).join("");
  if (activeCatId) sel.value = activeCatId;

  document.getElementById("addTitle").value = "";
  document.getElementById("addUrl").value = "";
  document.getElementById("addDesc").value = "";
  document.getElementById("addModal").classList.add("show");
  document.getElementById("addTitle").focus();
}

function closeAddModal() {
  document.getElementById("addModal").classList.remove("show");
}

async function saveUserLink() {
  if (!currentUser) { showToast("请先登录"); return; }

  const title = document.getElementById("addTitle").value.trim();
  const url   = document.getElementById("addUrl").value.trim();
  const desc  = document.getElementById("addDesc").value.trim();
  const catId = document.getElementById("addCategory").value;

  if (!title) { showToast("请输入标题"); return; }
  if (!url)   { showToast("请输入网址"); return; }
  if (!isValidUrlForCat(url, catId)) {
    if (catId === PERSONAL_CAT_ID) {
      showToast("请输入有效的地址（http/https 网址、file:/// 本地网页、或本地文件路径）");
    } else {
      showToast("请输入有效的网址（以 http/https 开头）");
    }
    return;
  }

  userLinksData.push({
    id: "ul_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    categoryId: catId,
    title, url: normalizeUrl(url), desc,
    createdAt: Date.now()
  });
  await saveUserLinks();

  closeAddModal();
  renderSidebar();
  renderContent();
  showToast("✅ 已添加到我的导航");
}

// ─── Utils ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}
function isValidUrl(str) {
  try { return /^https?:\/\//.test(str) && Boolean(new URL(str)); } catch { return false; }
}

/**
 * 将用户输入的地址统一标准化：
 * - file:///... 或 http(s)://... → 原样返回
 * - Windows 本地路径（如 D:\foo\bar.html）→ 转为 file:///D:/foo/bar.html
 * - 其他路径（如 /home/user/file）→ 转为 file:///home/user/file
 */
function normalizeUrl(raw) {
  if (/^(https?|file):\/\//.test(raw)) return raw;
  // Windows 路径：C:\xxx 或 D:/xxx
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    return "file:///" + raw.replace(/\\/g, "/");
  }
  // 绝对 Unix 路径或相对路径
  return "file:///" + raw;
}

/**
 * 根据分类验证网址/地址有效性：
 * - 个人网址分类：允许 http(s)、file:///、Windows 本地路径
 * - 其他分类：仅允许 http(s)
 */
function isValidUrlForCat(str, catId) {
  if (!str) return false;
  // 通用：http/https
  if (isValidUrl(str)) return true;
  // 个人网址分类：允许 file:/// 和本地文件路径
  if (catId === PERSONAL_CAT_ID) {
    // file:/// 协议
    if (/^file:\/\/\//.test(str)) {
      try { new URL(str); return true; } catch { return false; }
    }
    // Windows 本地路径：盘符开头
    if (/^[A-Za-z]:[\\/]/.test(str)) return true;
    // Unix 绝对路径
    if (str.startsWith("/") && str.length > 2) return true;
  }
  return false;
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// Track active section on scroll
document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");
  if (!content) return;
  content.addEventListener("scroll", () => {
    const sections = content.querySelectorAll(".category-section[id]");
    let current = null;
    sections.forEach(sec => {
      const top = sec.getBoundingClientRect().top - content.getBoundingClientRect().top;
      if (top <= 20) current = sec.id.replace("cat_", "");
    });
    if (current) setActiveCategory(current);
    else if (content.scrollTop < 10) setActiveCategory(null);
  });
});
