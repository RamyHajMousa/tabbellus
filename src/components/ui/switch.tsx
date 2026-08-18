import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className = '', ...props }, ref) => (
    <SwitchPrimitives.Root
        className={`peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:border-foreground data-[state=unchecked]:bg-transparent data-[state=unchecked]:border-border hover:data-[state=unchecked]:bg-muted-foreground/10 ${className}`}
        {...props}
        ref={ref}
    >
        <SwitchPrimitives.Thumb
            className="pointer-events-none block h-3.5 w-3.5 rounded-full border shadow-xs ring-0 transition-transform duration-200 data-[state=checked]:translate-x-4 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-background data-[state=unchecked]:border-foreground"
        />
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
