import type { SearchFilterDirective, SearchResultItem } from '../types';
import { tryParseHost } from '@/lib/sessionUtils';

export interface FilterEvaluationContext {
    lockedTabIds?: number[];
    now?: number;
}

const DURATION_MULTIPLIERS: Record<string, number> = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
};

/**
 * Parses duration strings like '30d', '7d', '2w', '24h', '1m'. Defaults to days if no unit.
 */
function parseDurationToMs(str: string): number | undefined {
    const match = str.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z])?$/);
    if (!match) return undefined;
    const amount = parseFloat(match[1]);
    const unit = (match[2] || 'd').toLowerCase();
    const multiplier = DURATION_MULTIPLIERS[unit] ?? DURATION_MULTIPLIERS.d;
    return amount * multiplier;
}

/**
 * Extracts available creation or added timestamp from search candidates.
 */
function getCandidateTimestamp(candidate: SearchResultItem): number | undefined {
    if ('addedAt' in candidate && typeof candidate.addedAt === 'number') {
        return candidate.addedAt;
    }
    if ('dateAdded' in candidate && typeof candidate.dateAdded === 'number') {
        return candidate.dateAdded;
    }
    if ('createdAt' in candidate && typeof candidate.createdAt === 'number') {
        return candidate.createdAt;
    }
    return undefined;
}

/**
 * Pure helper evaluating whether a candidate actively possesses the capability
 * and satisfies a positive directive (ignoring negation).
 */
function matchesDirectivePositive(
    candidate: SearchResultItem,
    directive: SearchFilterDirective,
    context?: FilterEvaluationContext
): boolean {
    const { key, value } = directive;
    const now = context?.now ?? Date.now();

    // 1. domain: / site:
    if (key === 'domain' || key === 'site') {
        if (!('url' in candidate) || !candidate.url) {
            return false;
        }

        const candidateHost = tryParseHost(candidate.url);
        if (!candidateHost) {
            return false;
        }

        const targetHost = (tryParseHost(value) || value.replace(/^www\./i, '')).toLowerCase();
        if (!targetHost) {
            return false;
        }

        if (candidateHost === targetHost || candidateHost.endsWith('.' + targetHost)) {
            return true;
        }
        if (!targetHost.includes('.') && candidateHost.includes(targetHost)) {
            return true;
        }

        return false;
    }

    // 2. in:
    if (key === 'in') {
        const valLower = value.trim().toLowerCase();

        // Scope shorthands
        if (valLower === 'active') {
            return candidate.type === 'tab';
        }

        if (valLower === 'spaces') {
            return candidate.type === 'space' || candidate.type === 'saved-tab';
        }

        if (valLower === 'readlater' || valLower === 'read-later' || valLower === 'read_later') {
            return candidate.type === 'read-later';
        }

        if (valLower === 'bookmarks' || valLower === 'bookmark') {
            return candidate.type === 'bookmark';
        }

        // Custom space name filtering
        if (candidate.type === 'space') {
            return candidate.name.toLowerCase().includes(valLower);
        }

        if (candidate.type === 'saved-tab') {
            return (
                candidate.spaceNames?.some((s) => s.toLowerCase().includes(valLower)) ||
                Boolean(candidate.spaceName?.toLowerCase().includes(valLower))
            );
        }

        // All other entities (active tab, read later, bookmark) are not inside named spaces
        return false;
    }

    // 3. is:
    if (key === 'is') {
        const pred = value.trim().toLowerCase();

        if (pred === 'unread') {
            if (candidate.type !== 'read-later') return false;
            return candidate.status === 'unread';
        }

        if (pred === 'archived') {
            if (candidate.type !== 'read-later') return false;
            return candidate.status === 'archived';
        }

        if (pred === 'audible') {
            if (candidate.type !== 'tab') return false;
            return Boolean(candidate.audible);
        }

        if (pred === 'muted') {
            if (candidate.type !== 'tab') return false;
            return Boolean(candidate.muted);
        }

        if (pred === 'discarded' || pred === 'suspended') {
            if (candidate.type !== 'tab') return false;
            return Boolean(candidate.discarded);
        }

        if (pred === 'locked') {
            if (candidate.type !== 'tab') return false;
            const lockedIds = context?.lockedTabIds || [];
            return lockedIds.includes(candidate.id);
        }

        if (pred === 'pinned') {
            if (candidate.type === 'tab') {
                return Boolean(candidate.pinned);
            }
            if (candidate.type === 'space') {
                return Boolean(candidate.isPinned);
            }
            return false;
        }

        // Unknown is: predicate does not match positively
        return false;
    }

    // 4. age:
    if (key === 'age') {
        const timestamp = getCandidateTimestamp(candidate);
        if (timestamp === undefined || typeof timestamp !== 'number' || isNaN(timestamp)) {
            return false;
        }

        const candidateAge = now - timestamp;
        const trimmed = value.trim();

        let comparator = '>';
        let durationStr = trimmed;

        if (trimmed.startsWith('>=')) {
            comparator = '>=';
            durationStr = trimmed.slice(2);
        } else if (trimmed.startsWith('<=')) {
            comparator = '<=';
            durationStr = trimmed.slice(2);
        } else if (trimmed.startsWith('>')) {
            comparator = '>';
            durationStr = trimmed.slice(1);
        } else if (trimmed.startsWith('<')) {
            comparator = '<';
            durationStr = trimmed.slice(1);
        }

        const thresholdMs = parseDurationToMs(durationStr);
        if (thresholdMs === undefined) {
            return false;
        }

        if (comparator === '>') {
            return candidateAge > thresholdMs;
        }
        if (comparator === '<') {
            return candidateAge < thresholdMs;
        }
        if (comparator === '>=') {
            return candidateAge >= thresholdMs;
        }
        if (comparator === '<=') {
            return candidateAge <= thresholdMs;
        }

        return false;
    }

    // 5. before:
    if (key === 'before') {
        const timestamp = getCandidateTimestamp(candidate);
        if (timestamp === undefined || typeof timestamp !== 'number' || isNaN(timestamp)) {
            return false;
        }

        const targetTime = new Date(value.trim()).getTime();
        if (isNaN(targetTime)) {
            return false;
        }

        return timestamp < targetTime;
    }

    // 6. after:
    if (key === 'after') {
        const timestamp = getCandidateTimestamp(candidate);
        if (timestamp === undefined || typeof timestamp !== 'number' || isNaN(timestamp)) {
            return false;
        }

        const targetTime = new Date(value.trim()).getTime();
        if (isNaN(targetTime)) {
            return false;
        }

        return timestamp > targetTime;
    }

    return false;
}

/**
 * Evaluates a single filter directive against a candidate.
 * Applies domain capability: positive directives require candidate capability,
 * and negated directives invert the positive evaluation so non-possessing entities pass.
 */
export function evaluateFilterDirective(
    candidate: SearchResultItem,
    directive: SearchFilterDirective,
    context?: FilterEvaluationContext
): boolean {
    const matchesPositive = matchesDirectivePositive(candidate, directive, context);
    return directive.negated ? !matchesPositive : matchesPositive;
}

/**
 * Pure evaluation function testing a candidate against all directives in a search query.
 * Returns true if the candidate matches all directives (AND condition).
 */
export function evaluateCandidateFilters(
    candidate: SearchResultItem,
    filters: SearchFilterDirective[],
    context?: FilterEvaluationContext
): boolean {
    if (!filters || filters.length === 0) {
        return true;
    }

    return filters.every((filter) => evaluateFilterDirective(candidate, filter, context));
}
