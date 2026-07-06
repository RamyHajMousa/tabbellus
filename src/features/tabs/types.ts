import { type Tab } from '@/lib/db';

export interface RowTabData {
  id: string; // Unified string identifier
  url: string;
  title: string;
  favicon: string | null;
  source: 'active' | 'saved' | 'synced' | 'suggestion'; // Discriminant string literal
  isActive?: boolean;
  chromeTabId?: number; // Kept only for live Chrome tab interactions
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
