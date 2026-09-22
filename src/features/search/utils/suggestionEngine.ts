import type {
    DirectiveSuggestion,
    FilterOperatorKey,
    SuggestionContext,
    TrailingOperator,
} from '../types';
import { tryParseHost } from '@/lib/sessionUtils';

const MAX_TOTAL_SUGGESTIONS = 6;
const MAX_DOMAIN_SUGGESTIONS = 5;

interface OperatorMetadata {
    key: FilterOperatorKey;
    description: string;
}

const OPERATOR_DEFINITIONS: OperatorMetadata[] = [
    { key: 'in', description: 'Filter by scope or workspace name' },
    { key: 'is', description: 'Filter by state (pinned, audible, discarded...)' },
    { key: 'domain', description: 'Filter by website domain' },
    { key: 'site', description: 'Filter by website domain (synonym)' },
    { key: 'before', description: 'Filter items before duration or date' },
    { key: 'after', description: 'Filter items after duration or date' },
    { key: 'age', description: 'Filter items older than duration' },
];

interface CapabilityToken {
    token: string;
    description: string;
}

const IS_CAPABILITIES: CapabilityToken[] = [
    { token: 'audible', description: 'Tabs playing audio' },
    { token: 'muted', description: 'Muted tabs' },
    { token: 'pinned', description: 'Pinned tabs or spaces' },
    { token: 'discarded', description: 'Suspended idle tabs' },
    { token: 'locked', description: 'Lock-protected tabs' },
    { token: 'unread', description: 'Unread Read Later items' },
    { token: 'archived', description: 'Archived Read Later items' },
];

interface ScopeToken {
    token: string;
    description: string;
}

const IN_SCOPES: ScopeToken[] = [
    { token: 'active', description: 'Currently open tabs' },
    { token: 'spaces', description: 'Saved spaces & tabs' },
    { token: 'readlater', description: 'Saved Read Later items' },
    { token: 'bookmarks', description: 'Browser bookmarks' },
];

const TEMPORAL_PRESETS: Array<{ token: string; description: string }> = [
    { token: 'today', description: 'Items from today' },
    { token: 'yesterday', description: 'Items from yesterday' },
    { token: '7d', description: 'Within last 7 days' },
    { token: '30d', description: 'Within last 30 days' },
];

/**
 * Pure, zero-IndexedDB suggestion generator.
 * Produces autocomplete items for both Operator Discovery Mode and Value Completion Mode.
 */
export function getDirectiveSuggestions(
    trailingOperator: TrailingOperator | undefined,
    context?: SuggestionContext
): DirectiveSuggestion[] {
    if (!trailingOperator) {
        return [];
    }

    const negPrefix = trailingOperator.negated ? '-' : '';

    // ==========================================
    // 1. Operator Discovery Mode (typing before colon)
    // ==========================================
    if (!trailingOperator.hasColon) {
        const partialKey = (trailingOperator.partialKey || '').toLowerCase();

        const matched = OPERATOR_DEFINITIONS.filter((op) =>
            partialKey.length === 0 ? true : op.key.startsWith(partialKey)
        );

        return matched.slice(0, MAX_TOTAL_SUGGESTIONS).map((op) => ({
            id: `op-${negPrefix}${op.key}`,
            label: `${negPrefix}${op.key}:`,
            description: op.description,
            insertText: `${negPrefix}${op.key}:`,
            category: 'operator',
            key: op.key,
        }));
    }

    // ==========================================
    // 2. Value Completion Mode (operator key complete)
    // ==========================================
    const opKey = trailingOperator.key;
    if (!opKey) {
        return [];
    }

    const partialVal = trailingOperator.partialValue.toLowerCase();

    // 2a. is: directive
    if (opKey === 'is') {
        const matched = IS_CAPABILITIES.filter((cap) => {
            if (!partialVal) return true;
            return cap.token.toLowerCase().includes(partialVal);
        }).sort((a, b) => {
            const aStarts = a.token.toLowerCase().startsWith(partialVal);
            const bStarts = b.token.toLowerCase().startsWith(partialVal);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });

        return matched.slice(0, MAX_TOTAL_SUGGESTIONS).map((cap) => ({
            id: `val-is-${negPrefix}${cap.token}`,
            label: `${negPrefix}is:${cap.token}`,
            description: cap.description,
            insertText: `${negPrefix}is:${cap.token} `,
            category: 'value',
            key: 'is',
        }));
    }

    // 2b. in: directive
    if (opKey === 'in') {
        const suggestions: DirectiveSuggestion[] = [];

        // Static scopes
        const matchedScopes = IN_SCOPES.filter((scope) => {
            if (!partialVal) return true;
            return scope.token.toLowerCase().includes(partialVal);
        }).sort((a, b) => {
            const aStarts = a.token.toLowerCase().startsWith(partialVal);
            const bStarts = b.token.toLowerCase().startsWith(partialVal);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });

        for (const scope of matchedScopes) {
            suggestions.push({
                id: `val-in-scope-${negPrefix}${scope.token}`,
                label: `${negPrefix}in:${scope.token}`,
                description: scope.description,
                insertText: `${negPrefix}in:${scope.token} `,
                category: 'value',
                key: 'in',
            });
        }

        // Dynamic space names
        if (context?.spaces && context.spaces.length > 0) {
            const seenNames = new Set<string>();

            for (const sp of context.spaces) {
                const rawName = typeof sp === 'string' ? sp : sp?.name;
                if (!rawName) continue;

                // Sanitize double quotes to prevent lexer corruption
                const cleanName = rawName.replace(/"/g, '').trim();
                if (!cleanName || seenNames.has(cleanName.toLowerCase())) continue;
                seenNames.add(cleanName.toLowerCase());

                if (partialVal && !cleanName.toLowerCase().includes(partialVal)) {
                    continue;
                }

                // Apply Quoting Constraint: wrap in double quotes if space name contains whitespace
                const formattedName = cleanName.includes(' ') ? `"${cleanName}"` : cleanName;

                suggestions.push({
                    id: `val-in-space-${negPrefix}${cleanName.toLowerCase()}`,
                    label: `${negPrefix}in:${formattedName}`,
                    description: `Space · ${cleanName}`,
                    insertText: `${negPrefix}in:${formattedName} `,
                    category: 'value',
                    key: 'in',
                });
            }
        }

        return suggestions.slice(0, MAX_TOTAL_SUGGESTIONS);
    }

    // 2c. domain: and site: directives
    if (opKey === 'domain' || opKey === 'site') {
        const suggestions: DirectiveSuggestion[] = [];
        const seenHosts = new Set<string>();

        if (context?.openTabs && context.openTabs.length > 0) {
            for (const tab of context.openTabs) {
                if (!tab.url) continue;
                const host = tryParseHost(tab.url);
                if (!host || seenHosts.has(host)) continue;
                seenHosts.add(host);

                if (partialVal && !host.includes(partialVal)) {
                    continue;
                }

                suggestions.push({
                    id: `val-${opKey}-${negPrefix}${host}`,
                    label: `${negPrefix}${opKey}:${host}`,
                    description: `Tabs on ${host}`,
                    insertText: `${negPrefix}${opKey}:${host} `,
                    category: 'value',
                    key: opKey,
                });

                if (suggestions.length >= MAX_DOMAIN_SUGGESTIONS) {
                    break;
                }
            }
        }

        return suggestions.slice(0, MAX_TOTAL_SUGGESTIONS);
    }

    // 2d. before:, after:, age: temporal directives
    if (opKey === 'before' || opKey === 'after' || opKey === 'age') {
        const matched = TEMPORAL_PRESETS.filter((preset) => {
            if (!partialVal) return true;
            return preset.token.toLowerCase().includes(partialVal);
        });

        return matched.slice(0, MAX_TOTAL_SUGGESTIONS).map((preset) => ({
            id: `val-${opKey}-${negPrefix}${preset.token}`,
            label: `${negPrefix}${opKey}:${preset.token}`,
            description: preset.description,
            insertText: `${negPrefix}${opKey}:${preset.token} `,
            category: 'value',
            key: opKey,
        }));
    }

    return [];
}
