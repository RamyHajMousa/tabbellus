# Privacy Policy for TabBellus

**Last Updated:** August 23, 2026  
**Effective Date:** August 23, 2026  

TabBellus ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy details how TabBellus handles information and emphasizes our strict **100% Local-First, Zero-Data-Collection** architecture.

---

## 1. Summary: Zero Data Collection

TabBellus operates entirely within your local browser environment. 
* **We do not collect, transmit, store, or sell any personal data.**
* **We do not track your browsing history, tab contents, search queries, or workspace data.**
* **We do not operate remote analytics servers, tracking pixels, or diagnostic beacons.**
* **We do not use third-party tracking services or monetization SDKs.**

---

## 2. Information Handled Locally on Your Device

All data processed by TabBellus remains strictly on your local physical device. This includes:

### A. Workspaces & Saved Tabs ("Spaces")
* **What is stored:** Space labels, tab titles, URLs, favicons, relative order, and optional color tags.
* **Storage Location:** IndexedDB (`TabBellusDB`) located in your browser's local sandbox storage via Dexie.js.
* **Access:** Accessible only by the TabBellus extension running locally on your computer.

### B. Reading Queue ("Read Later")
* **What is stored:** Deferred reading links, titles, favicons, timestamps, and read/archived status.
* **Storage Location:** IndexedDB (`TabBellusDB`) on your local device.

### C. Application Preferences & Ephemeral Session State
* **What is stored:** UI settings (theme, display options, badge mode, auto-discard interval threshold) and temporary window-to-space bindings.
* **Storage Location:** `chrome.storage.local` and `chrome.storage.session` on your local device.

---

## 3. Extension Permissions & How They Are Used

TabBellus utilizes the following browser permissions solely to deliver its core local productivity features:

* **`sidePanel`**: Embeds the workspace interface into Chrome's native Side Panel.
* **`tabs`**: Queries, focuses, restores, organizes, and suspends background tabs in your browser upon your request.
* **`tabGroups`**: Enables organizing, creating, naming, coloring, and saving native Chrome Tab Groups.
* **`storage` & `unlimitedStorage`**: Saves your settings, workspaces, and reading lists to local IndexedDB and Chrome storage without risk of data eviction.
* **`sessions`**: Allows viewing and restoring recently closed tabs/windows and matching closed windows to saved spaces.
* **`alarms`**: Schedules local background tasks (e.g., tab memory reclamation sweeps and workspace auto-sync flushes) efficiently.
* **`bookmarks`**: Provides a fast, read-only popover tree to launch browser bookmarks directly from the workspace header.
* **`contextMenus`**: Adds right-click options ("Save to TabBellus Read Later" on links/pages and toolbar menu actions).
* **`favicon`**: Retrieves cached website icons from your browser's local favicon cache for tab identity.
* **`topSites`**: Displays your frequent sites in the zero-state OmniSearch palette for quick keyboard navigation.
* **`scripting` & `<all_urls>`**: 
  * Allows media playback toggling (play/pause) on media-playing tabs without requiring tab focus.
  * Allows tab lock protection against accidental navigation/closure on user-designated protected tabs.
  * **No page content, keystrokes, form data, or web traffic is ever inspected, recorded, or transmitted.**

---

## 4. Third-Party Services & Remote Network Requests

TabBellus makes **zero** outbound network requests during its operation:
* No external API servers or databases are queried.
* No telemetry or crash reporting services are embedded.
* No advertising networks or affiliate trackers are integrated.

---

## 5. Data Backup, Export & Deletion

* **Export:** You can export your entire database (spaces, tabs, read later items) to a standardized JSON backup file at any time via **Settings → Data Tab → Export Backup**.
* **Import:** You can restore your data from any valid JSON backup file locally via **Settings → Data Tab → Import Backup** or by drag-and-dropping the backup file directly into the Spaces list.
* **Data Deletion:** You can permanently purge all stored data and reset the extension at any time via **Settings → Data Tab → Danger Zone (Purge All Data)** or by uninstalling the extension from your browser.

---

## 6. Children's Privacy

TabBellus does not collect or solicit any personal information from anyone, including children under the age of 13.

---

## 7. Changes to This Privacy Policy

Because TabBellus operates under a zero-data-collection model, our core privacy commitment will not change. If any updates are made to this document to reflect new local functionality or browser requirements, the updated policy will be published with an updated revision date.

---

## 8. Contact & Support

If you have questions, feedback, or need technical support regarding TabBellus, please reach out via our GitHub repository or support channels:

* **Repository:** [https://github.com/RamyHajMousa/tabbellus](https://github.com/RamyHajMousa/tabbellus)
