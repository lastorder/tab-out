# Tab Out 2

**Keep tabs on your tabs.**

Tab Out 2 is a Chrome extension that replaces your new tab page with a dashboard of everything you have open. Tabs are grouped by registrable domain, the ones that are safe to close are swept into a **Disposable** card, every tab you close lands in a searchable **History**, and a settings page lets you pin sites and write your own rules. Close tabs with a satisfying swoosh + confetti.

No server. No account. No external API calls. Just a Chrome extension.

---

## About this fork

Tab Out 2 is a fork of **[zarazhangrui/tab-out](https://github.com/zarazhangrui/tab-out)** — Zara's original Tab Out: a single-file JavaScript extension that groups your open tabs by domain. The idea, the design and the dashboard are hers, and all credit for them goes to her.

This fork starts from that project (upstream `2c9b9c5`, *"feat: bento layout + custom group support"*) and develops it further. In short: it was **rewritten in TypeScript** with a testable architecture and gained a set of **user-facing features that upstream doesn't have** — History, pinned sites, Disposable tabs with a "Tidy up" button, a search overlay, automatic tab sorting, and a settings page. The two projects have since diverged substantially.

If you want the original, leaner extension, use **[upstream](https://github.com/zarazhangrui/tab-out)**. This repo is the extended one.

---

## What's new in this fork

### Closed-tab History — everything you closed, one click from coming back

A **History** panel (clock icon, top-right) lists every tab you've closed recently — however you closed it: Tab Out's own buttons, Chrome's tab ✕, or closing a whole window. It's recorded in the background worker, so nothing slips through.

- Updates **live** — close a tab anywhere and it appears immediately, no refresh
- Click a row to reopen it; it leaves the list the moment it's open again, so a URL is never shown as both open and closed
- **Disposable tabs are skipped** — anything matching an enabled disposable rule (the Gmail inbox, GitHub's front page, a spent Zoom page…) is never recorded, so History stays a list of things actually worth reopening instead of the clutter "Tidy up" just cleared
- Has its own search box, and a configurable retention limit (default: last 100)

Upstream had no history at all.

### Disposable tabs + Tidy up — closing the boring tabs in one click

Upstream grouped "homepages" (Gmail inbox, X home…) into one card with a fixed, hard-coded list. This fork turns that into a **configurable rule system** and adds the cleanup button that makes it useful:

- **Disposable rules** match a hostname *plus a path pattern*, so you can be precise: prefix (`/j/*`), exact (`/home`), or veto (`!#inbox/` — *exclude* anything containing this). The shipped Gmail rule is `everything on mail.google.com except #inbox/, #sent/ and #search/`, which means your inbox is clutter but the email you're reading is not.
- Non-homepage clutter works too: the default set includes Zoom's post-join launcher page (`.zoom.us` + `/j/*`) — the call is in the desktop app, so that tab is pure leftover.
- **Tidy up** appears next to "Close all" whenever there's something safe to close — duplicates, disposable tabs, and tabs already on your saved list — and closes all of it in one click. Its tooltip and the toast spell out the breakdown (*"Closed 6 tabs — 3 disposable, 2 duplicates, 1 already saved"*), so nothing closes as a surprise.
- The whole group has an on/off switch, and **"+ Add suggested rules"** picks up new or corrected defaults without touching rules you've written.

### Pinned sites — always-visible shortcuts, inside their own card

New: pin the sites you always want at hand (Settings → Pinned sites). A pinned site with an open tab looks like any other tab in its domain card; one with **no** open tab still shows up in that card as a greyed, click-to-open placeholder, so your shortcuts never disappear.

- A pin claims a tab by **hostname + path** — pinning `https://calendar.google.com/` keeps labelling it "Google Calendar" after Calendar redirects deeper, while pinning one Jira board doesn't rename every other Jira tab
- Most specific pin wins, so a pin on a site root and a pin on a deep page inside it can coexist
- Give a pin its own **label**, and reorder the list: cards and chips follow your configured pin order first, then alphabetical
- Has its own on/off switch

Upstream had no pinning.

### Search overlay — find a tab without hunting for it

A configurable keyboard shortcut (default **Cmd+F** on macOS, **Ctrl+F** elsewhere) opens an overlay that searches across your **open tabs and closed-tab history** at once. Arrow keys move the selection, Enter jumps to an open tab or reopens a closed one. Only active on the Tab Out page, and the shortcut is rebindable.

Space-separated words **narrow** the results: `tab doc` first matches everything for "tab", then keeps only those that also match "doc" — the two may hit different fields (one the title, the other the URL). The same rule applies to every search box in Tab Out: the dashboard overlay, the browser-global popup, the History panel and the saved-tabs archive.

### Auto-sorted tabs — your tab bar follows the dashboard

Your Chrome tab bar quietly reorders itself to match the dashboard's grouping, so the tabs you see on screen are in the same order as the tabs in the bar. On by default; turn it off in Settings and you get a manual **"Sort tabs"** banner instead.

### One dashboard, always on the right

Opening a new Tab Out page closes the other ones (upstream showed a "Close extras" banner asking you to do it), and the dashboard keeps itself on the **rightmost** tab, so everything you open next appears to its left.

### A real settings page

Upstream was configured by hand-editing a gitignored `config.local.js`. This fork ships a proper options page — pinned sites, disposable rules, tab sorting, shortcut, history limit — with per-section enable switches, **Export / Import** for backups, and a reset. Everything lives in `chrome.storage.sync`, so it follows your Chrome profile across machines, and bad input is repaired rather than crashing the page.

### Cleaner grouping, and pages that used to break

- **Subdomains merge automatically.** Cards group by *registrable domain*, so `mail.google.com` and `calendar.google.com` share a card with no rule. Upstream's "custom groups" feature — merging several hostnames by hand — was removed in this fork, because automatic grouping already solves it.
- **Browser pages are first-class.** `chrome://extensions`, `chrome://settings` and friends group, close and get recorded into history like any other page. Local `file://` tabs can be reopened properly (Chrome blocks the naive approach), and the Disposable card closes by exact URL so it never takes unrelated tabs with it.

### Under the hood

- **TypeScript, strict, with a layered architecture**: pure decision logic in `core/` (no `chrome.*`, no DOM), browser access behind a swappable seam in `platform/`, thin composition roots at the edges.
- **359 unit tests** across 29 files with Vitest (upstream had none), covering grouping precedence, what each action closes, rule matching, settings validation, HTML escaping and the dashboard's render loop.
- **A release pipeline**: CI on every push and PR, and one `v*` tag builds, tests, packages and uploads the next version to the Chrome Web Store. See [doc/publishing.md](doc/publishing.md).

---

## Features

**Items marked ✦ are new in this fork.**

- ✦ **Closed-tab History** — every tab you close, live-updating and searchable, one click to reopen
- ✦ **Disposable tabs + Tidy up** — configurable "safe to close" rules with path patterns and vetoes, and one button that closes duplicates, disposable and already-saved tabs together
- ✦ **Pinned sites** — always-visible shortcuts shown inside their own card, with labels and click-to-open placeholders
- ✦ **Search overlay** — search open tabs *and* history from a rebindable shortcut (default Cmd/Ctrl+F)
- ✦ **Auto-sorted tabs** — the tab bar reorders itself to match the dashboard (or a manual banner, your choice)
- ✦ **Settings page** — edit every rule without touching code, with per-section switches, Export / Import and Reset
- ✦ **One dashboard, always** — opening a new Tab Out page closes the others, and it stays on the rightmost tab
- **See all your tabs at a glance** on a clean grid, grouped by domain — including browser pages like `chrome://extensions` and local `file://` pages, not just websites
- **Close tabs with style** — swoosh sound + confetti burst, on a whole card or a single tab
- **Duplicate detection** — an amber `(2x)` badge when you have the same page open twice, with one-click cleanup
- **Click any tab to jump to it** across windows, without opening a new tab
- **Save for later** — bookmark tabs to a checklist before closing them, with an archive for the ones you've dealt with
- **Localhost grouping** — port numbers shown next to each tab, so you can tell your projects apart
- **Expandable groups** — the first 8 tabs of a card, with a clickable "+N more"
- **100% local** — your data never leaves your machine

---

## Setup

This fork is written in TypeScript and compiles to a `dist/` folder. That folder is what you load into Chrome.

**1. Clone and build**

```bash
git clone https://github.com/lastorder/tab-out.git
cd tab-out
npm install
npm run build
```

**2. Load the extension**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`dist/`** folder (not the repo root)

**3. Open a new tab**

You'll see Tab Out 2.

> **Updating:** after `git pull`, run `npm run build` again and hit the reload icon on the Tab Out 2 card in `chrome://extensions`.

### Install with a coding agent

Send your coding agent (Claude Code, Codex, etc.) this repo and say **"install this"**:

```
https://github.com/lastorder/tab-out
```

The agent will walk you through it. Takes about 2 minutes.

---

## Settings

Click the gear icon in the top-right of the dashboard, or right-click the extension icon → **Options**.

| Section | What it controls |
|---------|------------------|
| **Pinned sites** | Sites you always want at hand. Shown inside their own domain card — with a tab open it looks like any other tab, without one it's a greyed, click-to-open placeholder. Each pin has a label, and the list order drives card order. Has its own "Enabled" toggle. |
| **Disposable tabs** | Which tabs are safe to close because reopening them costs nothing, collected into a shared **Disposable** card and counted by "Tidy up". Also has its own "Enabled" toggle, and a "+ Add suggested rules" button. |
| **Tab sorting** | Whether the tab bar is reordered to match the dashboard automatically (on by default) or only via a manual "Sort tabs" banner. |
| **Keyboard shortcut** | The key combo that opens the Search overlay on the Tab Out page (default Cmd/Ctrl+F). |
| **Global shortcuts** | Two shortcuts that work anywhere in Chrome, both **off by default**: `Cmd/Ctrl+Shift+F` opens the Tab Out search box over the page you're on, and `Cmd/Ctrl+Shift+T` opens the dashboard even when Tab Out isn't your new tab page. Chrome owns the key combinations, so rebinding them opens Chrome's own shortcut settings. |
| **History** | How many recently closed tabs to remember (default 100). |

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile across machines. Use **Export** / **Import** to move them as JSON.

### If another extension takes over your new tab

Only **one** extension can replace Chrome's new tab page at a time, and the rule is *last installed or enabled wins*. So installing another new-tab extension silently takes the page from Tab Out — Tab Out isn't broken, it has just lost that slot, and everything else keeps working.

To get it back:

1. Open `chrome://extensions`.
2. Disable (or remove) the extension that took it over.
3. Tab Out's dashboard returns automatically — no reinstall needed.

Chrome exposes no way to pick which extension owns the new tab page, so choosing means enabling them in the order you want, and nothing inside Tab Out can detect that it lost the slot. Two escape hatches still work in the meantime: the toolbar icon → **Options**, and the `Cmd/Ctrl+Shift+T` global shortcut if you've enabled it — `chrome.commands` is independent of the new tab override.

### Rule syntax

Rules match on hostname:

- `x.com` — matches that hostname exactly
- `.zoom.us` — a **leading dot** matches any subdomain

Disposable rules narrow by a single **Path pattern** field, a comma-separated mix of:

| Term | Meaning |
|------|---------|
| `/j/*` | Prefix match — that path and everything under it |
| `/home` | Exact match — only that exact path |
| `!#inbox/` | Veto — excludes any URL containing that text |

Blank matches only the site's root. Mix freely, e.g. `/*, !#inbox/, !#sent/, !#search/` — that's the shipped Gmail rule: every `mail.google.com` path *except* inbox, sent and search URLs, so your inbox is disposable while an individual email thread keeps its own card.

The shipped defaults cover two shapes of "disposable": a site's own homepage (Gmail inbox, X home, GitHub front page, LinkedIn feed, YouTube home), and Zoom's post-join launcher page (`.zoom.us` + `/j/*`). Google Meet and Microsoft Teams are **not** included by default, because their calls run *inside* the tab — auto-closing one would end a live meeting. Add a rule for them yourself only if that's genuinely safe for how you use them.

If you're upgrading from an older version with your own rules already saved, they're untouched — a default only ever seeds a fresh install or a "Reset to defaults". Click **"+ Add suggested rules"** to pick up new or corrected defaults (like the Zoom rule) without touching what you've already configured.

---

## Tidy up

Next to "Close all N tabs" on the dashboard, a **Tidy up** button appears whenever there's something safe to close in one click — any of:

- an open tab that's a duplicate of another open tab (one copy is kept)
- an open tab matching an enabled disposable rule
- an open tab whose URL is already on your "Saved for later" checklist

Its tooltip and the toast after clicking both spell out the breakdown, e.g. *"Closed 6 tabs — 3 disposable tabs, 2 duplicates, 1 tab already saved"* — nothing closes silently or as a surprise.

---

## History

Click the clock icon in the top-right of the dashboard to see every tab you've closed recently — however you closed it (Tab Out's buttons, Chrome's own tab ✕, closing a whole window). The list updates live: close a tab from anywhere and it appears immediately, no refresh needed. Click a row to reopen it; it disappears from history the moment it's open again, so a URL is never shown as both "open" and "closed" at once. Rows are sorted newest-closed first, with a search box to jump straight to the one you want. The oldest entries drop off once you pass the configured limit (Settings → History). Tabs matching an enabled disposable rule are deliberately left out — they're safe to lose by definition, so recording them would just refill History with rows worth reopening after every "Tidy up". Turn the Disposable feature off and they're recorded like any other tab.

---

## Development

```bash
npm run build         # production build → dist/
npm run build:watch   # rebuild on change
npm run typecheck     # tsc --noEmit
npm test              # run the unit tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run check         # typecheck + test + build (run before committing)
npm run package       # build the Chrome Web Store zip → release/tab-out-<version>.zip
npm run publish:cws   # upload that zip to the store as a draft (needs credentials)
```

### Project layout

```
src/
├── types/        Shared domain types
├── core/         Pure logic — no chrome.*, no DOM, fully unit tested
│   ├── grouping.ts    Tabs + settings → the ordered list of cards
│   ├── matching.ts    Evaluates disposable rules
│   ├── tidy.ts        Which open tabs "Tidy up" would close, and why
│   ├── selection.ts   Decides which tabs an action applies to
│   ├── search.ts      Matching tabs/history entries against a query
│   ├── query.ts       Query tokenizing + matching, shared by every search box
│   ├── title.ts       Cleans up noisy tab titles (and localhost ports)
│   ├── domain.ts      Hostname → friendly brand name
│   ├── duplicates.ts  Duplicate detection
│   ├── url.ts         Total URL helpers (registrable-domain grouping)
│   ├── time.ts        Relative-time formatting
│   ├── history.ts     Closed-tab list: dedup, ordering, trimming
│   └── dashboard.ts   Identifying and positioning Tab Out's own tab
├── platform/     The seam over Chrome APIs (swapped for fakes in tests)
│   ├── browser.ts     BrowserTabs interface + Chrome implementation
│   └── storage.ts     KeyValueStore interface + Chrome/memory implementations
├── config/       Settings: defaults, validation schema, storage-backed store
├── services/     Orchestration: TabActions, SavedTabsService, TabHistoryService
├── ui/           Presentation: pure HTML renderers + DOM effects
├── newtab/       Dashboard entry point, render loop, event controller
├── options/      Settings page: draft model, renderers, controller
├── background/   MV3 service worker (toolbar badge + closed-tab recording)
├── styles/       Stylesheets
└── manifest.json
```

The architecture follows one organising rule: **decisions are pure, effects are injected.** Anything that decides *what* should happen lives in `core/` and is tested with plain objects. Anything that touches the browser goes through the `BrowserTabs` / `KeyValueStore` interfaces in `platform/`, so tests inject `createFakeBrowser()` and `createMemoryStore()` instead of mocking globals.

### Tests

359 unit tests across 29 files, run with [Vitest](https://vitest.dev):

```bash
npm test
```

The suite is deliberately kept small enough to stay readable. Tests target
behaviour that could plausibly break — grouping precedence, which tabs an
action closes, settings validation, HTML escaping, and the dashboard's render
loop — rather than restating the implementation. Pure helpers are usually
covered through the service that uses them, since `createFakeBrowser()` and
`createMemoryStore()` make that the more realistic level to assert at.

### Adding a feature

1. Put the decision logic in `core/` as a pure function, with tests.
2. If it touches the browser, add a method to the `BrowserTabs` interface and implement it in both the Chrome adapter and the test fake.
3. Render markup with a pure function in `ui/render/`, emitting a `data-action` attribute.
4. Handle that action in `newtab/controller.ts`.
5. Run `npm run check`.

### Releasing to the Chrome Web Store

Releases run from GitHub Actions: pushing a `v*` tag builds, tests, packages and uploads the new version to the Chrome Web Store as a **draft**, then attaches the zip to a GitHub Release. Submitting that draft for review stays a manual step in the developer dashboard.

`package.json#version` is the single source of truth — the build copies it into `dist/manifest.json`, and the release job refuses to run when the tag and `package.json` disagree.

```bash
npm version patch --no-git-tag-version   # bump the version
git commit -am "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

The first-ever upload has to be done by hand (the store API cannot create new items), and the workflow needs store credentials as repository secrets. Both are covered step by step in [doc/publishing.md](doc/publishing.md), along with the local equivalents (`npm run package`, `npm run publish:cws`).

---

## Tech stack

| What | How |
|------|-----|
| Language | TypeScript (strict) |
| Build | esbuild → `dist/` |
| Tests | Vitest |
| Extension | Chrome Manifest V3 |
| Settings storage | `chrome.storage.sync` |
| Saved tabs storage | `chrome.storage.local` |
| Closed-tab history storage | `chrome.storage.local` |
| Tab snapshot cache | `chrome.storage.session` |
| Sound | Web Audio API (synthesized, no files) |
| Animations | CSS transitions + JS confetti particles |
| Releases | GitHub Actions → Chrome Web Store API v2 (draft uploads) |

Zero runtime dependencies — everything in `dist/` is first-party code.

---

## Credits & License

MIT.

Tab Out was created by [Zara](https://x.com/zarazhangrui) — the original project lives at [zarazhangrui/tab-out](https://github.com/zarazhangrui/tab-out). This extended fork is maintained by [lastorder](https://github.com/lastorder).
