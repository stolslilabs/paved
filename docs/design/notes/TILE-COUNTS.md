Follows [`profile.webp`](../profile.webp), 2026-11-07.

TILE-COUNTS (2026-11-07), the owner's two asks of the same day. First, Tiles' All tiles shows each tile's copies in the deck: the
dock's red square at its top right (the deck page's `Left`, the same classes), read from game-core's base deck (`baseCopies`, the 72
cards of the Challenge's draw, the shop's rarity and the chests' odds; Tutorial and Story levels bring their own, so Tiles means
this one, as its Description's "In deck" already did), each tile's button named "City corner, 5 in deck"; a pick not saved yet keeps
its gold dot, now at the top left. Second, the owner's rule: a section's title is a fixed word, with no count, X/Y, total, timer or
amount in it nor in its `end` slot, which holds a control at most (`SectionTitle`'s doc, `__tests__/section-title-rule.test.ts`
fails on a figure's marks in either). Each figure was dropped where the page already shows it, or moved into the section's content:
Skins' owned of five (dropped); Missions' Tutorial, Daily, Weekly and Achievements counts (dropped: the medallions and the
milestones' bars say them) and the Daily's and Weekly's reset timers (moved to a carved chip on the section's first line); the
Ranking's list counts (dropped: the ranks); the deck page's Tiles, Order, Village and Extras counts (dropped: the band of Left,
Played and Discarded, the red squares); the guild's Requests, Invitations sent and a visitor's Members counts (dropped: the
Requests tab's badge, the rows, the figures' band's members against the cap), the guild finder's Invitations and the Chat's
Requests (dropped: the rows, the Private tab's badge); the name's characters in Rename (moved to the end of the "3 to 15
characters" rule, under the field) and in the guild form's Name and Description (moved under the field, at the right); the
village editor's slots used (moved to a carved chip under Inventory, the hint beside it), the old layout editor's inventory
total (dropped: each card's ×N) and a Story level's opening's Deck count (dropped: the tiles are numbered in draw order, the
last number the count; its section no longer a named region, "Deck" alone repeating the board's stack under the veil). Kept: the Profile's Stats span at its title's end, a filter's chip with its cross (a control);
the drawers' Cobbles at their headers' end (the HUD's balance, a press opens the packs: a header, not a section's title); and
the pages' names that identify what they show ("Challenge #1234", a Story level's name, a village owner's): fixed for the
page's life, names rather than figures. This supersedes the counts beside the titles described in MISSIONS-PAGE, COLLECTION-PAGE,
ATTACK-SCOUT, LEADERBOARD-PAGE, GUILD-PAGE, EDIT-VILLAGE, PLAYER-RENAME and STORY-INTRO above.
