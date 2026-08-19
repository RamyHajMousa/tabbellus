import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className = '', ...props }, ref) => (
    <SwitchPrimitives.Root
        className={`peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=unchecked]:bg-muted-foreground/40 data-[state=unchecked]:border-transparent hover:data-[state=unchecked]:bg-muted-foreground/50 ${className}`}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm ring-1 ring-black/10 dark:ring-white/10 transition-transform duration-200 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
