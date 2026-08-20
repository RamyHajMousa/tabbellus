import React from 'react';
import { Heart, Star, Coffee, LifeBuoy, ShieldCheck, ExternalLink } from 'lucide-react';
import { EXTERNAL_LINKS } from '@/config/links';
import { handleExternalLink, openSupportHub } from '@/lib/platform';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface SupportTabProps {
    isEligibleForPromo: boolean;
    onDismissPromo: () => void;
}

export const SupportTab: React.FC<SupportTabProps> = ({
    isEligibleForPromo,
    onDismissPromo,
}) => {
    const extensionVersion = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
        ? chrome.runtime.getManifest().version
        : '1.2.2';

    return (
        <div className="space-y-3.5">
            {/* Community & Contribution Section (Two-State Transition Model) */}
            {isEligibleForPromo ? (
                <div className="p-3 rounded-lg bg-card border border-border space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                            <Heart className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                    Loving TabBellus?
                                </h4>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                                    Your support keeps development independent, local-first, and ad-free.
                                </p>
                            </div>
                        </div>
                        <TooltipSimple content="Dismiss promotion banner" side="top">
                            <button
                                type="button"
                                onClick={onDismissPromo}
                                className="text-xxs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded shrink-0"
                                aria-label="Dismiss promotion banner"
                            >
                                Dismiss
                            </button>
                        </TooltipSimple>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                            type="button"
                            onClick={() => handleExternalLink(EXTERNAL_LINKS.REVIEWS)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium rounded-md transition-colors shadow-xs"
                        >
                            <Star className="w-3.5 h-3.5 fill-current shrink-0" />
                            <span>Rate 5 Stars</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExternalLink(EXTERNAL_LINKS.DONATE)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted border border-border text-foreground hover:bg-muted/80 text-xs font-medium rounded-md transition-colors"
                        >
                            <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 shrink-0" />
                            <span>Buy Coffee</span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Support & Community
                    </label>
                    <div className="space-y-1.5">
                        <TooltipSimple content="Leave a review on the Chrome Web Store" side="top">
                            <button
                                type="button"
                                onClick={() => handleExternalLink(EXTERNAL_LINKS.REVIEWS)}
                                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/60 hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <Star className="w-4 h-4 text-orange-400 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">Rate TabBellus</p>
                                        <p className="text-xxs text-muted-foreground">Leave a review on the Chrome Web Store</p>
                                    </div>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                            </button>
                        </TooltipSimple>

                        <TooltipSimple content="Support development with a tip on Ko-fi" side="top">
                            <button
                                type="button"
                                onClick={() => handleExternalLink(EXTERNAL_LINKS.DONATE)}
                                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/60 hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">Buy me a coffee</p>
                                        <p className="text-xxs text-muted-foreground">Support independent, local-first development</p>
                                    </div>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                            </button>
                        </TooltipSimple>
                    </div>
                </div>
            )}

            {/* Resources & Troubleshooting Section */}
            <div className="space-y-2 pt-1 border-t border-border">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Resources & Help
                </label>
                <div className="space-y-1.5">
                    <TooltipSimple content="Submit a bug report, request a feature, or contact support with diagnostic telemetry" side="top">
                        <button
                            type="button"
                            onClick={openSupportHub}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/60 hover:bg-muted/50 transition-colors text-left"
                        >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <LifeBuoy className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground">Help & Feedback</p>
                                    <p className="text-xxs text-muted-foreground">Submit diagnostic reports or feature ideas</p>
                                </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                        </button>
                    </TooltipSimple>
                </div>
            </div>

            {/* About & Legal Section */}
            <div className="space-y-2 pt-1 border-t border-border">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    About & Legal
                </label>
                <TooltipSimple content="View privacy policy and local-first data protection guarantees" side="top">
                    <button
                        type="button"
                        onClick={() => handleExternalLink(EXTERNAL_LINKS.PRIVACY_POLICY)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/60 hover:bg-muted/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground">Privacy Policy</p>
                                <p className="text-xxs text-muted-foreground">Zero trackers, local-first offline guarantee</p>
                            </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                    </button>
                </TooltipSimple>
            </div>

            {/* Version & Identity Footer */}
            <div className="pt-1 text-center">
                <p className="text-xxs font-mono text-muted-foreground/70">
                    TabBellus v{extensionVersion} • Local-First & Privacy-Focused
                </p>
            </div>
        </div>
    );
};
