# Base vs Radix

API differences between `base` and `radix`. Check the `base` field from `npx shadcn@latest info`.

## Contents

- Composition: asChild vs render
- Button / trigger as non-button element
- Select (items prop, placeholder, positioning, multiple, object values)
- ToggleGroup (type vs multiple)
- Slider (scalar vs array)
- Accordion (type and defaultValue)

---

## Composition: asChild (radix) vs render (base)

Radix uses `asChild` to replace the default element. Base uses `render`. Don't wrap triggers in extra elements.

**Incorrect:**

```tsx
<DialogTrigger>
  <div>
    <Button>Open</Button>
  </div>
</DialogTrigger>
```

**Correct (radix):**

```tsx
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>
```

**Correct (base):**

```tsx
<DialogTrigger render={<Button />}>Open</DialogTrigger>
```

This applies to all trigger and close components: `DialogTrigger`, `SheetTrigger`, `AlertDialogTrigger`, `DropdownMenuTrigger`, `PopoverTrigger`, `TooltipTrigger`, `CollapsibleTrigger`, `DialogClose`, `SheetClose`, `NavigationMenuLink`, `BreadcrumbLink`, `SidebarMenuButton`, `Badge`, `Item`.

---

## Button / trigger as non-button element (base only)

When `render` changes an element to a non-button (`<a>`, `<span>`), add `nativeButton={false}`.

**Incorrect (base):** missing `nativeButton={false}`.

```tsx
<Button render={<a href="/docs" />}>Read the docs</Button>
```

**Correct (base):**

```tsx
<Button render={<a href="/docs" />} nativeButton={false}>
  Read the docs
</Button>
```

**Correct (radix):**

```tsx
<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```

Same for triggers whose `render` is not a `Button`:

```tsx
// base.
<PopoverTrigger render={<InputGroupAddon />} nativeButton={false}>
  Pick date
</PopoverTrigger>
```

---

## Select

**items prop (base only).** Base requires an `items` prop on the root. Radix uses inline JSX only.

**Incorrect (base):**

```tsx
<Select>
  <SelectTrigger />
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>
```

**Correct (base):**

```tsx
<Select items={[{ value: "a", label: "A" }]}>
  <SelectTrigger />
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>
```

**placeholder (base only).** Pass `placeholder` on the root, not the trigger.

**Correct (base):**

```tsx
<Select placeholder="Pick one" items={items}>
  <SelectTrigger />
  <SelectContent>...</SelectContent>
</Select>
```

---

## ToggleGroup

Radix uses `type="single"` or `type="multiple"`. Base uses `multiple` boolean.

**Correct (radix):**

```tsx
<ToggleGroup type="single" value={value} onValueChange={setValue}>
  <ToggleGroupItem value="a">A</ToggleGroupItem>
</ToggleGroup>
```

**Correct (base):**

```tsx
<ToggleGroup multiple value={value} onValueChange={setValue}>
  <ToggleGroupItem value="a">A</ToggleGroupItem>
</ToggleGroup>
```

---

## Slider

Radix uses an array for value even for single thumb. Base uses a scalar.

**Correct (radix):**

```tsx
<Slider value={[50]} onValueChange={([v]) => setValue(v)} />
```

**Correct (base):**

```tsx
<Slider value={50} onValueChange={(v) => setValue(v)} />
```

---

## Accordion

Radix `type="single"` requires `string | undefined` for `value`. Base uses `string | null`.

**Correct (radix):**

```tsx
<Accordion type="single" value={open ?? undefined} onValueChange={setOpen}>
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>
```

**Correct (base):**

```tsx
<Accordion value={open} onValueChange={setOpen}>
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>
```
