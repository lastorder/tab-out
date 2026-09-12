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
> - **See all your open tabs at a glance** grouped by registrable domain on a grid — subdomains of the same site (like `mail.google.com` and `calendar.google.com`) share one card automatically
> - **Disposable tabs group** collects tabs that are safe to close — a site's own homepage (Gmail, X, GitHub) and spent one-off pages like a Zoom meeting's post-join screen — into one card, with a "Tidy up" button for closing them (plus duplicates and already-saved tabs) in one click
> - **Close tabs with style** satisfying swoosh sound + confetti burst
> - **Duplicate detection** flags when you have the same page open twice
> - **Click any tab title to jump to it** even across different Chrome windows
> - **Save for later** bookmark individual tabs to a checklist before closing them
> - **Fully configurable** a settings page for pinned sites and disposable rules — each can be switched off entirely with one checkbox
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
> 1. **Your open tabs are grouped by registrable domain** in a grid layout — `mail.google.com` and `calendar.google.com` land in the same card, since they're the same site underneath.
> 2. **Disposable tabs** (Gmail inbox, X home, YouTube, a spent Zoom meeting page, etc.) are in their own group at the top — safe to close because reopening them costs nothing.
> 3. **Click any tab title** to jump directly to that tab, even in another window.
> 4. **Click the X** next to any tab to close just that one (with swoosh + confetti).
> 5. **Click "Close all N tabs"** on a group to close the whole thing.
> 6. **Duplicate tabs** are flagged with an amber "(2x)" badge. Click "Close duplicates" to keep one copy.
> 7. **Save a tab for later** by clicking the bookmark icon before closing it. Saved tabs appear in the sidebar.
> 8. **"Tidy up"** appears next to "Close all" whenever there's something safe to close in one click — duplicates, disposable tabs, or tabs already on the saved-for-later list.
> 9. **Only one Tab Out page stays open** — opening a new one automatically closes the others, and it always sits on the rightmost tab, so anything you open next appears to its left.
> 10. **History** — click the clock icon to see every tab you've recently closed, however you closed it, and reopen one with a click. It updates live — close a tab and it shows up immediately, no refresh needed — and a reopened tab drops off the list immediately too.
> 11. **Your tab bar quietly reorders itself** to match the dashboard — this is on by default; turn it off in Settings for a manual "Sort tabs" banner instead.
> 12. **Pinned sites get a "Pinned" strip up top**, one small chip per site — click to jump to it if it's open, or to open it if it's not. A pinned tab is also highlighted and sorted first inside its own domain card below; pinning never pulls a tab into a separate card of its own.

## Step 4 — Point them at the settings page

Most people miss this, so mention it explicitly:

> Click the **gear icon** in the top-right of the dashboard (or right-click the extension icon → Options) to configure:
>
> - **Pinned sites** — a compact "Pinned" strip above the grid, plus a highlight on the matching tab inside its own domain card. Pinning is tab-level: it never merges or promotes a whole card. Has its own on/off switch.
> - **Disposable tabs** — which tabs are safe to close and get collected into the shared Disposable card: a site's own homepage, or a spent one-off page like Zoom's post-join screen. Also has its own on/off switch.
> - **Tab sorting** — turn auto-sort off if you'd rather sort manually via a banner.
> - **History** — how many recently closed tabs to remember (default 100).
>
> Settings sync across your Chrome profile, and there are Export/Import buttons for backups.

Rule syntax worth explaining if they ask:

- Hostname `x.com` matches exactly; a **leading dot** like `.zoom.us` matches any subdomain.
- Disposable rules narrow by a single **Path pattern** field, comma-separated: `/j/*` (prefix — that path and everything under it), `/home` (exact path only), `!#inbox/` (veto — excludes any URL containing that text). Blank matches only the site root. `/*, !#inbox/, !#sent/` is the shipped Gmail rule.
- Grouping merges subdomains of the same site automatically (by registrable domain), so there's no separate "merge these hostnames into one card" feature to configure any more.

If they had homepage or pinned-site rules saved from an older version, mention that a shipped default only ever seeds a fresh install — their own saved settings are never touched.

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
| A saved local `file://` tab won't reopen ("Couldn't open" toast) | Chrome requires per-extension opt-in for file access. Go to `chrome://extensions` → Tab Out → **Details** → toggle **Allow access to file URLs**. |

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
services/   Orchestration: TabActions, SavedTabsService, TabHistoryService
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

- **Escape everything interpolated into HTML.** Page titles are attacker-controlled — any site can set its own `<title>`. Use `escapeHtml()` from `ui/html.ts`, in element content and attribute values alike. Tests assert this; don't delete them.
- **No inline event handlers, ever.** Manifest V3's CSP blocks `onclick="…"` and `onerror="…"`. Use `data-action` + delegation. The favicon fallback lives in `ui/favicon.ts` for exactly this reason.
- **Settings must stay serialisable.** No functions in settings objects — they have to survive `chrome.storage`. That's why disposable rules are declarative data (`urlNotContains`) rather than predicates.
- **`normalizeSettings()` must never throw.** It repairs bad input and reports issues. Corrupt storage must never break the new tab page.
- **Keep defaults in normalised form.** `normalizeSettings(defaults)` must equal `defaults` — a test guards this.
- **Group cards are addressed by index** via `data-group-index`, not by a slugified name. Don't reintroduce string-derived DOM ids; they collide.
- **Closing by hostname vs exact URL is a real distinction.** Domain cards close by hostname; the Disposable card closes by exact URL so it doesn't take unrelated tabs with it. See `TabActions.closeGroup`.
- **History is recorded in the background worker, not the dashboard.** `chrome.tabs.onRemoved` doesn't include the tab's URL, so `background/main.ts` keeps a `TabSnapshotCache` (`chrome.storage.session`) updated on every create/update, and consumes it on removal. If you add a way to close tabs that bypasses `chrome.tabs.remove`, history recording still works — it listens at the browser level, not through `TabActions`.
- **The dashboard stays pinned to the rightmost tab.** `background/main.ts` calls `TabActions.moveDashboardToEnd` on every `chrome.tabs.onCreated`, and `newtab/main.ts` calls it once at boot. Both share `dashboardUrls()` from `core/dashboard.ts` — don't redefine "what counts as a dashboard tab" anywhere else.
- **Storage-backed panels should react to `onChanged`, not just to tab events.** `TabHistoryService.onChanged` (mirroring `SettingsStore.onChanged`) is what makes the History panel update the instant the background worker records a closure, instead of waiting for the next unrelated repaint or a manual refresh. If you add another background-written, dashboard-displayed list, wire it the same way rather than relying on `RenderScheduler`.
- **Don't derive live state from `Dashboard`'s last render model.** `#model` is a snapshot from the previous full render, and the moments you most want to repaint (a tab just closed) are exactly when it is stale. `renderHistoryPanel` queries open tabs live for this reason — reading `#model.realTabs` made a just-closed tab still look "open", which filtered its new history entry straight back out until the user refreshed.
- **`RenderScheduler.suppress()` delays repaints; it must never drop them.** The close handlers mutate the DOM directly for instant feedback, but only a real render recomputes derived state — e.g. a pinned site whose last tab closed has to return as a click-to-open placeholder instead of vanishing. `suppress()` therefore queues a catch-up render; if you add a new suppressed action, don't bypass it.
- **A settings field that isn't a row table (a number, a checkbox) lives directly on `DraftState`, not inside `pinned`/`disposable`.** See `maxHistoryItems` (string, parsed on save) and `autoSortTabs` (boolean, no parsing needed) for the pattern: add the field to `DraftState`, copy it in `settingsToDraft`/`draftToSettings`, validate it in `config/schema.ts` with a `normalize*` function that never throws, and give it its own `if (input.id === '…')` branch in `options/main.ts`'s input listener — it does not go through `mutateSection`.
- **Never render a user-controlled URL as a plain `<a href>`.** Chrome silently blocks top-level navigation to `file://` from an extension page, so a saved or historical `file://` tab could never be reopened by clicking a link. Every reopen path goes through `TabActions.openOrFocusTab()` (`chrome.tabs.create`/`chrome.tabs.update` under the hood) via a `data-action="open-saved"` / `"reopen-history"` button instead. If you add another place that reopens a stored URL, use this method, not an anchor tag.
- **`isInternalUrl()` excludes as little as it can get away with.** Browser system pages (`chrome://extensions`, `chrome://settings`, `edge://...`, `brave://...`) are real tabs the user manages on purpose, so they group, close and get recorded into history like any other page. The only things actually excluded are `chrome://newtab/` (the dashboard itself, in disguise), `chrome-extension://` (any extension's UI), `about:` (a loading placeholder), and `devtools://`. Don't broaden this back to a blanket `chrome://` prefix match.
- **A renamed stored field needs a legacy-key fallback in `normalizeSettings`, not just in `migrateSettings`.** `SettingsStore.load()` calls `normalizeSettings(raw)` *before* `migrateSettings(settings)`. When `landingPatterns` became `disposableRules`, a naive rename would have made `normalizeSettings` see the old key as simply absent and silently substitute the defaults — destroying every real user's saved rules on their first load after upgrading. The fix reads `raw['disposableRules'] ?? raw['landingPatterns']` inside `normalizeSettings` itself; `migrateSettings` only stamps the version number. Any future field rename needs the same shape of fix, in the same place.
- **A pure decision that both a button's visibility and its label depend on belongs in `core/`, not in the renderer.** `core/tidy.ts`'s `selectTidyTabIds()` decides *which* tabs "Tidy up" would close and *why* (as a `{ disposable, saved, duplicates }` breakdown that always sums to the total); `newtab/dashboard.ts` only turns that into HTML and a tooltip string. This is what makes "does the button appear, and does its count match reality" testable without a DOM.
- **The options-page "Path pattern" field is a presentation-layer encoding, not a schema change.** `DisposableRule` still has separate `pathPrefix` / `pathExact` / `urlNotContains` fields in storage and in `core/matching.ts` — nothing there changed. Only `options/draft.ts`'s `patternToField()` / `patternFromField()` collapse those three into one comma-separated field (`/j/*` = prefix, `/home` = exact, `!#inbox/` = veto) for editing, the same way `hostnameToField()` / `hostnameFromField()` already collapse `hostname` / `hostnameEndsWith` into one. If you touch this, keep the round-trip lossless for every shipped default — there's a test for exactly that.
- **Domain cards group by registrable domain, not raw hostname.** `core/url.ts`'s `groupKeyOf`/`registrableDomainOf` collapse `mail.google.com` and `calendar.google.com` to `google.com` before `core/grouping.ts`'s `groupTabs()` ever buckets tabs, so subdomains of one site share a card without a merge rule. `isDisposableDomain` (in `core/matching.ts`) compares against this same registrable-domain key, not the rule's raw hostname — don't compare a rule's `hostname` field directly against a group's `key` again.
- **Pinning is tab-level, not group-level.** `core/grouping.ts#buildPinnedStrip` never touches which card a tab belongs to — it only looks up, per pinned site, the matching open tab (by hostname) for the "Pinned" strip, and `pinnedHostnameSet()` feeds `ui/render/cards.ts#renderGroupCard` a set used purely to sort that tab first within its own card and badge its chip. If you need "pin this whole card" back, that is a deliberately different feature from this one — don't quietly conflate them.

## Testing

Tests exist to catch real mistakes, not to restate the implementation. Before
adding one, ask what bug it would catch.

**Worth testing:**
- Decision logic with branches — grouping precedence, which tabs an action
  closes, rule matching, validation.
- Invariants worth stating out loud (`normalizeSettings(defaults) === defaults`;
  `buildPinnedStrip` doesn't mutate its input).
- Past bugs, so they stay fixed. Several tests exist only for this and say so
  in a comment — leave those alone.
- HTML escaping, since page titles are attacker-controlled.
- `Dashboard`'s render loop, via the jsdom integration suite — it catches
  wiring mistakes (wrong element id, missed `await`) that types can't.

**Not worth testing:**
- Pass-throughs and one-line wrappers.
- The same behaviour at three layers. Prefer the outermost meaningful one:
  services are covered through `createFakeBrowser` / `createMemoryStore`, so
  their pure helpers rarely need separate tests.
- Language semantics (`Array.filter` works).

Prefer a few `it.each` tables over many near-identical cases, and assert on
behaviour ("closing Disposable spares the email you're reading") rather than on
internals.

## Storage layout

| Key | Area | Contents |
|-----|------|----------|
| `settings` | `chrome.storage.sync` | `TabOutSettings` — small, follows the user across machines |
| `deferred` | `chrome.storage.local` | Saved-tab records — can grow large, stays on the device |
| `closedTabHistory` | `chrome.storage.local` | Closed-tab history, capped at `settings.maxHistoryItems` |
| `tabSnapshots` | `chrome.storage.session` | tab id → last-known `{url,title}`; cleared when the browser closes |

Saved tabs are never hard-deleted: `completed` moves an item to the archive, `dismissed` hides it from both lists. History entries *are* hard-deleted (by url, by id, or via "Clear all") — there is no archive for them.

## Things that were deliberately removed

Don't "restore" these — their absence is the design:

- **The "Close extras" banner.** Tab Out is now a singleton: opening a dashboard auto-closes every other one (`TabActions.keepOnlyThisDashboard`). No banner, no user action needed.
- **`config.local.js`.** Personal configuration now lives in the settings page and `chrome.storage`, not in a gitignored source file.
- **The `extension/` directory and `app.js`.** Replaced by `src/` plus a build step. `dist/` is generated and gitignored — never edit it by hand.
- **The `activeTab` permission.** It was unused; `tabs` already covers what's needed.
- **Custom groups.** `CustomGroupRule`, `customGroups`/`customGroupsEnabled`, `findCustomGroup`/`matchesCustomGroup`, and the whole "Custom groups" options panel are gone. Merging several hostnames into one card is now automatic — grouping by registrable domain (see below) already puts `mail.google.com` and `calendar.google.com` on one card without a rule. Don't reintroduce a merge-rule feature to solve a problem registrable-domain grouping already solves.
- **Whole-card pinning.** Pinning used to promote a pinned site's entire card to the front of the grid (and render a placeholder card when nothing was open). It's tab-level now: see the "Pinning is tab-level, not group-level" convention above. `applyPinnedSites()` and the `DashboardEntry` `'placeholder'` variant are gone along with it — don't resurrect a "promote this whole card" code path.

## Key facts

- Pure Chrome extension. No server, no telemetry, no external API calls (favicons come from Google's public favicon service).
- Manifest V3, permissions: `tabs`, `storage`.
- Zero runtime dependencies — everything shipped in `dist/` is first-party code.
- `dist/` is what gets loaded into Chrome, and it is gitignored.
