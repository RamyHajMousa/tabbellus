# TabBellus — Chrome Web Store Permissions & Compliance Justifications

**Extension Name:** TabBellus  
**Version:** 1.2.2  
**Manifest Version:** 3 (MV3)  
**Architecture:** 100% Local-First / Zero Data Collection  

---

## 1. Single-Purpose Description

TabBellus is a local-first workspace and tab manager designed for power users. It provides unified workspace management ("Spaces"), real-time active tab tree visualization with grouping and memory reclamation, an OmniSearch command palette, and a deferred reading list ("Read Later") embedded directly within Chrome's native Side Panel.

All features run entirely offline on the user's local machine. TabBellus does not transmit, collect, analyze, or monetize any user data, tab URLs, or browsing history.

---

## 2. API Permissions Justification Matrix

| Permission | Technical Requirement in Codebase | User-Facing Feature & Justification |
| :--- | :--- | :--- |
| **`sidePanel`** | `chrome.sidePanel.setPanelBehavior`, `chrome.sidePanel.setOptions`, `side_panel.default_path` in `manifest.config.ts` | **Primary Workspace Interface:** Embeds the main TabBellus workstation (Spaces, Active Tree, Read Later, and OmniSearch) into Chrome's native Side Panel for persistent, non-intrusive access alongside web content. |
| **`tabs`** | `chrome.tabs.query`, `chrome.tabs.create`, `chrome.tabs.update`, `chrome.tabs.remove`, `chrome.tabs.discard`, `chrome.tabs.getZoom`, `chrome.tabs.setZoom` in `tabService.ts`, `spaceService.ts`, `discardService.ts` | **Workspace Tab Orchestration:** Required to query open tabs in the active window for workspace capture, switch focus between tabs, calculate duplicates, restore saved spaces, adjust tab zoom, and execute automated memory suspension on idle background tabs. |
| **`tabGroups`** | `chrome.tabGroups.query`, `chrome.tabGroups.update`, `chrome.tabGroups.move`, `chrome.tabs.group`, `chrome.tabs.ungroup` in `useGroupLifecycle.ts`, `GroupRow.tsx`, `ActiveSession.tsx` | **Native Tab Group Management:** Enables users to visualize, color-code, rename, drag-and-drop organize, save, and restore native Chrome Tab Groups directly within their workspace. |
| **`storage`** | `chrome.storage.local`, `chrome.storage.session`, `chrome.storage.onChanged` in `appStore.ts`, `tabLockStore.ts`, `background/index.ts` | **Local Configuration & Transient State:** Stores strongly-typed user preferences (themes, auto-discard intervals, badge modes, keyboard shortcuts) in `chrome.storage.local` and ephemeral window-to-space bindings and tab locks in `chrome.storage.session`. |
| **`unlimitedStorage`** | IndexedDB (`TabBellusDB` via Dexie.js) in `db.ts` | **Database Reliability:** Ensures that local IndexedDB storage containing user-saved workspaces, tab hierarchy snapshots, and reading lists is not evicted during browser storage pressure. |
| **`sessions`** | `chrome.sessions.getRecentlyClosed`, `chrome.sessions.restore`, `chrome.sessions.onChanged` in `HistoryDialog.tsx`, `useLaunchpadData.ts` | **Session Recovery & Space Fingerprinting:** Allows users to view and restore recently closed tabs and windows, and matches recently closed windows to saved spaces for 1-click workspace reactivation. |
| **`alarms`** | `chrome.alarms.create`, `chrome.alarms.clear`, `chrome.alarms.onAlarm` in `background/index.ts` | **Efficient Background Scheduling:** Replaces resource-intensive continuous event polling with event-driven alarms (`tab-discard-sweep` every 5 minutes, `badge-refresh` every 1 minute, and debounced 5-second workspace sync flushes). |
| **`bookmarks`** | `chrome.bookmarks.getTree` in `bookmarkService.ts`, `BookmarkPopoverContent.tsx` | **Read-Only Bookmarks Launcher:** Renders a read-only hierarchical tree popover in the workspace header, allowing users to search and launch bookmarks without opening separate bookmark manager pages. |
| **`contextMenus`** | `chrome.contextMenus.create`, `chrome.contextMenus.onClicked` in `background/index.ts` | **Frictionless Ingestion:** Adds native right-click context menu options ("Save to TabBellus Read Later" on links/pages and quick workspace actions on the extension toolbar icon). |
| **`favicon`** | `chrome://favicon2/?size=32&pageUrl=...` in `SmartFallbackIcon.tsx` | **Native Visual Identity:** Retrieves cached website icons directly from Chromium's local favicon cache to render crisp, recognizable tab and space icons with zero layout shift. |
| **`topSites`** | `chrome.topSites.get` in `useLaunchpadData.ts`, `OmniSearch.tsx` | **Intelligent Launchpad (Zero-State Engine):** Populates the zero-state OmniSearch palette with the user's most frequently visited websites for instantaneous keyboard-driven navigation. |
| **`scripting`** | `chrome.scripting.executeScript` in `mediaService.ts` | **Programmatic Media Controller:** Injects a self-contained, isolated script into media-playing tabs to toggle `<video>`/`<audio>` playback (play/pause) directly from the Global Header or Tab rows without switching tab focus. |

---

## 3. Host Permissions (`host_permissions: ["<all_urls>"]`) Justification

TabBellus requests `<all_urls>` strictly for two isolated, local-first client functionalities:

### 1. Universal Media Playback Toggle (`src/lib/mediaService.ts`)
* **Purpose:** Allows users to pause or resume audio and video playback playing in any background tab (e.g., YouTube, Spotify, podcast web players, or news sites) directly from the TabBellus interface.
* **Mechanism:** Executes `chrome.scripting.executeScript` targeting HTML5 `<video>` and `<audio>` DOM elements or `navigator.mediaSession` on the user-selected tab.
* **Security & Privacy Boundary:** The injected script is 100% self-contained, executes zero dynamic string evaluation (`eval`, `new Function`), and does not read, log, or transmit any web page content, user input, or credentials.

### 2. Navigation Lock Guard (`src/content/lockGuard.ts`)
* **Purpose:** Provides a user-triggered "Tab Lock" feature to protect critical work tabs (e.g., active form submissions, cloud IDEs, unsaved drafts) from accidental closure or link navigation.
* **Mechanism:** Injected content script listens for `beforeunload` events and intercepts hard link clicks on locked tabs, prompting confirmation before page unload.
* **Security & Privacy Boundary:** The content script performs zero DOM modifications, injects no styles or external scripts, executes no network requests, and remains completely dormant until explicitly activated by the user for a specific tab ID.

---

## 4. Privacy & Data Handling Statement

* **Zero Data Collection:** TabBellus does not collect, record, track, or transmit any personal data, browsing habits, URLs, page titles, or workspace structures.
* **No Remote Telemetry or Tracking:** TabBellus contains zero tracking scripts, no Google Analytics, no third-party telemetry beacons, and no tracking cookies.
* **Local-First Storage:** All saved spaces, tabs, and Read Later items are stored exclusively in the user's browser storage (IndexedDB via Dexie.js) on the local disk.
* **No Remote Server Infrastructure:** TabBellus does not connect to any proprietary backend servers or cloud services.
