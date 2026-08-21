import { type Tab } from '@/lib/db';

export type VirtualRow =
    | {
          type: 'tab';
          tab: chrome.tabs.Tab;
          globalIndex: number;
          inGroup?: boolean;
          color?: chrome.tabGroups.ColorEnum;
          isDuplicate?: boolean;
      }
    | {
          type: 'group-header';
          group: chrome.tabGroups.TabGroup;
          tabs: chrome.tabs.Tab[];
      };

export interface TabDragPayload {
    type: 'tab';
    tabId: number;
    globalIndex: number;
    chromeIndex: number;
    groupId: number;
    pinned?: boolean;
    [key: string]: unknown;
}

export interface GroupDragPayload {
    type: 'group-header';
    groupId: number;
    tabIds: number[];
    fromMinIndex: number;
    [key: string]: unknown;
}

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
  audible?: boolean; // Chrome tab audible state
  status?: 'loading' | 'complete'; // Tab loading status
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
    audible: tab.audible || false,
    status: tab.status as 'loading' | 'complete' | undefined,
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
