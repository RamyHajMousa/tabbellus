import { ChromeColor } from '@/lib/colors';

const CHROME_COLORS: ChromeColor[] = [
    'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
];

export const autoGroupByDomain = async (tabs: chrome.tabs.Tab[]): Promise<{ groupsCreated: number }> => {
    // 1. Filter out pinned, already-grouped, missing ID, and internal browser tabs
    const eligibleTabs = tabs.filter(tab => 
        tab.id !== undefined &&
        !tab.pinned && 
        (tab.groupId === undefined || tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) &&
        tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('file://') && !tab.url.startsWith('about:')
    );

    // 2. Map Hostname -> Array of Tab IDs
    const domainMap = new Map<string, number[]>();
    
    for (const tab of eligibleTabs) {
        if (!tab.url) continue;
        try {
            const url = new URL(tab.url);
            const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
            if (!hostname) continue;
            
            if (!domainMap.has(hostname)) {
                domainMap.set(hostname, []);
            }
            domainMap.get(hostname)!.push(tab.id!);
        } catch (error) {
            // Gracefully skip tabs with unparseable URLs
            continue;
        }
    }

    // 3. Filter for hostnames that have 2 or more tabs
    const groupableDomains = Array.from(domainMap.entries()).filter(([_, ids]) => ids.length >= 2);

    if (groupableDomains.length === 0) {
        return { groupsCreated: 0 };
    }

    let colorIndex = 0;
    let groupsCreated = 0;

    // 4. Safely create groups and update metadata
    for (const [domain, tabIds] of groupableDomains) {
        try {
            // Atomic group creation
            const groupId = await chrome.tabs.group({ tabIds });
            
            try {
                // Update title and assign a distinct standard color
                const color = CHROME_COLORS[colorIndex % CHROME_COLORS.length];
                await chrome.tabGroups.update(groupId, { title: domain, color });
                colorIndex++;
                groupsCreated++;
            } catch (updateError) {
                console.warn(`Failed to set metadata for group ${domain}`, updateError);
                // We still count it as created since chrome.tabs.group succeeded
                groupsCreated++;
            }
        } catch (groupError) {
            console.warn(`Failed to group tabs for ${domain}`, groupError);
        }
    }

    return { groupsCreated };
};
