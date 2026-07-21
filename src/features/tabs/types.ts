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
  discarded?: boolean; // Chrome tab suspended/discarded state
}

export function chromeTabToRowData(tab: chrome.tabs.Tab, activeTabId?: number | null): RowTabData {
  return {
    id: `chrome-${tab.id ?? Math.random()}`,
    url: tab.url ?? '',
    title: tab.title ?? '',
    favicon: tab.favIconUrl ?? null,
    source: 'active',
    isActive: tab.id !== undefined && activeTabId !== undefined && tab.id === activeTabId,
    chromeTabId: tab.id,
    pinned: tab.pinned,
    mutedInfo: tab.mutedInfo,
    discarded: tab.discarded || false,
  };
}

export function savedTabToRowData(tab: Tab): RowTabData {
  return {
    id: `saved-${tab.id ?? Math.random()}`,
    url: tab.url,
    title: tab.title ?? '',
    favicon: tab.favicon ?? null,
    source: 'saved',
    isActive: false,
  };
}
