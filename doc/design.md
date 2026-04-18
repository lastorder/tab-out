# Tab Out 设计文档

> 本文档面向零基础读者，通过 Tab Out 这个真实项目，手把手讲解 Chrome 插件的开发方式和设计思路。

---

## 目录

1. [Chrome 插件基础知识](#1-chrome-插件基础知识)
2. [Tab Out 项目总览](#2-tab-out-项目总览)
3. [manifest.json — 插件的"身份证"](#3-manifestjson--插件的身份证)
4. [background.js — 后台服务工作者](#4-backgroundjs--后台服务工作者)
5. [新标签页覆盖 — 插件的"门面"](#5-新标签页覆盖--插件的门面)
6. [app.js — 核心业务逻辑详解](#6-appjs--核心业务逻辑详解)
7. [style.css — 视觉设计体系](#7-stylecss--视觉设计体系)
8. [Chrome API 使用详解](#8-chrome-api-使用详解)
9. [数据流与架构图](#9-数据流与架构图)
10. [关键设计决策](#10-关键设计决策)
11. [如何从零开发一个 Chrome 插件](#11-如何从零开发一个-chrome-插件)

---

## 1. Chrome 插件基础知识

### 1.1 什么是 Chrome 插件？

Chrome 插件（Chrome Extension）是一种运行在 Chrome 浏览器中的小程序，它可以：

- 修改网页的外观和行为
- 替换浏览器的默认页面（比如新标签页）
- 在后台监听浏览器事件
- 与浏览器的标签页、书签、历史记录等进行交互

**技术栈非常简单：HTML + CSS + JavaScript**，不需要任何后端服务器、不需要 Node.js、不需要 npm。你只需要写几个文件，就能让它在浏览器里运行。

### 1.2 插件的运行环境

Chrome 插件有几个不同的运行环境，理解它们是开发插件的关键：

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome 浏览器                          │
│                                                          │
│  ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │  Service Worker   │    │  Extension Pages             │ │
│  │  (background.js)  │    │  (index.html + app.js)       │ │
│  │                   │    │                              │ │
│  │  • 没有 DOM       │    │  • 有完整的 DOM              │ │
│  │  • 不能操作页面   │    │  • 可以渲染 UI               │ │
│  │  • 监听浏览器事件 │    │  • 可以直接调用 Chrome API   │ │
│  │  • 控制工具栏图标 │    │  • 用户直接看到和交互的页面  │ │
│  └──────────────────┘    └─────────────────────────────┘ │
│                                                          │
│  ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │  Content Scripts  │    │  Popup Page                  │ │
│  │  (本项目未使用)    │    │  (本项目未使用)               │ │
│  │                   │    │                              │ │
│  │  • 注入到网页中   │    │  • 点击工具栏图标弹出        │ │
│  │  • 可以读写网页DOM│    │  • 一个小窗口                │ │
│  └──────────────────┘    └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

| 运行环境 | 作用 | 有没有 DOM | Tab Out 是否使用 |
|---------|------|-----------|-----------------|
| **Service Worker** | 后台常驻，监听事件 | ❌ 没有 | ✅ `background.js` |
| **Extension Page** | 插件自己的网页 | ✅ 有 | ✅ `index.html` |
| **Content Script** | 注入到别人的网页里 | ✅ 有（别人的） | ❌ 未使用 |
| **Popup** | 点击工具栏图标弹出的小窗 | ✅ 有 | ❌ 未使用 |

### 1.3 Manifest V3

Chrome 插件有不同的"版本规范"。目前最新的是 **Manifest V3**（2021 年推出）。Tab Out 使用的就是 V3。

V3 相比 V2 的主要变化：
- 后台脚本从常驻的 "Background Page" 变成了按需唤醒的 **Service Worker**
- 更严格的权限管理
- 不允许使用 `eval()` 等动态代码执行

---

## 2. Tab Out 项目总览

### 2.1 项目做了什么？

Tab Out 用一个美观的仪表盘替换了 Chrome 的默认新标签页。当你打开新标签时，你看到的不是 Google 搜索框，而是：

- **所有打开的标签页**，按域名分组排列
- **首页标签组**，Gmail、X、YouTube 等首页聚合在一张卡片里
- **重复标签检测**，标注哪些标签你开了多份
- **"稍后阅读"**，可以保存标签到一个清单里
- **关闭标签时的动效**，swoosh 音效 + 五彩纸屑

### 2.2 文件结构

```
tab-out/
├── extension/              ← 整个插件的代码都在这里
│   ├── manifest.json       ← 插件的配置清单（身份证）
│   ├── background.js       ← Service Worker（后台脚本）
│   ├── index.html          ← 新标签页的 HTML 骨架
│   ├── app.js              ← 核心逻辑（~1500 行）
│   ├── style.css           ← 样式表（~1160 行）
│   └── icons/              ← 插件图标
│       ├── icon16.png      ← 16×16（工具栏用）
│       ├── icon48.png      ← 48×48（插件管理页用）
│       ├── icon128.png     ← 128×128（Chrome 商店用）
│       └── icon.svg        ← 矢量源文件
├── README.md
├── AGENTS.md
└── LICENSE
```

**注意：没有 `package.json`，没有 `node_modules`，没有构建步骤。** 这是一个纯静态的项目——写完代码直接在浏览器里加载就能运行。

---

## 3. manifest.json — 插件的"身份证"

每个 Chrome 插件都**必须**有一个 `manifest.json`，它告诉 Chrome：这个插件叫什么、需要什么权限、包含哪些文件。

```json
{
  "manifest_version": 3,
  "name": "Tab Out",
  "version": "1.0.0",
  "description": "Keep tabs on your tabs...",
  "permissions": ["tabs", "activeTab", "storage"],
  "chrome_url_overrides": { "newtab": "index.html" },
  "background": { "service_worker": "background.js" },
  "action": {
    "default_title": "Tab Out",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

逐字段解读：

| 字段 | 值 | 含义 |
|------|-----|------|
| `manifest_version` | `3` | 使用 Manifest V3 规范 |
| `name` | `"Tab Out"` | 插件在 Chrome 管理页和商店里显示的名称 |
| `version` | `"1.0.0"` | 版本号，发布更新时需要递增 |
| `description` | `"Keep tabs..."` | 一句话描述插件的功能 |
| `permissions` | `["tabs", "activeTab", "storage"]` | 声明插件需要的浏览器能力（详见下文） |
| `chrome_url_overrides` | `{ "newtab": "index.html" }` | **关键！** 用 `index.html` 替换默认新标签页 |
| `background` | `{ "service_worker": "background.js" }` | 注册后台 Service Worker |
| `action` | `{ ... }` | 工具栏上插件按钮的图标和提示文字 |
| `icons` | `{ "16": ..., "48": ..., "128": ... }` | 不同尺寸的图标，用于不同场景 |

### 3.1 权限（permissions）详解

```json
"permissions": ["tabs", "activeTab", "storage"]
```

- **`tabs`**：允许插件查询所有打开的标签页信息（URL、标题等）。这是 Tab Out 的核心权限——没有它就无法展示标签列表。
- **`activeTab`**：允许插件与当前激活的标签页进行交互。
- **`storage`**：允许使用 `chrome.storage.local` API 来持久化存储数据。Tab Out 用它来保存"稍后阅读"列表。

> **安全原则**：只申请你真正需要的权限。权限越少，用户越信任。Tab Out 没有申请 `<all_urls>`、`webRequest` 等敏感权限，因为它不需要读取或修改任何网页内容。

### 3.2 chrome_url_overrides — 替换新标签页

```json
"chrome_url_overrides": { "newtab": "index.html" }
```

这一行是 Tab Out 的灵魂。它告诉 Chrome：**当用户打开新标签页时，不要显示默认的搜索框页面，改为显示我的 `index.html`。**

除了 `newtab`，你还可以替换：
- `bookmarks`：书签管理器页面
- `history`：历史记录页面

---

## 4. background.js — 后台服务工作者

### 4.1 什么是 Service Worker？

Service Worker 是一个**没有界面**的 JavaScript 脚本，它运行在后台，独立于任何网页。你可以把它理解为一个"隐形助手"：

- **没有 DOM**：不能使用 `document.getElementById()` 之类的方法
- **按需唤醒**：Chrome 会在需要的时候启动它，空闲时自动休眠
- **监听事件**：它的主要工作方式是"注册事件监听器，等待事件发生"

### 4.2 Tab Out 的 background.js 做了什么？

Tab Out 的 Service Worker 只做一件事：**更新工具栏图标上的数字徽章（Badge）**。

```
┌─────────────────────┐
│  Chrome 工具栏       │
│                     │
│  [Tab Out 图标]      │
│       ┌──┐          │
│       │12│ ← Badge  │
│       └──┘          │
└─────────────────────┘
```

#### 核心函数 `updateBadge()`

```javascript
async function updateBadge() {
  // 1. 查询所有打开的标签页
  const tabs = await chrome.tabs.query({});

  // 2. 过滤掉浏览器内部页面（chrome://、about: 等）
  const count = tabs.filter(t => {
    const url = t.url || '';
    return (
      !url.startsWith('chrome://') &&
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('about:') &&
      !url.startsWith('edge://') &&
      !url.startsWith('brave://')
    );
  }).length;

  // 3. 设置 Badge 文字
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

  // 4. 根据标签数量设置颜色
  let color;
  if (count <= 10)      color = '#3d7a4a'; // 绿色：你很专注
  else if (count <= 20) color = '#b8892e'; // 琥珀色：有点多了
  else                  color = '#b35a5a'; // 红色：该清理了！

  await chrome.action.setBadgeBackgroundColor({ color });
}
```

#### 事件监听

```javascript
chrome.runtime.onInstalled.addListener(() => updateBadge()); // 插件安装时
chrome.runtime.onStartup.addListener(() => updateBadge());   // Chrome 启动时
chrome.tabs.onCreated.addListener(() => updateBadge());      // 新建标签时
chrome.tabs.onRemoved.addListener(() => updateBadge());      // 关闭标签时
chrome.tabs.onUpdated.addListener(() => updateBadge());      // 标签页URL变化时
```

这就是典型的 Service Worker 工作模式：**注册一堆事件监听器，然后等着被唤醒**。

> **设计亮点**：颜色编码让用户不用打开 Tab Out 就能知道自己开了多少标签——绿色安心，红色该清理了。

---

## 5. 新标签页覆盖 — 插件的"门面"

### 5.1 index.html 的结构

`index.html` 是用户每次打开新标签页时看到的页面。它的结构分为五个区域：

```
┌──────────────────────────────────────────────────────────┐
│ HEADER                                                   │
│   Good afternoon                                         │
│   FRIDAY, APRIL 18, 2026                                │
├──────────────────────────────────────────────────────────┤
│ TAB OUT DUPES BANNER (可选，仅在有多个新标签页时显示)      │
│   You have 3 Tab Out tabs open. Keep just this one?      │
├──────────────────────────────┬────────────────────────────┤
│ LEFT COLUMN: Open Tabs       │ RIGHT COLUMN: Saved Later  │
│                              │                            │
│ ┌──────────┐ ┌──────────┐   │ ☐ Article about Rust       │
│ │ GitHub   │ │ YouTube  │   │ ☐ Design patterns PDF      │
│ │ 5 tabs   │ │ 3 tabs   │   │                            │
│ └──────────┘ └──────────┘   │ ▸ Archive (12)             │
│ ┌──────────┐ ┌──────────┐   │                            │
│ │ Gmail    │ │ Reddit   │   │                            │
│ │ 2 tabs   │ │ 4 tabs   │   │                            │
│ └──────────┘ └──────────┘   │                            │
├──────────────────────────────┴────────────────────────────┤
│ FOOTER                                                   │
│   23 Open tabs                          Tab Out by Zara  │
├──────────────────────────────────────────────────────────┤
│ TOAST (浮动通知，操作后短暂出现)                           │
│   ✓ Closed 3 tabs from GitHub                            │
└──────────────────────────────────────────────────────────┘
```

### 5.2 HTML 设计哲学

注意 `index.html` 的几个特点：

1. **骨架式 HTML**：HTML 只定义结构和占位符，不包含任何数据。所有内容（标签列表、日期、统计）都由 `app.js` 动态填充。

2. **data-action 属性**：按钮不直接绑定 `onclick`，而是通过 `data-action` 属性标记动作类型：
   ```html
   <button class="tab-cleanup-btn" data-action="close-tabout-dupes">Close extras</button>
   ```
   这种方式配合事件委托（Event Delegation），使得一个事件监听器就能处理所有按钮点击。

3. **渐进增强**：`config.local.js` 通过 `onerror` 属性优雅降级——文件不存在也不会报错：
   ```html
   <script src="config.local.js" onerror="/* no personal config, that's fine */"></script>
   ```

4. **脚本加载顺序**：`app.js` 放在 `</body>` 之前，确保 DOM 加载完毕后再执行。

---

## 6. app.js — 核心业务逻辑详解

`app.js` 是整个项目的"大脑"，约 1500 行代码，负责所有的数据获取、处理和 UI 渲染。它分为以下几个模块：

### 6.1 模块架构

```
app.js 内部模块划分
━━━━━━━━━━━━━━━━━━━

┌────────────────────────┐
│  Chrome Tabs API 层     │  fetchOpenTabs(), closeTabsByUrls(), focusTab(), ...
│  直接与浏览器标签交互   │
└──────────┬─────────────┘
           │
┌──────────▼─────────────┐
│  Chrome Storage 层      │  saveTabForLater(), getSavedTabs(), checkOffSavedTab(), ...
│  "稍后阅读"数据持久化   │
└──────────┬─────────────┘
           │
┌──────────▼─────────────┐
│  数据处理层             │  域名分组, 标题清理, 首页识别, 重复检测
│  把原始数据变成可展示的  │
└──────────┬─────────────┘
           │
┌──────────▼─────────────┐
│  UI 渲染层              │  renderDomainCard(), renderDeferredColumn(), ...
│  生成 HTML 字符串       │
└──────────┬─────────────┘
           │
┌──────────▼─────────────┐
│  UI 辅助层              │  playCloseSound(), shootConfetti(), showToast(), ...
│  音效、动画、通知       │
└──────────┬─────────────┘
           │
┌──────────▼─────────────┐
│  事件处理层             │  click 事件委托，处理所有用户交互
│  连接 UI 操作和业务逻辑 │
└──────────────────────────┘
```

### 6.2 Chrome Tabs API 层

这一层封装了与 Chrome 标签页交互的所有操作。

#### `fetchOpenTabs()` — 获取所有标签页

```javascript
async function fetchOpenTabs() {
  const tabs = await chrome.tabs.query({});  // 查询所有标签页
  openTabs = tabs.map(t => ({
    id:       t.id,        // Chrome 分配的唯一 ID
    url:      t.url,       // 标签页的 URL
    title:    t.title,     // 标签页的标题
    windowId: t.windowId,  // 所属窗口的 ID
    active:   t.active,    // 是否是当前激活的标签
    isTabOut: ...           // 是否是 Tab Out 自己的页面
  }));
}
```

#### `closeTabsByUrls(urls)` — 按域名关闭标签

这个函数的设计很有意思：它不是按 URL 精确匹配，而是按 **hostname** 匹配。关闭一个 GitHub 分组时，会关闭所有 `github.com` 下的标签。

特殊处理：`file://` 协议的 URL 没有 hostname，所以用精确匹配。

#### `focusTab(url)` — 跳转到指定标签

```javascript
async function focusTab(url) {
  // 1. 先尝试精确 URL 匹配
  let matches = allTabs.filter(t => t.url === url);

  // 2. 找不到就退而求其次，按 hostname 匹配
  if (matches.length === 0) { ... }

  // 3. 优先选择不同窗口的匹配（这样才能真正"切换窗口"）
  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];

  // 4. 激活标签 + 聚焦窗口
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
}
```

> **设计亮点**：优先跳转到其他窗口的标签，因为用户如果在当前窗口，直接点标签栏就行了；跨窗口才是需要帮助的场景。

#### `closeDuplicateTabs(urls, keepOne)` — 关闭重复标签

保留一个副本，关闭其余的。优先保留处于 `active` 状态的那个。

### 6.3 Chrome Storage 层 — "稍后阅读"

Tab Out 使用 `chrome.storage.local` 存储"稍后阅读"列表。数据结构：

```javascript
// 存储在 chrome.storage.local 的 "deferred" key 下
[
  {
    id: "1712345678901",              // 时间戳作为唯一 ID
    url: "https://example.com",
    title: "Example Page",
    savedAt: "2026-04-04T10:00:00.000Z",
    completed: false,                  // true = 已勾选（归档）
    dismissed: false                   // true = 已删除
  }
]
```

**状态机**：

```
                ┌─────────────┐
                │   新建       │
  saveTabForLater()  │  completed=false │
                │  dismissed=false │
                └──────┬──────┘
                       │
            ┌──────────┼──────────┐
            │                     │
     checkOffSavedTab()    dismissSavedTab()
            │                     │
   ┌────────▼────────┐   ┌───────▼────────┐
   │    已归档        │   │    已删除       │
   │  completed=true  │   │  dismissed=true │
   │  （在 Archive 中  │   │  （彻底消失）   │
   │   仍然可见）     │   │                │
   └─────────────────┘   └────────────────┘
```

**为什么不用 `localStorage`？**

`chrome.storage.local` 相比浏览器原生的 `localStorage` 有几个优势：
- 存储容量更大（5MB vs localStorage 的 5~10MB，且可以通过 `unlimitedStorage` 权限解锁无限容量）
- 异步 API，不阻塞主线程
- 可以在 Service Worker 和 Extension Page 之间共享

### 6.4 数据处理层

#### 域名友好化 — `friendlyDomain(hostname)`

把 `mail.google.com` 变成 `Gmail`，把 `www.youtube.com` 变成 `YouTube`。内置了一个 60 多条记录的映射表 `FRIENDLY_DOMAINS`：

```javascript
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'mail.google.com':      'Gmail',
  'www.youtube.com':      'YouTube',
  'x.com':                'X',
  'claude.ai':            'Claude',
  // ... 60+ 条
};
```

对于没有在映射表中的域名，自动做智能处理：
- `*.substack.com` → `"XXX's Substack"`
- `*.github.io` → `"XXX (GitHub Pages)"`
- 其他：去掉 `www.` 和 TLD，首字母大写

#### 标题清理 — `stripTitleNoise()` + `cleanTitle()` + `smartTitle()`

标签页标题往往很"脏"，包含各种噪音。Tab Out 做了三层清理：

| 函数 | 作用 | 示例 |
|------|------|------|
| `stripTitleNoise()` | 去掉通知数字、邮箱地址 | `"(5) Inbox - john@gmail.com"` → `"Inbox"` |
| `cleanTitle()` | 去掉与域名重复的后缀 | `"React Docs - React"` → `"React Docs"` |
| `smartTitle()` | 根据 URL 生成更好的标题 | GitHub PR URL → `"owner/repo PR #123"` |

`smartTitle()` 对几个主流网站有特殊处理：
- **X/Twitter**：从 URL 提取 `@username`，显示为 `"Post by @username"`
- **GitHub**：识别 Issue、PR、代码文件路径
- **YouTube**：识别视频页面
- **Reddit**：识别 subreddit 和帖子

#### 首页识别 — `isLandingPage(url)`

有些页面是"首页"（Gmail 收件箱、X 首页、YouTube 首页），它们虽然和同域名的内容页在同一个域名下，但应该被单独分组。

```javascript
const LANDING_PAGE_PATTERNS = [
  { hostname: 'mail.google.com', test: (p, h) =>
      !h.includes('#inbox/') && !h.includes('#sent/') },  // Gmail 首页但不是具体邮件
  { hostname: 'x.com',           pathExact: ['/home'] },
  { hostname: 'www.linkedin.com', pathExact: ['/'] },
  { hostname: 'github.com',       pathExact: ['/'] },
  { hostname: 'www.youtube.com',  pathExact: ['/'] },
];
```

这样，"Gmail 收件箱"和"一封具体的 Gmail 邮件"会被分到不同的组里。关闭首页组不会影响正在阅读的邮件。

#### 标签分组算法

```
所有真实标签页
     │
     ▼
是首页？──── 是 ──→ 放入 "Homepages" 组
     │
     否
     │
匹配自定义规则？── 是 ──→ 放入对应自定义组
     │
     否
     │
     ▼
按 hostname 分组（file:// 统一放到 "Local Files" 组）
```

分组后的排序规则：
1. **Homepages 组永远排第一**
2. **与首页相关的域名**（如 `mail.google.com` 不是首页的那些邮件）排第二
3. **其余域名按标签数量降序排列**

### 6.5 UI 渲染层

#### 域名卡片 — `renderDomainCard(group)`

每个域名组渲染成一张卡片，内部包含：

```
┌──────────────────────────────────────────┐
│ ═══ 顶部颜色条（有重复=琥珀色，无=灰色）   │
│                                          │
│  GitHub          [5 tabs open] [2 dupes] │
│                                          │
│  🔖 owner/repo PR #123          [💾][✕]  │
│  ─────────────────────────────────────   │
│  🔖 owner/repo Issue #456       [💾][✕]  │
│  ─────────────────────────────────────   │
│  🔖 Some file path              [💾][✕]  │
│  ─────────────────────────────────────   │
│  +2 more                                 │
│                                          │
│  [Close all 5 tabs] [Close 2 duplicates] │
└──────────────────────────────────────────┘
```

关键设计：
- **去重显示**：同一个 URL 只显示一次，但用 `(2x)` 徽章标注有多少份
- **溢出折叠**：超过 8 个标签时，显示 "+N more" 按钮，点击展开
- **每行有两个操作按钮**：保存稍后阅读（💾）和关闭（✕）
- **Favicon 图标**：通过 Google 的 favicon 服务获取：`https://www.google.com/s2/favicons?domain=xxx&sz=16`

#### "稍后阅读"栏 — `renderDeferredColumn()`

右侧栏的渲染逻辑：

```
有活跃项 + 有归档 → 显示清单 + 折叠的 Archive 区
有活跃项 + 无归档 → 只显示清单
无活跃项 + 有归档 → 显示空状态文字 + Archive
无活跃项 + 无归档 → 整个右侧栏隐藏
```

### 6.6 UI 辅助层

#### 音效 — `playCloseSound()`

不使用任何音频文件，完全用 **Web Audio API** 合成一个"swoosh"音效：

```javascript
function playCloseSound() {
  const ctx = new AudioContext();
  // 1. 生成白噪声，叠加一个"快起慢落"的包络线
  // 2. 通过带通滤波器（bandpass），从 4000Hz 扫到 400Hz
  // 3. 音量从 0.15 渐弱到 0
  // 效果：一个从高到低的"嗖"声
}
```

> **设计亮点**：用代码合成音效，避免了加载音频文件的延迟和体积。0.25 秒的 swoosh 效果听起来非常自然。

#### 五彩纸屑 — `shootConfetti(x, y)`

纯 JavaScript + CSS 动画，不依赖任何库：

1. 在指定坐标创建 17 个小 `<div>` 元素
2. 每个元素随机选择颜色、大小、圆形/方形
3. 用 `requestAnimationFrame` 模拟物理运动：随机角度弹射 + 重力下坠 + 旋转
4. 700~900ms 后自动移除元素

#### Toast 通知 — `showToast(message)`

通过 CSS `transform` 和 `opacity` 实现的滑入/滑出动画，2.5 秒后自动消失。

### 6.7 事件处理层 — 事件委托模式

Tab Out 用了一个非常经典的模式：**事件委托（Event Delegation）**。

```javascript
document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'close-tabout-dupes') { ... }
  if (action === 'focus-tab') { ... }
  if (action === 'close-single-tab') { ... }
  if (action === 'defer-single-tab') { ... }
  if (action === 'check-deferred') { ... }
  if (action === 'dismiss-deferred') { ... }
  if (action === 'close-domain-tabs') { ... }
  if (action === 'dedup-keep-one') { ... }
  if (action === 'close-all-open-tabs') { ... }
  if (action === 'expand-chips') { ... }
});
```

**为什么用事件委托而不是给每个按钮绑定事件？**

因为 Tab Out 的 DOM 是动态生成的——每次渲染都会重建所有卡片的 HTML。如果给每个按钮绑定 `onclick`，每次渲染后都需要重新绑定。事件委托只需要在 `document` 上绑定一次，无论 DOM 怎么变化都能正常工作。

> 代码注释里有一个很好的比喻：**"一个保安看守整栋楼，而不是每扇门各放一个。"**

### 6.8 初始化流程

```javascript
// 文件末尾，一行启动整个应用：
renderDashboard();
```

`renderDashboard()` 的执行流程：

```
renderDashboard()
    │
    ├── 设置问候语 ("Good morning/afternoon/evening")
    ├── 设置日期 ("Friday, April 18, 2026")
    │
    ├── fetchOpenTabs()          ← 查询 Chrome 获取所有标签
    ├── getRealTabs()            ← 过滤掉浏览器内部页面
    │
    ├── 分组逻辑：
    │   ├── 识别首页标签 → 放入 Homepages 组
    │   ├── 匹配自定义规则 → 放入自定义组
    │   └── 按 hostname 分组
    │
    ├── 排序：Homepages > 首页域名 > 按标签数降序
    │
    ├── 渲染域名卡片（生成 HTML → innerHTML）
    ├── 更新页脚统计
    ├── 检查重复 Tab Out 标签
    │
    └── renderDeferredColumn()    ← 渲染"稍后阅读"侧栏
```

---

## 7. style.css — 视觉设计体系

### 7.1 设计系统

Tab Out 使用 CSS 自定义属性（CSS Variables）定义了一套完整的设计令牌：

```css
:root {
  --ink: #1a1613;          /* 主要文字颜色（深棕黑） */
  --paper: #f8f5f0;        /* 页面背景（暖白纸色） */
  --warm-gray: #e8e2da;    /* 分割线和边框 */
  --muted: #9a918a;        /* 次要文字 */
  --accent-amber: #c8713a; /* 强调色（琥珀色，用于关闭操作） */
  --accent-sage: #5a7a62;  /* 强调色（鼠尾草绿，用于保存操作） */
  --accent-slate: #5a6b7a; /* 强调色（石板蓝） */
  --accent-rose: #b35a5a;  /* 警告色（玫红） */
  --card-bg: #fffdf9;      /* 卡片背景（略暖于页面） */
}
```

**设计风格**：温暖的纸质质感（Paper Texture），不是冷冰冰的纯白背景，而是带有微妙颗粒感的暖色调。这通过 `body::before` 伪元素上的 SVG 噪点纹理实现：

```css
body::before {
  background-image: url("data:image/svg+xml,...feTurbulence...");
  opacity: 0.03;  /* 非常微弱，只是增加质感 */
}
```

### 7.2 字体系统

```
标题/数字：Newsreader（衬线体，优雅感）
正文/按钮：DM Sans（无衬线，现代感）
```

两者搭配产生了一种"杂志编辑台"的氛围。

### 7.3 布局系统

- **整体布局**：单列，最大宽度 960px（有侧栏时扩展到 1300px）
- **域名卡片网格**：使用 CSS Multi-column Layout（`columns: 280px`），自动瀑布流，类似 Pinterest
- **两栏布局**：Flexbox，左侧标签列表弹性伸缩，右侧"稍后阅读"固定 280px 宽度
- **响应式**：窄屏（< 800px）时两栏变为上下堆叠

### 7.4 动画系统

| 动画 | 技术 | 触发场景 |
|------|------|----------|
| 页面进入 | `@keyframes fadeUp` | 页面加载时，各元素错开时间依次浮入 |
| 卡片关闭 | `.closing` class | 缩小 + 淡出，0.25s |
| 标签行关闭 | JS inline style | 缩小到 80% + 淡出，0.2s |
| Toast 通知 | `.visible` class | 从下方滑入，2.5s 后滑出 |
| 清单项勾选 | `.checked` → `.removing` | 先划线 0.8s，再滑出 0.3s |
| 五彩纸屑 | JS + requestAnimationFrame | 关闭操作时从卡片中心爆发 |

### 7.5 颜色语义

Tab Out 对颜色有明确的语义约定：

- **琥珀色** (`--accent-amber`)：关闭/删除/需要注意（重复标签、关闭按钮）
- **鼠尾草绿** (`--accent-sage`)：保存/完成/正面（保存按钮、勾选、空状态）
- **玫红色** (`--accent-rose`)：严重警告（21+ 标签时的 Badge 颜色）
- **灰色** (`--muted`)：次要信息、非交互元素

---

## 8. Chrome API 使用详解

Tab Out 使用了三个 Chrome API，下面分别讲解：

### 8.1 `chrome.tabs` — 标签页操作

```javascript
// 查询所有标签页
const tabs = await chrome.tabs.query({});

// 查询特定条件的标签页
const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });

// 激活指定标签页
await chrome.tabs.update(tabId, { active: true });

// 关闭标签页（可以传单个 ID 或 ID 数组）
await chrome.tabs.remove(tabId);
await chrome.tabs.remove([id1, id2, id3]);
```

Tab 对象的主要属性：
```javascript
{
  id: 123,                           // Chrome 分配的唯一标识
  url: "https://github.com",         // 当前 URL
  title: "GitHub",                   // 页面标题
  windowId: 1,                       // 所属窗口 ID
  active: true,                      // 是否激活（当前可见）
  index: 0,                          // 在窗口标签栏中的位置
  pinned: false,                     // 是否被固定
  favIconUrl: "https://..."          // Favicon URL
}
```

### 8.2 `chrome.windows` — 窗口操作

```javascript
// 获取当前窗口
const currentWindow = await chrome.windows.getCurrent();

// 聚焦某个窗口（把它提到最前面）
await chrome.windows.update(windowId, { focused: true });
```

### 8.3 `chrome.storage.local` — 本地存储

```javascript
// 存储数据（异步操作）
await chrome.storage.local.set({ deferred: [...] });

// 读取数据（使用解构和默认值）
const { deferred = [] } = await chrome.storage.local.get('deferred');
```

### 8.4 `chrome.action` — 工具栏图标

```javascript
// 设置 Badge 文字
await chrome.action.setBadgeText({ text: '12' });

// 设置 Badge 背景色
await chrome.action.setBadgeBackgroundColor({ color: '#3d7a4a' });
```

### 8.5 `chrome.runtime` — 运行时信息

```javascript
// 获取插件 ID（用于识别自己的页面）
const extensionId = chrome.runtime.id;

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(() => { ... });

// 监听 Chrome 启动事件
chrome.runtime.onStartup.addListener(() => { ... });
```

---

## 9. 数据流与架构图

### 9.1 完整数据流

```
用户打开新标签页
       │
       ▼
Chrome 加载 index.html
       │
       ▼
app.js 执行 renderDashboard()
       │
       ├───────────────────────────────┐
       │                               │
       ▼                               ▼
chrome.tabs.query({})          chrome.storage.local.get('deferred')
  获取所有标签页                     获取保存的标签
       │                               │
       ▼                               │
  过滤浏览器内部页面                    │
       │                               │
       ▼                               │
  识别首页标签                          │
       │                               │
       ▼                               │
  按域名分组 + 排序                     │
       │                               │
       ▼                               ▼
  renderDomainCard()           renderDeferredColumn()
  生成左侧卡片 HTML              生成右侧清单 HTML
       │                               │
       └───────────────┬───────────────┘
                       │
                       ▼
                  innerHTML 写入 DOM
                       │
                       ▼
                 用户看到仪表盘
```

### 9.2 用户操作数据流

以"关闭单个标签"为例：

```
用户点击标签行的 ✕ 按钮
       │
       ▼
事件冒泡到 document 的 click 监听器
       │
       ▼
e.target.closest('[data-action]') 找到 data-action="close-single-tab"
       │
       ▼
从 data-tab-url 属性获取要关闭的 URL
       │
       ├──→ chrome.tabs.query({}) 找到匹配的标签
       │         │
       │         ▼
       │    chrome.tabs.remove(tabId) 关闭标签
       │         │
       │         ▼
       │    fetchOpenTabs() 刷新内存中的标签列表
       │
       ├──→ playCloseSound() 播放 swoosh 音效
       │
       ├──→ shootConfetti() 从芯片中心放五彩纸屑
       │
       ├──→ CSS 动画：缩小 + 淡出 0.2s 后移除 DOM 元素
       │
       ├──→ 检查父卡片是否已空 → 是则整卡片动画移除
       │
       ├──→ 更新页脚标签计数
       │
       └──→ showToast('Tab closed')
```

---

## 10. 关键设计决策

### 10.1 为什么没有用 React/Vue？

Tab Out 是一个纯 Vanilla JS 项目。原因：
- **Chrome 插件不需要构建步骤**：React 需要编译 JSX、打包代码，增加了复杂度
- **页面不复杂**：只有一个页面，交互模式固定，没有复杂的状态管理需求
- **性能**：新标签页需要极快加载，少一个框架就少几十 KB
- **字符串模板就够了**：域名卡片的渲染用模板字符串 + `innerHTML` 一次性写入，简单高效

### 10.2 为什么用 innerHTML 而不是 DOM API？

```javascript
// Tab Out 的方式（模板字符串 + innerHTML）
openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g)).join('');

// 另一种方式（createElement + appendChild）
// 代码量会膨胀 5-10 倍，但不存在 XSS 风险
```

好处：代码简洁，可读性强。

注意：Tab Out 对用户输入的 URL 和标题做了转义处理（`.replace(/"/g, '&quot;')`），防止 XSS 注入。不过因为数据源是 Chrome 的 tabs API（可信来源），风险很低。

### 10.3 为什么用事件委托？

因为 DOM 是动态生成的。每次 `innerHTML` 赋值后，之前绑定在子元素上的事件监听器都会丢失。事件委托绑定在不变的 `document` 上，永远有效。

### 10.4 为什么首页标签要单独分组？

如果 Gmail 首页和具体邮件混在一起，用户关闭"Gmail 组"时会误关正在阅读的邮件。把首页拆出来，就可以放心地一键清理所有首页标签。

### 10.5 为什么没有定时自动刷新？

Tab Out 只在页面加载时获取一次数据。因为：
- 新标签页每次打开都是一个全新的页面加载
- 用户的操作（关闭标签等）会立即调用 `fetchOpenTabs()` 更新数据
- 没有必要设置定时器持续轮询

---

## 11. 如何从零开发一个 Chrome 插件

以 Tab Out 为蓝本，总结开发 Chrome 插件的完整步骤：

### 11.1 最小可行插件

只需要两个文件：

```
my-extension/
├── manifest.json
└── popup.html
```

**manifest.json**：
```json
{
  "manifest_version": 3,
  "name": "My First Extension",
  "version": "1.0",
  "action": {
    "default_popup": "popup.html"
  }
}
```

**popup.html**：
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Hello, Chrome Extension!</h1>
</body>
</html>
```

### 11.2 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `my-extension/` 文件夹
5. 完成！点击工具栏图标就能看到你的弹窗

### 11.3 常见的插件类型

| 类型 | manifest 配置 | 典型例子 |
|------|-------------|---------|
| **弹窗（Popup）** | `action.default_popup` | 密码管理器、翻译工具 |
| **新标签页替换** | `chrome_url_overrides.newtab` | Tab Out、Momentum |
| **内容脚本** | `content_scripts` | 广告拦截器、暗色模式 |
| **侧边栏** | `side_panel` | AI 助手 |
| **DevTools 面板** | `devtools_page` | React DevTools |

### 11.4 开发调试技巧

1. **修改代码后**：去 `chrome://extensions` 点击刷新按钮（🔄），或直接重新加载页面
2. **查看控制台**：右键点击插件页面 → "检查" → 打开 DevTools
3. **查看 Service Worker 日志**：在 `chrome://extensions` 中点击 "Service Worker" 链接
4. **查看存储数据**：在 DevTools → Application → Storage → Extension Storage

### 11.5 从 Tab Out 学到的最佳实践

1. **权限最小化**：只申请必要的权限
2. **优雅降级**：`config.local.js` 不存在也不报错
3. **数据与视图分离**：先获取数据 → 处理成结构化对象 → 再渲染成 HTML
4. **事件委托**：一个监听器管所有动态元素
5. **无依赖**：不需要 npm、不需要打包工具，直接写直接跑
6. **用户体验细节**：音效、动画、空状态提示，这些"小事"让产品从能用变为好用

---

## 附录：文件行数与职责汇总

| 文件 | 行数 | 职责 |
|------|------|------|
| `manifest.json` | 21 | 插件配置清单 |
| `background.js` | 94 | 后台 Service Worker，维护工具栏 Badge |
| `index.html` | 135 | 页面 HTML 骨架，定义布局和占位符 |
| `app.js` | ~1483 | 核心逻辑：数据获取、分组、渲染、事件处理、音效动画 |
| `style.css` | ~1159 | 完整的视觉设计系统 |

**总计：约 2900 行代码**，实现了一个功能完整、体验精良的 Chrome 插件。没有任何外部依赖。
