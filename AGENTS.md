# AGENTS.md — Tab Out

Two parts:

- **Part 1 — Installing Tab Out** for a user. Follow it top to bottom when someone says "install this".
- **Part 2 — Working on the code.** Read it before changing anything in `src/`.

Deeper design notes live in `doc/design.md`; release and store details in `doc/publishing.md`.

---

# Part 1 — Installing Tab Out

You're installing **Tab Out** for the user. Set it up *and* get them excited about it. The blockquote blocks below are meant to be said to them.

## Step 0 — Introduce the product

> **Tab Out 2** replaces your new tab page with a clean dashboard of everything you have open, grouped by domain.
>
> - **See all your open tabs at a glance** grouped by registrable domain on a grid — subdomains of the same site (like `mail.google.com` and `calendar.google.com`) share one card automatically
> - **Chrome tab groups take priority** — a group you made yourself in Chrome's tab bar shows up as its own card, named and coloured to match; an optional setting automatically groups 2+ tabs from the same site for you
> - **Disposable tabs group** collects tabs that are safe to close — a site's own homepage (Gmail, X, GitHub) and spent one-off pages like a Zoom post-join screen — with a one-click **Tidy up** button that also clears duplicates and already-saved tabs
> - **Close tabs with style** — satisfying swoosh + confetti burst
> - **Duplicate detection** flags when the same page is open twice
> - **Click any tab title to jump to it**, even across Chrome windows
> - **Save for later** bookmarks individual tabs to a checklist before closing them
> - **Fully configurable** — a settings page for pinned sites and disposable rules, each switchable off with one checkbox
> - **100% local** — no server, no accounts, no data sent anywhere
>
> It's a Chrome extension. Setup takes about 2 minutes.

## Step 1 — Clone and build

Tab Out is written in TypeScript, so there's a one-time build step. The folder you load into Chrome is `dist/`, **not** the repo root.

```bash
git clone https://github.com/lastorder/tab-out.git
cd tab-out
npm install
npm run build
ls dist/manifest.json && echo "Build OK"   # confirm the build actually produced output
```

If `npm install` fails with an `EPERM` error about `~/.npm`, the npm cache contains root-owned files. Work around it without sudo: `npm install --cache ./.npm-cache`.

## Step 2 — Load the extension in Chrome

This is the one step needing manual action — make it as easy as possible. First, copy the `dist/` path to their clipboard:

- macOS: `cd dist && pwd | pbcopy && echo "Path copied to clipboard"`
- Linux: `cd dist && (pwd | xclip -selection clipboard 2>/dev/null || echo "Path: $(pwd)")`
- Windows: `cd dist && echo %CD% | clip`

Then open the extensions page (`open "chrome://extensions"`) and walk them through:

> 1. On Chrome's extensions page, toggle on **Developer mode** in the top-right corner.
> 2. Click **"Load unpacked"** in the top-left.
> 3. In the file picker, press **Cmd+Shift+G** (Mac) or **Ctrl+L** (Windows/Linux), **paste** the path I copied, and press Enter.
> 4. Click **"Select"/"Open"** — you should see "Tab Out" in your extensions list.

Fallback — open the folder directly: macOS `open dist/`, Linux `xdg-open dist/`, Windows `explorer dist\\`.

> ⚠️ They must select **`dist/`**, not the repo root. Selecting the repo root is the most common install failure — Chrome reports "Manifest file is missing or unreadable".

## Step 3 — Show them around

Once the extension is loaded:

> You're all set! Open a **new tab** and you'll see Tab Out.
>
> 1. **Your open tabs are grouped by registrable domain** — `mail.google.com` and `calendar.google.com` land in the same card, since they're the same site underneath.
> 2. **A Chrome tab group you made yourself shows up as its own card first** — named and coloured to match the real tab bar. Turn on **Auto-grouping** in Settings and Tab Out will do this for you: any 2+ tabs that would share one domain card become a real Chrome tab group automatically, and every later tab of that same site joins the group you already have instead of starting a second one.
> 3. **Disposable tabs** (Gmail inbox, X home, YouTube, a spent Zoom page…) sit in their own group at the bottom — safe to close because reopening them costs nothing.
> 4. **Click any tab title** to jump to it, even in another window; **click X** to close just that one (swoosh + confetti); **"Close all N tabs"** closes a whole group.
> 5. **Duplicate tabs** get an amber "(2x)" badge — "Close duplicates" keeps one copy.
> 6. **Save a tab for later** with the bookmark icon before closing it; saved tabs appear in the sidebar.
> 7. **"Tidy up"** appears next to "Close all" whenever something is safe to close in one click — duplicates, disposable tabs, or tabs already on the saved-for-later list.
> 8. **Only one Tab Out page stays open** — opening a new one auto-closes the others, and it always sits on the rightmost tab.
> 9. **History** — the clock icon lists every tab you've recently closed, however you closed it, and reopens one with a click. Disposable tabs (Gmail inbox, a site homepage…) are left out on purpose, since they're safe to lose. It updates live, no refresh needed.
> 10. **Your tab bar quietly reorders itself** to match the dashboard — on by default; turn it off in Settings for a manual "Sort tabs" banner.
> 11. **Pinned sites live inside their own domain card**: an open pinned tab looks like any other tab, and one with no open tab still shows up there as a grayed-out, click-to-open placeholder chip.

## Step 4 — Point them at the settings page

Most people miss this, so mention it explicitly:

> Click the **gear icon** in the top-right of the dashboard (or right-click the extension icon → Options) to configure:
>
> - **Pinned sites** — live inside each site's own domain card (see above). Has its own on/off switch.
> - **Disposable tabs** — which tabs are safe to close into the shared Disposable card. Also switchable off.
> - **Auto-grouping** — off by default. Turn it on and any 2+ tabs that would share one domain card become a real Chrome tab group, named after that domain; a tab you open later on that same site joins that group rather than starting a second one; and a tab already in a Chrome tab group is never re-grouped or moved.
> - **Tab sorting** — turn auto-sort off if you'd rather sort manually via a banner.
> - **History** — how many recently closed tabs to remember (default 100).
> - **Global shortcuts** — `Cmd+Shift+O` (Mac) works anywhere in Chrome and opens the Tab Out search box over whatever page you're on (press it again to close the box) — this is Chrome's own "activate the extension" shortcut. `Cmd+Shift+T` (Mac) opens the dashboard even if Tab Out isn't your new tab page. Both are already on by default with these keys; to change either one, use the button that opens Chrome's own shortcut settings — there's nothing to toggle on this page, since the key itself is entirely Chrome's to bind.
>
> Settings sync across your Chrome profile, and there are Export/Import buttons for backups.

Rule syntax worth explaining if they ask:

- Hostname `x.com` matches exactly; a **leading dot** like `.zoom.us` matches any subdomain.
- Disposable rules are a single **Pattern** field matched against the tab's whole URL, scheme included: `*` matches any characters, including `/`. `https://github.com/*` matches every page on GitHub, `https://github.com/*/issues/*` matches any issue page on any repo, `*.google.com/*` matches any page on any Google subdomain, `file:///Users/me/notes/*` matches every local file under that folder, and a bare `*` matches every URL. There's no separate hostname/path split any more, and no veto/exclude syntax — write a narrower pattern instead.
- Grouping merges subdomains of the same site automatically (by registrable domain), so there's no "merge these hostnames into one card" feature to configure any more.
- A pinned site's **Label** applies to that page *and anything under its path* — pinning `https://calendar.google.com/` still says "Google Calendar" after Calendar redirects deeper, while pinning one Jira board labels only that board. Pin the root to cover a whole site; pin a deep page to cover just that page.
- A shipped default only ever seeds a fresh install — a user's own saved settings from an older version are never touched.

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
| A saved local `file://` tab won't reopen ("Couldn't open" toast) | Chrome requires per-extension opt-in for file access. `chrome://extensions` → Tab Out → **Details** → enable **Allow access to file URLs**. |
| A global shortcut does nothing | Check `chrome://extensions/shortcuts`: Chrome may have kept `Cmd+Shift+T` for "reopen closed tab", or another extension may hold the chord — reassign it there. There's nothing to enable on the options page; both shortcuts are on by default. |
| Chrome refuses to load the extension ("requires a newer version of Chrome") | Tab Out needs Chrome 127+ for the global search shortcut (`manifest.json#minimum_chrome_version`). Update Chrome. |

---

# Part 2 — Working on the code

## Commands

```bash
npm run build         # production build → dist/
npm run build:watch   # rebuild on change
npm run typecheck     # tsc --noEmit
npm test              # unit tests (vitest)
npm run check         # typecheck + test + build — run before declaring work done
npm run package       # Chrome Web Store zip → release/tab-out-<version>.zip
npm run publish:cws   # upload that zip to the store as a draft (needs credentials)
```

Releases are cut by pushing a `v*` tag, which runs `.github/workflows/release.yml`. `package.json#version` is the only version source: the build copies it into `dist/manifest.json`, and `scripts/package.mjs` refuses to package a stale `dist/` or a tag that disagrees with it. See `doc/publishing.md`.

## The one architectural rule

**Decisions are pure. Effects are injected.**

```
types/     Shared domain types
  ↓
core/      Pure logic. No chrome.*, no DOM. Decisions live here.
  ↓
platform/  The seam over browser APIs: BrowserTabs, KeyValueStore
  ↓
config/    Settings: defaults, validation schema, storage-backed store
services/  Orchestration: TabActions, SavedTabsService, TabHistoryService
  ↓
ui/        Pure HTML string renderers + DOM effects
  ↓
newtab/ options/ background/ popup/    Entry points — thin wiring only
```

- **Never import `chrome.*` inside `core/` or `ui/render/`** — pass browser data in as an argument.
- **Never call `chrome.*` directly from a service.** Add a method to the `BrowserTabs` interface (`platform/browser.ts`), then implement it in the Chrome adapter *and* `tests/helpers/fake-browser.ts`.
- **Entry-point `main.ts` files are composition roots** — the only place allowed to construct concrete adapters.

## Adding a feature

1. Put the decision logic in `core/` as a pure function; write its tests first — they need no mocks.
2. Touching the browser? Extend `BrowserTabs` and both of its implementations.
3. Render markup with a pure function in `ui/render/`, emitting a `data-action` attribute.
4. Handle that action in `newtab/controller.ts` (add it to the `DashboardAction` union so the compiler checks you).
5. `npm run check`.

## Conventions that are easy to get wrong

**Security and DOM**

- **Escape everything interpolated into HTML** with `escapeHtml()` from `ui/html.ts` — in element content and attribute values alike. Page titles are attacker-controlled; tests assert this, don't delete them.
- **No inline event handlers, ever.** Manifest V3's CSP blocks `onclick="…"`/`onerror="…"`; use `data-action` + delegation. That's why the favicon fallback lives in `ui/favicon.ts`.
- **Never render a user-controlled URL as a plain `<a href>`.** Chrome silently blocks top-level `file://` navigation from an extension page, so a saved or historical `file://` tab could never be reopened by a link. Every reopen path goes through `TabActions.openOrFocusTab()` via a `data-action="open-saved"`/`"reopen-history"` button.

**Settings and storage**

- **Settings must stay serialisable** — no functions; they have to survive `chrome.storage`. That's why disposable rules are declarative data (a glob `pattern` string) rather than predicates.
- **`normalizeSettings()` must never throw** — it repairs bad input and reports issues; corrupt storage must never break the new tab page. **Keep defaults in normalised form**: `normalizeSettings(defaults)` must equal `defaults` (a test guards this).
- **A renamed stored field needs a legacy-key fallback inside `normalizeSettings`, not just `migrateSettings`.** `SettingsStore.load()` normalises *before* migrating, so when `landingPatterns` became `disposableRules`, a naive rename made `normalizeSettings` see the old key as absent and substitute the defaults — destroying every user's saved rules on first load. Read `raw['disposableRules'] ?? raw['landingPatterns']` inside `normalizeSettings`; any future rename needs the same fix, in the same place.
- **A settings field that isn't a row table (a number, a checkbox) lives directly on `DraftState`**, not inside `pinned`/`disposable`. Pattern (`maxHistoryItems`, `autoSortTabs`): field on `DraftState`, copied in `settingsToDraft`/`draftToSettings`, validated in `config/schema.ts` by a never-throwing `normalize*`, and given its own `if (input.id === '…')` branch in `options/main.ts`'s input listener — it does not go through `mutateSection`.
- **A disposable rule is a single glob `pattern` string, matched against the tab's whole URL.** `DisposableRule` used to split hostname/path/veto across `hostname`/`hostnameEndsWith`/`pathPrefix`/`pathExact`/`urlNotContains`; it's now just `{ pattern: string }`, compiled by `core/matching.ts#compilePattern` into a regex where `*` becomes `.*` (matches any characters, including `/`) and everything else is escaped literally. `options/draft.ts`'s `DisposableRow` mirrors this 1:1 — there's no field-splitting/collapsing to keep lossless any more, unlike the pinned-site hostname field.

**Grouping, pinning, sorting**

- **Domain cards group by registrable domain, not raw hostname.** `core/url.ts`'s `groupKeyOf`/`registrableDomainOf` collapse `mail.google.com` and `calendar.google.com` to `google.com` before `core/grouping.ts`'s `groupTabs()` buckets tabs, so subdomains share a card without a merge rule. There used to be an `isDisposableDomain` predicate in `core/matching.ts` that mapped a rule's `hostname`/`hostnameEndsWith` to a registrable domain; it's gone along with those fields — a glob `pattern` doesn't have an extractable "domain part" to bump a card's sort order with, so don't reintroduce that wiring into `sortGroups()`.
- **Card and chip order: pinned (configured order), then Chrome tab groups by their own tab-bar position, then everything else alphabetically, Disposable always last.** `sortGroups()` takes a `pinnedGroupOrder: Map<groupKey, earliest pinnedIndex>` from `buildPinnedPriorities()`; a card with no entry falls to the next tier via `groupDisplayTitle()` (an explicit `label` or friendly domain decides position — never `key` or tab count). A `kind: 'chrome-group'` card is *not* sorted alphabetically: it is ordered by `chromeGroupOrderKey()` (the lowest `index` among its tabs), so the dashboard mirrors the order the user already gave their groups in the real tab bar instead of re-sorting them by name. `ui/render/cards.ts`'s `renderGroupCard()` mirrors the pinned tier *inside* one card over real-tab chips plus `PinnedPlaceholder` chips, pinned first by global `pinnedIndex` (via `matchPinnedSite()` against `pinnedMatches: PinnedMatch[]`). Don't reintroduce tab count as a sort key.
- **Auto-sort and "Sort tabs" never touch tabs that belong to a Chrome tab group.** `desiredTabOrder()` skips `kind: 'chrome-group'` cards entirely, and `newtab/dashboard.ts` filters the same tabs out of the "actual order" side of the mismatch check via `chromeGroupedTabIds()` — comparing a filtered list against an unfiltered one would report a phantom mismatch and re-trigger auto-sort forever. Chrome already keeps a group contiguous and in the user's order; folding it into the move plan would issue `chrome.tabs.move()` calls that fight that arrangement.
- **Pinning surfaces inside its own card, never a card of its own.** `core/grouping.ts#attachPinnedPlaceholders` never moves an *open* pinned tab — `groupTabs()` already placed it by registrable domain; it only adds a grayed, click-to-open `PinnedPlaceholder` chip (via the returned `Map<groupKey, PinnedPlaceholder[]>`) for a pinned site with no open tab, creating an otherwise-empty card if none exists. "Promote this card to the front" was a deliberately different, removed feature — don't conflate the two.
- **A pinned site claims a tab by hostname *plus path prefix*** — never hostname alone, never exact URL. `buildPinnedPriorities()` records a `PinnedMatch { hostname, pathPrefix, pinnedIndex, label? }`; `matchPinnedSite()` resolves the tab and `renderChip()` prefers the matched `label` over `chipLabel()`. Both halves are load-bearing: the prefix keeps `https://calendar.google.com/` labelled "Google Calendar" after a redirect to `/calendar/u/0/r`, and the path stops a pinned Jira board from relabelling every other tab on that host. Prefix matching respects segment boundaries (`/board` ≠ `/boardroom`), and the most specific match wins.
- **Group cards are addressed by index** via `data-group-index`, not by a slugified name — string-derived DOM ids collide.
- **Closing by hostname vs exact URL is a real distinction.** Domain cards close by hostname; the Disposable card closes by exact URL so it doesn't take unrelated tabs with it. See `TabActions.closeGroup`.
- **`isInternalUrl()` excludes as little as it can get away with.** `chrome://extensions`, `chrome://settings`, `edge://…`, `brave://…` are real user-managed tabs that group, close and enter history like any other page. Only `chrome://newtab/`, `chrome-extension://`, `about:` and `devtools://` are excluded. Don't broaden this back to a blanket `chrome://` match.
- **A real Chrome tab group takes priority over everything else in `groupTabs()`.** A tab whose `groupId` resolves (via the `chromeGroups: ReadonlyMap<number, ChromeGroupInfo>` passed in) to an actual Chrome tab group becomes its own `kind: 'chrome-group'` card — ahead of disposable rules and domain grouping — labelled with the group's title (falling back to `UNTITLED_CHROME_GROUP_LABEL` for an untitled one) and coloured with `chromeGroupColor`. This is a stronger signal than a disposable rule or a pinned site: the user grouped these tabs on purpose, so Tab Out never second-guesses it. `chrome-group` cards close by live `groupId` (`selectTabIdsByGroupId`), not by hostname or exact URL — see `TabActions.closeGroup`.
- **Auto-grouping is a separate opt-in effect, not part of `groupTabs()`'s decision.** `core/auto-group.ts#planTabGrouping` is the pure decision, and it returns one of **two** action kinds — `create` (a domain with 2+ ungrouped tabs and no group yet becomes a new Chrome tab group) or `adopt` (a domain that *already* has a group: every ungrouped tab of it joins that group, however few there are). `TabActions.runAutoGroup()` is the one place that acts on them, via `BrowserTabs.createGroup()` / `BrowserTabs.addToGroup()`. It never touches a tab already in some Chrome tab group. Wired from `background/main.ts`, debounced on `chrome.tabs.onCreated`/`onUpdated` and re-run once at worker boot/install, gated behind `settings.autoGroupEnabled` (default off).
- **`adopt` exists because "only look at ungrouped tabs" used to seed duplicate groups.** Counting *only* ungrouped tabs made two fresh tabs of an already-grouped domain look like a brand-new domain, and the sweep created a second group for the same site (a real bug: one site ended up with two groups). Never let the plan decide "create" without first checking whether that window+domain already has a group.
- **Grouping buckets are scoped per *window*, not just per domain.** A Chrome tab group belongs to exactly one window and `chrome.tabs.group()` refuses tabs spanning windows, so `planTabGrouping` keys its buckets (and its existing-group lookup) by `windowId\u0000registrableDomain`. `groupTabs()` itself stays window-agnostic on purpose — a dashboard card spans windows, a Chrome group cannot.
- **A group only counts as a "domain group" when every tab in it shares one registrable domain.** A group the user assembled from unrelated sites is deliberately not adoptable: moving a fresh tab in because one member happened to share a domain would guess at the user's intent, and the chrome-group precedence rule above exists precisely to leave manual groups alone.
- **The auto-group sweep is serialised, and that is load-bearing.** The debounce only collapses events arriving *before* a timer fires; once one fires, the sweep is async, so a second burst (restoring a session, say) could start a second sweep that queries the same tab list before the first has grouped anything — each then creating its own group for the same domain. `background/main.ts`'s `runAutoGroupSweep()` keeps `autoGroupInFlight` / `autoGroupQueued` and repeats once rather than overlapping. Don't "simplify" it back to a bare `setTimeout` callback.

**Background and rendering**

- **History is recorded in the background worker, not the dashboard.** `chrome.tabs.onRemoved` omits the tab's URL, so `background/main.ts` keeps a `TabSnapshotCache` (`chrome.storage.session`) updated on every create/update and consumed on removal. Recording listens at the browser level, so it still works for closes that bypass `TabActions`.
- **Disposable tabs are never recorded in history.** `core/history.ts`'s `shouldRecordClosedTab(url, settings)` is the whole decision — a pure predicate that returns false for a URL matching an *enabled* disposable rule (so switching the Disposable feature off restores ordinary recording). `recordTabRemoved` consumes the snapshot first and then checks it, so a skipped tab can't leak its snapshot to a later tab id. Don't gate this in `trackTabActivity`'s purge path: reopening a disposable page should still clear any older history entry for it.
- **The dashboard stays pinned to the rightmost tab.** `background/main.ts` calls `TabActions.moveDashboardToEnd` on every `chrome.tabs.onCreated`, and `newtab/main.ts` once at boot — both through `dashboardUrls()` (`core/dashboard.ts`); don't redefine "what counts as a dashboard tab" anywhere else.
- **Storage-backed panels react to `onChanged`, not just tab events.** `TabHistoryService.onChanged` (mirroring `SettingsStore.onChanged`) updates the History panel the instant the worker records a closure, instead of waiting for an unrelated repaint. Wire any new background-written, dashboard-displayed list the same way rather than relying on `RenderScheduler`.
- **Don't derive live state from `Dashboard`'s last render model.** `#model` is a snapshot from the previous full render, stale exactly when you most want to repaint (a tab just closed). `renderHistoryPanel` queries open tabs live for this reason — reading `#model.realTabs` made a just-closed tab still look open and filtered its new history entry straight back out.
- **`RenderScheduler.suppress()` delays repaints; it must never drop them.** Close handlers mutate the DOM for instant feedback, but only a real render recomputes derived state — e.g. a pinned site whose last tab closed has to return as a click-to-open placeholder instead of vanishing. `suppress()` queues a catch-up render; don't bypass it.
- **A pure decision behind both a button's visibility and its label belongs in `core/`, not the renderer.** `core/tidy.ts`'s `selectTidyTabIds()` decides *which* tabs "Tidy up" would close and *why*, as a `{ disposable, saved, duplicates }` breakdown that always sums to the total; `newtab/dashboard.ts` only turns that into HTML and a tooltip. That's what makes "does the button appear, and does its count match reality" testable without a DOM.

**Global shortcuts**

- **There are two different shortcut systems, and they are not interchangeable.** `searchShortcut` (`core/shortcut.ts`) is a plain `keydown` listener that only fires while the Tab Out page has focus. The global one is `chrome.commands`, declared in `src/manifest.json`, which fires anywhere in the browser. Don't "unify" them: only `chrome.commands` can register a browser-wide chord, and Chrome — not our options page — owns rebinding it (`chrome://extensions/shortcuts`).
- **Opening the Search box globally is Chrome's own `_execute_action` command, not a custom `chrome.commands.onCommand` handler.** `_execute_action` is Chrome's reserved name for "do what clicking the toolbar icon does": open the action popup, and — since it's an ordinary popup — close it again on a second press. That's exactly the toggle behaviour a global search shortcut should have, for free, so there is no `core/global-commands.ts` branch for it and no settings flag gating it: it's always on, the same way the toolbar icon itself is always clickable. There used to be a second custom command, `global-search`, that called `chrome.action.openPopup()` from an `onCommand` handler — a hand-rolled duplicate of what `_execute_action` already does natively, and without the free toggle-to-close behaviour. Don't reintroduce it; if the Search box ever needs to *do more* than the toolbar icon already does, that's a reason to extend `popup/main.ts`, not to bring back a parallel command.
- **`global-dashboard` is the one remaining custom command, and it is always on — there is no settings flag gating it.** There used to be a `globalDashboardShortcutEnabled` flag, defaulting to `false`, that `core/global-commands.ts#planGlobalCommand` checked before acting. It was removed: the chord itself is entirely Chrome's to bind (`chrome://extensions/shortcuts`) regardless of that flag, so the checkbox only risked showing a shortcut as "configured" on the options page while our handler silently ignored the keypress. `planGlobalCommand` now always acts on a recognised command, the same as `_execute_action`.
- **`planGlobalCommand()` is the whole decision, and it is pure.** It takes a `GlobalCommandContext` (tab list, dashboard URLs, page URL — no settings) and returns either `null` or a `GlobalCommandAction`; `background/main.ts` performs the effect. Adding a *new* global command that needs its own logic (unlike `_execute_action`, which needs none) means a new command name + a new branch there, not new logic in the worker.
- **The options page reads both chords straight out of `manifest.json`, purely as text — neither has a checkbox.** They are shown, never edited, so there is no recorder like the in-page shortcut's; `tests/config/global-shortcuts.test.ts` pins the manifest shape so the displayed chords can't drift from what Chrome actually binds.
- **Any page that renders a Search box must link `styles/search.css` itself.** The rules are shared by the dashboard overlay and the popup, but `dashboard.css` deliberately does **not** `@import` them — so the `<link>` is load-bearing, and a page that renders `ui/render/search.ts` output without it silently falls back to browser-default inputs and buttons. That is exactly how the popup first shipped broken; `tests/styles/search-styles.test.ts` now guards it. The popup also overrides `.popup-modal` to drop the overlay's border/shadow while keeping an inset — removing the padding makes rows and the input run edge to edge.
- **Every search box shares `core/query.ts`.** `tokenizeQuery()` + `matchesQueryTerms()` are the one definition of the space-separated "narrow as you type" rule: `tab doc` requires both terms, each of which may hit a different field. The Search overlay and popup (`core/search.ts`), the History panel (`core/history.ts#filterHistory`) and the saved-tabs archive (`services/saved-tabs.ts#filterSavedTabs`) all call them, so the boxes can't drift apart. The two panel filters keep their own "shorter than two characters matches everything" guard to stop the list flickering while typing — that guard is per-box, not part of the shared helper.

## Testing

Tests exist to catch real mistakes, not to restate the implementation. Before adding one, ask what bug it would catch.

- **Worth testing:** decision logic with branches (grouping precedence, which tabs an action closes, rule matching, validation); invariants worth stating out loud (`normalizeSettings(defaults) === defaults`, `attachPinnedPlaceholders` doesn't mutate its input); past bugs, so they stay fixed; HTML escaping, since titles are attacker-controlled; `Dashboard`'s render loop via the jsdom integration suite, which catches wiring mistakes (wrong element id, missed `await`) that types can't.
- **Not worth testing:** pass-throughs and one-line wrappers; the same behaviour at three layers (services are covered through `createFakeBrowser`/`createMemoryStore`); language semantics.
- Prefer a few `it.each` tables over many near-identical cases, and assert on behaviour ("closing Disposable spares the email you're reading") rather than internals.

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

- **The "Close extras" banner.** Tab Out is a singleton: opening a dashboard auto-closes every other one (`TabActions.keepOnlyThisDashboard`).
- **`config.local.js`.** Personal configuration now lives in the settings page and `chrome.storage`.
- **The `extension/` directory and `app.js`.** Replaced by `src/` plus a build step; `dist/` is generated and gitignored — never edit it by hand.
- **The `activeTab` permission.** It was unused; `tabs` covers what's needed.
- **Custom groups.** `CustomGroupRule`, `customGroups`/`customGroupsEnabled`, `findCustomGroup`/`matchesCustomGroup` and the whole options panel are gone — registrable-domain grouping already merges hostnames onto one card, so don't reintroduce a merge rule to solve the same problem.
- **Whole-card pinning and a separate "Pinned" strip above the grid.** Both earlier pinning iterations are gone (`applyPinnedSites()`, `buildPinnedStrip()`, `pinnedHostnameSet()`, the `DashboardEntry` `'placeholder'` variant, `#pinnedStrip`). Current behaviour: pinned sites surface inside their own card.
- **The `global-search` custom command, and the `globalSearchShortcutEnabled` / `globalDashboardShortcutEnabled` settings flags.** `global-search` called `chrome.action.openPopup()` to duplicate what Chrome's native `_execute_action` command already does (including the free toggle-to-close). The two settings flags each gated a global shortcut behind an options-page checkbox that couldn't actually control the underlying Chrome keybinding — only whether *our* handler reacted to it — so an unchecked box could still show the shortcut as reserved in `chrome://extensions/shortcuts`. Both `_execute_action` and `global-dashboard` are simply always on now; see `core/global-commands.ts`.

## Key facts

- Pure Chrome extension. No server, no telemetry, no external API calls (favicons come from Google's public favicon service).
- Manifest V3, permissions: `tabs`, `tabGroups`, `storage`.
- Zero runtime dependencies — everything shipped in `dist/` is first-party code.
- `dist/` is what gets loaded into Chrome, and it is gitignored.
