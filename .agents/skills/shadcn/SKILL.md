---
name: shadcn
description: The shadcn/ui conventions for packages/app, the Paved client v2: composition, styling with tokens, forms, icons, Radix versus Base UI. Use when adding, fixing or composing a primitive under src/components/ui/ or any markup that uses one.
---

<!-- Source: rewritten for Paved from shadcn-ui/ui@30a58d4498f270af1c1e981a7d78a15cf5740841, skills/shadcn/SKILL.md. Licence: MIT, Copyright (c) 2023 shadcn (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

# shadcn/ui in Paved

shadcn/ui components are source code the app owns, in `packages/app/src/components/ui/` (tier `ui/` of the `paved-ui`
skill). The rules below come from the shadcn skill, pinned to the commit named in the header, with the parts that
do not fit this repository removed or changed. Each rule file marks its changes with `<!-- Paved: ... -->`.

## How it is set up here

- **Radix**, through the `radix-ui` package (not per-primitive packages). There is no `components.json`.
- **Tailwind v4**, tokens in `packages/app/src/styles/theme.css`; semantic classes only (`paved-ui`, "Styling").
- **Toasts** are Sonner (`ui/sonner.tsx`). **Icons** are Font Awesome through `<Icon>` (`ui/icon.tsx`), not lucide.
- **Classes** are merged with `cn()` from `src/lib/utils.ts`; variants use `cva`.
- **The CLI.** `shadcn` is a dev dependency of `packages/app`, version 4.21.4 (see `package.json`). A component is added
  by hand, copying its source into `ui/` and fitting it to the tokens, or with that pinned version run from the
  project. Never an unpinned or newest version. Check `ui/` first: do not add a component that is already there.
- Every new `ui/` component keeps shadcn's `data-slot` attributes, has a story per state, and follows the
  `paved-ui` skill (tokens, focus ring, accessible names, `m` components for motion).

## Principles

1. **Use existing components first.** Look in `ui/` before writing markup.
2. **Compose, don't reinvent.** A settings page is Tabs + Card + form controls.
3. **Built-in variants before custom styles.** `variant="outline"`, `size="sm"`.
4. **Semantic colors.** `bg-primary`, `text-muted-foreground`; never `bg-blue-500`.

## Rules

- Styling: [rules/styling.md](./rules/styling.md). `className` for layout only; `gap-*` not `space-*`; `size-*`;
  `truncate`; `cn()`; no manual `z-index` on overlays.
- Composition: [rules/composition.md](./rules/composition.md). Items inside their Group; Dialog, Sheet and Drawer
  need a Title; full Card composition; `TabsTrigger` inside `TabsList`; `AvatarFallback`; `Alert`, `Empty`,
  `Separator`, `Skeleton`, `Badge` instead of custom markup.
- Forms: [rules/forms.md](./rules/forms.md). `FieldGroup` + `Field`; `data-invalid` with `aria-invalid`;
  `ToggleGroup` for 2 to 7 options.
- Icons: [rules/icons.md](./rules/icons.md). Use `<Icon>`; icons inside a component are sized by the component.
- Radix versus Base UI: [rules/base-vs-radix.md](./rules/base-vs-radix.md). The app is Radix: `asChild`, `type="single"`.

When a rule here and the `paved-ui` skill or the code disagree, the code and `paved-ui` win.
