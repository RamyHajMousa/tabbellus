import type React from 'react';

export type SearchItemType = 'tab' | 'space' | 'saved-tab' | 'read-later' | 'bookmark';

export type FilterOperatorKey = 'domain' | 'site' | 'in' | 'is' | 'age' | 'before' | 'after';

export interface SearchFilterDirective {
    key: FilterOperatorKey;
    value: string;
    negated: boolean;
    rawToken: string;
}

export interface ParsedSearchQuery {
    rawText: string;
    terms: string[];
    filters: SearchFilterDirective[];
    trailingOperator?: {
        key: FilterOperatorKey;
        partialValue: string;
    };
}

export interface TabSearchResult {
    type: 'tab';
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    windowId: number;
    isCurrentWindow: boolean;
    audible?: boolean;
    muted?: boolean;
    discarded?: boolean;
    pinned?: boolean;
    createdAt?: number;
}

export interface SpaceSearchResult {
    type: 'space';
    id: number;
    name: string;
    color?: string;
    tabCount: number;
    isPinned?: boolean;
    createdAt?: number;
}

export interface SavedTabSearchResult {
    type: 'saved-tab';
    id?: number;
    spaceId?: number;
    spaceName?: string;
    spaceNames?: string[];
    title?: string;
    url: string;
    favicon?: string;
    createdAt?: number;
}

export interface ReadLaterSearchResult {
    type: 'read-later';
    id: number;
    title?: string;
    url: string;
    status: 'unread' | 'read' | 'archived';
    addedAt: number;
}

export interface BookmarkSearchResult {
    type: 'bookmark';
    id: string;
    title: string;
    url: string;
    dateAdded?: number;
}

export type SearchResultItem =
    | TabSearchResult
    | SpaceSearchResult
    | SavedTabSearchResult
    | ReadLaterSearchResult
    | BookmarkSearchResult;

export type CommandCategory =
    | 'Spaces & Workspaces'
    | 'Tab Management & Memory'
    | 'Audio & Tab Control'
    | 'Read Later & Ingestion'
    | 'Navigation & System';

export interface CommandContext {
    toast: (
        message: string | { title?: string; description?: string; action?: { label: string; onClick: () => void } },
        options?: { description?: string; onUndo?: () => void; action?: { label: string; onClick: () => void }; duration?: number }
    ) => void;
    setSearchOpen: (open: boolean) => void;
    setSettingsOpen: (open: boolean) => void;
    setHistoryOpen?: (open: boolean) => void;
    setActiveView: (view: 'active' | 'spaces' | 'read-later') => void;
    copy: (text: string) => Promise<boolean>;
}

export interface CommandAction {
    id: string;
    title: string;
    description?: string;
    category: CommandCategory;
    keywords: string[];
    shortcut?: string;
    icon: React.ComponentType<{ className?: string }>;
    isPro?: boolean;
    run: (context: CommandContext) => Promise<void> | void;
}

export type OmniSearchMode = 'search' | 'command';

export interface TopSiteItem {
    title: string;
    url: string;
}

export interface RecentSessionItem {
    sessionId?: string;
    lastModified: number;
    title: string;
    subtitle?: string;
    url?: string;
    isWindow: boolean;
    tabCount?: number;
    matchedSpaceId?: number;
    matchedSpaceName?: string;
    session: chrome.sessions.Session;
}

export interface LaunchpadData {
    topSites: TopSiteItem[];
    pinnedSpaces: SpaceSearchResult[];
    recentSessions: RecentSessionItem[];
    isLoading: boolean;
}
