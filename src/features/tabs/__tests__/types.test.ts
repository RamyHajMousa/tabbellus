import { describe, it, expect } from 'vitest';
import { chromeTabToRowData, savedTabToRowData } from '../types';
import { type Tab } from '@/lib/db';

describe('Tab Data Mappers (types.ts)', () => {
  it('should map chrome.tabs.Tab properties including status to RowTabData', () => {
    const mockChromeTab: chrome.tabs.Tab = {
      id: 42,
      index: 0,
      windowId: 1,
      highlighted: false,
      active: true,
      pinned: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      url: 'https://example.com',
      title: 'Example Page',
      favIconUrl: 'https://example.com/favicon.ico',
      status: 'loading',
      groupId: -1,
    };

    const rowData = chromeTabToRowData(mockChromeTab, 42);

    expect(rowData.id).toBe('chrome-42');
    expect(rowData.url).toBe('https://example.com');
    expect(rowData.title).toBe('Example Page');
    expect(rowData.favicon).toBe('https://example.com/favicon.ico');
    expect(rowData.source).toBe('active');
    expect(rowData.isActive).toBe(true);
    expect(rowData.chromeTabId).toBe(42);
    expect(rowData.status).toBe('loading');
  });

  it('should handle completed chrome tab status', () => {
    const mockChromeTab: chrome.tabs.Tab = {
      id: 101,
      index: 1,
      windowId: 1,
      highlighted: false,
      active: false,
      pinned: true,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      url: 'https://github.com',
      title: 'GitHub',
      favIconUrl: 'https://github.com/favicon.ico',
      status: 'complete',
      groupId: -1,
    };

    const rowData = chromeTabToRowData(mockChromeTab, 42);

    expect(rowData.id).toBe('chrome-101');
    expect(rowData.isActive).toBe(false);
    expect(rowData.pinned).toBe(true);
    expect(rowData.status).toBe('complete');
  });

  it('should correctly map savedTabToRowData without chrome tab status', () => {
    const savedTab: Tab = {
      id: 5,
      spaceId: 1,
      url: 'https://news.ycombinator.com',
      title: 'Hacker News',
      favicon: 'https://news.ycombinator.com/favicon.ico',
      order: 0,
    };

    const rowData = savedTabToRowData(savedTab);

    expect(rowData.id).toBe('saved-5');
    expect(rowData.url).toBe('https://news.ycombinator.com');
    expect(rowData.title).toBe('Hacker News');
    expect(rowData.source).toBe('saved');
    expect(rowData.isActive).toBe(false);
    expect(rowData.status).toBeUndefined();
  });
});
