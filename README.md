# 🐋 鲸波导航 / Whale Navigation

**一站式网址导航浏览器扩展**（Chrome / Edge 双版本）

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
| 🌐 **7 种语言** | 中文 / English / 日本語 / 한국어 / Español / العربية / Bahasa Indonesia |
| 🎨 **6 套配色** | 晨曦 / 深海 / 竹林 / 晚霞 / 墨韵 / 暗夜 |
| 📋 **批量导入导出** | TXT 格式，自动按分类归档，自动去重 |
| ↕️ **拖拽排序** | 网址卡片自由排序 |
| 👤 **36 款头像** | 个性化选择 |

### 🔒 隐私与安全

- **完全本地运行**：无远程组件、无统计代码、无跟踪器
- **数据仅存本地**：所有网址、账号、偏好设置只保存在你的浏览器中
- **不收集任何个人信息**：不上传、不共享、不出售
- **无需注册即可使用全部导航功能**

### 🚀 安装方式

**Chrome / Edge 用户**：
1. 下载本仓库 `nav-extension-chrome-edge.zip`
2. 解压到任意文件夹
3. 打开浏览器扩展管理页（`chrome://extensions` 或 `edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

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
1. Download `nav-extension-chrome-edge.zip` from this repository
2. Extract it to any folder
3. Open `chrome://extensions` or `edge://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the extracted folder

### 📜 License

[GNU GPL v3.0](../LICENSE)

---

**Author**: [Jim2029](https://github.com/Jim2029) · **Privacy Policy**: [julian4202.blogspot.com](https://julian4202.blogspot.com/)
