/**
 * Starter Tab Automation Rule Presets
 *
 * Ready-to-adopt rule bodies (minus identity/priority/timestamps, which are
 * assigned when a template is instantiated into a real `TabRule`).
 */

import type { TabRule } from '@/core/contracts/rules';

export const RULE_TEMPLATES: Omit<TabRule, 'id' | 'createdAt' | 'updatedAt' | 'priority'>[] = [
  {
    name: 'Development',
    enabled: true,
    matchAll: false,
    conditions: [
      { field: 'domain', operator: 'contains', value: 'github.com' },
      { field: 'domain', operator: 'contains', value: 'gitlab.com' },
    ],
    actions: [{ type: 'group', groupName: 'Dev', groupColor: 'purple' }],
  },
  {
    name: 'Google Workspace',
    enabled: true,
    matchAll: false,
    conditions: [
      { field: 'domain', operator: 'contains', value: 'docs.google.com' },
      { field: 'domain', operator: 'contains', value: 'sheets.google.com' },
    ],
    actions: [{ type: 'group', groupName: 'Work', groupColor: 'blue' }],
  },
  {
    name: 'Media & Streaming',
    enabled: true,
    matchAll: false,
    conditions: [
      { field: 'domain', operator: 'contains', value: 'youtube.com' },
      { field: 'domain', operator: 'contains', value: 'twitch.tv' },
    ],
    actions: [{ type: 'mute' }],
  },
  {
    name: 'Documentation',
    enabled: true,
    matchAll: false,
    conditions: [
      { field: 'domain', operator: 'contains', value: 'developer.mozilla.org' },
      { field: 'domain', operator: 'contains', value: 'stackoverflow.com' },
    ],
    actions: [{ type: 'group', groupName: 'Docs', groupColor: 'green' }],
  },
];
