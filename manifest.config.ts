import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
    manifest_version: 3,
    name: "TabBellus Workstation",
    version: "1.0.0",
    description: "A calm, local-first workspace layer for Chromium.",
    permissions: [
        "tabs",
        "storage",
        "sidePanel",
        "unlimitedStorage",
        "tabGroups",
        "sessions"
    ],
    action: {
        default_popup: "src/popup/index.html",
    },
    side_panel: {
        default_path: "src/sidepanel/index.html"
    },
    background: {
        service_worker: "src/background/index.ts",
        type: "module",
    },
    // icons: {
    //     "16": "icons/icon-16.png",
    //     "48": "icons/icon-48.png",
    //     "128": "icons/icon-128.png"
    // }
});
