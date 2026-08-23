import React, { useState } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { AnimatedAudioIcon } from './AnimatedAudioIcon';
import { useAudioTabs } from '../hooks/useAudioTabs';
import { tabService } from '@/lib/tabService';
import { useActiveMediaSession } from '../hooks/useActiveMediaSession';

function tryParseHost(url?: string) {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

export const AudioControlPopover: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { audioTabs, audibleCount, toggleMuteTab, muteAllAudioTabs, unmuteAllAudioTabs } = useAudioTabs();
    const mediaSessions = useActiveMediaSession((state) => state.mediaSessions);
    const togglePlayback = useActiveMediaSession((state) => state.togglePlayback);

    // Keep popover visible as long as we have any active, paused, or muted audio tabs
    if (audibleCount === 0 && audioTabs.length === 0) {
        return null;
    }

    const isAllMuted = audioTabs.length > 0 && audioTabs.every(t => t.mutedInfo?.muted);

    const hasUnmutedAudio = audioTabs.some(t => {
        const isMuted = !!t.mutedInfo?.muted;
        const sessionState = t.id !== undefined ? mediaSessions[t.id] : undefined;
        if (sessionState !== undefined) {
            return sessionState === 'playing' && !isMuted;
        }
        return t.audible && !isMuted;
    });

    const handleToggleMuteAll = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isAllMuted) {
            await unmuteAllAudioTabs();
        } else {
            await muteAllAudioTabs();
        }
    };

    const handleTogglePlayback = async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        e.preventDefault();
        if (typeof tab.id !== 'number' || tab.id <= 0) return;
        await togglePlayback(tab.id);
    };

    const handleFocusTab = (tab: chrome.tabs.Tab) => {
        if (!tab.id) return;
        if (tab.url) {
            tabService.focusOrCreate(tab.url);
        } else {
            chrome.tabs.update(tab.id, { active: true }).catch(() => { });
            if (tab.windowId) {
                chrome.windows.update(tab.windowId, { focused: true }).catch(() => { });
            }
        }
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipSimple content="Active Audio Tabs" side="bottom">
                <PopoverTrigger asChild>
                    <button
                        aria-label="Active audio tabs"
                        className="ml-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors relative outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {isAllMuted ? (
                            <VolumeX className="w-4 h-4" />
                        ) : (
                            <Volume2 className="w-4 h-4" />
                        )}
                        {hasUnmutedAudio && (
                            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        )}
                    </button>
                </PopoverTrigger>
            </TooltipSimple>
            <PopoverContent align="end" className="w-80 p-2 shadow-md">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-border mb-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <AnimatedAudioIcon className="w-3.5 h-3.5 text-primary" isPaused={!hasUnmutedAudio} />
                        <span>Audio Tabs ({audioTabs.length})</span>
                    </div>
                    {audioTabs.length > 0 && (
                        <TooltipSimple content={isAllMuted ? "Unmute all audio tabs" : "Mute all audio tabs"} side="top">
                            <button
                                onClick={handleToggleMuteAll}
                                className="px-2 py-0.5 text-xxs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors flex items-center outline-none"
                            >
                                {isAllMuted ? (
                                    <>
                                        <Volume2 className="w-3.5 h-3.5 mr-1" />
                                        Unmute All
                                    </>
                                ) : (
                                    <>
                                        <VolumeX className="w-3.5 h-3.5 mr-1" />
                                        Mute All
                                    </>
                                )}
                            </button>
                        </TooltipSimple>
                    )}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {audioTabs.map((tab) => {
                        const isMuted = !!tab.mutedInfo?.muted;
                        const host = tryParseHost(tab.url);

                        const sessionState = tab.id !== undefined ? mediaSessions[tab.id] : undefined;
                        const isPlaying = sessionState !== undefined
                            ? sessionState === 'playing'
                            : Boolean(tab.audible);

                        return (
                            <div
                                key={tab.id}
                                onClick={() => handleFocusTab(tab)}
                                className="group flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                                    <SmartFallbackIcon
                                        url={tab.url}
                                        favicon={tab.favIconUrl}
                                        className="w-4 h-4 rounded-sm flex-shrink-0"
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-medium text-foreground truncate leading-tight">
                                            {tab.title || tab.url}
                                        </span>
                                        {host && (
                                            <span className="text-[10px] text-muted-foreground/70 truncate leading-none mt-0.5">
                                                {host}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                    <TooltipSimple content={isPlaying ? "Pause Playback" : "Resume Playback"} side="top">
                                        <button
                                            onClick={(e) => handleTogglePlayback(e, tab)}
                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            aria-label={isPlaying ? "Pause Playback" : "Resume Playback"}
                                        >
                                            {isPlaying ? (
                                                <Pause className="w-3.5 h-3.5 text-foreground" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 text-foreground" />
                                            )}
                                        </button>
                                    </TooltipSimple>

                                    <TooltipSimple content={isMuted ? "Unmute Tab" : "Mute Tab"} side="top">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                if (tab.id) toggleMuteTab(tab.id);
                                            }}
                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            aria-label={isMuted ? "Unmute Tab" : "Mute Tab"}
                                        >
                                            {isMuted ? (
                                                <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
                                            ) : (
                                                <Volume2 className="w-3.5 h-3.5 text-primary" />
                                            )}
                                        </button>
                                    </TooltipSimple>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
};
