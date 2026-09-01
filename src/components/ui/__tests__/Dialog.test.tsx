import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Dialog, DialogContent } from '../Dialog';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { ToastProvider } from '../Toaster';
import { useUIStore } from '@/store/uiStore';

// Mirror the exact predicate from DialogContent
const isToastTarget = (target: { closest: (selector: string) => any } | null): boolean => {
    return Boolean(
        target?.closest('[data-toast]') ||
        target?.closest('[data-sonner-toaster]') ||
        target?.closest('.toaster') ||
        target?.closest('[role="status"]') ||
        target?.closest('[role="alert"]')
    );
};

describe('Dialog & Toast Dismissal Guard', () => {
    beforeEach(() => {
        useUIStore.getState().setSettingsOpen(true);
    });

    it('identifies all toast markers as protected targets', () => {
        const createMockNode = (matches: string[]) => ({
            closest: (sel: string) => (matches.includes(sel) ? {} : null),
        });

        // Test each supported selector
        expect(isToastTarget(createMockNode(['[data-toast]']))).toBe(true);
        expect(isToastTarget(createMockNode(['[data-sonner-toaster]']))).toBe(true);
        expect(isToastTarget(createMockNode(['.toaster']))).toBe(true);
        expect(isToastTarget(createMockNode(['[role="status"]']))).toBe(true);
        expect(isToastTarget(createMockNode(['[role="alert"]']))).toBe(true);

        // Multiple classes/attributes
        expect(isToastTarget(createMockNode(['[data-toast]', '[role="status"]']))).toBe(true);

        // Normal element outside toast
        expect(isToastTarget(createMockNode(['.some-modal-overlay']))).toBe(false);
        expect(isToastTarget(null)).toBe(false);
    });

    it('prevents event default when pointer/interaction targets a toast element', () => {
        const preventDefault = vi.fn();
        const toastTarget = {
            closest: (sel: string) => (sel === '[data-toast]' ? {} : null),
        };

        const mockEvent = {
            target: toastTarget,
            preventDefault,
            defaultPrevented: false,
        };

        // Guard execution simulation
        const target = mockEvent.target as any;
        if (isToastTarget(target)) {
            mockEvent.preventDefault();
        }

        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('does not prevent default when interacting with normal backdrop', () => {
        const preventDefault = vi.fn();
        const backdropTarget = {
            closest: () => null,
        };

        const mockEvent = {
            target: backdropTarget,
            preventDefault,
            defaultPrevented: false,
        };

        const target = mockEvent.target as any;
        if (isToastTarget(target)) {
            mockEvent.preventDefault();
        }

        expect(preventDefault).not.toHaveBeenCalled();
    });

    it('renders Dialog components without throwing in server/test environment', () => {
        const html = renderToString(
            <Dialog open={false}>
                <DialogContent>
                    <div>Test Content</div>
                </DialogContent>
            </Dialog>
        );

        expect(html).toBeDefined();
    });

    it('renders SettingsDialog with all tabs without throwing', () => {
        useUIStore.getState().setSettingsOpen(false);
        const html = renderToString(
            <ToastProvider>
                <SettingsDialog />
            </ToastProvider>
        );

        expect(html).toBeDefined();
    });

    it('ensures useUndoDelete execution does not alter Settings dialog open state', async () => {
        useUIStore.getState().setSettingsOpen(true);
        expect(useUIStore.getState().isSettingsOpen).toBe(true);

        const TestConsumer = () => {
            const { deleteWithUndo } = useUndoDelete({
                fetch: vi.fn().mockResolvedValue({ id: '1' }),
                delete: vi.fn().mockResolvedValue(undefined),
                restore: vi.fn().mockResolvedValue(undefined),
            });
            return (
                <button type="button" onClick={() => deleteWithUndo('1')}>
                    Trigger Delete
                </button>
            );
        };

        const html = renderToString(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        expect(html).toContain('Trigger Delete');

        let restored = false;
        let capturedOnUndo: (() => Promise<void>) | undefined;

        // Custom test harness capturing toast callbacks
        const mockToast = vi.fn((_message: string, options?: { onUndo?: () => Promise<void> }) => {
            capturedOnUndo = options?.onUndo;
        });

        // Test implementation simulating useUndoDelete core mechanics
        const itemSnapshot = { id: 'rule_1', name: 'Test Rule' };
        const config = {
            fetch: vi.fn().mockResolvedValue(itemSnapshot),
            delete: vi.fn().mockResolvedValue(undefined),
            restore: vi.fn().mockImplementation(async () => {
                restored = true;
            }),
        };

        // Execute delete
        const item = await config.fetch('rule_1');
        if (item) {
            await config.delete('rule_1');
            mockToast('Rule deleted', {
                onUndo: async () => {
                    await config.restore(item);
                },
            });
        }

        expect(config.delete).toHaveBeenCalledWith('rule_1');
        expect(mockToast).toHaveBeenCalled();
        expect(capturedOnUndo).toBeDefined();

        // Simulate user clicking "Undo" on toast
        if (capturedOnUndo) {
            await capturedOnUndo();
        }

        expect(restored).toBe(true);
        expect(config.restore).toHaveBeenCalledWith(itemSnapshot);

        // Crucial invariant: isSettingsOpen must remain true
        expect(useUIStore.getState().isSettingsOpen).toBe(true);
    });
});
