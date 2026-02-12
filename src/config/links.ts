/**
 * Centralized configuration for external links.
 */

// TODO: Change this to the real extension ID when put in production
export const EXTENSION_ID = "placeholder";

export const EXTERNAL_LINKS = {
    STORE: `https://chromewebstore.google.com/detail/${EXTENSION_ID}`,
    REVIEWS: `https://chromewebstore.google.com/detail/${EXTENSION_ID}/reviews`,
    DONATE: "https://ko-fi.com/tabbellus",
    FEEDBACK: "https://github.com/RamyHajMousa/tabbellus/issues",
    SUPPORT: "https://errorfirst.com/tabbellus-support" // Smart Hub
} as const;
