import { db } from '@/lib/db';

console.log('TabBellus Service Worker Initialized');

chrome.runtime.onInstalled.addListener(() => {
    console.log('TabBellus Installed');
    // Initialize default spaces if needed
    db.open().then(() => {
        console.log('DB Connected in Background');
    }).catch(err => {
        console.error('DB Connection Failed', err);
    });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
