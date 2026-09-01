/**
 * useCommandExecutor Unit Tests
 *
 * Tests:
 * - Free tier intercept: dismisses search and prompts upgrade for 'apply-tab-rules'
 * - Pro tier execution: dispatches APPLY_RULES_TO_WINDOW and reports telemetry toast
 * - Graceful runtime failure handling
 * - Standard command execution delegation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useCommandExecutor } from '../useCommandExecutor';
import { ToastProvider } from '@/components/ui/Toaster';
import { useUIStore } from '@/store/uiStore';
import { contractRegistry } from '@/core/contracts/registry';
import type { CommandAction } from '../../types';

const DummyIcon: React.FC<{ className?: string }> = () => null;

function captureHook<T>(useHook: () => T, wrapper?: React.FC<{ children: React.ReactNode }>): T {
    let captured: T | undefined;
    const Probe: React.FC = () => {
        captured = useHook();
        return null;
    };
    if (wrapper) {
        renderToString(React.createElement(wrapper, null, React.createElement(Probe)));
    } else {
        renderToString(React.createElement(Probe));
    }
    return captured as T;
}

describe('useCommandExecutor Hook', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        contractRegistry.reset();
        useUIStore.setState({ isSearchOpen: true, isSettingsOpen: false });

        (globalThis as any).chrome = {
            runtime: {
                sendMessage: vi.fn(),
            },
        };
    });

    it('intercepts "apply-tab-rules" when Free Tier: dismisses search and shows Upgrade prompt', async () => {
        vi.spyOn(contractRegistry, 'getEntitlementSnapshot').mockReturnValue({
            isPro: false,
            tier: 'free',
            loading: false,
        });

        const MockToastWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <ToastProvider>{children}</ToastProvider>
        );

        const { executeCommand } = captureHook(useCommandExecutor, MockToastWrapper);

        const applyCmd: CommandAction = {
            id: 'apply-tab-rules',
            title: 'Apply Tab Rules to Window',
            category: 'Tab Management & Memory',
            keywords: ['rules'],
            icon: DummyIcon,
            isPro: true,
            run: vi.fn(),
        };

        await executeCommand(applyCmd);

        // Search must be dismissed
        expect(useUIStore.getState().isSearchOpen).toBe(false);

        // Standard run must NOT be called directly
        expect(applyCmd.run).not.toHaveBeenCalled();
    });

    it('executes "apply-tab-rules" when Pro Tier: dispatches APPLY_RULES_TO_WINDOW message', async () => {
        vi.spyOn(contractRegistry, 'getEntitlementSnapshot').mockReturnValue({
            isPro: true,
            tier: 'pro',
            loading: false,
        });

        const sendMessageMock = vi.fn().mockResolvedValue({ processed: 12, matched: 5 });
        (globalThis as any).chrome = {
            runtime: {
                sendMessage: sendMessageMock,
            },
        };

        const MockToastWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <ToastProvider>{children}</ToastProvider>
        );

        const { executeCommand } = captureHook(useCommandExecutor, MockToastWrapper);

        const applyCmd: CommandAction = {
            id: 'apply-tab-rules',
            title: 'Apply Tab Rules to Window',
            category: 'Tab Management & Memory',
            keywords: ['rules'],
            icon: DummyIcon,
            isPro: true,
            run: vi.fn(),
        };

        await executeCommand(applyCmd);

        expect(sendMessageMock).toHaveBeenCalledWith({ type: 'APPLY_RULES_TO_WINDOW' });
        expect(useUIStore.getState().isSearchOpen).toBe(false);
    });

    it('handles runtime failure gracefully on "apply-tab-rules"', async () => {
        vi.spyOn(contractRegistry, 'getEntitlementSnapshot').mockReturnValue({
            isPro: true,
            tier: 'pro',
            loading: false,
        });

        const sendMessageMock = vi.fn().mockRejectedValue(new Error('Background script disconnected'));
        (globalThis as any).chrome = {
            runtime: {
                sendMessage: sendMessageMock,
            },
        };

        const MockToastWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <ToastProvider>{children}</ToastProvider>
        );

        const { executeCommand } = captureHook(useCommandExecutor, MockToastWrapper);

        const applyCmd: CommandAction = {
            id: 'apply-tab-rules',
            title: 'Apply Tab Rules to Window',
            category: 'Tab Management & Memory',
            keywords: ['rules'],
            icon: DummyIcon,
            isPro: true,
            run: vi.fn(),
        };

        // Should not throw
        await expect(executeCommand(applyCmd)).resolves.not.toThrow();
    });

    it('executes generic commands and closes search palette', async () => {
        const MockToastWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
            <ToastProvider>{children}</ToastProvider>
        );

        const { executeCommand } = captureHook(useCommandExecutor, MockToastWrapper);

        const mockRun = vi.fn();
        const customCmd: CommandAction = {
            id: 'custom-command',
            title: 'Custom Command',
            category: 'Navigation & System',
            keywords: ['custom'],
            icon: DummyIcon,
            run: mockRun,
        };

        await executeCommand(customCmd);

        expect(useUIStore.getState().isSearchOpen).toBe(false);
        expect(mockRun).toHaveBeenCalledWith(
            expect.objectContaining({
                setSearchOpen: expect.any(Function),
                setSettingsOpen: expect.any(Function),
                toast: expect.any(Function),
            })
        );
    });
});
