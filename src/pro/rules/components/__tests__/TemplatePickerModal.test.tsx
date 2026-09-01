/**
 * TemplatePickerModal Unit Tests
 *
 * SSR/Portal note: this project has no jsdom/testing-library and Radix
 * Dialog portal content renders empty under Node `renderToString` (verified
 * empirically — see RuleManagerCard.test.tsx). The template-append flow
 * lives in `templateActions.ts` as pure functions, exercised directly here.
 * A single closed-state SSR smoke test confirms the component itself
 * mounts without throwing.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TemplatePickerModal } from '../TemplatePickerModal';
import { ToastProvider } from '@/components/ui/Toaster';
import { instantiateTemplate, runAddTemplate } from '../templateActions';
import { RULE_TEMPLATES } from '@/pro/rules/storage/templates';
import type { TabRule } from '@/core/contracts/rules';

describe('TemplatePickerModal — SSR smoke test', () => {
  it('renders without throwing while closed', () => {
    expect(() =>
      renderToString(
        <ToastProvider>
          <TemplatePickerModal open={false} onOpenChange={() => {}} existingRules={[]} onAddRule={() => {}} />
        </ToastProvider>,
      ),
    ).not.toThrow();
  });
});

describe('instantiateTemplate', () => {
  it('generates a UUID id and matching createdAt/updatedAt timestamps', () => {
    const rule = instantiateTemplate(RULE_TEMPLATES[0], []);

    expect(rule.id).toBeTruthy();
    expect(typeof rule.id).toBe('string');
    expect(rule.createdAt).toBe(rule.updatedAt);
    expect(rule.name).toBe(RULE_TEMPLATES[0].name);
  });

  it('appends with the lowest evaluation precedence relative to existing rules', () => {
    const existing: TabRule[] = [
      { id: 'a', name: 'A', enabled: true, priority: 0, matchAll: false, conditions: [], actions: [], createdAt: 0, updatedAt: 0 },
      { id: 'b', name: 'B', enabled: true, priority: 4, matchAll: false, conditions: [], actions: [], createdAt: 0, updatedAt: 0 },
    ];

    const rule = instantiateTemplate(RULE_TEMPLATES[0], existing);
    expect(rule.priority).toBe(5);
  });

  it('assigns priority 0 to the first rule when the list is empty', () => {
    const rule = instantiateTemplate(RULE_TEMPLATES[0], []);
    expect(rule.priority).toBe(0);
  });

  it('generates distinct ids across successive instantiations', () => {
    const first = instantiateTemplate(RULE_TEMPLATES[0], []);
    const second = instantiateTemplate(RULE_TEMPLATES[0], [first]);
    expect(first.id).not.toBe(second.id);
  });

  it('every starter preset instantiates into a structurally valid TabRule', () => {
    for (const template of RULE_TEMPLATES) {
      const rule = instantiateTemplate(template, []);
      expect(rule.name).toBeTruthy();
      expect(rule.conditions.length).toBeGreaterThan(0);
      expect(rule.actions.length).toBeGreaterThan(0);
    }
  });
});

describe('runAddTemplate — 1-click append flow', () => {
  it('instantiates the template, hands it to onAddRule, and confirms via toast', async () => {
    const onAddRule = vi.fn().mockResolvedValue(undefined);
    const toast = vi.fn();

    const rule = await runAddTemplate(RULE_TEMPLATES[0], [], onAddRule, toast);

    expect(onAddRule).toHaveBeenCalledWith(rule);
    expect(toast).toHaveBeenCalledWith(`Added "${RULE_TEMPLATES[0].name}" rule`);
  });

  it('awaits an async onAddRule before toasting confirmation', async () => {
    const order: string[] = [];
    const onAddRule = vi.fn().mockImplementation(async () => {
      order.push('added');
    });
    const toast = vi.fn().mockImplementation(() => order.push('toasted'));

    await runAddTemplate(RULE_TEMPLATES[1], [], onAddRule, toast);

    expect(order).toEqual(['added', 'toasted']);
  });
});
