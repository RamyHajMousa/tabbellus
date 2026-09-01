import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuleExecutor } from '../engine/executor';
import { spaceService } from '@/lib/spaceService';
import { db } from '@/lib/db';
import type { RuleAction } from '@/core/contracts/rules';

// ── Chrome API Mocks ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();

  (globalThis as any).chrome = {
    tabs: {
      update: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 1, windowId: 10, url: 'https://example.com', title: 'Example' }),
      group: vi.fn().mockResolvedValue(999),
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('RuleExecutor.executeActions', () => {
  it('pins a tab via chrome.tabs.update', async () => {
    const actions: RuleAction[] = [{ type: 'pin' }];
    await RuleExecutor.executeActions(1, actions);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
  });

  it('mutes a tab via chrome.tabs.update', async () => {
    const actions: RuleAction[] = [{ type: 'mute' }];
    await RuleExecutor.executeActions(1, actions);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { muted: true });
  });

  it('discards a tab via chrome.tabs.discard', async () => {
    const actions: RuleAction[] = [{ type: 'discard' }];
    await RuleExecutor.executeActions(1, actions);

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1);
  });

  it('swallows a rejected discard (active tab / unsupported) without throwing', async () => {
    chrome.tabs.discard = vi.fn().mockRejectedValue(new Error('Cannot discard active tab'));
    const actions: RuleAction[] = [{ type: 'discard' }];

    await expect(RuleExecutor.executeActions(1, actions)).resolves.toBeUndefined();
  });

  it('does not let one failing action block the next action', async () => {
    chrome.tabs.update = vi.fn().mockRejectedValue(new Error('Tab closed'));
    const actions: RuleAction[] = [{ type: 'pin' }, { type: 'mute' }, { type: 'discard' }];

    await RuleExecutor.executeActions(1, actions);

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1);
  });

  describe('group action', () => {
    it('creates a new group and applies title/color when no matching group exists', async () => {
      chrome.tabGroups.query = vi.fn().mockResolvedValue([]);
      chrome.tabs.group = vi.fn().mockResolvedValue(555);

      const actions: RuleAction[] = [{ type: 'group', groupName: 'Dev', groupColor: 'purple' }];
      await RuleExecutor.executeActions(1, actions, 10);

      expect(chrome.tabGroups.query).toHaveBeenCalledWith({ windowId: 10 });
      expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: 1 });
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(555, { title: 'Dev', color: 'purple' });
    });

    it('joins an existing group in the window by case-insensitive title match', async () => {
      chrome.tabGroups.query = vi.fn().mockResolvedValue([{ id: 77, title: 'dev', windowId: 10 }]);

      const actions: RuleAction[] = [{ type: 'group', groupName: 'Dev', groupColor: 'purple' }];
      await RuleExecutor.executeActions(1, actions, 10);

      expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: 1, groupId: 77 });
      expect(chrome.tabGroups.update).not.toHaveBeenCalled();
    });

    it('resolves the window ID via chrome.tabs.get when windowId is omitted', async () => {
      chrome.tabs.get = vi.fn().mockResolvedValue({ id: 1, windowId: 42, url: 'https://x.com' });
      chrome.tabGroups.query = vi.fn().mockResolvedValue([]);

      const actions: RuleAction[] = [{ type: 'group', groupName: 'Dev' }];
      await RuleExecutor.executeActions(1, actions);

      expect(chrome.tabGroups.query).toHaveBeenCalledWith({ windowId: 42 });
    });

    it('is a no-op when the action has no groupName', async () => {
      const actions: RuleAction[] = [{ type: 'group' }];
      await RuleExecutor.executeActions(1, actions, 10);

      expect(chrome.tabGroups.query).not.toHaveBeenCalled();
      expect(chrome.tabs.group).not.toHaveBeenCalled();
    });
  });

  describe('space action', () => {
    it('adds the tab to the target space using live tab details', async () => {
      const spaceId = (await db.spaces.add({ name: 'Work', createdAt: Date.now() })) as number;
      chrome.tabs.get = vi.fn().mockResolvedValue({
        id: 1,
        windowId: 10,
        url: 'https://example.com/page',
        title: 'Example Page',
        favIconUrl: 'https://example.com/favicon.ico',
      });

      const actions: RuleAction[] = [{ type: 'space', spaceId }];
      await RuleExecutor.executeActions(1, actions);

      const tabs = await db.tabs.where('spaceId').equals(spaceId).toArray();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].url).toBe('https://example.com/page');
      expect(tabs[0].title).toBe('Example Page');
    });

    it('silently ignores a duplicate URL already saved in the target space', async () => {
      const spaceId = (await db.spaces.add({ name: 'Work', createdAt: Date.now() })) as number;
      await db.tabs.add({ spaceId, url: 'https://example.com/page', title: 'Existing', order: 0 });

      chrome.tabs.get = vi.fn().mockResolvedValue({
        id: 1,
        windowId: 10,
        url: 'https://example.com/page',
        title: 'Example Page',
      });

      const actions: RuleAction[] = [{ type: 'space', spaceId }];
      await expect(RuleExecutor.executeActions(1, actions)).resolves.toBeUndefined();

      const tabs = await db.tabs.where('spaceId').equals(spaceId).toArray();
      expect(tabs).toHaveLength(1);
    });

    it('completes cleanly when spaceService.addTabToSpace throws DUPLICATE_TAB and executes subsequent actions', async () => {
      const spaceId = 99;
      chrome.tabs.get = vi.fn().mockResolvedValue({
        id: 1,
        windowId: 10,
        url: 'https://example.com/duplicate',
        title: 'Duplicate Page',
      });

      vi.spyOn(spaceService, 'addTabToSpace').mockRejectedValueOnce(new Error('DUPLICATE_TAB'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const actions: RuleAction[] = [
        { type: 'space', spaceId },
        { type: 'pin' },
      ];

      await expect(RuleExecutor.executeActions(1, actions)).resolves.toBeUndefined();

      // Subsequent action (pin) must still execute
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
      // DUPLICATE_TAB must not trigger console.warn
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs a polite warning without throwing when spaceService.addTabToSpace encounters an unexpected error', async () => {
      const spaceId = 99;
      chrome.tabs.get = vi.fn().mockResolvedValue({
        id: 1,
        windowId: 10,
        url: 'https://example.com/error',
        title: 'Error Page',
      });

      const dbError = new Error('Database locked');
      vi.spyOn(spaceService, 'addTabToSpace').mockRejectedValueOnce(dbError);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const actions: RuleAction[] = [{ type: 'space', spaceId }];

      await expect(RuleExecutor.executeActions(1, actions)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('[RuleExecutor] Could not assign tab to space:', dbError);
    });

    it('is a no-op when the action has no spaceId', async () => {
      const actions: RuleAction[] = [{ type: 'space' }];
      await expect(RuleExecutor.executeActions(1, actions)).resolves.toBeUndefined();
      expect(chrome.tabs.get).not.toHaveBeenCalled();
    });
  });
});
