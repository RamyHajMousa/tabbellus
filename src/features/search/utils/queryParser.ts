import type { FilterOperatorKey, ParsedSearchQuery, SearchFilterDirective } from '../types';

const VALID_OPERATOR_KEYS = new Set<FilterOperatorKey>([
    'domain',
    'site',
    'in',
    'is',
    'age',
    'before',
    'after',
]);

function isAlpha(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * Deterministic single-pass search query lexer.
 * Scans input character-by-character without regex backtracking.
 *
 * Capabilities:
 * - Directives: domain:, site:, in:, is:, age:, before:, after:
 * - Case-insensitive operator keys (e.g. DOMAIN: -> domain)
 * - Negation prefix: -domain:youtube.com -> negated: true, rawToken captures '-'
 * - Quoted values with spaces: in:"Project Alpha"
 * - Unclosed quote recovery during typing: in:"Proj -> value: "Proj"
 * - Trailing operator extraction for autocomplete: ends on in: or is:aud
 * - Extracts clean rawText and terms outside filter directives
 */
export function parseSearchQuery(input: string): ParsedSearchQuery {
    if (!input || input.trim().length === 0) {
        return {
            rawText: '',
            terms: [],
            filters: [],
            trailingOperator: undefined,
        };
    }

    const n = input.length;
    let i = 0;
    const terms: string[] = [];
    const filters: SearchFilterDirective[] = [];
    let trailingOperator: ParsedSearchQuery['trailingOperator'] = undefined;

    while (i < n) {
        // 1. Skip leading whitespace
        while (i < n && input[i] === ' ') {
            i++;
        }
        if (i >= n) break;

        const tokenStart = i;

        // 2. Check for optional leading negation prefix '-'
        let negated = false;
        let cursor = i;
        if (input[cursor] === '-') {
            negated = true;
            cursor++;
        }

        // 3. Scan potential operator identifier (letters only)
        const identStart = cursor;
        while (cursor < n && isAlpha(input[cursor])) {
            cursor++;
        }
        const identifier = input.slice(identStart, cursor).toLowerCase();

        // 4. Check if this forms a valid operator directive followed by ':'
        if (
            identifier.length > 0 &&
            VALID_OPERATOR_KEYS.has(identifier as FilterOperatorKey) &&
            cursor < n &&
            input[cursor] === ':'
        ) {
            const opKey = identifier as FilterOperatorKey;
            cursor++; // skip ':'

            let value = '';
            let isAtEnd = false;

            if (cursor < n && input[cursor] === '"') {
                // Quoted value
                cursor++; // skip opening '"'
                const valStart = cursor;
                let quoteClosed = false;

                while (cursor < n) {
                    if (input[cursor] === '"') {
                        quoteClosed = true;
                        break;
                    }
                    cursor++;
                }

                value = input.slice(valStart, cursor);
                if (quoteClosed) {
                    cursor++; // skip closing '"'
                }

                const rawToken = input.slice(tokenStart, cursor);
                isAtEnd = cursor === n;

                if (value.length > 0) {
                    filters.push({
                        key: opKey,
                        value,
                        negated,
                        rawToken,
                    });
                }

                if (isAtEnd) {
                    trailingOperator = {
                        key: opKey,
                        partialValue: value,
                        negated,
                        startIndex: tokenStart,
                        endIndex: cursor,
                        rawToken,
                        hasColon: true,
                    };
                }

                i = cursor;
                continue;
            } else {
                // Unquoted value: scan until next whitespace or end of string
                const valStart = cursor;
                while (cursor < n && input[cursor] !== ' ') {
                    cursor++;
                }

                value = input.slice(valStart, cursor);
                const rawToken = input.slice(tokenStart, cursor);
                isAtEnd = cursor === n;

                if (value.length > 0) {
                    filters.push({
                        key: opKey,
                        value,
                        negated,
                        rawToken,
                    });
                }

                if (isAtEnd) {
                    trailingOperator = {
                        key: opKey,
                        partialValue: value,
                        negated,
                        startIndex: tokenStart,
                        endIndex: cursor,
                        rawToken,
                        hasColon: true,
                    };
                }

                i = cursor;
                continue;
            }
        }

        // 5. Operator Discovery Mode: check if cursor is at the end of input typing an operator key before ':'
        if (cursor === n) {
            const isPrefixOfOperator =
                identifier.length > 0 &&
                Array.from(VALID_OPERATOR_KEYS).some((k) => k.startsWith(identifier));
            const isDanglingNegation = negated && identifier.length === 0;

            if (isPrefixOfOperator || isDanglingNegation) {
                const rawToken = input.slice(tokenStart, cursor);
                trailingOperator = {
                    partialKey: identifier,
                    partialValue: '',
                    negated,
                    startIndex: tokenStart,
                    endIndex: cursor,
                    rawToken,
                    hasColon: false,
                };

                if (rawToken.length > 0 && !isDanglingNegation) {
                    terms.push(rawToken);
                }

                i = cursor;
                continue;
            }
        }

        // 6. Not an operator directive; parse as a search term
        cursor = tokenStart;
        if (input[cursor] === '"') {
            // Quoted search term
            cursor++; // skip opening '"'
            const termStart = cursor;
            let quoteClosed = false;

            while (cursor < n) {
                if (input[cursor] === '"') {
                    quoteClosed = true;
                    break;
                }
                cursor++;
            }

            const term = input.slice(termStart, cursor);
            if (quoteClosed) {
                cursor++; // skip closing '"'
            }
            if (term.trim().length > 0) {
                terms.push(term.trim());
            }
            i = cursor;
        } else {
            // Unquoted search term
            const termStart = cursor;
            while (cursor < n && input[cursor] !== ' ') {
                cursor++;
            }
            const term = input.slice(termStart, cursor);
            if (term.trim().length > 0) {
                terms.push(term.trim());
            }
            i = cursor;
        }
    }

    const rawText = terms.join(' ');

    return {
        rawText,
        terms,
        filters,
        trailingOperator,
    };
}
