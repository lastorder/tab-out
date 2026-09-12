# Tab Out

**Keep tabs on your tabs.**

Tab Out is a Chrome extension that replaces your new tab page with a dashboard of everything you have open. Tabs are grouped by domain, with disposable ones (Gmail inbox, X home, a spent Zoom meeting page…) pulled into their own group so you can clear them in one click without losing anything. Close tabs with a satisfying swoosh + confetti.

No server. No account. No external API calls. Just a Chrome extension.

---

## Install with a coding agent

Send your coding agent (Claude Code, Codex, etc.) this repo and say **"install this"**:

```
https://github.com/zarazhangrui/tab-out
```

The agent will walk you through it. Takes about 2 minutes.

---

## Features

- **See all your tabs at a glance** on a clean grid, grouped by domain — including browser pages like `chrome://extensions` and local `file://` pages, not just websites
- **Disposable tabs group** collects tabs that are safe to close because reopening them costs nothing — a site's own homepage (Gmail inbox, X home, GitHub front page) *and* spent one-off pages like the screen a Zoom meeting leaves behind — into one card. Fully configurable, and can be turned off entirely.
- **Tidy up** one button next to "Close all" that closes every duplicate, disposable tab, and already-saved tab in a single click — it only appears when there's something to tidy
- **Configurable settings page** edit pinned sites, disposable rules, and custom groups without touching code — pinned sites and disposable rules can each be switched off wholesale without deleting anything
- **Close tabs with style** with swoosh sound + confetti burst
- **Duplicate detection** flags when you have the same page open twice, with one-click cleanup
- **Click any tab to jump to it** across windows, no new tab opened
- **Save for later** bookmark tabs — including local files — to a checklist before closing them
- **History** every tab you close — however you closed it — is remembered and one click away from reopening; a reopened (or already-open) tab is never shown twice
- **Localhost grouping** shows port numbers next to each tab so you can tell your projects apart
- **One dashboard, always** opening a new Tab Out page automatically closes the other ones, and keeps it pinned to the rightmost tab so new pages always open to its left
- **Auto-sorted tabs** your tab bar quietly reorders itself to match the dashboard — turn it off in Settings for a manual "Sort tabs" banner instead
- **100% local** your data never leaves your machine

---

## Setup

Tab Out is written in TypeScript and compiles to a `dist/` folder. That folder is what you load into Chrome.

**1. Clone and build**

```bash
git clone https://github.com/zarazhangrui/tab-out.git
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

You'll see Tab Out.

> **Updating:** after `git pull`, run `npm run build` again and hit the reload icon on the Tab Out card in `chrome://extensions`.

---

## Settings

Click the gear icon in the top-right of the dashboard, or right-click the extension icon → **Options**.

| Section | What it controls |
|---------|------------------|
| **Pinned sites** | Sites always shown first. With open tabs they get a normal card; without, a click-to-open placeholder. Has its own "Enabled" toggle — turn it off to stop applying the list without deleting it. Empty by default. |
| **Disposable tabs** | Which tabs are safe to close because reopening them costs nothing, collected into a shared **Disposable** card and counted by the "Tidy up" button. Also has its own "Enabled" toggle. |
| **Custom groups** | Merge several hostnames into one card, or split one site into separate cards by path. |
| **Tab sorting** | Whether tabs are reordered to match the dashboard automatically (on by default) or only via a manual "Sort tabs" banner. |
| **History** | How many recently closed tabs to remember (default 100). |

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile across machines. Use **Export** / **Import** to move them as JSON.

### Custom groups: merging several hostnames into one card

A single custom-group rule can only match one hostname. To merge *several* hostnames into one card, add one rule per hostname and give them all the **same `Group key`** — every tab matching any of those rules lands on the same card, titled by whichever `Card title` you gave the rules (keep it consistent across them).

The shipped default is a worked example of exactly this: Google Calendar, Gmail and Google Chat are three unrelated hostnames (`calendar.google.com`, `mail.google.com`, `chat.google.com`) that would otherwise render as three separate cards. All three rules share `groupKey: google-suite`, so they render as one "Google" card instead.

> ⚠️ **This only works because those three hostnames are *not* also configured as Pinned sites.** A pinned entry claims tabs by exact hostname — if `mail.google.com` were pinned *and* in a custom group, the pinned-site logic would pull its tabs back out into their own card, undoing the merge. That's why Pinned sites ships empty by default now: these three used to live there.

### Rule syntax

Both rule types use the same hostname field:

- `x.com` — matches that hostname exactly
- `.zoom.us` — a **leading dot** matches any subdomain

Disposable rules (custom groups still use a plain "Path starts with" field) narrow by a single **path pattern**, a comma-separated mix of:

| Term | Meaning |
|------|---------|
| `/j/*` | Prefix match — that path and everything under it |
| `/home` | Exact match — only that exact path |
| `!#inbox/` | Veto — excludes any URL containing that text |

Blank matches only the site's root. Mix freely, e.g. `/*, !#inbox/, !#sent/` — that's the shipped Gmail rule: every `mail.google.com` path *except* URLs containing an inbox or sent-mail thread fragment, so your inbox is disposable while an individual email thread keeps its own card.

The shipped defaults cover two shapes of "disposable": a site's own homepage (Gmail inbox, X home, GitHub front page, LinkedIn feed), and Zoom's post-join launcher page (`.zoom.us` + `/j/*`) — since the call itself runs in the desktop app, that leftover browser tab is pure clutter. Google Meet and Microsoft Teams are **not** included by default, because their calls run *inside* the tab — auto-closing one would end a live meeting. Add a rule for them yourself only if that's genuinely safe for how you use them.

If you're upgrading from an older version with your own homepage or pinned-site rules already saved, they're untouched — a default only ever seeds a fresh install or a "Reset to defaults". Click **"+ Add suggested rules"** on the Disposable tabs panel to pick up new or corrected defaults (like the Zoom rule) without touching what you've already configured.

---

## Tidy up

Next to "Close all N tabs" on the dashboard, a **Tidy up** button appears whenever there's something safe to close in one click — any of:

- an open tab that's a duplicate of another open tab (one copy is kept)
- an open tab matching an enabled disposable rule
- an open tab whose URL is already on your "Saved for later" checklist

Its tooltip and the toast after clicking both spell out the breakdown, e.g. *"Closed 6 tabs — 3 disposable tabs, 2 duplicates, 1 tab already saved"* — nothing closes silently or as a surprise.

---

## History

Click the clock icon in the top-right of the dashboard to see every tab you've closed recently — however you closed it (Tab Out's buttons, Chrome's own tab X, closing a whole window). The list updates live: close a tab from anywhere and it appears immediately, no refresh needed. Click a row to reopen it; it disappears from history the moment it's open again, so a URL is never shown as both "open" and "closed" at once. Rows are sorted newest-closed first, with a search box to jump straight to the one you want. The oldest entries drop off once you pass the configured limit (Settings → History).

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
```

### Project layout

```
src/
├── types/        Shared domain types
├── core/         Pure logic — no chrome.*, no DOM, fully unit tested
│   ├── grouping.ts    Tabs + settings → the ordered list of cards
│   ├── matching.ts    Evaluates disposable / custom-group rules
│   ├── tidy.ts        Which open tabs "Tidy up" would close, and why
│   ├── selection.ts   Decides which tabs an action applies to
│   ├── title.ts       Cleans up noisy tab titles
│   ├── domain.ts      Hostname → friendly brand name
│   ├── duplicates.ts  Duplicate detection
│   ├── url.ts         Total URL helpers
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

302 unit tests across 27 files, run with [Vitest](https://vitest.dev):

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

Zero runtime dependencies — everything in `dist/` is first-party code.

---

## License

MIT

---

Built by [Zara](https://x.com/zarazhangrui)
