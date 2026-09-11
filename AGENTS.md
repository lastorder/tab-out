# AGENTS.md — Tab Out

This file has two parts:

- **Part 1 — Installing Tab Out** for the user. Follow it top to bottom when someone says "install this".
- **Part 2 — Working on the code.** Read it before changing anything in `src/`.

---

# Part 1 — Installing Tab Out

You're installing **Tab Out** for the user. Your job is not just to set it up — it's to get them excited about using it.

## Step 0 — Introduce the product

Before doing anything technical, tell the user what they're about to get:

> **Tab Out** replaces your new tab page with a clean dashboard of everything you have open, grouped by domain.
>
> Here's what makes it great:
> - **See all your open tabs at a glance** grouped by domain on a grid
> - **Homepages group** pulls Gmail, X, LinkedIn, YouTube, GitHub homepages into one card for easy cleanup
> - **Close tabs with style** satisfying swoosh sound + confetti burst
> - **Duplicate detection** flags when you have the same page open twice
> - **Click any tab title to jump to it** even across different Chrome windows
> - **Save for later** bookmark individual tabs to a checklist before closing them
> - **Fully configurable** a settings page for pinned sites, homepage rules and custom groups
> - **100% local** no server, no accounts, no data sent anywhere
>
> It's a Chrome extension. Setup takes about 2 minutes.

## Step 1 — Clone and build

Tab Out is written in TypeScript, so there is a one-time build step. The folder you load into Chrome is `dist/`, **not** the repo root.

```bash
git clone https://github.com/zarazhangrui/tab-out.git
cd tab-out
npm install
npm run build
```

Confirm the build actually produced output before moving on:

```bash
ls dist/manifest.json && echo "Build OK"
```

If `npm install` fails with an `EPERM` error about `~/.npm`, the user's npm cache contains root-owned files. Work around it without sudo:

```bash
npm install --cache ./.npm-cache
```

## Step 2 — Load the extension in Chrome

This is the one step that requires manual action from the user. Make it as easy as possible.

**First**, print and copy the `dist/` path to their clipboard:

```bash
echo "Extension folder: $(cd dist && pwd)"
```

- macOS: `cd dist && pwd | pbcopy && echo "Path copied to clipboard"`
- Linux: `cd dist && (pwd | xclip -selection clipboard 2>/dev/null || echo "Path: $(pwd)")`
- Windows: `cd dist && echo %CD% | clip`

**Then**, open the extensions page:

```bash
open "chrome://extensions"
```

**Then**, walk the user through it step by step:

> I've copied the extension folder path to your clipboard. Now:
>
> 1. You should see Chrome's extensions page. In the **top-right corner**, toggle on **Developer mode** (it's a switch).
> 2. Once Developer mode is on, a **"Load unpacked"** button appears in the top-left. Click it.
> 3. A file picker will open. **Press Cmd+Shift+G** (Mac) or **Ctrl+L** (Windows/Linux) to open the "Go to folder" bar, then **paste** the path I copied (Cmd+V / Ctrl+V) and press Enter.
> 4. Click **"Select"** or **"Open"** and the extension will install.
>
> You should see "Tab Out" appear in your extensions list.

**Also**, open the file browser directly to the folder as a fallback:

- macOS: `open dist/`
- Linux: `xdg-open dist/`
- Windows: `explorer dist\\`

> ⚠️ Make sure they select **`dist/`**, not the repo root. Selecting the repo root is the most common install failure — Chrome reports "Manifest file is missing or unreadable".

## Step 3 — Show them around

Once the extension is loaded:

> You're all set! Open a **new tab** and you'll see Tab Out.
>
> Here's how it works:
> 1. **Your open tabs are grouped by domain** in a grid layout.
> 2. **Homepages** (Gmail inbox, X home, YouTube, etc.) are in their own group at the top.
> 3. **Click any tab title** to jump directly to that tab, even in another window.
> 4. **Click the X** next to any tab to close just that one (with swoosh + confetti).
> 5. **Click "Close all N tabs"** on a group to close the whole thing.
> 6. **Duplicate tabs** are flagged with an amber "(2x)" badge. Click "Close duplicates" to keep one copy.
> 7. **Save a tab for later** by clicking the bookmark icon before closing it. Saved tabs appear in the sidebar.
> 8. **Only one Tab Out page stays open** — opening a new one automatically closes the others.

## Step 4 — Point them at the settings page

Most people miss this, so mention it explicitly:

> Click the **gear icon** in the top-right of the dashboard (or right-click the extension icon → Options) to configure:
>
> - **Pinned sites** — the sites that always sit at the top. Sites with no open tabs show as click-to-open placeholders.
> - **Homepage rules** — which URLs count as a "homepage" and get collected into the Homepages card.
> - **Custom groups** — merge several hostnames into one card, or split one site into separate cards by path.
>
> Settings sync across your Chrome profile, and there are Export/Import buttons for backups.

Rule syntax worth explaining if they ask:

- Hostname `x.com` matches exactly; a **leading dot** like `.atlassian.net` matches any subdomain.
- **Path starts with** `/` matches every path on that host.
- **Except URLs containing** vetoes a match — it's how the Gmail inbox counts as a homepage while an individual email thread doesn't.

## Updating

```bash
cd tab-out && git pull && npm install && npm run build
```

Then click the **reload icon** on the Tab Out card in `chrome://extensions`.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| "Manifest file is missing or unreadable" | They selected the repo root. Select `dist/` instead. |
| `dist/` doesn't exist | `npm run build` wasn't run, or it failed. Re-run it and read the output. |
| `npm install` fails with `EPERM` on `~/.npm` | Root-owned npm cache. Use `npm install --cache ./.npm-cache`. |
| New tab is still Chrome's default | Another extension is also overriding the new tab page. Disable it in `chrome://extensions`. |
| Code changes don't show up | `dist/` is a build artifact. Run `npm run build`, then reload the extension. |

---

# Part 2 — Working on the code

## Commands

```bash
npm run build         # production build → dist/
npm run build:watch   # rebuild on change
npm run typecheck     # tsc --noEmit
npm test              # unit tests (vitest)
npm run check         # typecheck + test + build — run this before you finish
```

**Always run `npm run check` before declaring work done.**

## The one architectural rule

**Decisions are pure. Effects are injected.**

```
types/      Shared domain types
  ↓
core/       Pure logic. No chrome.*, no DOM. This is where decisions live.
  ↓
platform/   The seam over browser APIs: BrowserTabs, KeyValueStore
  ↓
config/     Settings: defaults, validation schema, storage-backed store
services/   Orchestration: TabActions, SavedTabsService
  ↓
ui/         Pure HTML string renderers + DOM effects
  ↓
newtab/ options/ background/    Entry points — thin wiring only
```

Consequences you must respect:

- **Never import `chrome.*` inside `core/` or `ui/render/`.** If you need browser data there, pass it in as an argument.
- **Never call `chrome.*` directly from a service.** Add a method to the `BrowserTabs` interface in `platform/browser.ts`, then implement it in the Chrome adapter *and* in `tests/helpers/fake-browser.ts`.
- **Entry-point `main.ts` files are composition roots.** They are the only place allowed to construct concrete adapters.

## Adding a feature

1. Put the decision logic in `core/` as a pure function. Write its tests first — they need no mocks.
2. Touching the browser? Extend `BrowserTabs` and both of its implementations.
3. Render markup with a pure function in `ui/render/`, emitting a `data-action` attribute.
4. Handle that action in `newtab/controller.ts` (add it to the `DashboardAction` union so the compiler checks you).
5. `npm run check`.

## Conventions that are easy to get wrong

- **Escape everything interpolated into HTML.** Page titles are attacker-controlled — any site can set its own `<title>`. Use `escapeHtml()` for content and `attr()` for attributes, both from `ui/html.ts`. Tests assert this; don't delete them.
- **No inline event handlers, ever.** Manifest V3's CSP blocks `onclick="…"` and `onerror="…"`. Use `data-action` + delegation. The favicon fallback lives in `ui/favicon.ts` for exactly this reason.
- **Settings must stay serialisable.** No functions in settings objects — they have to survive `chrome.storage`. That's why homepage rules are declarative data (`urlNotContains`) rather than predicates.
- **`normalizeSettings()` must never throw.** It repairs bad input and reports issues. Corrupt storage must never break the new tab page.
- **Keep defaults in normalised form.** `normalizeSettings(defaults)` must equal `defaults` — a test guards this.
- **Group cards are addressed by index** via `data-group-index`, not by a slugified name. Don't reintroduce string-derived DOM ids; they collide.
- **Closing by hostname vs exact URL is a real distinction.** Domain cards close by hostname; Homepages and custom groups close by exact URL so they don't take unrelated tabs with them. See `TabActions.closeGroup`.

## Storage layout

| Key | Area | Contents |
|-----|------|----------|
| `settings` | `chrome.storage.sync` | `TabOutSettings` — small, follows the user across machines |
| `deferred` | `chrome.storage.local` | Saved-tab records — can grow large, stays on the device |

Saved tabs are never hard-deleted: `completed` moves an item to the archive, `dismissed` hides it from both lists.

## Things that were deliberately removed

Don't "restore" these — their absence is the design:

- **The "Close extras" banner.** Tab Out is now a singleton: opening a dashboard auto-closes every other one (`newtab/singleton.ts`). No banner, no user action needed.
- **`config.local.js`.** Personal configuration now lives in the settings page and `chrome.storage`, not in a gitignored source file.
- **The `extension/` directory and `app.js`.** Replaced by `src/` plus a build step. `dist/` is generated and gitignored — never edit it by hand.
- **The `activeTab` permission.** It was unused; `tabs` already covers what's needed.

## Key facts

- Pure Chrome extension. No server, no telemetry, no external API calls (favicons come from Google's public favicon service).
- Manifest V3, permissions: `tabs`, `storage`.
- Zero runtime dependencies — everything shipped in `dist/` is first-party code.
- `dist/` is what gets loaded into Chrome, and it is gitignored.
