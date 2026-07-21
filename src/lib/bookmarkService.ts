/**
 * Safe Bookmark Service wrapping chrome.bookmarks API.
 */
export const bookmarkService = {
  /**
   * Fetches the entire bookmark tree.
   * Returns empty array if bookmarks API is not available or errors out.
   */
  async getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    try {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        return await chrome.bookmarks.getTree();
      }
      console.warn('Bookmarks API is not available in this context.');
      return [];
    } catch (error) {
      console.error('Failed to get bookmark tree:', error);
      return [];
    }
  }
};
