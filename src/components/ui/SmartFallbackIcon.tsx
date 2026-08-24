import React, { useState, useEffect, useRef } from 'react';
import { Globe, FileText, File, Puzzle, Settings, AppWindow } from 'lucide-react';

interface SmartFallbackIconProps {
    url?: string;
    favicon?: string | null;
    className?: string;
}

const FAVICON_TIMEOUT_MS = 2500;

export const SmartFallbackIcon: React.FC<SmartFallbackIconProps> = ({ url, favicon, className }) => {
    // Stage 0 = Tier 1 (Native favicon URL), Stage 1 = Tier 2 (Chromium _favicon cache), Stage 2 = Tier 3 (Context Lucide icon)
    const [fallbackStage, setFallbackStage] = useState<number>(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setFallbackStage(0);
    }, [url, favicon]);

    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // Arm a timeout guard for image resolution stages (Stage 0 and Stage 1) to handle stalled requests, 204s, and CSP blocks
        if (fallbackStage === 0 || fallbackStage === 1) {
            timeoutRef.current = setTimeout(() => {
                setFallbackStage((prev) => Math.min(prev + 1, 2));
            }, FAVICON_TIMEOUT_MS);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [fallbackStage, url, favicon]);

    const handleImageLoad = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const handleImageError = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setFallbackStage((prev) => Math.min(prev + 1, 2));
    };

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
                    onLoad={handleImageLoad}
                    onError={handleImageError}
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
                        onLoad={handleImageLoad}
                        onError={handleImageError}
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
                        onLoad={handleImageLoad}
                        onError={handleImageError}
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
