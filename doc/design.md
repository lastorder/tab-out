# Tab Out 设计文档

> 本文档面向零基础读者，通过 Tab Out 这个真实项目，手把手讲解 Chrome 插件的开发方式和设计思路。
>
> **v2 说明**：项目已从"单文件纯 JS"重构为"TypeScript + 分层架构 + 单元测试"。本文档同步更新，并在关键处解释**为什么这样改**——比"怎么写"更重要的是"为什么"。

---

## 目录

1. [Chrome 插件基础知识](#1-chrome-插件基础知识)
2. [Tab Out 项目总览](#2-tab-out-项目总览)
3. [架构总览：分层设计](#3-架构总览分层设计)
4. [manifest.json — 插件的"身份证"](#4-manifestjson--插件的身份证)
5. [background — 后台服务工作者](#5-background--后台服务工作者)
6. [core 层 — 纯逻辑](#6-core-层--纯逻辑)
7. [platform 层 — 与浏览器之间的"接缝"](#7-platform-层--与浏览器之间的接缝)
8. [config 层 — 可配置的设置系统](#8-config-层--可配置的设置系统)
9. [services 层 — 业务编排](#9-services-层--业务编排)
10. [ui 层 — 渲染与特效](#10-ui-层--渲染与特效)
11. [入口层 — newtab / options / background](#11-入口层--newtab--options--background)
12. [单元测试体系](#12-单元测试体系)
13. [构建与安装](#13-构建与安装)
14. [关键设计决策](#14-关键设计决策)
15. [如何扩展一个新功能](#15-如何扩展一个新功能)
16. [附录：文件清单](#16-附录文件清单)

---

## 1. Chrome 插件基础知识

### 1.1 什么是 Chrome 插件？

Chrome 插件（Chrome Extension）是一种运行在 Chrome 浏览器中的小程序，它可以：

- 修改网页的外观和行为
- 替换浏览器的默认页面（比如新标签页）
- 读取和操作你的标签页、书签、历史记录
- 在工具栏上显示图标和角标（Badge）

本质上，插件就是**一堆 HTML / CSS / JavaScript 文件 + 一个叫 `manifest.json` 的配置文件**。Chrome 读取这个配置文件，就知道该怎么加载和运行你的代码。

### 1.2 插件的几种运行环境

这是初学者最容易混淆的地方。插件的代码可能跑在几个**互相隔离**的地方：

| 运行环境 | 说明 | Tab Out 中的对应 |
|---------|------|-----------------|
| **扩展页面** | 插件自己的 HTML 页面，拥有完整的 `chrome.*` API 权限 | 新标签页 `index.html`、设置页 `options.html` |
| **Service Worker** | 没有界面的后台脚本，按需唤醒、用完即眠 | `background.js`（维护工具栏角标） |
| **Content Script** | 注入到别人网页里的脚本，权限受限 | **Tab Out 不使用** |

关键点：**它们之间不共享变量**。想通信要靠消息传递或共享存储。Tab Out 刻意把架构设计得很简单——新标签页直接调用 `chrome.tabs`，不需要任何跨环境通信。

### 1.3 Manifest V3

Manifest V3（简称 MV3）是 Chrome 当前的插件规范。相比老的 V2，对本项目影响最大的两点是：

1. **后台脚本从"常驻页面"变成了"Service Worker"**——它会被浏览器随时休眠，所以**不能依赖全局变量保存状态**。
2. **严格的内容安全策略（CSP）**：
   - 禁止 `<script>` 内联代码
   - 禁止 `onclick="..."`、`onerror="..."` 这类内联事件属性

> 💡 第 2 点在 v2 重构中造成了一个真实的改动：旧代码里的 `onerror="this.style.display='none'"`（图标加载失败就隐藏）其实**在 MV3 下是被 CSP 拦截的、根本不生效**。v2 改用了捕获阶段的全局监听器，见 [10.4](#104-favicon-兜底为什么不能用-onerror)。

---

## 2. Tab Out 项目总览

### 2.1 项目做了什么？

Tab Out 把 Chrome 的新标签页替换成一个"标签页仪表盘"：

- 把你打开的所有标签按**域名**分组，显示成卡片网格
- 把各种"首页"（Gmail 收件箱、X 首页、YouTube 首页……）收进一张 **Homepages** 卡片，方便一键清理
- 检测**重复标签**（同一个 URL 开了多次）
- 点击标题可以**跨窗口跳转**到那个标签
- 关闭标签时有**音效 + 五彩纸屑**
- 可以把标签**存进"稍后阅读"清单**再关掉
- 提供**设置页**，置顶站点 / 首页规则 / 自定义分组都可以自己配

### 2.2 文件结构

```
tab-out/
├── src/                      ← 源代码（TypeScript）
│   ├── manifest.json         ← 插件配置清单
│   ├── types/
│   │   └── index.ts          ← 全项目共享的类型定义
│   ├── core/                 ← 【纯逻辑层】不碰 chrome.*，不碰 DOM
│   │   ├── grouping.ts       ← 核心算法：标签 + 设置 → 卡片列表
│   │   ├── matching.ts       ← 首页规则 / 自定义分组规则的匹配
│   │   ├── selection.ts      ← 决定"某个操作作用于哪些标签"
│   │   ├── title.ts          ← 标题清洗
│   │   ├── domain.ts         ← 域名 → 友好品牌名
│   │   ├── duplicates.ts     ← 重复检测
│   │   ├── url.ts            ← URL 工具（永不抛异常）
│   │   ├── dashboard.ts      ← 识别与定位 Tab Out 自己的标签页
│   │   ├── history.ts        ← 关闭历史的排序与裁剪
│   │   ├── time.ts           ← 相对时间格式化
│   │   └── friendly-domains.ts ← 域名映射表（纯数据）
│   ├── platform/             ← 【接缝层】把 chrome.* 封在这里
│   │   ├── browser.ts        ← BrowserTabs 接口 + Chrome 实现
│   │   └── storage.ts        ← KeyValueStore 接口 + Chrome/内存实现
│   ├── config/               ← 【设置层】
│   │   ├── defaults.ts       ← 默认设置
│   │   ├── schema.ts         ← 校验与规范化（永不抛异常）
│   │   └── store.ts          ← 读写 chrome.storage.sync
│   ├── services/             ← 【编排层】
│   │   ├── tab-actions.ts    ← 所有"对浏览器的写操作"
│   │   └── saved-tabs.ts     ← 稍后阅读清单
│   ├── ui/                   ← 【表现层】
│   │   ├── html.ts           ← 转义工具（安全关键）
│   │   ├── icons.ts          ← 内联 SVG 图标
│   │   ├── effects.ts        ← 音效、纸屑、动画
│   │   ├── toast.ts          ← 浮动提示
│   │   ├── favicon.ts        ← 图标加载失败兜底
│   │   └── render/           ← 纯函数渲染器（数据 → HTML 字符串）
│   │       ├── cards.ts
│   │       └── saved.ts
│   ├── newtab/               ← 【入口】新标签页
│   │   ├── index.html
│   │   ├── main.ts           ← 组装根（唯一构造具体实现的地方）
│   │   ├── dashboard.ts      ← 渲染循环与状态
│   │   └── controller.ts     ← 事件委托
│   ├── options/              ← 【入口】设置页
│   │   ├── options.html
│   │   ├── draft.ts          ← 表单草稿模型（纯函数）
│   │   ├── render.ts         ← 表单渲染
│   │   └── main.ts           ← 事件与保存
│   ├── background/           ← 【入口】Service Worker
│   │   ├── badge.ts          ← 角标计算（纯函数）
│   │   └── main.ts           ← 事件监听
│   ├── styles/
│   │   ├── dashboard.css
│   │   └── options.css
│   └── icons/
├── tests/                    ← 单元测试（26 个文件，271 个用例）
│   ├── helpers/              ← 测试替身：假浏览器、数据工厂
│   ├── core/ config/ services/ ui/ options/ newtab/ background/
│   └── setup.ts
├── scripts/
│   ├── build.mjs             ← esbuild 构建脚本
│   └── clean.mjs
├── dist/                     ← 【构建产物】← Chrome 加载的是这个目录
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── AGENTS.md
└── LICENSE
```

### 2.3 为什么引入了构建步骤？

v1 的卖点之一是"**没有 package.json，没有构建步骤，写完直接跑**"。这在项目只有 1500 行时确实很爽。但当 `app.js` 长到 1738 行、所有函数挤在一个文件里、共享着一堆全局变量之后，问题浮现了：

| v1 的痛点 | v2 的解法 |
|-----------|-----------|
| 改一个函数不知道会不会影响别处 | TypeScript 静态类型 + 271 个单元测试 |
| 想加功能得在 1700 行里找位置 | 按职责分成 34 个模块 |
| 逻辑和 `chrome.*` 调用混在一起，没法测试 | `platform/` 接缝层，测试注入假对象 |
| 首页规则是硬编码的 JS 函数，用户改不了 | 改成可序列化的声明式数据 + 设置页 |

**付出的代价**是诚实的：用户现在需要 `npm install && npm run build`，安装时要选 `dist/` 而不是仓库根目录。README 和 AGENTS.md 都把这一点写在了最显眼的位置。

> 这是一个典型的工程取舍：**项目小的时候，零构建的简单性是真实收益；项目要长期演进时，类型与测试带来的信心更值钱。**

---

## 3. 架构总览：分层设计

### 3.1 一条核心规则

整个 v2 架构只围绕一句话：

> **决策是纯的，副作用是注入的。**
> （Decisions are pure, effects are injected.）

- **"决策"**＝ 该把哪些标签分到一组？该关掉哪几个标签？标题该显示成什么？
  这些全部放进 `core/`，是**不依赖任何环境的纯函数**。
- **"副作用"**＝ 真的去调用 `chrome.tabs.remove()`、真的去写 `chrome.storage`。
  这些全部通过 `platform/` 里定义的**接口**进行。

### 3.2 依赖方向

```
        types/            共享类型，谁都可以依赖
          ↓
        core/             纯逻辑：无 chrome.*，无 DOM
          ↓
      platform/           接缝：BrowserTabs / KeyValueStore 接口
          ↓
   config/  services/     设置管理、业务编排
          ↓
         ui/              纯渲染器 + DOM 特效
          ↓
  newtab/ options/ background/    入口：只做组装和接线
```

**依赖只能向下，不能向上。** `core/` 永远不知道 `services/` 的存在。

### 3.3 这样分层换来了什么？

**① 核心算法可以用普通对象测试，不需要浏览器**

```ts
// 不需要启动 Chrome，不需要 mock 任何全局变量
const groups = groupTabs(
  [{ id: 1, url: 'https://github.com/', title: '', windowId: 1, active: false, index: 0 }],
  { landingPatterns: [...], customGroups: [] },
);
expect(groups[0].key).toBe('__landing-pages__');
```

**② 涉及浏览器的逻辑，靠"假浏览器"测试**

```ts
const browser = createFakeBrowser([tab('https://github.com/a'), tab('https://example.com/')]);
await new TabActions(browser).closeGroup({ key: 'github.com', kind: 'domain', tabs: [...] });
expect(browser.tabs.map(t => t.id)).toEqual([2]);   // 真的验证了"关掉了哪些"
```

注意这里**没有 `vi.mock('chrome')` 之类的操作**。因为 `TabActions` 从构造函数接收 `BrowserTabs`，测试直接塞一个假的进去就行。这就是"接缝"的价值。

**③ 渲染逻辑也是纯函数**

`ui/render/` 里的函数都是 `数据 → HTML 字符串`，所以可以直接断言输出，包括断言**XSS 转义有没有生效**：

```ts
const html = renderGroupCard(groupWithHostileTitle, 0);
expect(html).not.toContain('<img src=x onerror=alert(1)>');
expect(html).toContain('&lt;img');
```

### 3.4 分层边界是被"验证"的，不只是"约定"

架构规则如果只写在文档里，迟早会腐化。所以可以用一条命令检查：

```bash
# core/ 和 ui/render/ 里出现任何真实的 chrome.* 调用都应该是 0
grep -rn "chrome\." src/core src/ui/render --include="*.ts" | grep -vE ':\s*(\*|//)'
```

当前结果：`core/`、`ui/render/`、`types/`、`config/`、`services/`、`options/` 中真实代码里的 `chrome.*` 调用数量**全部为 0**；只有 `platform/`、`newtab/main.ts`、`background/` 才碰浏览器 API。

---

## 4. manifest.json — 插件的"身份证"

每个插件都**必须**有 `manifest.json`。Tab Out 的版本（源文件在 `src/manifest.json`，构建时复制到 `dist/`）：

```json
{
  "manifest_version": 3,
  "name": "Tab Out",
  "version": "2.0.0",
  "description": "Keep tabs on your tabs. ...",
  "permissions": ["tabs", "storage"],
  "chrome_url_overrides": { "newtab": "index.html" },
  "background": { "service_worker": "background.js" },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "action": { "default_title": "Tab Out", "default_icon": { ... } },
  "icons": { "16": "...", "48": "...", "128": "..." }
}
```

### 4.1 权限（permissions）

| 权限 | 用途 |
|------|------|
| `tabs` | 读取标签的 URL 和标题、关闭标签、切换标签 |
| `storage` | 保存设置和"稍后阅读"清单 |

> ⚠️ v2 **删掉了 `activeTab` 权限**。检查代码后发现它从来没被用到过——`tabs` 已经覆盖了所有需求。
> **权限最小化原则**：能删的权限一定要删，用户在安装时看到的权限越少，信任成本越低。

### 4.2 `chrome_url_overrides` — 替换新标签页

```json
"chrome_url_overrides": { "newtab": "index.html" }
```

这一行就是"新标签页被接管"的全部魔法。只要装了插件，按 `Cmd+T` 打开的就是 `index.html`。

因为它是**插件自己的页面**（而不是注入到别人网页里的脚本），所以它拥有完整的 `chrome.*` 权限——这正是 Tab Out 不需要任何跨环境消息通信的原因。

### 4.3 `options_ui` — 注册设置页

```json
"options_ui": { "page": "options.html", "open_in_tab": true }
```

这是 v2 新增的。有了它：

- 在 `chrome://extensions` 里右键插件 → "选项" 可以进入设置页
- 代码中可以调用 `chrome.runtime.openOptionsPage()` 打开它（仪表盘右上角的齿轮按钮就是这么做的）

`open_in_tab: true` 表示在普通标签页里打开，而不是弹一个小窗口——设置页内容较多，用整页体验更好。

---

## 5. background — 后台服务工作者

### 5.1 Service Worker 的特点

MV3 的后台脚本是 Service Worker：**没有界面、按需唤醒、空闲时被杀掉**。

这意味着一条铁律：**不要用全局变量保存状态**。因为 Worker 随时可能被回收，下次唤醒时所有变量都没了。需要持久化就写 `chrome.storage`。

Tab Out 的后台任务非常单纯：**维护工具栏角标上的标签数**。

### 5.2 纯逻辑与副作用的拆分

即使是这么简单的功能，v2 也按架构规则做了拆分：

**`background/badge.ts`（纯函数，可测试）**

```ts
export const BADGE_THRESHOLDS = [
  { max: 10,       color: '#3d7a4a' },  // 绿：从容
  { max: 20,       color: '#b8892e' },  // 琥珀：有点多了
  { max: Infinity, color: '#b35a5a' },  // 红：该清理了
] as const;

export function badgeStateForTabs(tabs: readonly { url?: string }[]): BadgeState {
  if (count <= 0) return { text: '' };          // 0 个不显示"0"，留白更干净
  const t = BADGE_THRESHOLDS.find(t => count <= t.max) ?? BADGE_THRESHOLDS[2];
  return { text: String(count), color: t.color };
}
```

**`background/main.ts`（只负责接线）**

```ts
async function updateBadge(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const state = badgeStateForTabs(tabs.map(t => ({ url: t.url ?? '' })));
    await chrome.action.setBadgeText({ text: state.text });
    if (state.color) await chrome.action.setBadgeBackgroundColor({ color: state.color });
  } catch {
    void chrome.action.setBadgeText({ text: '' });   // 宁可清空，也不显示过期数据
  }
}

chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.tabs.onCreated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onUpdated.addListener(refresh);
refresh();   // Worker 首次启动时立刻跑一次
```

**为什么值得拆开？** 因为"11 个标签该显示什么颜色"这种阈值逻辑是最容易改错的地方，而它现在有 9 个测试守着：

```ts
it.each([[10, '#3d7a4a'], [11, '#b8892e'], [20, '#b8892e'], [21, '#b35a5a']])(
  'colours %i tabs %s', (count, color) => {
    expect(badgeStateForTabs(realTabs(count))).toEqual({ text: String(count), color });
  });
```

---

## 6. core 层 — 纯逻辑

这是整个项目的大脑，也是测试覆盖率最高的地方（接近 100%）。

### 6.1 `url.ts` — 永不抛异常的 URL 工具

标签页的 URL 千奇百怪：`chrome://newtab/`、`file:///tmp/a.md`、`about:blank`，还有加载中的空 URL。`new URL()` 遇到它们会**抛异常**。

所以这一层的所有函数都是"全函数"（total function）——任何输入都有合理返回值，绝不抛错：

```ts
export function parseUrl(url: string | undefined | null): URL | null {
  if (!url) return null;
  try { return new URL(url); } catch { return null; }
}

export function hostnameOf(url: string | undefined | null): string {
  return parseUrl(url)?.hostname ?? '';
}
```

两个值得注意的设计：

**① `file://` 的分组键**

`file://` URL 没有 hostname，直接按 hostname 分组会全部落空。所以专门给它一个桶：

```ts
export const LOCAL_FILES_KEY = 'local-files';

export function groupKeyOf(url): string {
  if (url?.startsWith('file://')) return LOCAL_FILES_KEY;   // 所有本地文件归成一组
  return hostnameOf(url);
}
```

**② "内部页面"判定**

```ts
export function isInternalUrl(url): boolean {
  if (!url) return true;      // ← 注意：URL 为空也算内部页面
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://')
      || url.startsWith('about:')   || url.startsWith('edge://')
      || url.startsWith('brave://') || url.startsWith('devtools://');
}
```

`!url → true` 这个细节很重要：正在加载、还没拿到 URL 的标签不应该被渲染成一张卡片。把"不确定"归为"内部页面"是安全的默认值。

### 6.2 `domain.ts` — 域名变友好名

```ts
friendlyDomain('mail.google.com')    // → 'Gmail'          （查表）
friendlyDomain('zara.substack.com')  // → "Zara's Substack"（规则）
friendlyDomain('my.github.io')       // → 'My (GitHub Pages)'
friendlyDomain('cool-tool.dev')      // → 'Cool-tool'      （去掉 www 和后缀）
```

映射表单独放在 `friendly-domains.ts` 里，**因为它是数据不是逻辑**。想支持一个新网站，加一行就行，不用碰任何代码分支。

### 6.3 `title.ts` — 标题清洗流水线

浏览器标题很吵：通知数、站点名后缀、甚至泄露的邮箱地址。三个函数串成流水线：

```
stripTitleNoise  →  smartTitle  →  cleanTitle
   去噪声            从 URL 推断      去掉冗余站点名
```

**`stripTitleNoise`** 去掉装饰性噪声：

```ts
'(3) Inbox (16,359) - me@example.com'  →  'Inbox'
'Zara on X: "hello"'                   →  'Zara: "hello"'
```

去掉邮箱既是为了简洁，**也是为了隐私**——分享屏幕时不至于把邮箱暴露在标题里。

**`smartTitle`** 在标题本身没用时（还在加载、或标题就是 URL）从 URL 推断：

```ts
smartTitle('', 'https://github.com/acme/app/pull/7')   // → 'acme/app PR #7'
smartTitle('', 'https://x.com/zara/status/123')        // → 'Post by @zara'
smartTitle('', 'https://reddit.com/r/ts/comments/...')  // → 'r/ts post'
```

**`cleanTitle`** 去掉结尾冗余的站点名：

```ts
cleanTitle('Some Long Article - Medium', 'medium.com')  // → 'Some Long Article'
```

这里有个容易忽略的保护：

```ts
const cleaned = title.slice(0, idx).trim();
if (cleaned.length >= MIN_CLEANED_LENGTH) return cleaned;   // 太短就放弃
```

如果标题是 `'Hi - Medium'`，砍掉后只剩 `'Hi'`，信息量反而更少，所以保留原样。**"清洗"不能清洗到损失信息。**

### 6.4 `matching.ts` — 声明式规则引擎

这是 v2 最重要的一次设计转变。

**v1 的写法（有致命缺陷）：**

```js
const LANDING_PAGE_PATTERNS = [
  { hostname: 'mail.google.com',
    test: (p, h) => !h.includes('#inbox/') && !h.includes('#sent/') },  // ← 是个函数！
];
```

用函数当然灵活，但它**没法被 `JSON.stringify`**，也就意味着：

- 存不进 `chrome.storage`
- 做不出可视化的设置表单
- 用户只能改代码

**v2 改成纯数据：**

```ts
{
  hostname: 'mail.google.com',
  pathPrefix: '/',                                    // 匹配该域名下所有路径
  urlNotContains: ['#inbox/', '#sent/', '#search/'],  // 但这些除外
}
```

同样表达了"Gmail 收件箱算首页，但具体某封邮件不算"，而且**可序列化、可编辑、可导出**。

匹配规则的优先级设计得很小心：

```ts
export function matchesLandingPattern(pattern: LandingPattern, url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (!hostnameMatches(pattern, parsed.hostname)) return false;

  // 否决优先：urlNotContains 可以推翻一个本来成立的匹配
  if (pattern.urlNotContains?.some(n => n && url.includes(n))) return false;

  if (pattern.pathPrefix)       return parsed.pathname.startsWith(pattern.pathPrefix);
  if (pattern.pathExact?.length) return pattern.pathExact.includes(parsed.pathname);
  return parsed.pathname === '/';   // 都没配 → 只匹配站点根路径
}
```

还有一个**安全默认值**：

```ts
function hostnameMatches(rule, hostname): boolean {
  if (rule.hostname)         return hostname === rule.hostname;
  if (rule.hostnameEndsWith) return hostname.endsWith(rule.hostnameEndsWith);
  return false;   // ← 两个都没填，永不匹配
}
```

为什么返回 `false` 而不是 `true`？因为用户在设置页里填到一半的规则不应该**把全互联网的标签都吞进去**。出错时要往"什么都不做"的方向倒。

### 6.5 `grouping.ts` — 核心分组算法

这是整个仪表盘的心脏：`标签 + 设置 → 有序的卡片列表`。

**第一步：分桶**（优先级很关键）

```ts
for (const tab of tabs) {
  if (isLandingPage(tab.url, landingPatterns)) { landingTabs.push(tab); continue; }  // ① 首页规则最高
  const rule = findCustomGroup(tab.url, customGroups);
  if (rule) { ensureGroup(rule.groupKey, 'custom', rule.groupLabel).tabs.push(tab); continue; } // ② 自定义分组
  ensureGroup(groupKeyOf(tab.url), 'domain').tabs.push(tab);                          // ③ 按域名
}
```

**为什么首页规则优先级最高？** 这样"GitHub 首页"进 Homepages 卡片，而"GitHub 的某个 PR"留在自己的 GitHub 卡片里。于是"清空所有首页"这个动作不会误伤你正在看的 PR。

**第二步：排序**

```
Homepages 卡片  →  首页规则提到过的域名  →  标签数多的  →  key 字母序
```

最后那条"key 字母序"看似多余，实则重要：**它保证了标签数相同的两张卡片每次渲染的相对位置一致**，页面不会莫名其妙地跳来跳去。

**第三步：置顶站点**（`applyPinnedSites`）

这一步逻辑最绕，三种情况：

1. 已经有该域名的卡片 → 提到最前面
2. 没有卡片，但有该域名的标签（可能正躺在 Homepages 卡片里）→ **把这些标签"抢"过来**建一张新卡片，并从原来的组里移除，避免同一个标签被渲染两次
3. 一个标签都没有 → 渲染一张灰色的"点击打开"占位卡片

第 2 种情况的"抢标签"是关键，对应的测试非常明确：

```ts
it('reclaims a pinned site's tabs from the Homepages group, without duplicating them', () => {
  // github.com 被置顶，它的首页标签要从 Homepages 移到自己的卡片
  expect(orderedGroups[0].tabs.map(t => t.id)).toEqual([10]);   // 新卡片拿到了
  expect(orderedGroups[1].tabs.map(t => t.id)).toEqual([11]);   // Homepages 只剩没被抢的
});
```

另外，`applyPinnedSites` 是**不可变的**——它先把输入深拷贝一份再操作，有一个专门的测试守着这点：

```ts
it('does not mutate the groups it was given', () => { ... });
```

> v1 用的是 `domainGroups.splice(...)` 直接改全局数组，这类"改着改着状态就乱了"的 bug 极难排查。v2 全部改成返回新数组。

### 6.6 `selection.ts` — 决定"关哪些标签"

这是**风险最高**的代码：算错了就是误删用户的标签页。所以它被单独抽出来做成纯函数，配了 17 个测试。

**按域名关闭 vs 按精确 URL 关闭——这个区分是真实需求：**

```ts
selectTabIdsByHostname(tabs, urls)   // 关掉该域名下所有标签
selectTabIdsByExactUrl(tabs, urls)   // 只关掉 URL 完全一样的
```

- 点"GitHub"卡片上的"关闭全部"→ 就该把所有 GitHub 标签都关掉（**按域名**）
- 点"Homepages"卡片上的"关闭全部"→ 只能关掉那几个首页，**不能**把你正在读的邮件一起关了（**按精确 URL**）

**跳转目标的选择也有讲究：**

```ts
return matches.find(tab => tab.windowId !== currentWindowId) ?? matches[0];
```

同一个 URL 开了多个时，**优先选不在当前窗口的那个**。否则点了半天没反应，用户会以为功能坏了。

---

## 7. platform 层 — 与浏览器之间的"接缝"

### 7.1 为什么需要这一层？

如果 `services/` 里直接写 `chrome.tabs.remove(...)`，测试时就只能去伪造全局的 `chrome` 对象——又脏又容易出错。

所以定义一个接口，把"Tab Out 需要浏览器做的所有事"列清楚：

```ts
export interface BrowserTabs {
  queryAll(): Promise<TabInfo[]>;
  queryCurrentWindow(): Promise<TabInfo[]>;
  close(tabIds: readonly number[]): Promise<void>;
  activate(tabId: number, windowId: number): Promise<void>;
  create(url: string, index: number): Promise<void>;
  move(tabId: number, index: number): Promise<void>;
  currentWindowId(): Promise<number>;
  currentTabId(): Promise<number>;
  onChanged(listener: () => void): () => void;
}
```

生产环境用 `createChromeBrowserTabs()`（转发给真的 `chrome.*`），测试用 `createFakeBrowser()`（纯内存实现）。

### 7.2 顺带做的两件好事

**① 收窄数据模型。** Chrome 的 `Tab` 对象字段几十个，Tab Out 只关心 6 个：

```ts
export function toTabInfo(tab: chrome.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1, url: tab.url ?? '', title: tab.title ?? '',
    windowId: tab.windowId ?? -1, active: tab.active ?? false, index: tab.index ?? 0,
  };
}
```

字段少了，测试里造数据也轻松，`core/` 的函数签名也更清晰。

**② 事件降噪。** `chrome.tabs.onUpdated` 在页面加载过程中会疯狂触发：

```ts
const onUpdated = (_id, change) => {
  // 只有 URL 变了或加载完成，才可能影响分组结果；中间态一律忽略
  if (change.url || change.status === 'complete') listener();
};
```

### 7.3 `storage.ts` — 同样的套路

```ts
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  onChanged(listener: (key: string) => void): () => void;
}
```

内存实现里有个容易被忽略的细节：

```ts
async set<T>(key: string, value: T): Promise<void> {
  data.set(key, structuredClone(value));   // ← 深拷贝
  emit(key);
}
```

**为什么要深拷贝？** 真实的 `chrome.storage` 是跨进程序列化的，存进去之后你再改原对象，存储里的值不会变。内存实现如果不拷贝，就会出现"测试通过但线上有 bug"的假象。**测试替身要模拟真实实现的语义，而不只是接口形状。**

这一点本身也有测试：

```ts
it('isolates stored values from later caller mutation', async () => {
  const value = { list: [1, 2] };
  await store.set('k', value);
  value.list.push(3);
  expect(await store.get('k')).toEqual({ list: [1, 2] });
});
```

---

## 8. config 层 — 可配置的设置系统

v2 最大的用户可见改进：**把硬编码的配置变成了一个设置页面。**

### 8.1 数据形状

```ts
export interface TabOutSettings {
  version: number;                      // 为将来的数据迁移预留
  pinnedSites: PinnedSite[];            // 置顶站点
  landingPatterns: LandingPattern[];    // 首页识别规则
  customGroups: CustomGroupRule[];      // 自定义分组规则
}
```

**铁律：设置里不允许出现函数。** 它必须能被 `chrome.storage` 序列化。这也是 [6.4](#64-matchingts--声明式规则引擎) 把首页规则改成声明式数据的根本原因。

### 8.2 `schema.ts` — 一个永不抛异常的校验器

设置数据可能来自三个**不可信**的地方：

1. 旧版本写进 `chrome.storage` 的数据
2. 设置页表单（用户可能填一半）
3. 用户导入的 JSON 文件（可能是任何东西）

所以所有入口都汇入 `normalizeSettings()`，它的契约是：

> **永不抛异常。能修的修，不能修的丢掉，并把丢掉的原因报告出来。**

```ts
export function normalizeSettings(raw: unknown): NormalizeResult {
  const issues: ValidationIssue[] = [];
  const defaults = createDefaultSettings();
  if (!isObject(raw)) return { settings: defaults, issues };   // 完全无法识别 → 用默认值
  // ... 逐条校验，坏的丢掉并记入 issues
  return { settings: { version, pinnedSites, landingPatterns, customGroups }, issues };
}
```

**为什么这么严格？** 因为这是**新标签页**。如果存储里有一条坏数据就让页面白屏，用户每按一次 `Cmd+T` 都会崩——而且他很难自己修好。**宁可降级，不可崩溃。**

它做的修复包括：

- `example.com` → `https://example.com/`（补协议）
- `home` → `/home`（补路径前缀斜杠）
- `https://x.com` 填在 hostname 字段 → 自动剥掉协议
- 重复的置顶 URL / 重复的 groupKey → 丢弃后者并报告

### 8.3 一个被测试抓到的真实 bug

写测试时我加了这样一条断言：

```ts
it('leaves the shipped defaults untouched', () => {
  const defaults = createDefaultSettings();
  expect(normalizeSettings(defaults).settings).toEqual(defaults);
});
```

**它失败了。** 原因是默认值里写的是 `'https://calendar.google.com'`（无尾斜杠），而 `normalizeUrlInput()` 会把它规范成 `'https://calendar.google.com/'`。

后果不严重但很恶心：用户每点一次"恢复默认"，存进去的数据都和源码里写的不一样。修复是把默认值直接写成规范形式，并把这条断言永久保留：

```ts
/**
 * URL 写成已规范化的形式（带尾斜杠），
 * 保证 normalizeSettings(defaults) === defaults。设置层的测试守着这个不变量。
 */
```

> 这正是单元测试的价值：**它逼你把"本该成立的性质"明确写出来，然后发现它其实不成立。**

### 8.4 存储位置的选择

| Key | 存储区 | 内容 | 为什么 |
|-----|--------|------|--------|
| `settings` | `chrome.storage.sync` | 设置 | 体积小，跨设备同步更方便 |
| `deferred` | `chrome.storage.local` | 稍后阅读清单 | 可能很大，`sync` 有配额限制 |

---

## 9. services 层 — 业务编排

### 9.1 `TabActions` — 所有对浏览器的写操作

这一层很薄，因为**决策都在 `core/`**，它只负责"拿数据 → 问 core → 执行"：

```ts
async closeGroup(group: TabGroup): Promise<number> {
  const urls = group.tabs.map(t => t.url);
  const tabs = await this.#browser.queryAll();

  // 关键判断：域名卡片按 hostname 关，Homepages/自定义分组按精确 URL 关
  const useExact = group.kind !== 'domain' || group.key === LANDING_GROUP_KEY;
  const ids = useExact ? selectTabIdsByExactUrl(tabs, urls)
                       : selectTabIdsByHostname(tabs, urls);
  await this.#browser.close(ids);
  return ids.length;
}
```

注意它**重新查询了一次 `queryAll()`**，而不是直接用 `group.tabs` 里的 id。因为渲染和点击之间可能隔了几十秒，用户可能已经手动关掉了一些标签——用实时数据更安全。

### 9.2 `SavedTabsService` — 稍后阅读

有两个设计值得说：

**① 软删除**

```ts
completed: true   → 移到"归档"，还能搜到
dismissed: true   → 两个列表都不显示，但记录仍在存储里
```

数据从不真正删除。用户误点一下不会永久丢失内容。

**② 依赖注入让测试可确定**

```ts
export interface SavedTabsDeps {
  now: () => Date;
  makeId: () => string;
}
```

测试里注入固定的时钟和自增 id，就能精确断言时间戳：

```ts
expect(archived[0].completedAt).toBe('2026-04-04T12:30:00.000Z');
```

不需要 `vi.useFakeTimers()` 去 hack 全局时间。

---

## 10. ui 层 — 渲染与特效

### 10.1 渲染器是纯函数

`ui/render/` 里全是 `数据 → HTML 字符串` 的纯函数。没有 DOM 操作，所以：

- 可以直接断言输出
- 可以断言 XSS 转义生效
- 可以断言"没有内联事件属性"

```ts
it('uses no inline event handlers, which MV3 would block', () => {
  expect(renderChip(tab('https://a.com/'), 1, 'a.com')).not.toMatch(/\son\w+=/);
});
```

### 10.2 HTML 转义：安全关键

**任何网站都能把自己的 `<title>` 设成任意字符串**，包括 `<img src=x onerror=...>`。而渲染器用模板字符串拼 HTML。所以：

```ts
export function escapeHtml(value: unknown): string {   // 元素内容与属性值通用
  return String(value).replace(/[&<>"']/g, c => HTML_ESCAPES[c] ?? c);
}
```

**所有**插入 HTML 的标题和 URL 都必须经过它们。测试里有专门的恶意输入用例：

```ts
it('escapes a hostile tab title', () => {
  const html = renderGroupCard(domainGroup([tab(url, { title: '<img src=x onerror=alert(1)>' })]), 0);
  expect(html).not.toContain('<img src=x onerror=alert(1)>');
});
it('escapes a hostile URL so it cannot break out of an attribute', () => {
  expect(html).not.toContain('"><script>');
});
```

> v1 只做了 `.replace(/"/g, '&quot;')`——只转义了引号，`<`、`>`、`&` 都没处理。v2 修掉了这个洞。

### 10.3 卡片用 index 定位，不用字符串 id

v1 的做法：

```js
const stableId = 'domain-' + group.domain.replace(/[^a-z0-9]/g, '-');
```

这个正则**没有 `i` 标志**，所以大写字母也会被替换成 `-`。结果是 `Work-Jira` 和 `work.jira` 会生成同样的 id——**冲突了就会关错卡片**。

v2 改成按渲染顺序编号：

```html
<div class="mission-card" data-group-index="3">
```

```ts
groupAt(index: number): TabGroup | null {
  return this.#model?.orderedGroups[index] ?? null;
}
```

渲染时占位卡片不占用编号，有测试守着：

```ts
it('numbers group cards consecutively, skipping placeholders', () => { ... });
```

### 10.4 favicon 兜底：为什么不能用 `onerror`

v1 的写法是：

```html
<img src="..." onerror="this.style.display='none'">
```

在 MV3 的 CSP 下，**这段内联 JS 根本不会执行**——也就是说这个兜底逻辑一直是失效的。

v2 的做法是在捕获阶段监听：

```ts
export function installFaviconFallback(root: Document = document): () => void {
  const handler = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.add('favicon-failed');
  };
  root.addEventListener('error', handler, true);   // ← true：error 事件不冒泡，必须用捕获
  return () => root.removeEventListener('error', handler, true);
}
```

配合一条 CSS：

```css
.favicon-failed { display: none !important; }
```

> 同样的原因，v1 中散落在 JS 里的 `style.cssText = '...'` 也尽量收敛回了 CSS 类（`.badge-amber`、`.close-all-btn`、`.footer-credit` 等）。

### 10.5 特效：音效与纸屑

**音效完全用 Web Audio API 合成，不打包任何音频文件：**

```ts
// 白噪声 + 带通滤波器从 4000Hz 扫到 400Hz = "唰"的一声
filter.frequency.setValueAtTime(4000, t);
filter.frequency.exponentialRampToValueAtTime(400, t + duration);
```

**纸屑是纯 JS 抛物线运动：**

```ts
const px = vx * elapsed;
const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;   // 自由落体
```

所有特效都被 `try/catch` 包着并静默失败——浏览器不支持音频，不该让仪表盘挂掉。

---

## 11. 入口层 — newtab / options / background

### 11.1 `main.ts` 是"组装根"

这是**唯一**允许构造具体实现的地方：

```ts
async function bootstrap(): Promise<void> {
  const browser       = createChromeBrowserTabs();
  const tabActions    = new TabActions(browser);
  const savedTabs     = new SavedTabsService(createChromeStore('local'));
  const settingsStore = new SettingsStore(createChromeStore('sync'));
  const historyService = new TabHistoryService(createChromeStore('local'));

  installFaviconFallback();

  // 先执行"单例"规则，再首次渲染 —— 这样渲染出来的数字已经排除了即将关闭的页面
  await tabActions.keepOnlyThisDashboard(dashboardUrls(chrome.runtime.id));
  // 然后把自己挪到标签栏最右 —— 之后新开的页面都在它左边
  await tabActions.moveDashboardToEnd(dashboardUrls(chrome.runtime.id));

  const dashboard = new Dashboard({ browser, tabActions, savedTabs, settingsStore, historyService });
  const scheduler = new RenderScheduler(() => dashboard.render());

  attachController(dashboard, scheduler);
  browser.onChanged(() => scheduler.schedule());
  settingsStore.onChanged(() => void dashboard.render());   // 设置页保存后自动刷新

  await dashboard.render();
}
```

其他所有模块都通过参数接收依赖，这就是它们能被测试的原因。

### 11.2 单例仪表盘：取代了 "Close extras"

**v1 的行为**：检测到开了多个 Tab Out 页面时，顶部弹一条横幅："你有 3 个 Tab Out 标签，只保留这一个？" 用户得手动点"Close extras"。

**v2 的行为**：直接关掉，不问。

```ts
// Tab Out 是一个"路过的地方"，不是一个"要收藏的标签"。
async keepOnlyThisDashboard(dashboardUrls: readonly string[]): Promise<number> {
  try {
    const keepTabId = await this.#browser.currentTabId();
    if (keepTabId === -1) return 0;          // 拿不到自己的 id 就什么都不做
    const tabs = await this.#browser.queryAll();
    const ids = selectStaleDashboardTabIds(tabs, dashboardUrls, keepTabId);
    await this.#browser.close(ids);
    return ids.length;
  } catch {
    return 0;   // 出错也不能影响仪表盘渲染
  }
}
```

判定"哪些算 Tab Out 页面"：

```ts
export function dashboardUrls(extensionId: string): string[] {
  return [
    `chrome-extension://${extensionId}/index.html`,
    `chrome-extension://${extensionId}/index.html#`,
    'chrome://newtab/',      // Chrome 有时会这样报告被覆盖的新标签页
  ];
}
```

**设计理由**：这条横幅解决的问题（Tab Out 页面堆积）本来就不该让用户操心。能自动做对的事，就不要做成一个需要用户决策的 UI。少一个横幅，少一次打断。

对应的核心函数当然也是纯的、有测试的：

```ts
export function selectStaleDashboardTabIds(tabs, dashboardUrls, keepTabId): number[] {
  const set = new Set(dashboardUrls);
  return tabs.filter(t => t.id !== keepTabId && set.has(t.url)).map(t => t.id);
}
```

测试明确保证了**永远不会误关普通页面**：

```ts
it('never touches ordinary pages', () => { ... });
```

### 11.3 `RenderScheduler` — 防抖 + 自我静音

```ts
export class RenderScheduler {
  schedule(): void {
    if (Date.now() < this.#mutedUntil) return;    // 静音期内直接忽略
    // ... 300ms 防抖
  }
  suppress(ms = 800): void { this.#mutedUntil = Date.now() + ms; }
}
```

**为什么需要 `suppress()`？** 当用户点"关闭这个标签"时：

1. 我们调用 `chrome.tabs.remove()`
2. 触发 `chrome.tabs.onRemoved`
3. 事件监听器要求重新渲染
4. **整页重绘，正在播放的纸屑动画被抹掉了**

所以在主动关闭标签前先 `suppress()`，给动画留出时间。

### 11.4 事件委托

整个仪表盘只在 `document` 上挂一个 click 监听器。元素通过 `data-action` 声明自己要干什么：

```ts
export type DashboardAction =
  | 'sort-tabs' | 'open-pinned-site' | 'open-settings' | 'expand-chips'
  | 'focus-tab' | 'close-tab' | 'save-tab' | 'complete-saved'
  | 'dismiss-saved' | 'close-group' | 'close-duplicates' | 'close-all-tabs';
```

把它定义成**联合类型**而不是 `string`，这样 `switch` 漏了分支 TypeScript 会报错。

好处：卡片是动态生成的，用委托就不用在每次重绘后重新绑定监听器。

### 11.5 设置页：草稿模型

设置页不直接编辑设置对象，而是编辑一个**全是字符串的"草稿"**：

```ts
export interface DraftState {
  pinned:  PinnedRow[];    // { url, label }
  landing: LandingRow[];   // { hostname, pathPrefix, pathExact, urlNotContains }
  custom:  CustomRow[];    // { groupKey, groupLabel, hostname, pathPrefix }
}
```

理由：

1. **表单字段天然是字符串**，草稿和表单一一对应，转换逻辑集中在一处
2. **不点保存就不写存储**，填到一半的内容不可能污染真实设置
3. **草稿模型是纯函数，可以完整测试**——增删行、上下移动、双向转换都有用例

一个巧妙的简化：hostname 字段用**前导点**表示后缀匹配。

```ts
'x.com'          → { hostname: 'x.com' }              // 精确匹配
'.atlassian.net' → { hostnameEndsWith: '.atlassian.net' }  // 匹配所有子域名
```

这样一个输入框就搞定了两种规则，用户不用理解"精确匹配 vs 后缀匹配"这种术语。

输入时**不重新渲染**，只更新草稿——否则光标会跳：

```ts
document.addEventListener('input', (event) => {
  // ... 只改 draft，只更新保存按钮状态，不重绘表单
  updateStatus();
});
```

---

## 12. 单元测试体系

### 12.1 规模

**26 个测试文件，271 个用例**，用 [Vitest](https://vitest.dev) 运行，全套跑完约 0.8 秒。

```bash
npm test              # 跑一次
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
```

### 12.2 覆盖率分布

| 层 | 语句覆盖率 | 说明 |
|----|-----------|------|
| `core/` | **99.8%** | 核心算法，风险最高，覆盖最全 |
| `services/` | 97.9% | 用假浏览器端到端验证 |
| `options/` | 97.9% | 草稿模型 + 表单渲染 |
| `config/` | 97.7% | 校验器的各种坏输入 |
| `ui/render/` | **100%** | 纯函数，含 XSS 断言 |
| `background/` | 100% | 角标阈值 + 历史记录 |
| `platform/` | 低 | **刻意的**——它就是 `chrome.*` 的转发层，没有逻辑可测 |
| `newtab/` | 中 | 渲染循环有集成测试，事件接线靠手测 |

**覆盖率不是均匀分布的目标，而是按风险分配的。** `platform/browser.ts` 覆盖率低是设计的结果：它里面每一行都是 `return chrome.tabs.xxx()`，为它写测试等于测试 Chrome 本身。

### 12.3 两个关键测试替身

**`createFakeBrowser()`** —— 内存版浏览器，能记录所有操作：

```ts
const browser = createFakeBrowser([tab('https://a.com/', { id: 1 })]);
await actions.closeByUrl('https://a.com/');
expect(browser.closed).toEqual([1]);      // 记录了关掉哪些
expect(browser.tabs).toHaveLength(0);     // 状态也真的变了
```

**`createMemoryStore()`** —— 内存版存储，语义对齐真实 `chrome.storage`（含深拷贝）。

### 12.4 集成测试：Dashboard 渲染循环

`Dashboard` 是"纯逻辑"和"DOM"的交界处，所以专门配了 13 个 jsdom 集成测试，真的去断言页面里的 HTML：

```ts
it('renders a card per domain and counts open tabs', async () => {
  const { dashboard } = await buildDashboard([
    tab('https://github.com/a'), tab('https://github.com/b'), tab('https://example.com/'),
  ]);
  await dashboard.render();

  expect(missions()).toContain('GitHub');
  expect(document.getElementById('openTabsSectionCount').innerHTML).toContain('2 domains');
  expect(document.getElementById('statTabs').textContent).toBe('3');
});
```

它能抓到类型检查抓不到的错误：元素 id 写错、忘了 `await`、model 没更新。

### 12.5 测试写法约定

- **不 mock 全局变量。** 需要 mock `chrome` 说明该模块设计错了，应该改成接收依赖。
- **时间和随机 id 靠注入。** 不用 fake timers。
- **恶意输入要有专门用例。** 标题和 URL 是攻击面。
- **不变量要写成断言。** 比如"默认值已是规范形式"、"函数不修改入参"。

### 12.6 什么**不**该测

测试也是要维护的代码。一个只是复述实现的用例，不会帮你发现 bug，却会在每次
重构时逼你改它——这种测试是负资产。

写之前先问一句：**这个用例能抓住什么 bug？** 答不上来就别写。

不值得测的：

- **一行透传。** `attr(v) { return escapeHtml(v) }` 这种函数，测了等于测 `return`。
- **同一件事测三层。** 服务层已经用 `createFakeBrowser()` / `createMemoryStore()`
  端到端验证过了，它内部调用的纯函数通常不必再单独测一遍。
- **语言本身的语义。** `Array.filter` 会不会工作，不是你的职责。

值得测的：

- **有分支的决策逻辑**——分组优先级、关哪些标签、规则匹配、校验。
- **值得写下来的不变量**——"默认值已是规范形式"、"函数不修改入参"。
- **修过的 bug**，防止回归。这类用例在注释里会写明它守的是什么。
- **HTML 转义**，因为页面标题是攻击面。
- **`Dashboard` 渲染循环**，jsdom 集成测试能抓到类型系统抓不到的接线错误。

> v2.4 的一次整理把用例从 395 个减到 271 个，代码却没有少覆盖任何真实风险——
> 减掉的几乎都是上面"不值得测"的三类。**测试的价值在于密度，不在于数量。**

---

## 13. 构建与安装

### 13.1 构建管线

`scripts/build.mjs` 用 esbuild 打三个包，再复制静态资源：

```
src/newtab/main.ts      →  dist/newtab.js      (~33 KB)
src/options/main.ts     →  dist/options.js     (~12 KB)
src/background/main.ts  →  dist/background.js  (~1 KB)

src/manifest.json       →  dist/manifest.json  (版本号自动同步 package.json)
src/newtab/index.html   →  dist/index.html
src/options/options.html→  dist/options.html
src/styles/*            →  dist/styles/*
src/icons/              →  dist/icons/
```

产物总共约 120 KB，**零运行时依赖**——`dist/` 里全是自己的代码。

版本号同步是个小而有用的细节：

```js
// manifest 的 version 永远跟 package.json 走，避免两处不一致
manifest.version = pkg.version;
```

### 13.2 常用命令

```bash
npm run build         # 生产构建 → dist/
npm run build:watch   # 改动自动重建（HTML/CSS 也会重新复制）
npm run typecheck     # tsc --noEmit
npm test              # 单元测试
npm run check         # typecheck + test + build —— 提交前跑这个
```

### 13.3 安装

```bash
npm install
npm run build
```

然后在 `chrome://extensions`：打开开发者模式 → "加载已解压的扩展程序" → **选择 `dist/` 目录**。

> ⚠️ **最常见的安装失败**：选成了仓库根目录。Chrome 会报 "Manifest file is missing or unreadable"，因为 `manifest.json` 在 `dist/` 里。

`dist/` 已被 `.gitignore` 忽略——**它是产物，永远不要手改，也不要提交**。

---

## 14. 关键设计决策

| 决策 | 理由 |
|------|------|
| **决策纯化，副作用注入** | 让 90% 的逻辑可以用普通对象测试，不需要浏览器 |
| **首页规则改成声明式数据** | 函数没法序列化，也就没法做设置页。数据可以存、可以编辑、可以导出 |
| **设置存 `sync`，稍后阅读存 `local`** | 设置小且值得跨设备同步；清单可能很大，会撞 `sync` 配额 |
| **校验器永不抛异常** | 这是新标签页。一条坏数据就白屏的话，用户每次开新标签都会崩 |
| **单例仪表盘取代 "Close extras"** | 能自动做对的事，不要做成需要用户决策的 UI |
| **卡片按 index 定位** | 字符串 slug 会冲突（`Work-Jira` 和 `work.jira`），会关错卡片 |
| **按域名关 vs 按精确 URL 关** | 关 GitHub 卡片该带走所有 GitHub 标签；关 Homepages 不能带走你在读的邮件 |
| **规则缺 hostname 时永不匹配** | 用户填到一半的规则不应该吞掉全互联网的标签 |
| **删掉 `activeTab` 权限** | 从未使用。权限最小化降低用户的信任成本 |
| **所有插值都转义** | 任何网站都能自定义 `<title>`，这是真实攻击面 |
| **软删除稍后阅读** | 误点一下不该永久丢失内容 |
| **排序按 key 做最终 tie-break** | 保证渲染稳定，卡片不会在重绘间跳动 |

---

## 15. 如何扩展一个新功能

按这个顺序走，架构会自然保持整洁：

**1. 把"决策"写成 `core/` 里的纯函数，先写测试。**

```ts
// src/core/my-feature.ts
export function decideSomething(tabs: readonly TabInfo[], settings: X): Y { ... }
```

它不需要任何 mock，测试写起来很快。

**2. 需要浏览器新能力？扩展接缝。**

在 `platform/browser.ts` 的 `BrowserTabs` 接口加一个方法，然后**两个实现都要补**：真实的 Chrome 适配器 + `tests/helpers/fake-browser.ts`。

**3. 渲染用 `ui/render/` 里的纯函数，输出带 `data-action`。**

记得用 `escapeHtml()`，不要写内联事件属性。

**4. 在 `newtab/controller.ts` 里处理这个 action。**

把新 action 加进 `DashboardAction` 联合类型，编译器会检查你有没有漏分支。

**5. 如果它该可配置，就走设置层。**

`types/` 加字段 → `config/defaults.ts` 给默认值 → `config/schema.ts` 加校验 → `options/draft.ts` 加表单行 → `options/render.ts` 渲染。

**6. `npm run check`。**

### 容易踩的坑

- ❌ 在 `core/` 或 `ui/render/` 里 `import chrome` → 不可测了
- ❌ 在 service 里直接调 `chrome.*` → 绕过了接缝
- ❌ 在设置里放函数 → 存不进 storage
- ❌ 用内联 `onclick` / `onerror` → 被 MV3 的 CSP 拦截
- ❌ 拼 HTML 时忘记转义 → XSS
- ❌ 让 `normalizeSettings()` 抛异常 → 新标签页会白屏

### 调试技巧

1. **新标签页 / 设置页**：直接 F12，就是普通网页的 DevTools
2. **Service Worker**：在 `chrome://extensions` 里点插件卡片上的 "Service Worker" 链接
3. **查看存储数据**：DevTools → Application → Storage → Extension Storage
4. **改完代码没生效**：`dist/` 是产物，要先 `npm run build`，再到 `chrome://extensions` 点刷新按钮

---

## 16. 附录：文件清单

### 源代码（TypeScript，34 个模块，约 3670 行）

| 模块 | 行数 | 职责 |
|------|-----:|------|
| `types/index.ts` | 119 | 全项目共享类型 |
| **core/** | | **纯逻辑，无依赖** |
| `core/grouping.ts` | 212 | 分组 + 排序 + 置顶站点，仪表盘核心算法 |
| `core/title.ts` | 178 | 标题清洗流水线 |
| `core/selection.ts` | 125 | 决定操作作用于哪些标签（风险最高） |
| `core/matching.ts` | 91 | 声明式规则匹配 |
| `core/duplicates.ts` | 85 | 重复检测与去重选择 |
| `core/friendly-domains.ts` | 76 | 域名 → 品牌名映射表（纯数据） |
| `core/url.ts` | 71 | 永不抛异常的 URL 工具 |
| `core/history.ts` | 53 | 关闭历史的去重、排序、裁剪 |
| `core/time.ts` | 50 | 相对时间、问候语 |
| `core/dashboard.ts` | 48 | 识别与定位 Tab Out 自己的标签页 |
| `core/domain.ts` | 39 | 域名友好化 |
| **platform/** | | **浏览器接缝** |
| `platform/browser.ts` | 107 | `BrowserTabs` 接口 + Chrome 实现 |
| `platform/storage.ts` | 74 | `KeyValueStore` 接口 + Chrome/内存实现 |
| **config/** | | **设置系统** |
| `config/schema.ts` | 296 | 校验与规范化（永不抛异常） |
| `config/defaults.ts` | 72 | 默认设置 |
| `config/store.ts` | 69 | 读写 `chrome.storage.sync` |
| **services/** | | **业务编排** |
| `services/tab-actions.ts` | 174 | 所有对浏览器的写操作 |
| `services/saved-tabs.ts` | 122 | 稍后阅读清单（软删除） |
| `services/tab-history.ts` | 121 | 关闭历史的读写 |
| `services/tab-snapshot-cache.ts` | 67 | tab id → 最后已知信息（session 存储） |
| **ui/** | | **表现层** |
| `ui/render/cards.ts` | 189 | 分组卡片、占位卡片与页面小标签 |
| `ui/effects.ts` | 154 | 音效、纸屑、淡出动画 |
| `ui/render/history.ts` | 63 | 历史面板列表 |
| `ui/render/saved.ts` | 56 | 稍后阅读侧栏 |
| `ui/html.ts` | 33 | HTML 转义（安全关键） |
| `ui/favicon.ts` | 23 | 图标加载失败兜底 |
| `ui/toast.ts` | 23 | 浮动提示 |
| `ui/icons.ts` | 20 | 内联 SVG |
| **入口** | | |
| `newtab/controller.ts` | 405 | 事件委托，所有交互 |
| `newtab/dashboard.ts` | 286 | 渲染循环与状态 |
| `newtab/main.ts` | 58 | 组装根 |
| `options/main.ts` | 280 | 设置页事件、保存、导入导出 |
| `options/draft.ts` | 215 | 表单草稿模型（纯函数） |
| `options/render.ts` | 123 | 表单渲染（数据驱动） |
| `background/main.ts` | 145 | Service Worker 事件接线 |
| `background/history-recorder.ts` | 55 | 关闭标签的记录逻辑 |
| `background/badge.ts` | 35 | 角标计算（纯函数） |

### 其他

| 文件 | 行数 | 职责 |
|------|-----:|------|
| `tests/**` | ~2840 | 26 个测试文件，271 个用例 |
| `styles/dashboard.css` | 1297 | 仪表盘视觉体系 |
| `styles/options.css` | 281 | 设置页样式 |
| `newtab/index.html` | 131 | 仪表盘骨架 |
| `options/options.html` | 94 | 设置页骨架 |
| `scripts/build.mjs` | ~115 | esbuild 构建管线 |
| `manifest.json` | 25 | 插件配置 |

### 规模小结

- **源代码**：约 4410 行 TypeScript + 1580 行 CSS + 225 行 HTML
- **测试代码**：约 2840 行，271 个用例
- **构建产物**：约 120 KB，零运行时依赖
- **测试/源码比**：约 0.64 —— 测试只覆盖真正会出错的地方，不追求行数

---

## 结语

v1 用 1738 行的单文件证明了"**想法是对的**"；v2 用分层架构和 271 个测试让它"**可以继续长大**"。

如果你只想从这份文档带走一句话，那就是：

> **把"决定做什么"和"真的去做"分开。**
> 前者是纯函数，测试起来几乎零成本；后者藏在接口后面，测试时可以整个换掉。
>
> 这一条规则，同时解决了可测试性、可维护性和可扩展性三个问题。
