# 发布到 Chrome 应用商店

本文档讲怎么把 Tab Out 发布到 Chrome 应用商店：**首次上架必须手动做一次**，之后每次发版都可以由 GitHub Actions 自动完成（构建 → 打包 → 上传新版本 → 挂到 GitHub Release）。

发布流程由 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 驱动，它调用两个普通 Node 脚本，本地也能跑：

| 命令 | 作用 |
|------|------|
| `npm run package` | 把 `dist/` 打成 `release/tab-out-<version>.zip`（校验版本号，zip 根目录必须是 `manifest.json`） |
| `npm run publish:cws` | 把 zip 上传到应用商店（**默认只上传成草稿**，不提交审核） |

---

## 0. 一次性准备（手动，约 15 分钟）

### 0.1 注册开发者账号

到 [开发者控制台](https://chrome.google.com/webstore/devconsole) 注册，需一次性支付 **5 美元**。账号**必须开启两步验证**，否则无法发布。

### 0.2 手动创建 item 并首次上传

> ⚠️ **应用商店 API 不能创建新的 item**（[v2 API 移除了这个能力](https://developer.chrome.com/blog/cws-api-v2)）。所以第一次必须手动上传，之后 CI 才能更新它。

```bash
npm ci
npm run check          # 类型检查 + 单测 + 构建
npm run package        # → release/tab-out-1.0.0.zip
```

在控制台点击 **New item** → 上传这个 zip → 填写：

- **Store listing**：名称、简介、详细描述、分类、语言，以及**至少 1 张 1280×800 的截图**（最多 5 张）。首次上传时名称默认取 `manifest.json` 里的 `name`（当前是 `Tab Out 2`），之后可以在控制台改
- **Privacy**：说明 `tabs` 与 `storage` 权限的用途（在新标签页展示已打开的标签、分组、关闭标签、保存设置）。Tab Out 2 完全本地运行，选择「不收集用户数据」
- **Distribution**：可见性（Public / Unlisted）、地区

提交审核，通过后就正式上架了。

### 0.3 记下两个 ID

| 值 | 在哪找 |
|----|--------|
| **Extension ID** | 控制台里该 item 的 URL：`.../devconsole/.../<32位ID>` |
| **Publisher ID** | 控制台 → **Publisher** → **Settings** |

---

## 1. 配置认证（二选一）

两种方式都要先在 [Google Cloud Console](https://console.cloud.google.com) 建一个项目，并在搜索框里启用 **Chrome Web Store API**。

### 方案 A — Service Account（推荐，只需要 1 个 secret）

不需要交互式登录，最适合 CI。

1. 到 [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) 创建一个 service account（**不需要**授予任何 IAM 角色）
2. 进入它 → **Keys** → **Add key** → **Create new key** → **JSON**，下载密钥文件
3. 打开下载到的 JSON 文件，复制其中 `client_email` 的值
4. 回到[开发者控制台](https://chrome.google.com/webstore/devconsole) → **Account** → 把这个邮箱加进去（**一个 publisher 目前只能加一个 service account**）

> 这个 JSON 密钥等同于发布权限，别提交到仓库；`*.local.json` 和 `release/` 都已在 `.gitignore` 里。

### 方案 B — OAuth refresh token

1. 在 Cloud Console 配置 **OAuth consent screen**（类型 External，并把**你自己的邮箱**加到 Test users，这样不用等 Google 审核）
2. **Credentials** → **Create credentials** → **OAuth client ID** → 类型选 **Web application**，在 **Authorized redirect URIs** 里加 `https://developers.google.com/oauthplayground`
3. 打开 [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → 右上角齿轮 → 勾选 **Use your own OAuth credentials**，填入上一步的 client ID / secret
4. 左侧 **Input your own scopes** 填 `https://www.googleapis.com/auth/chromewebstore` → **Authorize APIs** → 用自己的账号登录
5. 点 **Exchange authorization code for tokens**，复制返回的 **refresh token**

> refresh token 会在改密码、被手动撤销、或长期不用之后失效；失效时重新走一遍第 3–5 步。

---

## 2. 配置 GitHub Secrets

仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**：

| Secret | 必填 | 说明 |
|--------|------|------|
| `CWS_EXTENSION_ID` | ✅ | 0.3 记下的 item ID |
| `CWS_PUBLISHER_ID` | ✅ | 0.3 记下的 publisher ID |
| `CWS_SERVICE_ACCOUNT_KEY` | 方案 A | service account JSON 密钥的**完整内容** |
| `CWS_CLIENT_ID` | 方案 B | OAuth client ID |
| `CWS_CLIENT_SECRET` | 方案 B | OAuth client secret |
| `CWS_REFRESH_TOKEN` | 方案 B | 上一步拿到的 refresh token |

用 `gh` 命令行设置（`CWS_SERVICE_ACCOUNT_KEY` 直接读文件，避免粘贴丢换行）：

```bash
gh secret set CWS_EXTENSION_ID        --body "<32位ID>"
gh secret set CWS_PUBLISHER_ID        --body "<publisher id>"
gh secret set CWS_SERVICE_ACCOUNT_KEY < ~/Downloads/tab-out-cws-key.json
```

---

## 3. 发一个新版本

版本号只有一个来源：`package.json#version`。构建时 `scripts/build.mjs` 会把它写进 `dist/manifest.json`，打包时 `scripts/package.mjs` 会检查两者一致，并且**当 tag 与 `package.json` 不一致时直接失败**。

```bash
# 1. 升版本号（Chrome 商店要求新版本号必须比线上高）
npm version patch --no-git-tag-version    # 1.0.0 → 1.0.1，也可以用 minor/major

# 2. 本地跑一遍完整检查
npm run check

# 3. 提交 + 打 tag + 推送（tag 就是发布按钮）
git commit -am "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

推送 `v*` tag 会触发 **Release** workflow：

1. `npm ci`
2. `npm run check`（类型检查 + 单测 + 构建，失败就停）
3. `npm run package --expect-version v1.0.1`（版本号校验 + 打包）
4. 把 zip 传成 workflow artifact（保留 30 天）
5. 调用应用商店 API **上传成草稿**（`uploadState` 为异步时会自动轮询直到完成）
6. 建/更新同名 GitHub Release，并把 zip 附上去

**它不会提交审核。** 线上版本保持不变，直到你在控制台里手动提交。

## 4. 提交审核

控制台 → 该 item → 看到新的 draft 版本 → **Submit for review**。审核通常几小时到几天；通过后自动对用户生效。

## 5. 手动运行 / 本地运行

- **只构建不发布**：仓库 **Actions** → **Release** → **Run workflow**，不要勾 *upload*，跑完从 artifact 下载 zip
- **手动上传一次草稿**：同上，勾选 *upload*
- **完全在本地跑**：

```bash
export CWS_EXTENSION_ID=...
export CWS_PUBLISHER_ID=...
export CWS_SERVICE_ACCOUNT_KEY="$(cat ~/Downloads/key.json)"

npm run check
npm run package
npm run publish:cws                 # 只上传成草稿
node scripts/publish.mjs --publish  # 额外提交审核
node scripts/publish.mjs --publish --staged   # 审核通过后先暂存，再手动发布
```

只想本地验证一个 zip 时：`node scripts/package.mjs --out /tmp/tab-out.zip`。

---

## 常见错误

| 报错 / 现象 | 原因与解决 |
|-------------|-----------|
| workflow 报 `version mismatch` | tag 和 `package.json#version` 不一致。升版本号后重新打 tag |
| 上传返回 **400** | 最常见是版本号没升（商店要求严格递增）；也可能是 zip 结构不对（根目录必须有 `manifest.json`） |
| 上传返回 **403** | Chrome Web Store API 没启用，或 service account 邮箱没加到控制台的 Account 里 |
| 上传返回 **404** | `CWS_PUBLISHER_ID` 或 `CWS_EXTENSION_ID` 写错了，或授权账号不是该 item 的拥有者 |
| 换 token 报 `invalid_grant` | refresh token 失效了（改过密码 / 被撤销 / 太久没用），重走方案 B 的步骤 3–5 |
| `CWS_SERVICE_ACCOUNT_KEY is not valid JSON` | 密钥内容没粘全，或被截断；用 `gh secret set ... < key.json` 更稳 |
| 提示不能创建 item | 首次必须手动上传一次，API 不支持新建 item |
| 审核被拒 | 看控制台的违规说明；常见原因是权限用途说明不够具体、隐私声明与行为不符 |

## 版本号规则

- 1–4 段数字，每段 0–65535，例如 `1.0.1`；不能有字母（`1.0.1-beta` 不行）
- 只能递增：可以上传 `1.1.0` 替换 `1.0.0`，不能上传更低的版本
- 上传只是替换 **draft**，线上版本在你提交审核并通过之前不会变
- **同一件商品**才受递增约束；这是一个全新 item，所以从 `1.0.0` 开始没问题

## 安全提醒

service account 的 JSON 密钥等价于该 publisher 的发布权限，只放在 GitHub Secrets 里；如果怀疑泄露，在 Cloud Console 里删掉这个 key 再建一个新的，然后更新 secret。仓库里的 `.gitignore` 已经忽略了 `*.local.json` 和 `release/`。

## 参考

- [Publish programmatically（官方教程）](https://developer.chrome.com/docs/webstore/using-api)
- [Chrome Web Store API v2 参考](https://developer.chrome.com/docs/webstore/api)
- [用 service account 调用 API](https://developer.chrome.com/docs/webstore/service-accounts)
- [V2 新 API 公告（V1 支持到 2026-10-15）](https://developer.chrome.com/blog/cws-api-v2)
