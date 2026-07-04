# Component Composition

## Contents

- Items always inside their Group component
- Callouts use Alert
- Empty states use Empty component
- Toast notifications use sonner
- Choosing between overlay components
- Dialog, Sheet, and Drawer always need a Title
- Card structure
- Button has no isPending or isLoading prop
- TabsTrigger must be inside TabsList
- Avatar always needs AvatarFallback
- Use Separator instead of raw hr or border divs
- Use Skeleton for loading placeholders
- Use Badge instead of custom styled spans

---

## Items always inside their Group component

Never render items directly inside the content container.

**Incorrect:**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

**Correct:**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

This applies to all group-based components:

| Item | Group |
|------|-------|
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## Callouts use Alert

```tsx
<Alert>
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Something needs attention.</AlertDescription>
</Alert>
```

---

## Empty states use Empty component

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Create your first project to get started.</EmptyDescription>
  </EmptyHeader>
  <EmptyFooter>
    <Button>New Project</Button>
  </EmptyFooter>
</Empty>
```

---

## Toast notifications use sonner

```tsx
import { toast } from "sonner"

toast("Event has been created.")
toast.error("Something went wrong.")
toast.success("Changes saved.")
```

---

## Dialog, Sheet, and Drawer always need a Title

`DialogTitle`, `SheetTitle`, `DrawerTitle` are required for accessibility. Use `className="sr-only"` if the title should be visually hidden.

**Incorrect:**

```tsx
<DialogContent>
  <p>Are you sure?</p>
</DialogContent>
```

**Correct:**

```tsx
<DialogContent>
  <DialogTitle>Confirm Action</DialogTitle>
  <p>Are you sure?</p>
</DialogContent>

{/* Visually hidden: */}
<DialogContent>
  <DialogTitle className="sr-only">Confirm Action</DialogTitle>
  <p>Are you sure?</p>
</DialogContent>
```

---

## Card structure

Use full Card composition. Don't dump everything in `CardContent`.

**Incorrect:**

```tsx
<Card>
  <CardContent>
    <h3>Title</h3>
    <p>Description</p>
    <Button>Action</Button>
  </CardContent>
</Card>
```

**Correct:**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* main content */}
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

---

## Button has no isPending or isLoading prop

Compose loading state with `Spinner` + `data-icon` + `disabled`.

**Incorrect:**

```tsx
<Button isLoading={isPending}>Save</Button>
```

**Correct:**

```tsx
<Button disabled={isPending}>
  {isPending && <Spinner data-icon="inline-start" />}
  Save
</Button>
```

---

## TabsTrigger must be inside TabsList

**Incorrect:**

```tsx
<Tabs>
  <TabsTrigger value="tab1">Tab 1</TabsTrigger>
  <TabsContent value="tab1">Content</TabsContent>
</Tabs>
```

**Correct:**

```tsx
<Tabs>
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content</TabsContent>
</Tabs>
```

---

## Avatar always needs AvatarFallback

```tsx
<Avatar>
  <AvatarImage src={user.avatarUrl} alt={user.name} />
  <AvatarFallback>{user.initials}</AvatarFallback>
</Avatar>
```

---

## Use Separator instead of raw hr or border divs

**Incorrect:**

```tsx
<hr />
<div className="border-t" />
```

**Correct:**

```tsx
<Separator />
```

---

## Use Skeleton for loading placeholders

**Incorrect:**

```tsx
<div className="animate-pulse bg-muted rounded h-4 w-32" />
```

**Correct:**

```tsx
<Skeleton className="h-4 w-32" />
```

---

## Use Badge instead of custom styled spans

**Incorrect:**

```tsx
<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">New</span>
```

**Correct:**

```tsx
<Badge>New</Badge>
<Badge variant="secondary">Beta</Badge>
<Badge variant="destructive">Deprecated</Badge>
```
