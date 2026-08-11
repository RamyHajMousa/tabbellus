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
        } else {
            setZoomFactor(1.0);
        }
    }, [activeTabId]);

    // Fetch zoom on mount, activeTabId change, or popover open
    useEffect(() => {
        fetchZoom();
    }, [fetchZoom, isOpen]);

    // Subscribe to Chrome active tab switches & zoom change events with strict cleanup
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.tabs) return;

        const handleActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
            if (activeTabId && activeInfo.tabId === activeTabId) {
                fetchZoom();
            } else if (!activeTabId && activeInfo.tabId) {
                // If activeTabId wasn't passed directly, query zoom for newly activated tab
                tabService.getTabZoom(activeInfo.tabId).then(setZoomFactor).catch(() => {});
            }
        };

        const handleZoomChange = (info: { tabId: number; oldZoomFactor: number; newZoomFactor: number }) => {
            if (activeTabId && info.tabId === activeTabId) {
                setZoomFactor(info.newZoomFactor);
            }
        };

        chrome.tabs.onActivated?.addListener(handleActivated);
        chrome.tabs.onZoomChange?.addListener(handleZoomChange);

        return () => {
            chrome.tabs.onActivated?.removeListener(handleActivated);
            chrome.tabs.onZoomChange?.removeListener(handleZoomChange);
        };
    }, [activeTabId, fetchZoom]);

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
    const isZoomed = Math.abs(zoomFactor - 1.0) > 0.01;

    const triggerTooltipContent = isZoomed ? `Page Zoom (${percentage}%)` : 'Page Zoom';

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipSimple content={triggerTooltipContent} side="bottom">
                <PopoverTrigger asChild>
                    <button
                        disabled={!activeTabId}
                        className="h-7 w-7 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors outline-none relative focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label="Page zoom control"
                    >
                        <Search className="w-3.5 h-3.5" />
                        {isZoomed && (
                            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                    </button>
                </PopoverTrigger>
            </TooltipSimple>
            <PopoverContent align="start" side="bottom" className="w-auto p-1.5 shadow-md">
                <div className="flex items-center gap-1">
                    {/* Fixed Left Slot: Reset Button */}
                    <TooltipSimple content={!isZoomed ? "Zoom is at 100%" : "Reset Zoom (100%)"} side="top">
                        <button
                            onClick={handleResetZoom}
                            disabled={!isZoomed}
                            className="h-7 px-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                            aria-label="Reset zoom"
                        >
                            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                            Reset
                        </button>
                    </TooltipSimple>

                    {/* Vertical Divider */}
                    <div className="w-[1px] h-4 bg-border mx-0.5 shrink-0" />

                    {/* Zoom Out (-) */}
                    <TooltipSimple content="Zoom Out (-10%)" side="top">
                        <button
                            onClick={handleZoomOut}
                            disabled={zoomFactor <= 0.25}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="w-3.5 h-3.5 shrink-0" />
                        </button>
                    </TooltipSimple>

                    {/* Percentage Label with tabular-nums for zero width shift */}
                    <span className="min-w-[3.5rem] text-center text-xs font-mono font-medium tabular-nums text-foreground select-none shrink-0">
                        {percentage}%
                    </span>

                    {/* Zoom In (+) */}
                    <TooltipSimple content="Zoom In (+10%)" side="top">
                        <button
                            onClick={handleZoomIn}
                            disabled={zoomFactor >= 5.0}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="w-3.5 h-3.5 shrink-0" />
                        </button>
                    </TooltipSimple>
                </div>
            </PopoverContent>
        </Popover>
    );
};
