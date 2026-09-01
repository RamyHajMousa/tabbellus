/**
 * Chrome Action Executor for Tab Automation Rules
 *
 * Applies the side-effect `RuleAction[]` produced by a matched `TabRule`
 * against a live Chrome tab. Every Chrome API call is isolated so a single
 * failed action (permission error, closed tab, stale group) never halts
 * the remaining actions in the list.
 */

import type { RuleAction } from '@/core/contracts/rules';
import { spaceService } from '@/lib/spaceService';

export class RuleExecutor {
  static async executeActions(tabId: number, actions: RuleAction[], windowId?: number): Promise<void> {
    for (const action of actions) {
      try {
        await RuleExecutor.executeAction(tabId, action, windowId);
      } catch {
        // A single failed action must not halt subsequent actions.
      }
    }
  }

  private static async executeAction(tabId: number, action: RuleAction, windowId?: number): Promise<void> {
    switch (action.type) {
      case 'pin':
        await RuleExecutor.safeCall(() => chrome.tabs.update(tabId, { pinned: true }));
        return;
      case 'mute':
        await RuleExecutor.safeCall(() => chrome.tabs.update(tabId, { muted: true }));
        return;
      case 'discard':
        // Chrome rejects discarding the active/already-discarded tab or on
        // unsupported platforms — swallowed by safeCall, non-fatal.
        await RuleExecutor.safeCall(() => chrome.tabs.discard(tabId));
        return;
      case 'group':
        await RuleExecutor.executeGroupAction(tabId, action, windowId);
        return;
      case 'space':
        await RuleExecutor.executeSpaceAction(tabId, action);
        return;
      default:
        return;
    }
  }

  private static async safeCall<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  }

  private static async executeGroupAction(tabId: number, action: RuleAction, windowId?: number): Promise<void> {
    if (!action.groupName) return;

    let targetWindowId = windowId;
    if (targetWindowId === undefined) {
      const tab = await RuleExecutor.safeCall(() => chrome.tabs.get(tabId));
      targetWindowId = tab?.windowId;
    }
    if (targetWindowId === undefined) return;

    const groups = (await RuleExecutor.safeCall(() => chrome.tabGroups.query({ windowId: targetWindowId }))) ?? [];

    const normalizedName = action.groupName.trim().toLowerCase();
    const existingGroup = groups.find((group) => (group.title ?? '').trim().toLowerCase() === normalizedName);

    if (existingGroup) {
      await RuleExecutor.safeCall(() => chrome.tabs.group({ tabIds: tabId, groupId: existingGroup.id }));
      return;
    }

    const groupId = await RuleExecutor.safeCall(() => chrome.tabs.group({ tabIds: tabId }));
    if (groupId === undefined) return;

    await RuleExecutor.safeCall(() =>
      chrome.tabGroups.update(groupId, {
        title: action.groupName,
        color: action.groupColor as chrome.tabGroups.ColorEnum,
      }),
    );
  }

  private static async executeSpaceAction(tabId: number, action: RuleAction): Promise<void> {
    if (action.spaceId === undefined) return;

    const tab = await RuleExecutor.safeCall(() => chrome.tabs.get(tabId));
    if (!tab?.url) return;

    try {
      await spaceService.addTabToSpace(action.spaceId, {
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
      });
    } catch (err) {
      if (
        err === 'DUPLICATE_TAB' ||
        (err instanceof Error && err.message === 'DUPLICATE_TAB') ||
        (typeof err === 'object' && err !== null && (err as any).message === 'DUPLICATE_TAB')
      ) {
        return;
      }
      console.warn('[RuleExecutor] Could not assign tab to space:', err);
    }
  }
}
