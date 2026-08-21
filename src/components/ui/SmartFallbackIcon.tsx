import React, { useState, useEffect } from 'react';
import { Globe, FileText, File, Puzzle, Settings, AppWindow } from 'lucide-react';

interface SmartFallbackIconProps {
    url?: string;
    favicon?: string | null;
    className?: string;
}

export const SmartFallbackIcon: React.FC<SmartFallbackIconProps> = ({ url, favicon, className }) => {
    // Stage 0 = Tier 1 (Native favicon URL), Stage 1 = Tier 2 (Chromium _favicon cache), Stage 2 = Tier 3 (Context Lucide icon)
    const [fallbackStage, setFallbackStage] = useState<number>(0);

    useEffect(() => {
        setFallbackStage(0);
    }, [url, favicon]);

    const isInternalScheme = (targetUrl?: string) => {
        if (!targetUrl) return false;
        return (
            targetUrl.startsWith('chrome://') ||
            targetUrl.startsWith('chrome-extension://') ||
            targetUrl.startsWith('edge://') ||
            targetUrl.startsWith('about:') ||
            targetUrl.startsWith('file://')
        );
    };

    // Helper to render Tier 3 context fallbacks
    const renderContextFallback = () => {
        if (!url) {
            return <Globe className={className} />;
        }

        if (url.startsWith('chrome://extensions')) {
            return <Puzzle className={className} />;
        }

        if (url.startsWith('chrome://settings')) {
            return <Settings className={className} />;
        }

        if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
            return <AppWindow className={className} />;
        }

        if (url.startsWith('file://')) {
            if (url.toLowerCase().endsWith('.pdf')) {
                return <FileText className={className} />;
            }
            return <File className={className} />;
        }

        return <Globe className={className} />;
    };

    // Internal schemes bypass external network/cache favicons directly to Tier 3
    if (isInternalScheme(url)) {
        return renderContextFallback();
    }

    // Tier 1: Try native favicon if provided
    if (fallbackStage === 0) {
        if (favicon && (favicon.startsWith('http://') || favicon.startsWith('https://') || favicon.startsWith('data:'))) {
            return (
                <img
                    src={favicon}
                    alt=""
                    className={className}
                    onError={() => setFallbackStage(1)}
                    loading="lazy"
                />
            );
        }
        // If no valid native favicon provided, proceed directly to Tier 2 if URL exists
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
            if (extensionId) {
                const chromiumFaviconUrl = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
                return (
                    <img
                        src={chromiumFaviconUrl}
                        alt=""
                        className={className}
                        onError={() => setFallbackStage(2)}
                        loading="lazy"
                    />
                );
            }
        }
        return renderContextFallback();
    }

    // Tier 2: Try Chromium _favicon cache
    if (fallbackStage === 1) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
            if (extensionId) {
                const chromiumFaviconUrl = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
                return (
                    <img
                        src={chromiumFaviconUrl}
                        alt=""
                        className={className}
                        onError={() => setFallbackStage(2)}
                        loading="lazy"
                    />
                );
            }
        }
        return renderContextFallback();
    }

    // Tier 3: Context fallback icon
    return renderContextFallback();
};
