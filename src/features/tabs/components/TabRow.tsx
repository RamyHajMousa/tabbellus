import React from 'react';
import { Globe, X, Clock, Trash2, Copy, Check, GripVertical } from 'lucide-react';
import { tabService } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { AddToSpaceMenu } from '@/features/spaces/components/AddToSpaceMenu';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { type RowTabData } from '../types';
import { InteractiveRow } from './InteractiveRow';

interface TabRowProps {
    data: RowTabData;
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

export const TabRow = React.memo(({ data, isActive: propIsActive, onClose, onReadLater, onDelete, isDragging, dragHandleProps }: TabRowProps) => {
    const { hasCopied, copy } = useClipboard();
    const isActive = propIsActive ?? data.isActive;
    const canAddToSpace = data.source === 'active';

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.url) {
            copy(data.url);
        }
    };

    return (
        <InteractiveRow
            size="md"
            isActive={isActive}
            isDragging={isDragging}
            onClick={(e) => {
                e.stopPropagation();
                if (data.source === 'saved') {
                    tabService.focusOrCreate(data.url).catch(() => { });
                } else if (data.chromeTabId !== undefined) {
                    chrome.tabs.update(data.chromeTabId, { active: true }).catch(() => { });
                }
            }}
        >
            {/* Leading */}
            <InteractiveRow.Leading>
                {dragHandleProps && (
                    <span
                        {...dragHandleProps}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity -ml-1"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Drag to reorder"
                    >
                        <GripVertical className="w-3.5 h-3.5" />
                    </span>
                )}
                {data.favicon ? (
                    <img
                        src={data.favicon}
                        alt=""
                        className="w-4 h-4 rounded-sm flex-shrink-0"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : null}
                <Globe className={`w-4 h-4 opacity-50 flex-shrink-0 ${data.favicon ? 'hidden' : ''}`} />
            </InteractiveRow.Leading>

            {/* Title */}
            <InteractiveRow.Title
                className={isActive ? 'text-foreground' : 'text-foreground/90'}
                subTitle={
                    <span className="truncate text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                        {tryParseHost(data.url)}
                    </span>
                }
            >
                {data.title || data.url}
            </InteractiveRow.Title>

            {/* Actions */}
            <InteractiveRow.Actions
                className={`gap-0.5 px-1 py-0.5 pl-2 ${isActive ? 'bg-accent' : 'bg-background group-hover:bg-accent'}`}
            >
                {data.url && (
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-blue-500 transition-colors focus:opacity-100"
                        title="Copy URL"
                    >
                        {hasCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                )}

                {canAddToSpace && (
                    <AddToSpaceMenu tab={data} />
                )}

                {onReadLater && (
                    <button
                        onClick={onReadLater}
                        className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-primary transition-colors focus:opacity-100"
                        title="Read Later"
                    >
                        <Clock className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                        title="Delete Tab from Space"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                        title="Close Tab"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </InteractiveRow.Actions>
        </InteractiveRow>
    );
});

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
