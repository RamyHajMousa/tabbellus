# Styling & Customization

See [customization.md](../customization.md) for theming, CSS variables, and adding custom colors.

## Contents

- Semantic colors
- Built-in variants first
- className for layout only
- No space-x-* / space-y-*
- Prefer size-* over w-* h-* when equal
- Prefer truncate shorthand
- No manual dark: color overrides
- Use cn() for conditional classes
- No manual z-index on overlay components

---

## Semantic colors

**Incorrect:**

```tsx
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">Secondary text</p>
</div>
```

**Correct:**

```tsx
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">Secondary text</p>
</div>
```

---

## No raw color values for status/state indicators

For positive, negative, or status indicators, use Badge variants, semantic tokens like `text-destructive`, or define custom CSS variables — don't reach for raw Tailwind colors.

**Incorrect:**

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">Active</span>
<span className="text-red-600">-3.2%</span>
```

**Correct:**

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span className="text-destructive">-3.2%</span>
```

If you need a success/positive color that doesn't exist as a semantic token, use a Badge variant or ask the user about adding a custom CSS variable to the theme.

---

## className for layout only

Use `className` for layout (padding, margin, width, flex, grid) — never for overriding component colors or typography.

**Incorrect:**

```tsx
<Button className="bg-blue-500 text-white font-bold">Click</Button>
```

**Correct:**

```tsx
<Button variant="default">Click</Button>
```

---

## No space-x-* / space-y-*

Use `flex` with `gap-*` for spacing between children. For vertical stacks: `flex flex-col gap-*`.

**Incorrect:**

```tsx
<div className="space-y-4">
  <Input />
  <Button>Submit</Button>
</div>
```

**Correct:**

```tsx
<div className="flex flex-col gap-4">
  <Input />
  <Button>Submit</Button>
</div>
```

---

## Use size-* when width and height are equal

**Incorrect:**

```tsx
<div className="w-10 h-10" />
```

**Correct:**

```tsx
<div className="size-10" />
```

---

## Use truncate shorthand

**Incorrect:**

```tsx
<p className="overflow-hidden text-ellipsis whitespace-nowrap">Long text</p>
```

**Correct:**

```tsx
<p className="truncate">Long text</p>
```

---

## No manual dark: color overrides

Use semantic tokens that automatically respond to dark mode.

**Incorrect:**

```tsx
<div className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
```

**Correct:**

```tsx
<div className="bg-background text-foreground" />
```

---

## Use cn() for conditional classes

**Incorrect:**

```tsx
<div className={`base-class ${isActive ? 'active-class' : ''}`} />
```

**Correct:**

```tsx
<div className={cn("base-class", isActive && "active-class")} />
```

---

## No manual z-index on overlay components

Dialog, Sheet, Popover, Tooltip, etc. manage their own stacking context. Never add `z-*` classes to them.

**Incorrect:**

```tsx
<DialogContent className="z-50">...</DialogContent>
```

**Correct:**

```tsx
<DialogContent>...</DialogContent>
```
