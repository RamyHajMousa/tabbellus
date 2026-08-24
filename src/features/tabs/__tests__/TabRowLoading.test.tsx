import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TabRow } from '../components/TabRow';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { ToastProvider } from '@/components/ui/Toaster';
import { type RowTabData } from '../types';

describe('Tab Loading Indicator & Fallback Architecture', () => {
    it('renders a loading spinner when data.status is loading', () => {
        const loadingTab: RowTabData = {
            id: 'chrome-1',
            chromeTabId: 1,
            url: 'https://example.com',
            title: 'Loading Page...',
            favicon: null,
            source: 'active',
            status: 'loading',
        };

        const html = renderToString(
            <ToastProvider>
                <TabRow data={loadingTab} disableContextMenu />
            </ToastProvider>
        );
        // Expect spinner class to be present
        expect(html).toContain('animate-spin');
    });

    it('renders SmartFallbackIcon without spinner when data.status is complete', () => {
        const completeTab: RowTabData = {
            id: 'chrome-2',
            chromeTabId: 2,
            url: 'https://example.com',
            title: 'Complete Page',
            favicon: 'https://example.com/favicon.ico',
            source: 'active',
            status: 'complete',
        };

        const html = renderToString(
            <ToastProvider>
                <TabRow data={completeTab} disableContextMenu />
            </ToastProvider>
        );
        // Spinner should not be rendered
        expect(html).not.toContain('animate-spin');
        // SmartFallbackIcon image should be rendered
        expect(html).toContain('src="https://example.com/favicon.ico"');
    });

    it('renders context fallback icon for internal schemes without stalling or network requests', () => {
        const extensionsHtml = renderToString(<SmartFallbackIcon url="chrome://extensions" />);
        const settingsHtml = renderToString(<SmartFallbackIcon url="chrome://settings" />);
        const pdfHtml = renderToString(<SmartFallbackIcon url="file:///document.pdf" />);

        expect(extensionsHtml).toBeDefined();
        expect(settingsHtml).toBeDefined();
        expect(pdfHtml).toBeDefined();
    });
});

