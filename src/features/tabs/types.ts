import { type Tab } from '@/lib/db';

export interface RowTabData {
  id: string; // Unified string identifier
  url: string;
  title: string;
  favicon: string | null;
  source: 'active' | 'saved' | 'synced' | 'suggestion'; // Discriminant string literal
  isActive?: boolean;
  chromeTabId?: number; // Kept only for live Chrome tab interactions
  pinned?: boolean; // Chrome tab pinned state (context menu toggle)
  mutedInfo?: chrome.tabs.MutedInfo; // Chrome tab muted state (context menu toggle)
}

export function chromeTabToRowData(tab: chrome.tabs.Tab, activeTabId?: number | null): RowTabData {
  return {
    id: `chrome-${tab.id ?? Math.random()}`,
    url: tab.url ?? '',
    title: tab.title ?? '',
    favicon: tab.favIconUrl || getFallbackFavicon(tab.url),
    source: 'active',
    isActive: tab.id !== undefined && activeTabId !== undefined && tab.id === activeTabId,
    chromeTabId: tab.id,
    pinned: tab.pinned,
    mutedInfo: tab.mutedInfo,
  };
}

export function savedTabToRowData(tab: Tab): RowTabData {
  return {
    id: `saved-${tab.id ?? Math.random()}`,
    url: tab.url,
    title: tab.title ?? '',
    favicon: tab.favicon || getFallbackFavicon(tab.url),
    source: 'saved',
    isActive: false,
  };
}

export function getFallbackFavicon(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol.startsWith('http')) {
      const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'mock-extension-id';
      return `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    }
  } catch {}
  return null;
}
