<!-- Source: shadcn-ui/ui@30a58d4498f270af1c1e981a7d78a15cf5740841, skills/shadcn/rules/icons.md. Licence: MIT, Copyright (c) 2023 shadcn (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

# Icons

<!-- Paved: upstream says to import from the configured icon library (lucide-react and the like). This app uses Font Awesome Pro through `<Icon>` in `ui/icon.tsx`; it imports no icon set. The code samples below show the upstream icon components; write `<Icon name="magnifying-glass" />` instead. -->
**Draw icons with `<Icon name="..." variant="solid" label="..." />` from `ui/icon.tsx`** (see the "Icons" section of the `paved-ui` skill). Never import `lucide-react` or another icon set, and never write `<i class="fa-...">`.

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

Components handle icon sizing via CSS. Don't add `size-4`, `w-4 h-4`, or other sizing classes to icons inside `Button`, `DropdownMenuItem`, `Alert`, `Sidebar*`, or other shadcn components. Unless the user explicitly asks for custom icon sizes.

**Incorrect:**

```tsx
<Button>
  <SearchIcon className="size-4" data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  Settings
</DropdownMenuItem>
```

**Correct:**

```tsx
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  Settings
</DropdownMenuItem>
```

---

## Pass icons as component objects, not string keys

Use `icon={CheckIcon}`, not a string key to a lookup map.

**Incorrect:**

```tsx
const iconMap = {
  check: CheckIcon,
  alert: AlertIcon,
}

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon />
}

<StatusBadge icon="check" />
```

**Correct:**

```tsx
// Paved: pass a small component that renders <Icon name="check" />, not an icon-set import.
const CheckIcon = () => <Icon name="check" />

function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />
}

<StatusBadge icon={CheckIcon} />
```
