---
name: Work issue
about: A piece of work asked by the owner (goal, decisions, scope, acceptance)
title: ""
labels: []
---

## Asked (owner, YYYY-MM-DD)

<!-- What the owner wants, in a few lines. -->

## Owner decisions

<!-- The decisions that bind, each dated. -->

## What exists today (main at `<short sha>`)

<!-- The current code, with the main commits and file references. -->

## Scope

<!-- In and out. The packages touched. -->

## Proposal

<!-- How it is to be done, in numbered steps. -->

## Acceptance

<!-- What must be true when done: hand check, widths, reduced motion, budget. -->

## Deliverables

<!-- The PRs, tests, stories, captures, docs. -->

- Design notes (a change drawn after a reference image): write your design notes in `docs/design/notes/<ID>.md` (the brief's ID;
  first line the reference image it follows and the date) and add one link line under that image's "Notes" in
  `docs/design/README.md`. Never a paragraph in the README itself.

## Open points

<!-- Each point with the proposal or default to take when there is no answer. -->

## Constraints

<!-- Keep or trim:
- Mobile first.
- Self-hosted: nothing fetched from a CDN.
- Tests scoped to the touched packages.
- `check-run -- bun run check` passes.
- Design notes in `docs/design/notes/<ID>.md`, not in `docs/design/README.md`.
- Public repository: no machine paths or briefs.
-->

- [ ] Handled outside the normal flow (no board task)
