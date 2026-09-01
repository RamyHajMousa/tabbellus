/**
 * Background Rules Dispatcher Unit Tests
 *
 * Tests:
 * - isRuleEligibleUrl internal scheme / Chrome Web Store filtering
 * - Navigation event deduplication (2000ms debounce window)
 * - Debounce cache eviction on tab removal
 * - processTab: matched vs. unmatched evaluation
 * - applyRulesToWindow batch sweep telemetry
 * - APPLY_RULES_TO_WINDOW runtime message dispatching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RulesDispatcher, isRuleEligibleUrl } from '../rulesDispatcher';
import { contractRegistry } from '@/core/contracts/registry';
import type { RulesContract, TabRule } from '@/core/contracts/rules';

function makeRulesProvider(overrides: Partial<RulesContract> = {}): RulesContract {
  return {
    getRules: vi.fn().mockResolvedValue([]),
    saveRules: vi.fn().mockResolvedValue(undefined),
    evaluateTab: vi.fn().mockResolvedValue({ matched: false, actions: [] }),
    executeActions: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
      cb([]);
      return () => {};
    }),
    ...overrides,
  };
}

function makeTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    windowId: 10,
    url: 'https://example.com',
    title: 'Example',
    active: false,
    index: 0,
    pinned: false,
    highlighted: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    ...overrides,
  } as chrome.tabs.Tab;
}

type OnUpdatedHandler = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void;
type OnMessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

let onCreatedHandler: ((tab: chrome.tabs.Tab) => void) | undefined;
let onUpdatedHandler: OnUpdatedHandler | undefined;
let onRemovedHandler: ((tabId: number, removeInfo: unknown) => void) | undefined;
let onMessageHandler: OnMessageHandler | undefined;
let tabsQueryMock: ReturnType<typeof vi.fn>;

function setupChromeMock() {
  onCreatedHandler = undefined;
  onUpdatedHandler = undefined;
  onRemovedHandler = undefined;
  onMessageHandler = undefined;
  tabsQueryMock = vi.fn().mockResolvedValue([]);

  (globalThis as any).chrome = {
    tabs: {
      query: tabsQueryMock,
      onCreated: { addListener: vi.fn((fn) => { onCreatedHandler = fn; }) },
      onUpdated: { addListener: vi.fn((fn) => { onUpdatedHandler = fn; }) },
      onRemoved: { addListener: vi.fn((fn) => { onRemovedHandler = fn; }) },
    },
    runtime: {
      onMessage: { addListener: vi.fn((fn) => { onMessageHandler = fn; }) },
    },
  };
}

beforeEach(() => {
  contractRegistry.reset();
  setupChromeMock();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// isRuleEligibleUrl
// ---------------------------------------------------------------------------

describe('isRuleEligibleUrl', () => {
  it('excludes internal browser schemes', () => {
    expect(isRuleEligibleUrl('chrome://settings')).toBe(false);
    expect(isRuleEligibleUrl('chrome-extension://abcdefg/page.html')).toBe(false);
    expect(isRuleEligibleUrl('edge://settings')).toBe(false);
    expect(isRuleEligibleUrl('about:blank')).toBe(false);
    expect(isRuleEligibleUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
    expect(isRuleEligibleUrl('view-source:https://example.com')).toBe(false);
  });

  it('excludes Chrome Web Store URLs', () => {
    expect(isRuleEligibleUrl('https://chromewebstore.google.com/detail/xyz')).toBe(false);
    expect(isRuleEligibleUrl('https://chrome.google.com/webstore/detail/xyz')).toBe(false);
  });

  it('excludes empty, blank, and undefined urls', () => {
    expect(isRuleEligibleUrl(undefined)).toBe(false);
    expect(isRuleEligibleUrl('')).toBe(false);
    expect(isRuleEligibleUrl('   ')).toBe(false);
  });

  it('is case-insensitive when matching excluded schemes', () => {
    expect(isRuleEligibleUrl('CHROME://settings')).toBe(false);
  });

  it('allows ordinary http(s) urls', () => {
    expect(isRuleEligibleUrl('https://github.com/org/repo')).toBe(true);
    expect(isRuleEligibleUrl('http://internal.local/dashboard')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// init() listener bindings
// ---------------------------------------------------------------------------

describe('RulesDispatcher.init() — listener bindings', () => {
  it('binds chrome.tabs.onCreated to trigger tab processing', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const tab = makeTab({ id: 11, url: 'https://github.com/org/repo' });
    onCreatedHandler?.(tab);

    await vi.waitFor(() => expect(evaluateTab).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// Navigation event deduplication
// ---------------------------------------------------------------------------

describe('RulesDispatcher — navigation event deduplication', () => {
  it('evaluates a tab/url transition exactly once for rapid successive processTab calls', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    const tab = makeTab({ id: 5, url: 'https://github.com/org/repo' });

    await dispatcher.processTab(tab);
    await dispatcher.processTab(tab);
    await dispatcher.processTab(tab);

    expect(evaluateTab).toHaveBeenCalledTimes(1);
  });

  it('deduplicates rapid successive onUpdated events routed through init()', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const tab = makeTab({ id: 5, url: 'https://github.com/org/repo' });

    // Loading -> complete transitions Chrome typically fires for one navigation.
    onUpdatedHandler?.(5, { status: 'loading' } as chrome.tabs.TabChangeInfo, tab);
    onUpdatedHandler?.(5, { url: tab.url } as chrome.tabs.TabChangeInfo, tab);
    onUpdatedHandler?.(5, { status: 'complete' } as chrome.tabs.TabChangeInfo, tab);

    await vi.waitFor(() => expect(evaluateTab).toHaveBeenCalled());
    expect(evaluateTab).toHaveBeenCalledTimes(1);
  });

  it('does not evaluate onUpdated events without a url change or complete status', () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const tab = makeTab({ id: 5, url: 'https://github.com/org/repo' });
    onUpdatedHandler?.(5, { status: 'loading' } as chrome.tabs.TabChangeInfo, tab);

    expect(evaluateTab).not.toHaveBeenCalled();
  });

  it('re-evaluates once the 2000ms debounce window has elapsed', async () => {
    vi.useFakeTimers();
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    const tab = makeTab({ id: 5, url: 'https://github.com/org/repo' });

    await dispatcher.processTab(tab);
    vi.advanceTimersByTime(2001);
    await dispatcher.processTab(tab);

    expect(evaluateTab).toHaveBeenCalledTimes(2);
  });

  it('re-evaluates immediately when the URL changes for the same tab', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    await dispatcher.processTab(makeTab({ id: 5, url: 'https://github.com/a' }));
    await dispatcher.processTab(makeTab({ id: 5, url: 'https://github.com/b' }));

    expect(evaluateTab).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Cache cleanup on tab removal
// ---------------------------------------------------------------------------

describe('RulesDispatcher — debounce cache cleanup', () => {
  it('clearTab() evicts the cache entry, allowing immediate re-evaluation', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    const tab = makeTab({ id: 7, url: 'https://github.com/org/repo' });

    await dispatcher.processTab(tab);
    expect(evaluateTab).toHaveBeenCalledTimes(1);

    dispatcher.clearTab(7);
    await dispatcher.processTab(tab);

    expect(evaluateTab).toHaveBeenCalledTimes(2);
  });

  it('wires chrome.tabs.onRemoved through init() to clear the cache', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const tab = makeTab({ id: 9, url: 'https://github.com/org/repo' });
    await dispatcher.processTab(tab);
    expect(evaluateTab).toHaveBeenCalledTimes(1);

    onRemovedHandler?.(9, { windowId: 10, isWindowClosing: false });

    await dispatcher.processTab(tab);
    expect(evaluateTab).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// processTab
// ---------------------------------------------------------------------------

describe('RulesDispatcher.processTab', () => {
  it('executes matched actions via the rules provider', async () => {
    const actions = [{ type: 'pin' as const }];
    const evaluateTab = vi.fn().mockResolvedValue({ matched: true, ruleId: 'r1', ruleName: 'Pin it', actions });
    const executeActions = vi.fn().mockResolvedValue(undefined);
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    const tab = makeTab({ id: 3, windowId: 20, url: 'https://github.com/org/repo', title: 'Repo' });

    await dispatcher.processTab(tab);

    expect(evaluateTab).toHaveBeenCalledWith({ url: 'https://github.com/org/repo', title: 'Repo' });
    expect(executeActions).toHaveBeenCalledWith(3, actions, 20);
  });

  it('takes no action when no rule matches', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: false, actions: [] });
    const executeActions = vi.fn();
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    await dispatcher.processTab(makeTab({ id: 3, url: 'https://github.com/org/repo' }));

    expect(executeActions).not.toHaveBeenCalled();
  });

  it('takes no action when matched but the actions array is empty', async () => {
    const evaluateTab = vi.fn().mockResolvedValue({ matched: true, ruleId: 'r1', actions: [] });
    const executeActions = vi.fn();
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    await dispatcher.processTab(makeTab({ id: 3, url: 'https://github.com/org/repo' }));

    expect(executeActions).not.toHaveBeenCalled();
  });

  it('skips ineligible URLs without calling evaluateTab', async () => {
    const evaluateTab = vi.fn();
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    await dispatcher.processTab(makeTab({ id: 3, url: 'chrome://settings' }));

    expect(evaluateTab).not.toHaveBeenCalled();
  });

  it('skips tabs with no id', async () => {
    const evaluateTab = vi.fn();
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab }));

    const dispatcher = new RulesDispatcher();
    await dispatcher.processTab(makeTab({ id: undefined, url: 'https://github.com' }));

    expect(evaluateTab).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// applyRulesToWindow
// ---------------------------------------------------------------------------

describe('RulesDispatcher.applyRulesToWindow', () => {
  it('evaluates and executes actions across multiple eligible tabs in a window', async () => {
    tabsQueryMock.mockResolvedValue([
      makeTab({ id: 1, windowId: 10, url: 'https://github.com/a' }),
      makeTab({ id: 2, windowId: 10, url: 'https://gitlab.com/b' }),
      makeTab({ id: 3, windowId: 10, url: 'chrome://settings' }), // ineligible
    ]);

    const evaluateTab = vi
      .fn()
      .mockResolvedValueOnce({ matched: true, ruleId: 'r1', actions: [{ type: 'pin' }] })
      .mockResolvedValueOnce({ matched: false, actions: [] });
    const executeActions = vi.fn().mockResolvedValue(undefined);
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    const result = await dispatcher.applyRulesToWindow(10);

    expect(tabsQueryMock).toHaveBeenCalledWith({ windowId: 10 });
    expect(evaluateTab).toHaveBeenCalledTimes(2); // chrome:// tab excluded
    expect(executeActions).toHaveBeenCalledTimes(1);
    expect(executeActions).toHaveBeenCalledWith(1, [{ type: 'pin' }], 10);
    expect(result).toEqual({ processed: 2, matched: 1 });
  });

  it('isolates a single tab evaluation failure without aborting the rest of the sweep', async () => {
    tabsQueryMock.mockResolvedValue([
      makeTab({ id: 1, windowId: 10, url: 'https://github.com/a' }),
      makeTab({ id: 2, windowId: 10, url: 'https://gitlab.com/b' }),
    ]);

    const evaluateTab = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ matched: true, ruleId: 'r1', actions: [{ type: 'mute' }] });
    const executeActions = vi.fn().mockResolvedValue(undefined);
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    const result = await dispatcher.applyRulesToWindow(10);

    expect(result).toEqual({ processed: 2, matched: 1 });
  });

  it('returns zeroed telemetry when no tabs are eligible', async () => {
    tabsQueryMock.mockResolvedValue([makeTab({ id: 1, windowId: 10, url: 'about:blank' })]);
    contractRegistry.registerRulesProvider(makeRulesProvider());

    const dispatcher = new RulesDispatcher();
    const result = await dispatcher.applyRulesToWindow(10);

    expect(result).toEqual({ processed: 0, matched: 0 });
  });
});

// ---------------------------------------------------------------------------
// APPLY_RULES_TO_WINDOW runtime message
// ---------------------------------------------------------------------------

describe('RulesDispatcher — APPLY_RULES_TO_WINDOW runtime message', () => {
  it('dispatches applyRulesToWindow with the provided windowId and responds with telemetry', async () => {
    tabsQueryMock.mockResolvedValue([makeTab({ id: 1, windowId: 42, url: 'https://github.com/a' })]);

    const evaluateTab = vi.fn().mockResolvedValue({ matched: true, ruleId: 'r1', actions: [{ type: 'pin' }] });
    const executeActions = vi.fn().mockResolvedValue(undefined);
    contractRegistry.registerRulesProvider(makeRulesProvider({ evaluateTab, executeActions }));

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const sendResponse = vi.fn();
    const keepChannelOpen = onMessageHandler?.(
      { type: 'APPLY_RULES_TO_WINDOW', windowId: 42 },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ processed: 1, matched: 1 }));
    expect(tabsQueryMock).toHaveBeenCalledWith({ windowId: 42 });
  });

  it('falls back to the active tab window when windowId is omitted', async () => {
    tabsQueryMock.mockImplementation((query: chrome.tabs.QueryInfo) => {
      if (query.active && query.currentWindow) {
        return Promise.resolve([makeTab({ id: 1, windowId: 77, active: true })]);
      }
      return Promise.resolve([makeTab({ id: 1, windowId: 77, url: 'https://github.com/a' })]);
    });

    contractRegistry.registerRulesProvider(makeRulesProvider());

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const sendResponse = vi.fn();
    onMessageHandler?.({ type: 'APPLY_RULES_TO_WINDOW' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(tabsQueryMock).toHaveBeenCalledWith({ windowId: 77 });
  });

  it('responds with zeroed telemetry when no window can be resolved', async () => {
    tabsQueryMock.mockResolvedValue([]); // active-tab lookup finds nothing
    contractRegistry.registerRulesProvider(makeRulesProvider());

    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const sendResponse = vi.fn();
    onMessageHandler?.({ type: 'APPLY_RULES_TO_WINDOW' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ processed: 0, matched: 0 }));
  });

  it('ignores unrelated message types', () => {
    contractRegistry.registerRulesProvider(makeRulesProvider());
    const dispatcher = new RulesDispatcher();
    dispatcher.init();

    const sendResponse = vi.fn();
    const result = onMessageHandler?.({ type: 'SOME_OTHER_MESSAGE' }, {}, sendResponse);

    expect(result).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
