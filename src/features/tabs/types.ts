import { type Tab } from '@/lib/db';
import { getFaviconUrl } from '@/lib';

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
    favicon: getFaviconUrl(tab.url, tab.favIconUrl),
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
    favicon: getFaviconUrl(tab.url, tab.favicon),
    source: 'saved',
    isActive: false,
  };
}
