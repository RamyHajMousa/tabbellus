import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface Toast {
    id: string;
    message: string;
    onUndo?: () => void;
    duration?: number;
}

interface ToastContextType {
    toast: (message: string, options?: { onUndo?: () => void; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((message: string, options?: { onUndo?: () => void; duration?: number }) => {
        const id = Math.random().toString(36).substring(7);
        const duration = options?.duration || 5000;

        setToasts((prev) => [...prev, {
            id,
            message,
            duration,
            onUndo: options?.onUndo
        }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className="bg-zinc-900 text-zinc-50 border border-zinc-800 rounded-lg shadow-lg p-4 min-w-[300px] flex items-center justify-between animate-in slide-in-from-bottom-2 fade-in"
                    >
                        <span className="text-sm font-medium">{t.message}</span>
                        <div className="flex items-center gap-3">
                            {t.onUndo && (
                                <button
                                    onClick={() => {
                                        t.onUndo?.();
                                        removeToast(t.id);
                                    }}
                                    className="text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                                >
                                    Undo
                                </button>
                            )}
                            <button
                                onClick={() => removeToast(t.id)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
