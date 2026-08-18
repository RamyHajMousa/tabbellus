import React from 'react';
import { Heart, Star, Coffee, LifeBuoy, ShieldCheck } from 'lucide-react';
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
    return (
        <div className="space-y-4">
            {/* Mission Statement */}
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed px-1">
                <p>
                    TabBellus is a local-first tool built for your privacy. No ads, no trackers, and your data never leaves your machine.
                </p>
                <p>
                    If you find value in a cleaner workflow, consider supporting my work. Your tips help keep the project independent and ad-free.
                </p>
                <p className="font-medium text-foreground">
                    Thank you for being part of the journey! — Ramy
                </p>
            </div>

            {/* Promo Banner */}
            {isEligibleForPromo && (
                <div className="p-4 rounded-lg bg-card border border-border">
                    <div className="flex items-start gap-3">
                        <Heart className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <h4 className="text-sm font-semibold text-foreground">Loving TabBellus?</h4>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Your active usage helps us grow! If TabBellus has improved your workflow, please consider supporting development.
                            </p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={() => handleExternalLink(EXTERNAL_LINKS.REVIEWS)}
                                    className="px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium rounded-md transition-colors"
                                >
                                    Rate 5 Stars
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleExternalLink(EXTERNAL_LINKS.DONATE)}
                                    className="px-3 py-1.5 bg-background border border-border text-foreground hover:bg-muted text-xs font-medium rounded-md transition-colors"
                                >
                                    Buy Coffee
                                </button>
                                <button
                                    type="button"
                                    onClick={onDismissPromo}
                                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Support Actions */}
            <div className="space-y-1.5">
                <TooltipSimple content="Leave a review on the Chrome Web Store" side="top">
                    <button
                        type="button"
                        onClick={() => handleExternalLink(EXTERNAL_LINKS.REVIEWS)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted transition-colors"
                    >
                        <Star className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="text-sm font-medium text-foreground">Rate TabBellus</span>
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Support independent development with a tip on Ko-fi" side="top">
                    <button
                        type="button"
                        onClick={() => handleExternalLink(EXTERNAL_LINKS.DONATE)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted transition-colors"
                    >
                        <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-medium text-foreground">Buy me a coffee</span>
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Submit a bug report, request a feature, or contact support" side="top">
                    <button
                        type="button"
                        onClick={openSupportHub}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted transition-colors"
                    >
                        <LifeBuoy className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">Help & Feedback</span>
                    </button>
                </TooltipSimple>
            </div>

            {/* Legal Section */}
            <div className="mt-6 space-y-2 pt-4 border-t border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal</h4>
                <a
                    href="https://errorfirst.com/tabbellus-privacy-policy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted transition-colors"
                >
                    <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">Privacy Policy</span>
                </a>
            </div>
        </div>
    );
};
