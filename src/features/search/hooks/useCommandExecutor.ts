import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toaster';
import { useClipboard } from '@/hooks/useClipboard';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { contractRegistry } from '@/core/contracts/registry';
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

            // Specialized Pro Command Dispatcher for Tab Rules
            if (command.id === 'apply-tab-rules') {
                const entitlement = contractRegistry.getEntitlementSnapshot();
                if (!entitlement.isPro) {
                    setSearchOpen(false);
                    toast('TabBellus Pro Feature', {
                        description: 'Tab Rules and automation require an active Pro license.',
                        action: {
                            label: 'Upgrade',
                            onClick: () => {
                                setSettingsOpen(true);
                            },
                        },
                    });
                    return;
                }

                try {
                    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
                        toast('Tab Rules Error', { description: 'Chrome runtime is unavailable.' });
                        return;
                    }

                    const response = await chrome.runtime.sendMessage({ type: 'APPLY_RULES_TO_WINDOW' });
                    const processed = typeof response?.processed === 'number' ? response.processed : 0;
                    const matched = typeof response?.matched === 'number' ? response.matched : 0;

                    toast('Tab Rules Applied', {
                        description: `Organized ${matched} of ${processed} tabs in this window.`,
                    });
                } catch (error) {
                    console.error('[useCommandExecutor] Failed to apply tab rules to window:', error);
                    toast('Failed to apply tab rules', {
                        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
                    });
                }
                return;
            }

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

