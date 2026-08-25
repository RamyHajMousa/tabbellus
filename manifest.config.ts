import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import packageJson from './package.json';

const { version } = packageJson;

export default defineManifest(async (env) => {
    const envVars = loadEnv(env.mode, process.cwd(), '');
    const isDev = env.mode === 'development';
    const devKey = envVars.VITE_CRX_PUBLIC_KEY;

    return {
        manifest_version: 3,
        name: "TabBellus",
        version: version,
        description: "The premium workspace and tab manager for power users. Save spaces, search tabs, and declutter your browser.",
        minimum_chrome_version: "116",
        ...(isDev && devKey ? { key: devKey } : {}),
        permissions: [
            "tabs",
            "scripting",
            "storage",
            "sidePanel",
            "unlimitedStorage",
            "tabGroups",
            "sessions",
            "alarms",
            "bookmarks",
            "contextMenus",
            "favicon",
            "topSites",
            "identity"
        ],
        oauth2: {
            client_id: "355684236759-lpotgaton5baaq7g9m74hj9f14i28bm6.apps.googleusercontent.com",
            scopes: ["https://www.googleapis.com/auth/drive.appdata"]
        },
        host_permissions: [
            "<all_urls>"
        ],
        action: {
            default_popup: "src/popup/index.html",
        },
        commands: {
            "save-to-read-later": {
                suggested_key: {
                    default: "Alt+R",
                    mac: "MacCtrl+R"
                },
                description: "Save to Read Later"
            }
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
            "32": "icons/icon-32.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png"
        },
        content_scripts: [
            {
                matches: ["<all_urls>"],
                js: ["src/content/lockGuard.ts"]
            }
        ]
    };
});
