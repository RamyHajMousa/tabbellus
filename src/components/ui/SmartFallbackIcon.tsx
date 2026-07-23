import React from 'react';
import { Globe, FileText, File, Puzzle, Settings, AppWindow } from 'lucide-react';

interface SmartFallbackIconProps {
    url?: string;
    className?: string;
}

export const SmartFallbackIcon: React.FC<SmartFallbackIconProps> = ({ url, className }) => {
    if (!url) {
        return <Globe className={className} />;
    }

    if (url.startsWith('chrome://extensions')) {
        return <Puzzle className={className} />;
    }

    if (url.startsWith('chrome://settings')) {
        return <Settings className={className} />;
    }

    if (url.startsWith('chrome://') || url.startsWith('edge://')) {
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
