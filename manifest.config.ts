import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';

const { version } = packageJson;

export default defineManifest({
    manifest_version: 3,
    name: "TabBellus",
    version: version,
    description: "The premium workspace and tab manager for power users. Save spaces, search tabs, and declutter your browser.",
    permissions: [
        "tabs",
        "storage",
        "sidePanel",
        "unlimitedStorage",
        "tabGroups",
        "sessions",
        "alarms",
        "_favicon"
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
    icons: {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "128": "icons/icon-128.png"
    }
});
