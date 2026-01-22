export type ChromeColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

interface ColorDefinition {
    badge: string; // The solid dot or border
    row: string; // The row background tint
    text: string; // Text color
    border: string; // The vertical guide line color
}

export const GROUP_COLORS: Record<ChromeColor, ColorDefinition> = {
    grey: { badge: 'bg-zinc-500', row: 'bg-zinc-500/10 dark:bg-zinc-500/20', text: 'text-zinc-500', border: 'border-zinc-500' },
    blue: { badge: 'bg-blue-500', row: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500' },
    red: { badge: 'bg-red-500', row: 'bg-red-500/10 dark:bg-red-500/20', text: 'text-red-500', border: 'border-red-500' },
    yellow: { badge: 'bg-yellow-500', row: 'bg-yellow-500/10 dark:bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500' },
    green: { badge: 'bg-green-500', row: 'bg-green-500/10 dark:bg-green-500/20', text: 'text-green-500', border: 'border-green-500' },
    pink: { badge: 'bg-pink-500', row: 'bg-pink-500/10 dark:bg-pink-500/20', text: 'text-pink-500', border: 'border-pink-500' },
    purple: { badge: 'bg-purple-500', row: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-500', border: 'border-purple-500' },
    cyan: { badge: 'bg-cyan-500', row: 'bg-cyan-500/10 dark:bg-cyan-500/20', text: 'text-cyan-500', border: 'border-cyan-500' },
    orange: { badge: 'bg-orange-500', row: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500' },
};

export const getGroupColorClasses = (color: ChromeColor | string): ColorDefinition => {
    return GROUP_COLORS[color as ChromeColor] || GROUP_COLORS.grey;
};
