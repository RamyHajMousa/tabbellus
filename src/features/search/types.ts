import type React from 'react';

export type SearchItemType = 'tab' | 'space' | 'saved-tab' | 'read-later' | 'bookmark';

export interface TabSearchResult {
    type: 'tab';
    id: number;
    title: string;
    url: string;
    favIconUrl?: string;
    windowId: number;
    isCurrentWindow: boolean;
}

export interface SpaceSearchResult {
    type: 'space';
    id: number;
    name: string;
    color?: string;
    tabCount: number;
    isPinned?: boolean;
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
    toast: (message: string, options?: { description?: string; onUndo?: () => void; duration?: number }) => void;
    setSearchOpen: (open: boolean) => void;
    setSettingsOpen: (open: boolean) => void;
    setHistoryOpen?: (open: boolean) => void;
    setActiveView: (view: 'active' | 'spaces' | 'read-later') => void;
    copy: (text: string) => Promise<boolean>;
}

export interface CommandAction {
    id: string;
    title: string;
    category: CommandCategory;
    keywords: string[];
    shortcut?: string;
    icon: React.ComponentType<{ className?: string }>;
    run: (context: CommandContext) => Promise<void> | void;
}

export type OmniSearchMode = 'search' | 'command';
