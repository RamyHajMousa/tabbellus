# Icons

**Always use the project's configured `iconLibrary` for imports.** Check the `iconLibrary` field from project context: `lucide` → `lucide-react`, `tabler` → `@tabler/icons-react`, etc. Never assume `lucide-react`.

---

## Icons in Button use data-icon attribute

Add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) to the icon. No sizing classes on the icon.

**Incorrect:**

```tsx
<Button>
  <SearchIcon className="mr-2 size-4" />
  Search
</Button>
```

**Correct:**

```tsx
<Button>
  <SearchIcon data-icon="inline-start"/>
  Search
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end"/>
</Button>
```

---

## No sizing classes on icons inside components

Components handle icon sizing via CSS. Never add `size-4`, `w-4 h-4`, or similar classes to icons inside Button, Badge, Alert, etc.

**Incorrect:**

```tsx
<Button>
  <PlusIcon className="size-4" />
  Add
</Button>
```

**Correct:**

```tsx
<Button>
  <PlusIcon data-icon="inline-start" />
  Add
</Button>
```

---

## Pass icons as objects, not string keys

**Incorrect:**

```tsx
<SomeComponent icon="check" />
```

**Correct:**

```tsx
import { CheckIcon } from "lucide-react"

<SomeComponent icon={CheckIcon} />
```
