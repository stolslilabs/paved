> Record of the client specification v1, copied verbatim from the PM's file `spec-client-v1.md` (2026-10-14), header included: section A is the owner's text, translated; section B is the PM's rulings (P-57). The benchmark and the architecture proposal are in [`v2-architecture.md`](v2-architecture.md).

# Client specification v1 (owner, 2026-10-14)

Source: the owner's message to the PM, 2026-10-14, in French. Below: (A) the owner's text translated faithfully; (B) the PM's rulings where the text leaves gaps (the owner asked for initiative: "many iterations will follow"). The owner's words are the reference; a PM ruling yields to any later owner word.

## A. The owner's specification (translated)

This document is the specification for the client. It may need contract changes too, to reach the target or simply to keep the client and the contracts coherent.

- Style direction: `packages/app/src/stories/renderer/mockups/mockup-01.png` (and `mockup-02.png`), on main since db469fb (moved from `app/docs/` in #591).
- Web, mobile first and responsive, also playable on desktop. Several breakpoints if needed: small mobile, mobile, tablet, desktop.
- First thing: benchmark, and draw heavily on the architecture and file structure of https://github.com/cartridge-gg/nums.
- Host a Storybook app to explore each component individually, at storybook.paved.bal7hazar.com (the owner pointed that DNS name at the VPS).
- In the Storybook: the colour palette (see the implementation in https://github.com/cartridge-gg/glitchbomb, with a standard Tailwind declension of the colours), and the font families.
- Icons: Font Awesome only, using the font-awesome.min.js libraries that are in nums.
- Dark theme only for now. A light theme may come one day; it is neither validated nor a priority.
- Base UI: mainly shadcn, plus similar libraries that offer a much better UX, notably animations on interaction with buttons, tabs, etc.
- Storybook also gets a section to browse the existing base tiles (and the extended tiles in another section, possibly). The Storybook background is the board's (dark theme).
- Tile rendering in the app: the post-processing needed for a clean render with no flicker; thin black outlines that scale with the zoom: thinner when zooming out, until invisible; a maximum width when zooming in, so the line never gets too thick.
- Pages:
  - home
  - play: choose the mode: challenge, training, multiplayer (disabled, "coming soon"), other?
  - board: the game board, with the choice of the tile to place
  - over: the final score with the game's metrics
  - theme: theme choice: default (the default, with meadows), forest (see the alternative tiles in the repository), snow, desert and volcano (coming soon)
  - settings
  - vault (staking)
  - referral
  - purchase
  - quests
  - achievements
  - loading
  - welcome
  - leaderboard
- Challenge mode: a unique seed, a hash of the token id. It evolves with each placement, deterministically and predictably, to draw the next tile, so that play renders with no loading.
- Drop the notion of Daily in the client for now: Challenge only.
- A game costs $2, with a minimum score to beat (the average performance adjusted for the protocol's fees, as in Nums). Keep the same prices and bonuses as Glitchbomb (a reward bonus for high stakes).
- A game is valid 24 h. Show it in the purchase scene and in the game's details.
- Take initiatives where there is no information; many iterations will follow.
- The hooks and contexts of the reference repositories may not be best in class: look up best practices, notably for performance.
- Download and add the skills needed for an efficient, performant solution.
- Later, a native mobile client in Swift; for now React, to iterate faster.
- Later: daily and weekly challenges paid from entry fees; a Story mode with predefined seeds and a non-empty starting board (puzzles); a player meta-progression with XP that unlocks things (to be defined); leagues to face players, synchronously or asynchronously (depending on the player base and technical limits).

## B. PM rulings on the gaps (P-57, reversible by the owner's word)

1. Program "Client v2": a rebuild of the web client to this specification. CLIENT owns it; CORE owns the contract changes it implies.
2. Order: (a) the Nums benchmark and an architecture proposal (a docs PR) before any code; (b) foundations: the design system, Storybook and its hosting; (c) pages; (d) polish. The PM rules on (a) before (b) starts.
3. The mockups give the UI style (dark, gold accents, cards, bottom navigation on mobile). They show characters, which D-18 removed: ignore them. The board's art is the repository's existing tile art, with the outline post-processing above. A 3D isometric voxel board, as drawn in the mockups, is not in v1 unless the owner asks; the benchmark says what it would cost.
4. Play also offers the Tutorial (off-chain, D-21), beside Challenge, Training and Multiplayer (disabled).
5. A collection page, seen in the mockups, is not in the owner's list: not in v1. The tile gallery lives in Storybook.
6. Font Awesome from Nums: CLIENT checks the licence of the files in Nums (Free or Pro). If Pro, it is a licence question for the owner before use.
7. Storybook hosting: a static site published like the client, under its own Caddy site. Installing that site needs root: the PM prepares the owner's root block when the Storybook is ready.
8. The next-tile prediction: the client computes the next draw locally with the engine (parity with the contract is already proven in CI), so the board never waits on the chain; the chain's answer then confirms it.
9. Contract items (CORE): the 24 h validity of a game (what exists today, what must change); prices and stake bonuses identical to Glitchbomb's (a parity table); and the views the client needs to predict the next tile.
10. Future items (daily and weekly, Story, XP, leagues) are not built now; the architecture must leave room for them.
