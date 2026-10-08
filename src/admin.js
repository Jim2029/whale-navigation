// admin.js - 管理员后台逻辑（含登录验证 + 显示/隐藏 + i18n）

let adminData = { categories: [], links: [] };
let editingLinkId = null;
let currentUser = null;
let userLinksData = [];  // 当前用户的个人网址（按用户隔离）

const PERSONAL_CAT_ID = "cat_personal";

// ─── 个人网址读写（按用户隔离）──────────────────────────────
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

// ─── i18n helper ────────────────────────────────────────────
function _t(key, params, fallback) {
  if (typeof t === "function") {
    const v = t(key, params);
    return v === key ? (fallback || v) : v;
  }
  return fallback || key;
}

// 分类名显示：预置分类走翻译，用户自建分类用原始名
function _catName(cat) {
  if (!cat) return "";
  return _t("catName_" + cat.id, {}, cat.name);
}

// 后台表格里的网址链接：新标签打开（保留后台页）
function adminOpenLink(url) {
  if (!url) return;
  chrome.tabs.create({ url, active: false });
}

// Force LTR layout on this page regardless of language (Arabic stays LTR per spec).
function _forceLTR() {
  try { document.documentElement.setAttribute('dir', 'ltr'); } catch (e) {}
}

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

// ─── Lang selector ─────────────────────────────────────────
// 语言 → logo 直接按语言代码取文件 logo-{lang}.png
function updateLogoByLang() {
  const cur = (typeof getCurrentLang === "function") ? getCurrentLang() : "zh_CN";
  const img = document.getElementById("mainLogo");
  // 简体中文用新版 logo
  const logoFile = `logo-${cur}.png`;
  if (img) img.src = `../icons/${logoFile}`;
}

function initLangSelect() {
  const sel = document.getElementById("langSelect");
  if (!sel) return;
  const langs = (window.LANGS || (typeof LANGS !== "undefined" ? LANGS : []));
  const prompt = `<option value="" disabled selected style="color:#888;">Language</option>`;
  sel.innerHTML = prompt + langs.map(l => `<option value="${l.code}">${l.label}</option>`).join("");
  // 不自动设 sel.value，让下拉框默认显示 "Language"
  sel.addEventListener("change", async () => {
    const code = sel.value;
    if (typeof setLanguage === "function") await setLanguage(code);
    _forceLTR();
    updateLogoByLang();
    renderThemeOptions();  // 重新渲染配色下拉（同步翻译）
    if (typeof applyI18n === "function") applyI18n();
    _forceLTR();
    renderAll();
    renderAdminHeader();
  });
}

// ─── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  // Wait for i18n init if present
  if (typeof initI18n === "function") {
    try { await initI18n(); } catch (e) {}
  }
  _forceLTR();
  initLangSelect();
  bindThemeSelect();
  updateLogoByLang();
  if (typeof applyI18n === "function") applyI18n();
  _forceLTR();

  currentUser = (await chrome.storage.local.get("currentUser")).currentUser || null;

  if (!currentUser) {
    showLoginPage();
    return;
  }

  await loadUserLinks();  // 加载当前用户的个人网址
  
  // 迁移旧数据：把 adminData.links 中 categoryId=cat_personal 的旧数据迁移到 userLinksData
  const oldPersonalLinks = adminData.links.filter(l => l.categoryId === PERSONAL_CAT_ID);
  if (oldPersonalLinks.length > 0) {
    // 加入到 userLinksData（去重）
    const existingUrls = new Set(userLinksData.map(l => l.url));
    oldPersonalLinks.forEach(l => {
      if (!existingUrls.has(l.url)) {
        userLinksData.push({ ...l });
        existingUrls.add(l.url);
      }
    });
    // 从全局 adminData.links 中删除
    adminData.links = adminData.links.filter(l => l.categoryId !== PERSONAL_CAT_ID);
    await saveUserLinks();
    await saveAdminData();
    console.log(`已迁移 ${oldPersonalLinks.length} 条旧个人网址数据到用户隔离存储`);
  }
  
  await initAdmin();

  // 监听语言/头像变化（前台切语言后后台自动同步）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.uiLanguage) {
      if (typeof initI18n === "function") {
        initI18n().then(() => {
          applyI18n();
          _forceLTR();
          updateLogoByLang();
          if (typeof renderThemeOptions === "function") renderThemeOptions();
          if (currentUser) { renderAll(); renderAdminHeader(); }
        });
      }
    }
    if (changes.userAvatar && currentUser) {
      // 头像变化时无需刷新后台（后台不显示用户头像）
    }
  });
});

async function initAdmin() {
  await loadAdminData();
  renderAll();
  bindNavEvents();
  bindCategoryEvents();
  bindLinksEvents();
  bindBatchEvents();
  bindEditModal();
  bindAuthEvents();
  renderAdminHeader();
}

// ─── Login Page ──────────────────────────────────────────────
function showLoginPage() {
  document.querySelector(".admin-body").style.display = "none";
  document.getElementById("editModal").style.display = "none";

  let loginOverlay = document.getElementById("adminLoginOverlay");
  if (!loginOverlay) {
    loginOverlay = document.createElement("div");
    loginOverlay.id = "adminLoginOverlay";
    loginOverlay.style.cssText = "display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 58px);flex:1;";
    loginOverlay.innerHTML = `
      <div class="form-card" style="text-align:center;padding:40px;width:360px;">
        <div style="font-size:36px;margin-bottom:12px;">🔐</div>
        <h2 style="font-size:18px;margin-bottom:20px;color:var(--text-primary);" data-i18n="login_title">请先登录</h2>
        <div style="margin-bottom:14px;">
          <input id="adminLoginUser" class="form-input" data-i18n-placeholder="login_username_ph" placeholder="用户名" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-color);border-radius:8px;font-size:14px;outline:none;background:var(--bg-input);color:var(--text-primary);" />
        </div>
        <div style="margin-bottom:14px;">
          <input id="adminLoginPass" class="form-input" type="password" data-i18n-placeholder="login_password_ph" placeholder="密码" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-color);border-radius:8px;font-size:14px;outline:none;background:var(--bg-input);color:var(--text-primary);" />
        </div>
        <div id="adminLoginError" style="color:var(--danger);font-size:12px;min-height:20px;margin-bottom:8px;"></div>
        <button id="adminLoginBtn" class="btn btn-primary" style="width:100%;padding:10px;font-size:14px;font-weight:600;" data-i18n="login_btn">登 录</button>
        <p style="margin-top:14px;font-size:12px;color:var(--text-muted);"><span data-i18n="login_no_account">没有账号？</span><a href="#" id="adminGoRegister" style="color:var(--accent);text-decoration:none;" data-i18n="login_go_register">去注册</a></p>
      </div>
      <div class="form-card" style="text-align:center;padding:40px;width:360px;display:none;" id="adminRegisterBox">
        <div style="font-size:36px;margin-bottom:12px;">📝</div>
        <h2 style="font-size:18px;margin-bottom:20px;color:var(--text-primary);" data-i18n="register_title">注册账号</h2>
        <div style="margin-bottom:14px;">
          <input id="adminRegUser" class="form-input" data-i18n-placeholder="register_username_ph" placeholder="用户名（3-20字符）" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-color);border-radius:8px;font-size:14px;outline:none;background:var(--bg-input);color:var(--text-primary);" />
        </div>
        <div style="margin-bottom:14px;">
          <input id="adminRegPass" class="form-input" type="password" data-i18n-placeholder="register_password_ph" placeholder="密码（至少6位）" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-color);border-radius:8px;font-size:14px;outline:none;background:var(--bg-input);color:var(--text-primary);" />
        </div>
        <div style="margin-bottom:14px;">
          <input id="adminRegPass2" class="form-input" type="password" data-i18n-placeholder="register_password2_ph" placeholder="确认密码" style="width:100%;padding:10px 14px;border:1.5px solid var(--border-color);border-radius:8px;font-size:14px;outline:none;background:var(--bg-input);color:var(--text-primary);" />
        </div>
        <div id="adminRegError" style="color:var(--danger);font-size:12px;min-height:20px;margin-bottom:8px;"></div>
        <button id="adminRegBtn" class="btn btn-primary" style="width:100%;padding:10px;font-size:14px;font-weight:600;" data-i18n="register_btn">注 册</button>
        <p style="margin-top:14px;font-size:12px;color:var(--text-muted);"><span data-i18n="register_have_account">已有账号？</span><a href="#" id="adminGoLogin" style="color:var(--accent);text-decoration:none;" data-i18n="register_go_login">去登录</a></p>
      </div>
    `;
    document.querySelector(".admin-body").parentNode.insertBefore(loginOverlay, document.querySelector(".admin-body").nextSibling);
    if (typeof applyI18n === "function") applyI18n(loginOverlay);
  }

  loginOverlay.style.display = "flex";

  document.getElementById("adminLoginBtn").addEventListener("click", handleAdminLogin);
  document.getElementById("adminLoginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") handleAdminLogin(); });
  document.getElementById("adminRegBtn").addEventListener("click", handleAdminRegister);
  document.getElementById("adminRegPass2").addEventListener("keydown", (e) => { if (e.key === "Enter") handleAdminRegister(); });
  document.getElementById("adminGoRegister").addEventListener("click", (e) => {
    e.preventDefault();
    loginOverlay.querySelector('div:first-child').style.display = "none";
    document.getElementById("adminRegisterBox").style.display = "block";
  });
  document.getElementById("adminGoLogin").addEventListener("click", (e) => {
    e.preventDefault();
    loginOverlay.querySelector('div:first-child').style.display = "block";
    document.getElementById("adminRegisterBox").style.display = "none";
  });
}

function hashPassword(password) {
  let hash = 0;
  const str = password + "_nav_salt_2026";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "h_" + Math.abs(hash).toString(36);
}

async function handleAdminLogin() {
  const username = document.getElementById("adminLoginUser").value.trim();
  const password = document.getElementById("adminLoginPass").value;
  const errEl = document.getElementById("adminLoginError");
  if (!username || !password) { errEl.textContent = _t("admin_need_username_password"); return; }

  const res = await chrome.storage.local.get("accounts");
  const accounts = res.accounts || {};
  const account = accounts[username];
  if (!account) { errEl.textContent = _t("userNotFound"); return; }
  if (account.passwordHash !== hashPassword(password)) { errEl.textContent = _t("passwordWrong"); return; }

  currentUser = { username: account.username, createdAt: account.createdAt };
  await chrome.storage.local.set({ currentUser });

  const overlay = document.getElementById("adminLoginOverlay");
  if (overlay) overlay.style.display = "none";
  document.querySelector(".admin-body").style.display = "flex";
  await initAdmin();
  showToast("✅ " + _t("welcomeBack", { name: currentUser.username }));
}

async function handleAdminRegister() {
  const username = document.getElementById("adminRegUser").value.trim();
  const password = document.getElementById("adminRegPass").value;
  const password2 = document.getElementById("adminRegPass2").value;
  const errEl = document.getElementById("adminRegError");

  if (!username || username.length < 3 || username.length > 20) { errEl.textContent = _t("usernameLenError"); return; }
  if (/[^a-zA-Z0-9_一-鿿]/.test(username)) { errEl.textContent = _t("usernameCharsetError"); return; }
  if (!password || password.length < 6) { errEl.textContent = _t("passwordLenError"); return; }
  if (password !== password2) { errEl.textContent = _t("passwordMismatch"); return; }

  const res = await chrome.storage.local.get("accounts");
  const accounts = res.accounts || {};
  if (accounts[username]) { errEl.textContent = _t("usernameExists"); return; }

  accounts[username] = { username, passwordHash: hashPassword(password), createdAt: Date.now() };
  await chrome.storage.local.set({ accounts });

  currentUser = { username, createdAt: accounts[username].createdAt };
  await chrome.storage.local.set({ currentUser });

  const overlay = document.getElementById("adminLoginOverlay");
  if (overlay) overlay.style.display = "none";
  document.querySelector(".admin-body").style.display = "flex";
  await initAdmin();
  showToast("✅ " + _t("registeredAutoLogin"));
}

function renderAdminHeader() {
  const homeLink = document.getElementById("homeLink");
  if (homeLink) {
    homeLink.onclick = null;
    homeLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const url = chrome.runtime.getURL("pages/popup.html");
      // 复用已有导航页标签，避免重复开标签
      const tabs = await chrome.tabs.query({ url });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url, active: false });
      }
    });
  }

  const badge = document.getElementById("adminBadge");
  if (badge && currentUser) {
    badge.innerHTML = "🔐 " + _t("admin_user_logout", { name: currentUser.username });
    badge.style.cursor = "pointer";
    badge.onclick = null;
    badge.addEventListener("click", async () => {
      if (confirm(_t("admin_logout_confirm"))) {
        await chrome.storage.local.remove("currentUser");
        location.reload();
      }
    });
  }
}

function bindAuthEvents() {}

// ─── Data ────────────────────────────────────────────────────
async function loadAdminData() {
  const res = await chrome.storage.local.get("adminData");
  adminData = res.adminData || { categories: [], links: [] };
  if (!adminData.categories) adminData.categories = [];
  if (!adminData.links)      adminData.links = [];

  // 本地预置数据缺失（如 storage 被清除）时，向 background 请求恢复
  if (adminData.categories.length === 0) {
    try {
      const r = await chrome.runtime.sendMessage({ type: "reloadAdminData" });
      if (r && r.success) {
        const res2 = await chrome.storage.local.get("adminData");
        adminData = res2.adminData || adminData;
        if (!adminData.categories) adminData.categories = [];
        if (!adminData.links) adminData.links = [];
      }
    } catch (e) { /* 忽略 */ }
  }
}

async function saveAdminData() {
  await chrome.storage.local.set({ adminData });
}

// ─── Nav Tabs ────────────────────────────────────────────────
function bindNavEvents() {
  document.querySelectorAll(".admin-nav-item").forEach(item => {
    item.onclick = null;
    item.addEventListener("click", () => {
      document.querySelectorAll(".admin-nav-item").forEach(i => i.classList.remove("active"));
      document.querySelectorAll(".panel-section").forEach(p => p.classList.remove("active"));
      item.classList.add("active");
      document.getElementById("panel-" + item.dataset.panel).classList.add("active");
    });
  });
}

// ─── Render All ──────────────────────────────────────────────
async function renderAll() {
  renderOverview();
  renderCatChips();
  await renderLinksTable();
  populateCatSelects();
  await renderAvatarGrid();
  if (typeof applyI18n === "function") applyI18n();
  _forceLTR();
}

// ─── Overview ────────────────────────────────────────────────
function renderOverview() {
  const catCount = adminData.categories.length;
  // 统计时排除个人网址（个人网址按用户隔离，不计入全局统计）
  const publicLinks = adminData.links.filter(l => l.categoryId !== PERSONAL_CAT_ID);
  const totalLinks = publicLinks.length;
  const visibleLinks = publicLinks.filter(l => !l.hidden).length;
  const hiddenLinks = totalLinks - visibleLinks;

  document.getElementById("statRow").innerHTML = `
    <div class="stat-card"><div class="stat-num">${catCount}</div><div class="stat-label">${_t("stat_cat_count")}</div></div>
    <div class="stat-card"><div class="stat-num">${visibleLinks}</div><div class="stat-label">${_t("stat_visible")}</div></div>
    <div class="stat-card"><div class="stat-num" style="color:${hiddenLinks > 0 ? '#e17055' : 'var(--text-muted)'}">${hiddenLinks}</div><div cla
  `;

  const visibleData = adminData.links.filter(l => !l.hidden);
  if (visibleData.length === 0) {
    document.getElementById("overviewTable").innerHTML = `<div class="empty-hint">${_t("admin_empty_overview")}</div>`;
    return;
  }

  let rows = visibleData.map(link => {
    const cat = adminData.categories.find(c => c.id === link.categoryId);
    return `<tr>
      <td>${escHtml(link.title)}</td>
      <td class="url-cell"><a href="javascript:void(0)" onclick="adminOpenLink(this.dataset.url)" data-url="${escAttr(link.url)}">${escHtml(link.url)}</a></td>
      <td>${cat ? (cat.icon || "") + " " + escHtml(_catName(cat)) : "—"}</td>
      <td>${escHtml(link.desc || "—")}</td>
    </tr>`;
  }).join("");

  document.getElementById("overviewTable").innerHTML = `
    <table class="data-table">
      <thead><tr><th>${_t("th_name")}</th><th>${_t("th_url")}</th><th>${_t("th_category")}</th><th>${_t("th_desc")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── Categories ──────────────────────────────────────────────
function bindCategoryEvents() {
  document.getElementById("addCatBtn").onclick = null;
  document.getElementById("addCatBtn").addEventListener("click", addCategory);
}

function addCategory() {
  const name = document.getElementById("catName").value.trim();
  const icon = document.getElementById("catIcon").value.trim() || "📁";
  if (!name) { showToast(_t("admin_need_cat_name")); return; }

  adminData.categories.push({
    id: "cat_" + Date.now(),
    name, icon,
    order: adminData.categories.length + 1
  });
  saveAdminData();
  renderAll();
  document.getElementById("catName").value = "";
  document.getElementById("catIcon").value = "";
  showToast(_t("admin_cat_added"));
}

function renderCatChips() {
  const container = document.getElementById("catChips");
  if (adminData.categories.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">${_t("admin_no_cats")}</span>`;
    return;
  }
  container.innerHTML = adminData.categories.map((cat, idx) => `
    <div class="cat-chip" data-id="${cat.id}">
      <span class="chip-name">${cat.icon || "📁"} ${escHtml(_catName(cat))}</span>
      <button class="chip-btn chip-top"   data-id="${cat.id}" data-i18n-title="admin_cat_top" ${idx === 0 ? "disabled style='opacity:.25;cursor:default;'" : ""}>⏫</button>
      <button class="chip-btn chip-up"    data-id="${cat.id}" data-i18n-title="admin_cat_up" ${idx === 0 ? "disabled style='opacity:.25;cursor:default;'" : ""}>⬆</button>
      <button class="chip-btn chip-down"  data-id="${cat.id}" data-i18n-title="admin_cat_down" ${idx === adminData.categories.length - 1 ? "disabled style='opacity:.25;cursor:default;'" : ""}>⬇</button>
      <button class="chip-btn chip-bottom" data-id="${cat.id}" data-i18n-title="admin_cat_bottom" ${idx === adminData.categories.length - 1 ? "disabled style='opacity:.25;cursor:default;'" : ""}>⏬</button>
      <button class="chip-btn chip-edit" data-id="${cat.id}" data-i18n-title="admin_cat_edit">✏️</button>
      <button class="chip-btn chip-del"  data-id="${cat.id}" data-i18n-title="admin_cat_del">✕</button>
    </div>`).join("");

  container.querySelectorAll(".chip-top").forEach(btn => {
    btn.addEventListener("click", () => moveCat(btn.dataset.id, "top"));
  });
  container.querySelectorAll(".chip-up").forEach(btn => {
    btn.addEventListener("click", () => moveCat(btn.dataset.id, "up"));
  });
  container.querySelectorAll(".chip-down").forEach(btn => {
    btn.addEventListener("click", () => moveCat(btn.dataset.id, "down"));
  });
  container.querySelectorAll(".chip-bottom").forEach(btn => {
    btn.addEventListener("click", () => moveCat(btn.dataset.id, "bottom"));
  });
  container.querySelectorAll(".chip-edit").forEach(btn => {
    btn.addEventListener("click", () => startEditCat(btn.dataset.id));
  });
  container.querySelectorAll(".chip-del").forEach(btn => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.id));
  });
  if (typeof applyI18n === "function") applyI18n(container);
}

function moveCat(id, direction) {
  const cats = adminData.categories;
  const idx = cats.findIndex(c => c.id === id);
  if (idx === -1) return;

  if (direction === "top") {
    const [item] = cats.splice(idx, 1);
    cats.unshift(item);
  } else if (direction === "bottom") {
    const [item] = cats.splice(idx, 1);
    cats.push(item);
  } else if (direction === "up" && idx > 0) {
    [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
  } else if (direction === "down" && idx < cats.length - 1) {
    [cats[idx], cats[idx + 1]] = [cats[idx + 1], cats[idx]];
  } else {
    return;
  }
  cats.forEach((cat, i) => { cat.order = i + 1; });
  saveAdminData();
  renderAll();
}

function startEditCat(id) {
  const cat = adminData.categories.find(c => c.id === id);
  if (!cat) return;
  const chip = document.querySelector(`.cat-chip[data-id="${id}"]`);
  if (!chip) return;

  const nameSpan = chip.querySelector(".chip-name");
  const input = document.createElement("input");
  input.className = "chip-edit-input";
  input.value = cat.name;
  chip.replaceChild(input, nameSpan);

  const editBtn = chip.querySelector(".chip-edit");
  editBtn.textContent = "✅";
  editBtn.setAttribute("data-i18n-title", "admin_save_short");
  editBtn.title = _t("admin_save_short");
  editBtn.onclick = () => saveEditCat(id, input);

  input.focus();
  input.select();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveEditCat(id, input);
    if (e.key === "Escape") renderCatChips();
  });
}

function saveEditCat(id, input) {
  const newName = input.value.trim();
  if (!newName) { showToast(_t("admin_cat_name_empty")); return; }
  const cat = adminData.categories.find(c => c.id === id);
  if (!cat) return;
  cat.name = newName;
  saveAdminData();
  renderAll();
  showToast(_t("admin_cat_updated"));
}

function deleteCategory(id) {
  const cat = adminData.categories.find(c => c.id === id);
  if (!cat) return;
  const linkedCount = adminData.links.filter(l => l.categoryId === id).length;
  const msg = linkedCount > 0
    ? _t("admin_delete_cat_with_links", { name: cat.name, count: linkedCount })
    : _t("admin_delete_cat", { name: cat.name });
  if (!confirm(msg)) return;

  adminData.categories = adminData.categories.filter(c => c.id !== id);
  adminData.links.forEach(l => { if (l.categoryId === id) l.categoryId = ""; });
  saveAdminData();
  renderAll();
  showToast(_t("admin_cat_deleted"));
}

// ─── Links ───────────────────────────────────────────────────
function bindLinksEvents() {
  document.getElementById("addLinkBtn").onclick = null;
  document.getElementById("addLinkBtn").addEventListener("click", () => openEditModal(null));
  document.getElementById("filterCat").onchange = null;
  document.getElementById("filterCat").addEventListener("change", renderLinksTable);
  document.getElementById("filterKeyword").oninput = null;
  document.getElementById("filterKeyword").addEventListener("input", renderLinksTable);
  document.getElementById("filterVisibility").onchange = null;
  document.getElementById("filterVisibility").addEventListener("change", renderLinksTable);
  document.getElementById("batchShowBtn").onclick = null;
  document.getElementById("batchShowBtn").addEventListener("click", () => batchSetVisibility(true));
  document.getElementById("batchHideBtn").onclick = null;
  document.getElementById("batchHideBtn").addEventListener("click", () => batchSetVisibility(false));
  
  document.getElementById("batchDeleteBtn").onclick = null;
  document.getElementById("batchDeleteBtn").addEventListener("click", batchDeleteLinks);
}

async function batchDeleteLinks() {
  const checkedBoxes = document.querySelectorAll(".link-checkbox:checked");
  if (checkedBoxes.length === 0) {
    showToast(_t("admin_batch_no_selection", "请先勾选要删除的网址"));
    return;
  }
  if (!confirm(_t("admin_batch_delete_confirm", { count: checkedBoxes.length }, `确定要删除选中的 ${checkedBoxes.length} 个网址吗？此操作不可恢复。`))) return;

  const idsToDelete = Array.from(checkedBoxes).map(cb => cb.dataset.id);
  
  // 先从全局公共分类中删除
  adminData.links = adminData.links.filter(l => !idsToDelete.includes(l.id));
  // 再从当前用户个人网址中删除
  const beforeCount = userLinksData.length;
  userLinksData = userLinksData.filter(l => !idsToDelete.includes(l.id));
  const personalDeleted = beforeCount - userLinksData.length;
  
  await saveAdminData();
  if (personalDeleted > 0) await saveUserLinks();
  
  renderAll();
  showToast(_t("admin_batch_deleted", { count: idsToDelete.length }, `已删除 ${idsToDelete.length} 个网址`));
}

function populateCatSelects() {
  const selects = ["filterCat", "batchCat", "editCat", "exportCat"];
  selects.forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    const prevVal = el.value;
    const allOpt = (sid === "filterCat" || sid === "exportCat")
      ? `<option value="" data-i18n="admin_all_cats">${_t("admin_all_cats")}</option>`
      : "";
    el.innerHTML = allOpt + adminData.categories.map(c =>
      `<option value="${c.id}">${c.icon || ""} ${escHtml(_catName(c))}</option>`
    ).join("");
    if (prevVal) el.value = prevVal;
  });
  if (typeof applyI18n === "function") applyI18n();
}

async function renderLinksTable() {
  const catFilter = document.getElementById("filterCat").value;
  const kw = (document.getElementById("filterKeyword").value || "").trim().toLowerCase();
  const visFilter = document.getElementById("filterVisibility").value;

  let links;
  if (catFilter === PERSONAL_CAT_ID) {
    // 筛选"个人网址"时：从 storage 实时读取当前用户的个人网址（确保最新）
    if (!currentUser) {
      links = [];
    } else {
      const key = "userLinks_" + currentUser.username;
      const res = await chrome.storage.local.get(key);
      userLinksData = res[key] || [];
      links = userLinksData.filter(l => l.categoryId === PERSONAL_CAT_ID);
    }
  } else {
    // 其他情况：显示公共分类（排除个人网址）
    links = adminData.links.filter(l => l.categoryId !== PERSONAL_CAT_ID);
    if (catFilter) links = links.filter(l => l.categoryId === catFilter);
  }
  
  if (kw) links = links.filter(l =>
    l.title.toLowerCase().includes(kw) || l.url.toLowerCase().includes(kw)
  );
  if (visFilter === "visible") links = links.filter(l => !l.hidden);
  if (visFilter === "hidden") links = links.filter(l => l.hidden);

  if (links.length === 0) {
    document.getElementById("linksTable").innerHTML = `<div class="empty-hint">${_t("admin_empty_links")}</div>`;
    return;
  }

  const rows = links.map(link => {
    const cat = adminData.categories.find(c => c.id === link.categoryId);
    const isHidden = !!link.hidden;
    return `<tr data-id="${link.id}" draggable="true" class="${isHidden ? 'row-hidden' : ''}">
      <td><input type="checkbox" class="link-checkbox" data-id="${link.id}" style="margin-right:6px;cursor:pointer;" /><span class="drag-handle" style="cursor:grab;color:var(--text-muted);margin-right:6px;font-size:14px;" data-i18n-title="admin_drag_title">⠿</span>${escHtml(link.title)} ${isHidden ? `<span style="color:var(--danger);font-size:11px;">[${_t("admin_hidden_tag")}]</span>` : ''}</td>
      <td class="url-cell" style="max-width:220px;"><a href="javascript:void(0)" onclick="adminOpenLink(this.dataset.url)" data-url="${escAttr(link.url)}" title="${escAttr(link.url)}" style="color:var(--url-color);">${escHtml(link.url)}</a></td>
      <td>${cat ? escHtml(_catName(cat)) : `<span style="color:var(--text-muted)">${_t("admin_no_category")}</span>`}</td>
      <td>${escHtml(link.desc || "—")}</td>
      <td style="width:320px;white-space:nowrap;">
        <div class="td-actions" style="display:flex;align-items:center;gap:3px;flex-wrap:nowrap;">
          <button class="btn btn-sm btn-sort-link" data-id="${link.id}" data-dir="first" data-i18n-title="admin_move_first">⏫</button>
          <button class="btn btn-sm btn-sort-link" data-id="${link.id}" data-dir="up" data-i18n-title="admin_move_up">⬆</button>
          <button class="btn btn-sm btn-sort-link" data-id="${link.id}" data-dir="down" data-i18n-title="admin_move_down">⬇</button>
          <button class="btn btn-sm btn-sort-link" data-id="${link.id}" data-dir="last" data-i18n-title="admin_move_last">⏬</button>
          <button class="btn btn-sm ${isHidden ? 'btn-primary' : 'btn-secondary'} btn-toggle-vis" data-id="${link.id}" data-i18n-title="${isHidden ? 'admin_action_show' : 'admin_action_hide'}">${isHidden ? '👁 ' + _t("admin_action_show") : '👁‍🗨 ' + _t("admin_action_hide")}</button>
          <button class="btn btn-warning btn-sm btn-edit-link" data-id="${link.id}">✏️</button>
          <button class="btn btn-danger  btn-sm btn-del-link"  data-id="${link.id}">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  document.getElementById("linksTable").innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th style="width:120px"><input type="checkbox" id="selectAllCheckbox" style="cursor:pointer;" /> ${_t("th_name")}</th>
        <th>${_t("th_url")}</th><th style="width:120px">${_t("th_category")}</th><th>${_t("th_desc")}</th><th style="width:320px">${_t("th_actions")}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  const selectAll = document.getElementById("selectAllCheckbox");
  selectAll.addEventListener("change", (e) => {
    document.querySelectorAll(".link-checkbox").forEach(cb => { cb.checked = e.target.checked; });
  });

  document.querySelectorAll(".btn-toggle-vis").forEach(btn => {
    btn.addEventListener("click", () => toggleVisibility(btn.dataset.id));
  });
  document.querySelectorAll(".btn-edit-link").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.id));
  });
  document.querySelectorAll(".btn-del-link").forEach(btn => {
    btn.addEventListener("click", () => deleteLink(btn.dataset.id));
  });
  document.querySelectorAll(".btn-sort-link").forEach(btn => {
    btn.addEventListener("click", () => moveLink(btn.dataset.id, btn.dataset.dir));
  });

  if (typeof applyI18n === "function") applyI18n(document.getElementById("linksTable"));
  bindTableRowDrag();
}

// ─── Sort / Move ─────────────────────────────────────────────
function moveLink(id, direction) {
  const links = adminData.links;
  const idx = links.findIndex(l => l.id === id);
  if (idx === -1) return;

  if (direction === "up" && idx > 0) {
    [links[idx - 1], links[idx]] = [links[idx], links[idx - 1]];
  } else if (direction === "down" && idx < links.length - 1) {
    [links[idx], links[idx + 1]] = [links[idx + 1], links[idx]];
  } else if (direction === "first") {
    const [item] = links.splice(idx, 1);
    links.unshift(item);
  } else if (direction === "last") {
    const [item] = links.splice(idx, 1);
    links.push(item);
  } else {
    return;
  }

  saveAdminData();
  renderAll();
  showToast(_t("admin_sorted"));
}

// ─── Visibility ──────────────────────────────────────────────
function toggleVisibility(id) {
  const link = adminData.links.find(l => l.id === id);
  if (!link) return;
  link.hidden = !link.hidden;
  saveAdminData();
  renderAll();
  showToast(link.hidden ? _t("admin_hidden") : _t("admin_visible"));
}

async function batchSetVisibility(visible) {
  const checkedBoxes = document.querySelectorAll(".link-checkbox:checked");
  if (checkedBoxes.length === 0) {
    showToast(_t("admin_select_first"));
    return;
  }

  const ids = Array.from(checkedBoxes).map(cb => cb.dataset.id);
  const action = visible ? _t("admin_batch_action_show") : _t("admin_batch_action_hide");
  if (!confirm(_t("admin_batch_confirm", { action: action, count: ids.length }))) return;

  ids.forEach(id => {
    const link = adminData.links.find(l => l.id === id);
    if (link) link.hidden = !visible;
  });

  await saveAdminData();
  renderAll();
  showToast("✅ " + (visible ? _t("admin_visible") : _t("admin_hidden")) + " " + ids.length);
}

function deleteLink(id) {
  // 先在全局公共分类中查找
  let link = adminData.links.find(l => l.id === id);
  if (link) {
    if (!confirm(_t("admin_delete_link", { title: link.title }))) return;
    adminData.links = adminData.links.filter(l => l.id !== id);
    saveAdminData();
    renderAll();
    showToast(_t("admin_link_deleted"));
    return;
  }
  // 再在当前用户个人网址中查找
  link = userLinksData.find(l => l.id === id);
  if (link) {
    if (!confirm(_t("admin_delete_link", { title: link.title }))) return;
    userLinksData = userLinksData.filter(l => l.id !== id);
    saveUserLinks();
    renderAll();
    showToast(_t("admin_link_deleted"));
    return;
  }
}

// ─── Edit Modal ──────────────────────────────────────────────
function bindEditModal() {
  document.getElementById("cancelEdit").onclick = null;
  document.getElementById("cancelEdit").addEventListener("click", closeEditModal);
  document.getElementById("confirmEdit").onclick = null;
  document.getElementById("confirmEdit").addEventListener("click", saveEditLink);
  document.getElementById("editModal").onclick = null;
  document.getElementById("editModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("editModal")) closeEditModal();
  });
}

function openEditModal(linkId) {
  editingLinkId = linkId;
  populateCatSelects();

  if (linkId) {
    // 先在公共分类中查找
    let link = adminData.links.find(l => l.id === linkId);
    // 再在个人网址中查找
    if (!link) link = userLinksData.find(l => l.id === linkId);
    if (!link) return;
    document.getElementById("editModalTitle").innerHTML = "✏️ " + _t("admin_edit_modal_title");
    document.getElementById("editTitle").value = link.title || "";
    document.getElementById("editUrl").value   = link.url   || "";
    document.getElementById("editDesc").value  = link.desc  || "";
    document.getElementById("editCat").value   = link.categoryId || "";
  } else {
    document.getElementById("editModalTitle").innerHTML = "➕ " + _t("admin_add_modal_title");
    document.getElementById("editTitle").value = "";
    document.getElementById("editUrl").value   = "";
    document.getElementById("editDesc").value  = "";
    if (adminData.categories.length > 0)
      document.getElementById("editCat").value = adminData.categories[0].id;
  }

  document.getElementById("editModal").classList.add("show");
  document.getElementById("editTitle").focus();
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("show");
  editingLinkId = null;
}

async function saveEditLink() {
  const title = document.getElementById("editTitle").value.trim();
  let url   = document.getElementById("editUrl").value.trim();
  const desc  = document.getElementById("editDesc").value.trim();
  const catId = document.getElementById("editCat").value;

  if (!title) { showToast(_t("needTitle")); return; }
  if (!url)   { showToast(_t("needUrl")); return; }
  if (!isValidUrlForCat(url, catId)) {
    if (catId === "cat_personal") {
      showToast(_t("needValidUrlPersonal"));
    } else {
      showToast(_t("needValidUrl"));
    }
    return;
  }

  url = normalizeUrl(url);

  if (editingLinkId) {
    // 编辑模式：先在公共分类中查找，再在个人网址中查找
    const idxAdmin = adminData.links.findIndex(l => l.id === editingLinkId);
    if (idxAdmin > -1) {
      adminData.links[idxAdmin] = { ...adminData.links[idxAdmin], title, url, desc, categoryId: catId };
      saveAdminData();
    } else {
      const idxUser = userLinksData.findIndex(l => l.id === editingLinkId);
      if (idxUser > -1) {
        userLinksData[idxUser] = { ...userLinksData[idxUser], title, url, desc, categoryId: catId };
        await saveUserLinks();
      }
    }
  } else {
    // 新增模式：去重检测（分类内去重，URL+标题 联合比较）
    const normUrl = normalizeUrl(url);
    const dedupKey = normUrl + "||" + title.trim();
    const isDuplicate = catId === PERSONAL_CAT_ID
      ? userLinksData.some(l => l.categoryId === PERSONAL_CAT_ID && normalizeUrl(l.url) + "||" + (l.title||"").trim() === dedupKey)
      : adminData.links.some(l => l.categoryId === catId && normalizeUrl(l.url) + "||" + (l.title||"").trim() === dedupKey);
    if (isDuplicate) {
      showToast("⚠️ 该分类下已存在相同网址，无需重复添加");
      return;
    }
    
    if (catId === PERSONAL_CAT_ID) {
      // 添加到个人网址：存到当前用户的 userLinks（互不可见）
      userLinksData.push({
        id: "lk_" + Date.now(),
        categoryId: catId, title, url: normUrl, desc, hidden: false
      });
      await saveUserLinks();
    } else {
      // 添加到公共分类：存到全局 adminData.links
      adminData.links.push({
        id: "lk_" + Date.now(),
        categoryId: catId, title, url: normUrl, desc, hidden: false
      });
    }
  }

  renderAll();
  closeEditModal();
  showToast(editingLinkId ? _t("admin_updated") : _t("admin_added"));
}

// ─── Batch Import ─────────────────────────────────────────────
function bindBatchEvents() {
  document.getElementById("previewBatchBtn").onclick = null;
  document.getElementById("previewBatchBtn").addEventListener("click", previewBatch);
  document.getElementById("importBatchBtn").onclick = null;
  document.getElementById("importBatchBtn").addEventListener("click", importBatch);
  document.getElementById("previewExportBtn").onclick = null;
  document.getElementById("previewExportBtn").addEventListener("click", previewExport);
  document.getElementById("exportBtn").onclick = null;
  document.getElementById("exportBtn").addEventListener("click", exportLinks);
}

function parseBatchLines() {
  const raw = document.getElementById("batchData").value;
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(/[,，\t]/).map(p => p.trim());
    // 清洗 URL：去掉 @url: 前缀、反引号、markdown 格式
    const cleanUrl = (u) => (u || "")
      .replace(/^@url:/i, "")      // 去掉 @url: 前缀
      .replace(/`+/g, "")           // 去掉所有反引号
      .trim();
    // 新格式："分类,标题,网址"（3列）
    // 旧格式："标题,网址"（2列）
    if (parts.length >= 3) {
      return { category: parts[0] || "", title: parts[1] || "", url: cleanUrl(parts[2]) };
    }
    return { category: "", title: parts[0] || "", url: cleanUrl(parts[1]), desc: parts[2] || "" };
  }).filter(item => item.title && item.url);
}

function previewBatch() {
  const items = parseBatchLines();
  const batchCatId = document.getElementById("batchCat").value;
  if (items.length === 0) {
    document.getElementById("batchPreview").innerHTML = `<div class="empty-hint">${_t("admin_no_preview_data")}</div>`;
    return;
  }
  const rows = items.map(item => {
    // 确定目标分类（有分类名按名称匹配，否则用下拉选择的）
    let targetCatId = batchCatId;
    if (item.category) {
      const cat = adminData.categories.find(c => c.name === item.category);
      if (cat) targetCatId = cat.id;
    }
    const valid = isValidUrlForCat(item.url, targetCatId);
    const errTip = valid ? "✅" : (targetCatId === "cat_personal" ? _t("admin_addr_format_err") : _t("admin_url_format_err"));
    const catName = item.category || adminData.categories.find(c => c.id === targetCatId)?.name || "—";
    return `<tr style="${valid ? "" : "background:var(--preview-error-bg)"}">
      <td>${escHtml(catName)}</td>
      <td>${escHtml(item.title)}</td>
      <td>${escHtml(item.url)}</td>
      <td>${errTip}</td>
    </tr>`;
  }).join("");

  document.getElementById("batchPreview").innerHTML = `
    <div class="form-card">
      <div class="form-card-title">👁 ${_t("admin_preview_title", { count: items.length })}</div>
      <table class="data-table">
        <thead><tr><th>${_t("th_category")}</th><th>${_t("th_title")}</th><th>${_t("th_url")}</th><th>${_t("th_status")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function importBatch() {
  const selectedCatId = document.getElementById("batchCat").value;
  if (!selectedCatId) { showToast(_t("admin_select_cat")); return; }

  const items = parseBatchLines();
  if (items.length === 0) { showToast(_t("admin_no_valid_import")); return; }

  // 导入前先从 storage 重新加载最新数据（避免使用过期的内存缓存）
  await loadAdminData();
  await loadUserLinks();

  // 按分类构建去重集合（分类内去重：URL+标题 联合比较，同 URL 不同标题可共存）
  const keySetByCat = {};
  const getKeySet = (catId) => {
    if (!keySetByCat[catId]) {
      const s = new Set();
      if (catId === PERSONAL_CAT_ID) {
        // 个人网址：只比较当前用户该分类下的网址
        userLinksData
          .filter(l => l.categoryId === PERSONAL_CAT_ID)
          .forEach(l => s.add(normalizeUrl(l.url) + "||" + (l.title || "").trim()));
      } else {
        // 公共分类：只比较该分类下的网址
        adminData.links
          .filter(l => l.categoryId === catId)
          .forEach(l => s.add(normalizeUrl(l.url) + "||" + (l.title || "").trim()));
      }
      keySetByCat[catId] = s;
    }
    return keySetByCat[catId];
  };

  let imported = 0;
  let skipped = 0;
  let personalImported = 0;

  for (const item of items) {
    // 如果有分类名（3列格式），按名称匹配分类ID
    let targetCatId = selectedCatId;
    if (item.category) {
      const cat = adminData.categories.find(c => c.name === item.category);
      if (cat) targetCatId = cat.id;
    }
    
    if (!isValidUrlForCat(item.url, targetCatId)) continue;
    
    const normUrl = normalizeUrl(item.url);
    const keySet = getKeySet(targetCatId);
    const dedupKey = normUrl + "||" + (item.title || "").trim();
    
    // 去重检测：该分类下已有相同 URL+标题 才跳过；同 URL 不同标题允许共存
    if (keySet.has(dedupKey)) {
      skipped++;
      continue;
    }
    keySet.add(dedupKey);  // 本次批次内同一分类也去重
    
    const linkObj = {
      id: "lk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      categoryId: targetCatId,
      title: item.title,
      url:   normUrl,
      desc:  item.desc || "",
      hidden: false
    };
    
    if (targetCatId === PERSONAL_CAT_ID) {
      // 个人网址：存到当前用户的 userLinks（互不可见）
      userLinksData.push(linkObj);
      personalImported++;
    } else {
      // 公共分类：存到全局 adminData.links
      adminData.links.push(linkObj);
    }
    imported++;
  }

  if (imported === 0 && skipped === 0) { showToast(_t("admin_no_valid_import")); return; }
  
  if (personalImported > 0) await saveUserLinks();
  saveAdminData();
  renderAll();
  document.getElementById("batchData").value = "";
  document.getElementById("batchPreview").innerHTML = "";
  
  // 提示导入结果（含去重信息）
  if (skipped > 0) {
    showToast(`✅ 导入 ${imported} 条，跳过重复 ${skipped} 条`);
  } else {
    showToast(_t("admin_imported", { count: imported }));
  }
}

// ─── Batch Export ─────────────────────────────────────────────
function previewExport() {
  const catId = document.getElementById("exportCat").value;
  let links = adminData.links.filter(l => !l.hidden);
  if (catId) links = links.filter(l => l.categoryId === catId);

  const container = document.getElementById("exportPreview");
  if (links.length === 0) {
    container.innerHTML = `<div class="empty-hint">${_t("admin_no_visible_export")}</div>`;
    return;
  }

  const rows = links.map(link => {
    const cat = adminData.categories.find(c => c.id === link.categoryId);
    return `<tr>
      <td>${escHtml(link.title)}</td>
      <td class="url-cell" title="${escAttr(link.url)}">${escHtml(link.url)}</td>
      <td>${cat ? escHtml(_catName(cat)) : "—"}</td>
    </tr>`;
  }).join("");

  const catName = catId
    ? (_catName(adminData.categories.find(c => c.id === catId)) || _t("admin_unknown_cat"))
    : _t("admin_all_cats");

  container.innerHTML = `
    <div class="form-card">
      <div class="form-card-title">👁 ${_t("admin_export_preview_title", { name: escHtml(catName), count: links.length })}</div>
      <table class="data-table">
        <thead><tr><th>${_t("th_title")}</th><th>${_t("th_url")}</th><th>${_t("th_category")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="format-hint" style="margin-top:10px;">
        ${_t("admin_export_records_hint", { count: links.length })}
      </div>
    </div>`;
}

function exportLinks() {
  const catId = document.getElementById("exportCat").value;
  
  // 个人网址：导出当前用户的 userLinksData（互不可见）
  let links;
  if (catId === PERSONAL_CAT_ID) {
    if (!currentUser) { showToast(_t("needLogin")); return; }
    links = userLinksData.filter(l => l.categoryId === PERSONAL_CAT_ID);
  } else {
    // 公共分类：从全局 adminData.links 导出
    links = adminData.links.filter(l => !l.hidden);
    if (catId) links = links.filter(l => l.categoryId === catId);
  }

  if (links.length === 0) {
    showToast(_t("admin_no_export"));
    return;
  }

  const catOrder = {};
  adminData.categories.forEach((c, i) => { catOrder[c.id] = c.order || (i + 1); });
  links.sort((a, b) => {
    const orderA = catOrder[a.categoryId] || 999;
    const orderB = catOrder[b.categoryId] || 999;
    if (orderA !== orderB) return orderA - orderB;
    return (adminData.links.indexOf(a) !== -1 ? adminData.links.indexOf(a) : 9999) - 
           (adminData.links.indexOf(b) !== -1 ? adminData.links.indexOf(b) : 9999);
  });

  const lines = links.map(link => {
    const cat = adminData.categories.find(c => c.id === link.categoryId);
    const catName = cat ? cat.name : "";
    return `${catName},${link.title},${link.url}`;
  });
  const content = lines.join("\n");

  let filename = _t("admin_export_filename_base");
  if (catId) {
    const cat = adminData.categories.find(c => c.id === catId);
    if (cat) filename += "_" + cat.name;
  }
  filename += "_" + new Date().toISOString().slice(0, 10) + ".txt";

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(_t("admin_exported", { count: links.length, filename: filename }));
}

// ─── Utils ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}
function isValidUrl(str) {
  try { return /^https?:\/\//.test(str) && Boolean(new URL(str)); } catch { return false; }
}

function normalizeUrl(raw) {
  if (/^(https?|file):\/\//.test(raw)) return raw;
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    return "file:///" + raw.replace(/\\/g, "/");
  }
  return "file:///" + raw;
}

function isValidUrlForCat(str, catId) {
  if (!str) return false;
  if (isValidUrl(str)) return true;
  if (catId === "cat_personal") {
    if (/^file:\/\//.test(str)) {
      try { new URL(str); return true; } catch { return false; }
    }
    if (/^[A-Za-z]:[\\/]/.test(str)) return true;
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
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

// ─── Table Row Drag Sort ───────────────────────────────────
function bindTableRowDrag() {
  const tbody = document.querySelector("#linksTable tbody");
  if (!tbody) return;
  const rows = tbody.querySelectorAll("tr[data-id]");
  let dragRow = null;

  rows.forEach(row => {
    row.addEventListener("dragstart", (e) => {
      dragRow = row;
      row.classList.add("drag-row");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.id);
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("drag-row");
      tbody.querySelectorAll(".drag-over-row").forEach(r => r.classList.remove("drag-over-row"));
      dragRow = null;
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (row !== dragRow) row.classList.add("drag-over-row");
    });

    row.addEventListener("dragleave", () => row.classList.remove("drag-over-row"));

    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drag-over-row");
      if (!dragRow || dragRow === row) return;

      const dragId = dragRow.dataset.id;
      const dropId = row.dataset.id;
      const links = adminData.links;
      const dragIdx = links.findIndex(l => l.id === dragId);
      const dropIdx = links.findIndex(l => l.id === dropId);
      if (dragIdx === -1 || dropIdx === -1) return;

      const [moved] = links.splice(dragIdx, 1);
      links.splice(dropIdx, 0, moved);

      await saveAdminData();
      renderAll();
      showToast(_t("admin_sorted"));
    });
  });
}

// ─── Avatar Grid ──────────────────────────────────────────────
const AVATAR_LIST = [
  "avatar-avataaars-aya.png",
  "avatar-avataaars-chen.png",
  "avatar-avataaars-hiro.png",
  "avatar-avataaars-jun.png",
  "avatar-avataaars-kai.png",
  "avatar-avataaars-lin.png",
  "avatar-avataaars-mei.png",
  "avatar-avataaars-ming.png",
  "avatar-avataaars-sakura.png",
  "avatar-avataaars-wei.png",
  "avatar-avataaars-xia.png",
  "avatar-avataaars-yuki.png",
  "avatar-notionists-chen2.png",
  "avatar-notionists-choi.png",
  "avatar-notionists-kim.png",
  "avatar-notionists-li.png",
  "avatar-notionists-liu.png",
  "avatar-notionists-park.png",
  "avatar-notionists-suzuki.png",
  "avatar-notionists-tanaka.png",
  "avatar-notionists-wang.png",
  "avatar-notionists-wu.png",
  "avatar-notionists-yamamoto.png",
  "avatar-notionists-zhang.png",
  "avatar-personas-daiki.png",
  "avatar-personas-hana.png",
  "avatar-personas-haru.png",
  "avatar-personas-hina.png",
  "avatar-personas-kenji.png",
  "avatar-personas-kokoro.png",
  "avatar-personas-miyu.png",
  "avatar-personas-ren.png",
  "avatar-personas-rin.png",
  "avatar-personas-sota.png",
  "avatar-personas-yui.png",
  "avatar-personas-yuto.png"
];

async function renderAvatarGrid() {
  const grid = document.getElementById("avatarGrid");
  if (!grid) return;
  
  const res = await chrome.storage.local.get("userAvatar");
  const current = res.userAvatar || "";
  
  grid.innerHTML = AVATAR_LIST.map(f => {
    const selected = (f === current) ? "border:3px solid var(--accent,#667eea);" : "border:2px solid var(--border-color,#ddd);";
    return `<img src="../icons/avatars/${f}" data-avatar="${f}" style="width:60px;height:60px;border-radius:50%;cursor:pointer;${selected}transition:transform .2s;" 
      onmouseover="this.style.transform='scale(1.1)'" 
      onmouseout="this.style.transform='scale(1)'">`;
  }).join("");
  
  grid.querySelectorAll("img").forEach(img => {
    img.addEventListener("click", async () => {
      const avatar = img.dataset.avatar;
      await chrome.storage.local.set({ userAvatar: avatar });
      renderAvatarGrid();
      showToast(_t("admin_avatar_saved", "头像已更新"));
    });
  });
}
