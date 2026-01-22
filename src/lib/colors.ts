export type ChromeColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

interface ColorDefinition {
    bg: string;
    border: string;
    text: string;
}

export const GROUP_COLORS: Record<ChromeColor, ColorDefinition> = {
    grey: { bg: 'bg-zinc-500', border: 'border-zinc-500', text: 'text-zinc-100' },
    blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-100' },
    red: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-100' },
    yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-100' },
    green: { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-100' },
    pink: { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-100' },
    purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-100' },
    cyan: { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-100' },
    orange: { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-100' },
};

export const getGroupColorClasses = (color: ChromeColor | string): ColorDefinition => {
    return GROUP_COLORS[color as ChromeColor] || GROUP_COLORS.grey;
};
