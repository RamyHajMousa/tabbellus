import type { DirectiveSuggestion, TrailingOperator } from '../types';

export interface ApplyDirectiveResult {
    updatedQuery: string;
    nextCaretPosition: number;
}

/**
 * Pure query splicer for directive autocomplete.
 * Deterministically replaces the substring slice defined by trailingOperator's start and end indices.
 *
 * Rules:
 * - Operator completion tokens (ending in ':') preserve colon without trailing space so value completion triggers immediately.
 * - Value completion tokens append a single space (' ') to commit the directive in the lexer.
 * - Mid-query replacements cleanly avoid duplicate spaces if followed by an existing space.
 * - Returns updated query and next caret position.
 */
export function applyDirectiveSuggestion(
    query: string,
    suggestion: DirectiveSuggestion | string,
    trailingOperator: TrailingOperator
): ApplyDirectiveResult {
    const rawToken = typeof suggestion === 'string' ? suggestion : suggestion.insertText;

    const before = query.slice(0, trailingOperator.startIndex);
    const after = query.slice(trailingOperator.endIndex);

    // Operator completion (e.g. "in:", "-is:") keeps colon without space
    const isOperator = rawToken.endsWith(':');

    let replacement: string;
    if (isOperator) {
        replacement = rawToken;
    } else {
        // Value completion must end with a single space to commit the directive in the lexer
        replacement = rawToken.endsWith(' ') ? rawToken : `${rawToken} `;
    }

    // Mid-query whitespace collision guard: if replacement ends with space and after starts with space, consume one space
    const trimmedAfter =
        replacement.endsWith(' ') && after.startsWith(' ') ? after.slice(1) : after;

    const updatedQuery = before + replacement + trimmedAfter;
    const nextCaretPosition = before.length + replacement.length;

    return {
        updatedQuery,
        nextCaretPosition,
    };
}
