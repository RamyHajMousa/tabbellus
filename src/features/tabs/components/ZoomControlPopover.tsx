import React, { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { tabService } from '@/lib/tabService';

interface ZoomControlPopoverProps {
    activeTabId?: number | null;
}

export const ZoomControlPopover: React.FC<ZoomControlPopoverProps> = ({ activeTabId }) => {
    const [zoomFactor, setZoomFactor] = useState<number>(1.0);
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const fetchZoom = useCallback(async () => {
        if (activeTabId) {
            const zoom = await tabService.getTabZoom(activeTabId);
            setZoomFactor(zoom);
        }
    }, [activeTabId]);

    useEffect(() => {
        if (isOpen) {
            fetchZoom();
        }
    }, [isOpen, fetchZoom]);

    // Also listen to chrome tab zoom change events dynamically
    useEffect(() => {
        const handleZoomChange = (info: { tabId: number; oldZoomFactor: number; newZoomFactor: number }) => {
            if (activeTabId && info.tabId === activeTabId) {
                setZoomFactor(info.newZoomFactor);
            }
        };

        if (typeof chrome !== 'undefined' && chrome.tabs?.onZoomChange) {
            chrome.tabs.onZoomChange.addListener(handleZoomChange);
            return () => {
                chrome.tabs.onZoomChange.removeListener(handleZoomChange);
            };
        }
    }, [activeTabId]);

    const handleZoomIn = async () => {
        if (!activeTabId) return;
        // Discrete stepping: 0.1 step up to 5.0
        const nextZoom = Math.min(5.0, Number((zoomFactor + 0.1).toFixed(2)));
        await tabService.setTabZoom(activeTabId, nextZoom);
        setZoomFactor(nextZoom);
    };

    const handleZoomOut = async () => {
        if (!activeTabId) return;
        // Discrete stepping: 0.1 step down to 0.25
        const nextZoom = Math.max(0.25, Number((zoomFactor - 0.1).toFixed(2)));
        await tabService.setTabZoom(activeTabId, nextZoom);
        setZoomFactor(nextZoom);
    };

    const handleResetZoom = async () => {
        if (!activeTabId) return;
        await tabService.setTabZoom(activeTabId, 1.0);
        setZoomFactor(1.0);
    };

    const percentage = Math.round(zoomFactor * 100);
    const isDefault = percentage === 100;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipSimple content={`Page Zoom (${percentage}%)`} side="bottom">
                <PopoverTrigger asChild>
                    <button
                        disabled={!activeTabId}
                        className="h-7 w-7 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors outline-none relative"
                        aria-label="Page zoom control"
                    >
                        <Search className="w-3.5 h-3.5" />
                        {!isDefault && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                    </button>
                </PopoverTrigger>
            </TooltipSimple>
            <PopoverContent align="start" side="bottom" className="w-auto p-2">
                <div className="flex items-center gap-1.5">
                    {!isDefault && (
                        <>
                            <TooltipSimple content="Reset Zoom (100%)" side="top">
                                <button
                                    onClick={handleResetZoom}
                                    className="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors outline-none"
                                    aria-label="Reset zoom"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                </button>
                            </TooltipSimple>
                            <div className="w-[1px] h-4 bg-border mx-0.5" />
                        </>
                    )}

                    <TooltipSimple content="Zoom Out (-10%)" side="top">
                        <button
                            onClick={handleZoomOut}
                            disabled={zoomFactor <= 0.25}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                    </TooltipSimple>

                    <span className="w-12 text-center text-xs font-mono font-medium text-foreground select-none">
                        {percentage}%
                    </span>

                    <TooltipSimple content="Zoom In (+10%)" side="top">
                        <button
                            onClick={handleZoomIn}
                            disabled={zoomFactor >= 5.0}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </TooltipSimple>
                </div>
            </PopoverContent>
        </Popover>
    );
};
