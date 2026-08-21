import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toaster';
import { useClipboard } from '@/hooks/useClipboard';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import type { CommandAction, CommandContext } from '../types';

export function useCommandExecutor() {
    const { toast } = useToast();
    const { copy } = useClipboard();
    const setSearchOpen = useUIStore((state) => state.setSearchOpen);
    const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
    const setHistoryOpen = useUIStore((state) => state.setHistoryOpen);
    const setActiveView = useAppStore((state) => state.setActiveView);

    const executeCommand = useCallback(
        async (command: CommandAction) => {
            // Automatically close the search palette when an action is executed
            setSearchOpen(false);

            const context: CommandContext = {
                toast,
                setSearchOpen,
                setSettingsOpen,
                setHistoryOpen,
                setActiveView,
                copy,
            };

            try {
                await command.run(context);
            } catch (error) {
                console.error(`[useCommandExecutor] Failed to run command "${command.id}":`, error);
                toast(`Failed to execute: ${command.title}`, {
                    description: error instanceof Error ? error.message : 'An unexpected error occurred.',
                });
            }
        },
        [toast, setSearchOpen, setSettingsOpen, setHistoryOpen, setActiveView, copy]
    );

    return { executeCommand };
}
