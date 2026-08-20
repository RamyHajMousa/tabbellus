import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/Dialog';
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@/components/ui/tabs';
import { useUIStore } from '@/store/uiStore';
import { useToast } from '@/components/ui/Toaster';
import { getUsageStats, markSupportInteracted } from '@/lib/usageTracker';
import {
    AppearanceTab,
    BehaviorTab,
    DataTab,
    SupportTab,
} from './components';

export const SettingsDialog: React.FC = () => {
    const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
    const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<string>('appearance');
    const [showSupportBadge, setShowSupportBadge] = useState(false);
    const [isEligibleForPromo, setIsEligibleForPromo] = useState(false);

    useEffect(() => {
        if (isSettingsOpen) {
            getUsageStats().then(stats => {
                setShowSupportBadge(stats.isEligible);
                setIsEligibleForPromo(stats.isEligible);
            });
        }
    }, [isSettingsOpen]);

    const handleDismissPromo = async () => {
        await markSupportInteracted();
        setIsEligibleForPromo(false);
        setShowSupportBadge(false);
        toast('Thanks for using TabBellus!');
    };

    return (
        <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>Customize your TabBellus experience.</DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <TabsList aria-label="Settings sections">
                        <TabsTrigger value="appearance">
                            Appearance
                        </TabsTrigger>
                        <TabsTrigger value="behavior">
                            Behavior
                        </TabsTrigger>
                        <TabsTrigger value="data">
                            Data
                        </TabsTrigger>
                        <TabsTrigger value="support">
                            Support
                            {showSupportBadge && (
                                <span
                                    aria-label="New notification"
                                    className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"
                                />
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="appearance">
                        <AppearanceTab />
                    </TabsContent>

                    <TabsContent value="behavior">
                        <BehaviorTab />
                    </TabsContent>

                    <TabsContent value="data">
                        <DataTab
                            onImportSuccess={() => setSettingsOpen(false)}
                            onClearSuccess={() => setSettingsOpen(false)}
                        />
                    </TabsContent>

                    <TabsContent value="support">
                        <SupportTab
                            isEligibleForPromo={isEligibleForPromo}
                            onDismissPromo={handleDismissPromo}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
