# 🐋 鲸波导航 / Whale Navigation

**一站式网址导航浏览器扩展**（Chrome / Edge / Firefox）

当前版本：**v1.4.1**

---

[English](#-english) | [简体中文](#-简体中文)

---

## 简体中文

鲸波导航是一款本地运行的网址导航扩展，把浏览器新标签页变成整齐好用的导航台。内置 17 大类、2000 余条精选网址，支持搜索、分类浏览、个人私有收藏与多语言界面。

### ✨ 核心功能

| 功能 | 说明 |
|---|---|
| 📚 **17 大类精选网址** | 搜索引擎、教育平台、学术科研、AI 资源、休闲娱乐等，开箱即用 |
| 🔍 **智能搜索** | 本站检索、必应、Google 三种引擎 |
| 👤 **个人网址私有化** | 登录后专属栏目，不同用户数据互不可见 |
| 🔖 **一键书签收藏** | 右键菜单 / Ctrl+Alt+S 快速收藏当前页，支持「收藏域名 ↔ 收藏页面」切换 |
| 🌐 **7 种语言** | 中文 / English / 日本語 / 한국어 / Español / العربية / Bahasa Indonesia |
| 🎨 **6 套配色** | 晨曦 / 深海 / 竹林 / 晚霞 / 墨韵 / 暗夜 |
| 📋 **批量导入导出** | TXT 格式，自动按分类归档，自动去重 |
| ↕️ **拖拽排序** | 网址卡片自由排序 |
| 👤 **36 款头像** | 个性化选择 |

### 🔖 书签收藏（v1.4 新增）

把网址导航与书签收藏合并到同一套分类体系，收藏即入库：

- **多入口收藏**：右键菜单「收藏到鲸波导航」（支持页面 / 链接 / 选中文字）、快捷键 `Ctrl+Alt+S`
- **智能站名**：自动抓取页面标题与标准站点名（og:site_name），切换「收藏域名」时优先使用标准中文站名
- **域名 / 页面切换**：网址框旁一键切换「当前页面完整网址」与「网站首页域名」，标题同步切换
- **登录衔接**：未登录收藏时先提示，登录/注册成功后自动弹出待收藏窗口，无需重复操作
- **存储分流**：收藏到「个人网址」按账号隔离；收藏到其他分类则全局共享

### 🔒 隐私与安全

- **完全本地运行**：无远程组件、无统计代码、无跟踪器
- **数据仅存本地**：所有网址、账号、偏好设置只保存在你的浏览器中
- **不收集任何个人信息**：不上传、不共享、不出售
- **无需注册即可使用全部导航功能**

### 🚀 安装方式

**Chrome / Edge 用户**：
1. 下载本仓库 `nav-extension-chrome-v1.4.1.zip`
2. 解压到任意文件夹
3. 打开浏览器扩展管理页（`chrome://extensions` 或 `edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

**Firefox 用户**：
1. 下载 `nav-extension-firefox-v1.4.1.zip`
2. 打开 Firefox，进入 `about:addons`
3. 点击 ⚙️ 齿轮图标 → 「从文件安装附加组件…」
4. 选择下载的 zip 文件

### 📁 目录结构

```
├── manifest.json          # 扩展清单
├── popup.js / popup.html # 前台导航页
├── admin.js / admin.html # 后台管理页
├── background.js          # Service Worker
├── i18n.js               # 多语言模块
├── icons/                # 图标与头像（36 款）
├── _locales/             # 7 语言翻译
├── pages/                # 页面模板
└── data/                 # 预置网址数据
```

### 📄 开源许可

[GNU GPL v3.0](../LICENSE)

---

## 🐋 English

Whale Navigation is a fully local bookmark navigator for Chrome and Edge. It turns your new tab into a clean, well-organized navigation page with 17 curated categories, 2000+ quality links, private personal bookmarks, 7 interface languages and 6 color themes.

### ✨ Features

| Feature | Description |
|---|---|
| 📚 **17 curated categories** | Search, education, academic research, AI, entertainment — ready out of the box |
| 🔍 **Smart search** | Local search, Bing, Google |
| 👤 **Private personal links** | Isolated between accounts, visible only to you |
| 🔖 **One-click bookmarking** | Right-click menu / Ctrl+Alt+S to save any page, switch between domain & full page |
| 🌐 **7 languages** | 简体中文 / English / 日本語 / 한국어 / Español / العربية / Bahasa Indonesia |
| 🎨 **6 themes** | Dawn, Deep Sea, Bamboo, Sunset, Ink, Midnight |
| 📋 **Batch import & export** | TXT format, auto-categorize, auto-deduplicate |
| ↕️ **Drag to reorder** | Arrange cards freely |
| 👤 **36 avatars** | Personalize your profile |

### 🔒 Privacy & Security

- **Runs entirely locally** — no remote components, analytics, or trackers
- **All data stored only in your browser** — nothing is uploaded, shared, or sold
- **No data collection** — all navigation features work without signing up

### 🚀 Installation

**For Chrome / Edge users:**
1. Download `nav-extension-chrome-v1.4.1.zip` from this repository
2. Extract it to any folder
3. Open `chrome://extensions` or `edge://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the extracted folder

**For Firefox users:**
1. Download `nav-extension-firefox-v1.4.1.zip`
2. Open Firefox and go to `about:addons`
3. Click the ⚙️ gear icon → **Install Add-on From File...**
4. Select the downloaded zip file

### 📜 License

[GNU GPL v3.0](../LICENSE)

---

**Author**: [Jim2029](https://github.com/Jim2029) · **Privacy Policy**: [julian4202.blogspot.com](https://julian4202.blogspot.com/)
