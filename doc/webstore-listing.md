# Chrome Web Store listing — copy, assets and privacy answers

Everything needed to fill in the Developer Dashboard when publishing **Tab Out 2** for the first
time. Blocks marked **→ paste** are ready to copy as-is: each paragraph is a single unwrapped line,
so the store renders them as proper paragraphs.

Two of the fields below are **not** typed into the dashboard — they are read from the shipped
package, so changing them means editing `src/manifest.json` and rebuilding:

| Field | Source |
|-------|--------|
| Name | `src/manifest.json` → `name` |
| Short description | `src/manifest.json` → `description` (limit 132) |
| Store icon | `icons/icon128.png`, bundled in the zip |

The rest — detailed description, category, screenshots, promo tiles, privacy answers — is filled in
on the dashboard's **Store listing** and **Privacy practices** tabs. See
[doc/publishing.md](publishing.md) for the upload mechanics.

---

## 1. Name

| Field | Value | Limit |
|-------|-------|-------|
| Name | `Tab Out 2` | 45 characters (current: 9) |

Already set in `src/manifest.json`.

> **Why the "2".** The store already has an extension called *Tab Out*
> ([`imocfgofpgjhgklobbbpobhkbkjllegj`](https://chromewebstore.google.com/detail/tab-out/imocfgofpgjhgklobbbpobhkbkjllegj)).
> Tab Out 2 is an independent fork of that project's open-source code, so the name makes the
> relation explicit instead of competing for the same name. The detailed description credits the
> original author.

## 2. Short description

Comes from `src/manifest.json` → `description`; it is shown in search results and under the listing
title. There is nothing to paste into the dashboard for this field — edit the manifest and rebuild.

**Currently shipped** (109/132):

```
Keep tabs on your tabs. New tab page that groups your open tabs by domain and lets you close them with style.
```

**Recommended replacement** (122/132) — it names the two features this fork is really about:

```
A new tab page that groups your tabs by site, collects the ones that are safe to close, and remembers every tab you close.
```

To take it: edit `src/manifest.json`, then `npm run check && npm run package` and upload the new
zip (§9). Either version is compliant — the shipped one is catchier, the replacement is more
discoverable.

## 3. Detailed description

The dashboard's **Detailed description** field. Plain text: the store renders line breaks and
bullet characters, but not Markdown. Replace `<PRIVACY POLICY URL>` before pasting — it appears once.

**→ paste**

```
Tab Out 2 replaces your new tab page with a dashboard of every tab you have open, so you can see what you're working on and clear out the rest in one click.

Tabs are grouped by site — mail.google.com and calendar.google.com land on one card automatically. The tabs that are safe to close, like a site's own homepage or the leftover page a Zoom meeting leaves behind, are collected into a "Disposable" card. One button, "Tidy up", closes those plus any duplicates and anything you've already saved for later, and tells you exactly what it closed.

WHAT YOU GET

• Every open tab at a glance, grouped by site on a single grid
• Chrome tab groups — a group you've created yourself is shown as its own card, named and coloured to match; an optional setting auto-groups same-site tabs for you, and every later tab of that site joins the group you already have
• Disposable tabs — your own rules for what is safe to close, with a one-click Tidy up
• History — every tab you close is remembered, searchable, and one click from coming back
• Pinned sites — the sites you always want at hand, always visible in their own card
• Search — one shortcut (Cmd/Ctrl+F) searches your open tabs and your history
• Auto-sorted tabs — plain tabs tidy themselves to match the dashboard, while your Chrome tab groups and pinned tabs stay exactly where you put them
• Save for later — bookmark tabs to a checklist before closing them, with an archive
• Duplicate detection — an amber "(2x)" badge when the same page is open twice
• Close tabs with style — a swoosh sound and a confetti burst
• Localhost grouping — port numbers next to each tab, so you can tell your projects apart
• Fully configurable — a settings page for every rule, with Export and Import
• Works with browser pages too — chrome://extensions and local file:// tabs are first-class

PRIVACY

Tab Out 2 runs entirely on your device. There is no account, no server and no analytics. Your tab list, your saved tabs and your closed-tab history never leave your machine: they are stored in Chrome's own extension storage, and you can export or clear them whenever you want.

The only outbound requests the extension makes are for display assets — the site icons shown next to each tab (loaded from Google's public favicon service, which receives only the site's domain) and the two web fonts used by the interface (served by Google Fonts). Nothing about you is sent anywhere, and nothing is ever shared or sold. Read the full policy: <PRIVACY POLICY URL>

Open source under the MIT licence. Tab Out 2 is an independent, extended fork of the open-source Tab Out created by Zara (github.com/zarazhangrui/tab-out) — the original idea, design and dashboard are hers. This fork rewrote the extension in TypeScript with a full test suite and added History, pinned sites, Disposable rules with Tidy up, search, and automatic tab sorting.
```

Keep this text consistent with the privacy policy (§7) and the privacy tab answers (§6) — reviewers
compare them.

## 4. Category and language

| Field | Value |
|-------|-------|
| Category | **Productivity** |
| Language | **English (United States)** |

Alternatives if Productivity feels crowded: **Workflow & Planning** or **Tools**. Only one primary
category is allowed.

There is no Chinese listing by default. The extension UI is English-only, so adding a `zh-CN`
listing would mean localising the interface first (`_locales/`), not just the store text.

## 5. Graphic assets

| Asset | Size | Required | Notes |
|-------|------|----------|-------|
| Store icon | 128×128 PNG | Yes | Already in the package (`icons/icon128.png`) — nothing to upload |
| Screenshots | 1280×800 PNG/JPEG | **Yes, at least 1**, up to 5 | The main work — see the shot list below |
| Small promo tile | 440×280 PNG/JPEG | Yes | Not localised; one image serves all languages |
| Marquee promo tile | 1400×560 PNG/JPEG | No | Only used if the listing gets featured |
| Promo video | YouTube URL | No | Skip unless you have one |

### Suggested screenshots

Capture at exactly **1280×800** — a 1280-wide browser window at 100% zoom, screenshotting the page
area. Use a realistic but anonymous tab set: no personal email addresses, no internal URLs.

1. **The dashboard** — a full new tab page with 4–6 domain cards, a couple of `(2x)` duplicate
   badges, and the Disposable card at the bottom. Caption: *Everything you have open, grouped by site.*
2. **The Disposable card + Tidy up** — one card up close with the Tidy up button and its tooltip
   showing the breakdown. Caption: *One button closes what's safe to close — and tells you what it closed.*
3. **History** — the history panel open with a few entries and the search box in use.
   Caption: *Every tab you closed, one click from coming back.*
4. **Search overlay** — the Cmd/Ctrl+F overlay showing results from both open tabs and history.
   Caption: *Find any tab, open or closed.*
5. **Settings** — the Pinned sites and Disposable tabs panels. Caption: *Your rules, your way.*

Add captions if the dashboard offers a caption field for screenshots; they are not localised and
appear under the image.

## 6. Privacy practices tab

### 6.1 Single purpose description

**→ paste**

```
Tab Out 2 replaces Chrome's new tab page with a dashboard for managing the tabs you have open: it groups them by site, shows which ones are safe to close, and lets you close, save or reopen them from one place.
```

### 6.2 Permissions justification

The manifest requests exactly three permissions; all fields are required.

**`tabs` → paste**

```
Tab Out 2 is a tab manager, so it needs to read the tabs that are open. Each tab's URL, title and window are used to group tabs by site and draw the new tab page, and to close, focus, reopen or reorder tabs when the user asks. All of this is processed on the user's device to render the page; none of it is transmitted to the developer or to any third party.
```

**`tabGroups` → paste**

```
Tab Out 2 shows tab groups the user created in Chrome's own tab bar as cards on the dashboard, named and coloured to match. It also offers an optional, off-by-default setting that automatically groups 2 or more tabs from the same site. Group names, colours and membership are read and written only to draw and organise the page; none of it is transmitted to the developer or to any third party.
```

**`storage` → paste**

```
Used to persist the user's own data across sessions: their settings (chrome.storage.sync, so they follow the user's Chrome profile) and their saved-for-later list and closed-tab history (chrome.storage.local, which stay on the device). No data is sent to the developer.
```

If the dashboard ever lists a fourth permission, it is a leftover — remove it from the manifest,
upload a new version, and try again. The current manifest declares `tabs`, `tabGroups` and `storage`.

### 6.3 Remote code

Select **"No, I am not using remote code."**

Everything in the package is first-party code bundled at build time, with zero runtime
dependencies. The Google Fonts stylesheet is a `<link>` to CSS, not executed JavaScript, and
Manifest V3's content security policy forbids remote scripts regardless.

### 6.4 Data usage

Read this alongside Google's
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), which
says plainly that local-only processing **still requires disclosure** (Q3) and that "web browsing
activity… including the domains or URLs the browser interacts with" counts as user data (Q4).

What Tab Out 2 actually does:

| Data | Read? | Stored? | Sent to the developer? |
|------|-------|---------|------------------------|
| Open tabs: URL, title, window | Yes, to draw the dashboard | No | No |
| Chrome tab group: title, colour, membership | Yes, to draw and (optionally) create group cards | No | No |
| Closed-tab history | Written by the extension itself | Yes — `chrome.storage.local` | No |
| Saved-for-later list | Written by the extension itself | Yes — `chrome.storage.local` | No |
| Settings | Written by the extension itself | Yes — `chrome.storage.sync` | No |
| Site domain, for that tab's icon | Yes | No | Sent to Google's favicon service, not to the developer |

**Recommended answers:**

- **Data types collected:** tick nothing in the "collects" group. The extension never sends data to
  the developer; the activity it *handles* is disclosed in the privacy policy (§7) instead, which
  is where the FAQ points for local-only processing.
- **Certifications:** tick all of them — no selling data to third parties, no use or transfer for
  purposes unrelated to the single purpose, no use for determining creditworthiness or lending.
  All three are true.
- If you would rather err toward disclosure, also tick **Web history** under the data types (the
  extension does read tab URLs) and leave everything else as above. It is the more conservative
  reading of "collects", cannot be held against you, and only adds a "may collect" note to the
  listing.

### 6.5 Privacy policy URL

**Required.** The FAQ requires a privacy policy even for an extension that only processes data
locally. Publish the text in §7 somewhere reachable and paste the URL here. Two easy options:

- commit `PRIVACY.md` to this repo and link the GitHub blob URL, or
- enable GitHub Pages on the repo and publish it as a page (nicer URL, and it looks official).

## 7. Privacy policy

Publish as-is, filling in the two placeholders. Keep it consistent with §6.4.

```
Tab Out 2 — Privacy Policy

Last updated: <DATE>

Tab Out 2 is a Chrome extension that replaces the new tab page with a dashboard for the tabs you have open. It is designed to work entirely on your device.

WHAT THE EXTENSION HANDLES

- The URL, title and window of each open tab. The extension reads these to group your tabs by site and draw the new tab page. They are processed in your browser and are never sent to us.
- The title, colour and membership of any Chrome tab group you've created. The extension reads this to show your group as its own card on the dashboard, and — only if you turn on the optional auto-grouping setting — writes it to create a new group for 2+ tabs on the same site. Processed in your browser and never sent to us.
- Your settings, your "saved for later" list, and your history of closed tabs. The extension writes these itself so they survive a restart. Settings are stored in chrome.storage.sync, which Chrome may sync across your signed-in devices under your own Google account; the other two are stored in chrome.storage.local and stay on this device.

WHERE YOUR DATA GOES

Nowhere. Tab Out 2 has no server, no account and no analytics. We do not receive, collect, store or sell your tabs, settings, saved tabs or history, and we have no way to access them. Removing the extension removes the data it stored.

NETWORK REQUESTS

The extension makes two kinds of outbound request, both for display assets only:

1. Site icons. Each tab shows its site's icon, loaded from Google's public favicon service (google.com/s2/favicons). That request includes the site's domain, for example "github.com", so the service can return the matching icon. It does not include the page path, the page title, or your history.
2. Web fonts. The interface uses two fonts served by Google Fonts (fonts.googleapis.com and fonts.gstatic.com).

Neither request identifies you, and neither is used to build a profile of you.

YOUR CHOICES

- Export or clear your saved tabs and history at any time from the dashboard.
- Reset every setting, or export them as JSON, from the extension's options page.
- Remove the extension to delete everything it stored.

CHILDREN

The extension is not directed at children and collects no personal information from anyone.

CHANGES

If this policy changes, the updated version will be published at this URL with a new date.

CONTACT

Questions about this policy: <CONTACT EMAIL>
```

## 8. Reviewer notes (test instructions)

Optional, but it speeds up review. **→ paste**

```
No account, login or setup is needed.

1. Install the extension and open a new tab — the dashboard is the extension's only UI.
2. Open a handful of tabs (for example github.com, mail.google.com, and two copies of the same page) and return to a new tab. Tabs are grouped by site, and the duplicate shows a "(2x)" badge.
3. The extension does not collect or transmit user data. It reads open tabs to draw the page, and stores the user's own settings, saved tabs and closed-tab history in Chrome's extension storage. The only outbound requests are site icons from Google's public favicon service, and the interface web fonts from Google Fonts — see the privacy policy.
4. Permissions: "tabs" is required to read, group, close and reorder tabs; "tabGroups" is required to show/create Chrome tab groups on the dashboard; "storage" persists the user's settings, saved tabs and history.
```

## 9. Before you submit — checklist

- [ ] Decide the short description (§2). If you take the recommended one, edit `src/manifest.json`,
      then `npm run check && npm run package`, and upload the new zip.
- [ ] Publish the privacy policy (§7), then paste its URL in §6.5 and into the detailed
      description (§3).
- [ ] Capture at least one 1280×800 screenshot, and make the 440×280 small promo tile.
- [ ] Fill in the **Single purpose** and both **Permissions justification** fields (§6.1–6.2).
- [ ] Set **Remote code** to "No" (§6.3) and complete the **Data usage** certifications (§6.4).
- [ ] Set Category to Productivity and Language to English (United States) (§4).
- [ ] Add a Homepage URL (`https://github.com/lastorder/tab-out`) and a Support URL (the repo's
      Issues page) — reviewers and users both look for them.
- [ ] Submit for review. Drafts uploaded by CI are **not** submitted automatically; see
      [doc/publishing.md](publishing.md).

---

## Notes and risks

**1. The "100% local" claim needs the caveat in §3.** The copy says the extension runs on your
device, then names the two exceptions. Do not shorten it to "no network requests": the new tab page
does fetch site icons from Google's favicon service and fonts from Google Fonts. The repo README's
"no external API calls" is close to true but glosses over both. To make the clean claim literally
true:

- self-host the two fonts under `src/styles/` instead of loading them from Google Fonts — a small
  change with no behaviour difference, roughly +100–200 KB in the package; and
- replace the favicon service with a locally drawn initial/letter tile, or a bundled icon set.
  This is the bigger change: the favicon lookup is the only reason the extension talks to the
  network on a user's behalf.

**2. Name similarity.** A name close to an existing listing can draw a "confusing similarity"
question from the reviewer. The defence is already in the copy: the description states up front that
this is an independent fork of the MIT-licensed original and credits its author. Keep that credit —
removing it is what would look like impersonation.

**3. Keep three texts in sync.** The manifest `description`, the detailed description and the
privacy policy all describe the same behaviour. When a feature or a network request changes, update
all three plus §6.4 here.
