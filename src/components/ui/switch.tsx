import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
        className={cn(
            "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            // Track fills (supporting both data-state and aria-checked for wrapper resilience)
            "data-[state=checked]:bg-primary aria-checked:bg-primary data-[state=unchecked]:bg-zinc-300 aria-[checked=false]:bg-zinc-300 hover:data-[state=unchecked]:bg-zinc-400 hover:aria-[checked=false]:bg-zinc-400",
            "dark:data-[state=checked]:bg-primary dark:aria-checked:bg-primary dark:data-[state=unchecked]:bg-zinc-700 dark:aria-[checked=false]:bg-zinc-700 dark:hover:data-[state=unchecked]:bg-zinc-600 dark:hover:aria-[checked=false]:bg-zinc-600",
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                "pointer-events-none block h-4 w-4 rounded-full shadow-sm ring-1 ring-black/10 transition-transform duration-200",
                // Translation
                "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
                // Light mode thumb
                "bg-white",
                // Dark mode state-scoped thumbs
                "dark:data-[state=unchecked]:bg-zinc-100 dark:data-[state=unchecked]:ring-white/10",
                "dark:data-[state=checked]:bg-black dark:data-[state=checked]:ring-black/20"
            )}
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };

