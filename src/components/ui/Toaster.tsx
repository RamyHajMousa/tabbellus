import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Toast {
    id: string;
    message: string;
    description?: string;
    onUndo?: () => void;
    action?: { label: string; onClick: () => void };
    duration?: number;
}

export interface ToastOptions {
    description?: string;
    onUndo?: () => void;
    action?: { label: string; onClick: () => void };
    duration?: number;
}

export type ToastPayload = string | {
    title?: string;
    message?: string;
    description?: string;
    onUndo?: () => void;
    action?: { label: string; onClick: () => void };
    duration?: number;
};

interface ToastContextType {
    toast: (messageOrConfig: ToastPayload, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((messageOrConfig: ToastPayload, options?: ToastOptions) => {
        const id = Math.random().toString(36).substring(7);

        let message = '';
        let opts: ToastOptions = options || {};

        if (typeof messageOrConfig === 'string') {
            message = messageOrConfig;
        } else if (messageOrConfig && typeof messageOrConfig === 'object') {
            message = messageOrConfig.title || messageOrConfig.message || '';
            opts = {
                description: messageOrConfig.description,
                onUndo: messageOrConfig.onUndo,
                action: messageOrConfig.action,
                duration: messageOrConfig.duration,
                ...options,
            };
        }

        const duration = opts.duration ?? 5000;

        setToasts((prev) => [...prev, {
            id,
            message,
            description: opts.description,
            duration,
            onUndo: opts.onUndo,
            action: opts.action,
        }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    const toasterContent = toasts.length > 0 ? (
        <div
            className="toaster fixed bottom-4 right-4 flex flex-col gap-2 z-[100] pointer-events-none max-w-[calc(100vw-2rem)]"
            role="region"
            aria-label="Notifications"
            data-sonner-toaster=""
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className="pointer-events-auto bg-popover text-popover-foreground border border-border rounded-lg p-3.5 min-w-[280px] max-w-[380px] shadow-lg flex items-center justify-between animate-in slide-in-from-bottom-2 fade-in"
                    role="status"
                    aria-live="polite"
                    data-toast=""
                >
                    <div className="flex flex-col pr-2 min-w-0">
                        <span className="text-sm font-medium leading-tight break-words">{t.message}</span>
                        {t.description && (
                            <span className="text-xs text-muted-foreground mt-0.5 break-words">{t.description}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {t.action ? (
                            <button
                                type="button"
                                onClick={() => {
                                    t.action?.onClick();
                                    removeToast(t.id);
                                }}
                                className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                            >
                                {t.action.label}
                            </button>
                        ) : t.onUndo ? (
                            <button
                                type="button"
                                onClick={() => {
                                    t.onUndo?.();
                                    removeToast(t.id);
                                }}
                                className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                            >
                                Undo
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => removeToast(t.id)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                            aria-label="Dismiss notification"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    ) : null;

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {mounted && typeof document !== 'undefined' && document.body
                ? createPortal(toasterContent, document.body)
                : toasterContent}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

