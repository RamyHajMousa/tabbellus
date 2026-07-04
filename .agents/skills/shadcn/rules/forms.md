# Forms & Inputs

## Contents

- Forms use FieldGroup + Field
- InputGroup requires InputGroupInput/InputGroupTextarea
- Buttons inside inputs use InputGroup + InputGroupAddon
- Option sets (2–7 choices) use ToggleGroup
- FieldSet + FieldLegend for grouping related fields
- Field validation and disabled states

---

## Forms use FieldGroup + Field

Always use `FieldGroup` + `Field` — never raw `div` with `space-y-*`:

```tsx
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" type="email" />
  </Field>
  <Field>
    <FieldLabel htmlFor="password">Password</FieldLabel>
    <Input id="password" type="password" />
  </Field>
</FieldGroup>
```

Use `Field orientation="horizontal"` for settings pages. Use `FieldLabel className="sr-only"` for visually hidden labels.

**Choosing form controls:**

- Simple text input → `Input`
- Dropdown with predefined options → `Select`
- Searchable dropdown → `Combobox`
- Native HTML select (no JS) → `native-select`
- Boolean toggle → `Switch` (for settings) or `Checkbox` (for forms)
- Single choice from few options → `RadioGroup`
- Toggle between 2–5 options → `ToggleGroup` + `ToggleGroupItem`
- OTP/verification code → `InputOTP`
- Multi-line text → `Textarea`

---

## InputGroup requires InputGroupInput/InputGroupTextarea

Never use raw `Input` or `Textarea` inside an `InputGroup`.

**Incorrect:**

```tsx
<InputGroup>
  <Input placeholder="Search..." />
</InputGroup>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

## Buttons inside inputs use InputGroup + InputGroupAddon

**Incorrect:**

```tsx
<div className="relative">
  <Input placeholder="Search..." />
  <Button className="absolute right-0 top-0">Go</Button>
</div>
```

**Correct:**

```tsx
<InputGroup>
  <InputGroupInput placeholder="Search..." />
  <InputGroupAddon>
    <Button variant="ghost" size="sm">Go</Button>
  </InputGroupAddon>
</InputGroup>
```

---

## Option sets (2–7 choices) use ToggleGroup

Don't loop `Button` with manual active state for option selection.

**Incorrect:**

```tsx
{options.map(opt => (
  <Button
    key={opt}
    variant={selected === opt ? "default" : "outline"}
    onClick={() => setSelected(opt)}
  >
    {opt}
  </Button>
))}
```

**Correct:**

```tsx
<ToggleGroup type="single" value={selected} onValueChange={setSelected}>
  {options.map(opt => (
    <ToggleGroupItem key={opt} value={opt}>{opt}</ToggleGroupItem>
  ))}
</ToggleGroup>
```

---

## FieldSet + FieldLegend for grouping related fields

**Incorrect:**

```tsx
<div>
  <h3>Notifications</h3>
  <Field>...</Field>
  <Field>...</Field>
</div>
```

**Correct:**

```tsx
<FieldSet>
  <FieldLegend>Notifications</FieldLegend>
  <Field>...</Field>
  <Field>...</Field>
</FieldSet>
```

---

## Field validation and disabled states

Use `data-invalid` on `Field` and `aria-invalid` on the control. For disabled: `data-disabled` on `Field`, `disabled` on the control.

**Validation:**

```tsx
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Please enter a valid email address.</FieldDescription>
</Field>
```

**Disabled:**

```tsx
<Field data-disabled>
  <FieldLabel>Email</FieldLabel>
  <Input disabled />
</Field>
```
