---
name: composition-patterns
description: React composition patterns for packages/app, the Paved client v2: compound components, no boolean-prop sprawl, explicit variants, state lifted into providers, React 19 APIs. Use when refactoring a component with many boolean props, building a compound component or a provider, or designing a component's API.
---

<!-- Source: rewritten for Paved from vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278, skills/composition-patterns/SKILL.md. Licence: MIT (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

# Composition patterns in Paved

Rules for composing React components without boolean-prop sprawl. They come from Vercel's `composition-patterns`
skill, pinned to the commit named in the header, with the parts that do not fit this repository changed. Each rule
file marks its changes with `<!-- Paved: ... -->`.

The skills of this repository decide first:

- **`paved-ui`** sets the tiers (`ui/`, `elements/`, `containers/`, `scenes/`), the tokens, the stories and the rule that
  a scene takes all its data as props.
- **`paved-data`** sets where data is read and written: hooks, query keys, sessions. Data enters through the routes.
- **`shadcn`** sets how the `ui/` primitives are composed.

Where a rule below and one of these differ, the repository's skill wins. The samples in the rule files are upstream's
chat composer, written for React Native in places (`TextInput`, `onPress`): read them as a shape, and write DOM
elements and `onClick` in `packages/app`.

## When to apply

- A component grows boolean props that change what it renders.
- Building a compound component, a provider or a reusable API.
- Reviewing a component's structure.

## Rules

Read the rule file before applying a rule.

| Priority | Rule file (in `rules/`) | In one line |
|---|---|---|
| High | `architecture-avoid-boolean-props` | Do not customise behaviour with boolean props; compose |
| High | `architecture-compound-components` | Subcomponents share state through context; consumers compose the pieces |
| Medium | `state-decouple-implementation` | Only the provider knows how state is managed |
| Medium | `state-context-interface` | A generic `state`, `actions`, `meta` interface any provider can implement |
| Medium | `state-lift-state` | Lift state into a provider so siblings can reach it |
| Medium | `patterns-explicit-variants` | One explicit component per variant, not a boolean mode |
| Medium | `patterns-children-over-render-props` | `children` for structure; render props only to pass data back |
| Medium | `react19-no-forwardref` | `ref` as a prop, `use()` instead of `useContext()` (the app is on React 19) |

## How it meets the tiers

- A compound component and its context live in one tier; its parts import only from their tier or below.
- A provider in `elements/`, `containers/` or `scenes/` is fed by props. A provider that reads data is a route
  component, wired as `paved-data` says.
- Every new component, and every explicit variant, has a story per state (`paved-ui`).
