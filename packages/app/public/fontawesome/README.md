# Font Awesome Pro 6.6.0

The owner's Font Awesome Pro files, under the owner's Font Awesome Commercial License (https://fontawesome.com/license).

**Source:** stolslilabs/paved commit `21788fb` ("feat: add fa sources"), where the owner added them as
`app/public/fontawesome/js/*`. They were moved here with `git mv`, unmodified.

| File | Bytes | SHA-256 |
|---|---|---|
| `js/fontawesome.min.js` | 47,100 | `19e1110c6569c44a0b910f16cb39022e82c1fd70e4769d32e145d1e2e5baace9` |
| `../../vendor/fontawesome/solid.min.js` | 2,070,771 | `40b81666f7f3bd1bc8d255fb00a2ce5a9470e33a7a492930a0c73ccde0b15a9f` |
| `../../vendor/fontawesome/thin.min.js` | 4,505 | `100c32756a08b9c00be6627ee3dc4f837e068d453a6501ead8f311940a9354dc` |

`js/fontawesome.min.js` and the two files of `packages/app/vendor/fontawesome/` are the owner's, whole and unmodified: do not
edit them. Check them with `sha256sum js/fontawesome.min.js ../../vendor/fontawesome/*.min.js`. `vendor/fontawesome/` is the
input of the subset and is outside `public/`: neither the build nor the published Storybook copies it (the build and
`scripts/storybook-guard.ts` fail if it appears in `dist/` or `storybook-static/`).

`js/solid.min.js` and `js/thin.min.js` are **generated** from `vendor/fontawesome/` by `scripts/fa-subset.ts` (`bun run fa-subset` in
`packages/app`), cut to the icons `src/` names, with the licence header kept first and a note naming the source's SHA-256.
Do not edit them: add the icon to the code and run the script. The build and `__tests__/fa-subset.test.ts` fail on a subset
that is stale. `thin` has one icon, `spider-web`.

They are loaded by `src/lib/font-awesome.ts` and rendered by `src/components/ui/icon.tsx`
(docs/client/v2-architecture.md, section 8).
