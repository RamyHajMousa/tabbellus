/**
 * Platform Detection Utility
 * 
 * Handles browser-specific logic to ensure feature compatibility.
 */

/**
 * Checks if the current browser is Microsoft Edge.
 * Edge uses "Edg/" in its user agent string.
 */
export const isEdge = (): boolean => {
    return navigator.userAgent.indexOf("Edg/") > -1;
};

/**
 * Opens the browser's appearance settings in a new tab.
 * This is used for changing sidebar position, theme, etc.
 * 
 * Note: Chrome specific URL.
 */
export const openAppearanceSettings = () => {
    if (isEdge()) {
        console.warn("Sidebar settings are not available via this link in Edge.");
        return;
    }

    chrome.tabs.create({ url: "chrome://settings/appearance" });
};
