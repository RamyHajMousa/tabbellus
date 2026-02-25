/**
 * Centralized configuration for external links.
 */

export const EXTENSION_ID = "icggkiaagnjmomdbpnmofhalhfdgooio";

export const EXTERNAL_LINKS = {
    STORE: `https://chromewebstore.google.com/detail/TabBellus/${EXTENSION_ID}`,
    REVIEWS: `https://chromewebstore.google.com/detail/tabbellus/${EXTENSION_ID}/reviews`,
    DONATE: "https://ko-fi.com/tabbellus",
    FEEDBACK: "https://github.com/RamyHajMousa/tabbellus/issues",
    SUPPORT: "https://errorfirst.com/tabbellus-support" // Smart Hub
} as const;
