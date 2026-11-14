/**
 * UI-ART: the HUD's icons and frames, WebP copies of the masters in `ui-sources/`.
 *
 *   node scripts/compress-ui-art.ts [--check]
 *
 * Reads `ui-sources/icons/<name>.webp` (`UI_ICONS`, each on `ICON_FRAME`) and `ui-sources/frames/<name>.webp` (`FRAME_ART`), in
 * `src/components/elements/ui-art.ts`, `ui-sources/medallions/<name>.webp` (`UI_MEDALLIONS` and `UI_RINGS`, on `MEDALLION_FRAME`, in
 * `medallion-art.ts`), `ui-sources/missions/<name>.webp` (`MISSION_PARTS`, there too), `ui-sources/shop/<name>.webp` (`SHOP_PARTS`,
 * in `shop-art.ts`), `ui-sources/friends/<name>.webp` (`FRIENDS_PARTS`, in `friends-art.ts`) and `ui-sources/emblems/<name>.webp`
 * (`GUILD_EMBLEM_CHARGES`, on `EMBLEM_FRAME`, in `emblem-art.ts`), `ui-sources/play/<name>.webp` (`MODE_ICONS` on `MODE_ICON_FRAME`, `MODE_SCENES` on `MODE_SCENE_FRAME`, `STAKE_ART`, in
 * `play-art.ts`), `ui-sources/avatar/<name>.webp` (`AVATAR_ART`, on `AVATAR_ART_FRAME`, in `avatar-art.ts`),
 * `ui-sources/ranking/<name>.webp` (`RANKING_ART`, on `RANKING_ART_FRAME`, in `ranking-art.ts`) and `ui-sources/attack/<name>.webp`
 * (`RADAR_ART`, in `attack-art.ts`), transparent lossless WebP
 * left untouched
 * and never shipped (not in `public/`), and writes
 * `public/ui-art/icons/<size>/<name>.webp` and `public/ui-art/frames/<size>/<name>.webp` for each size. Each run removes the copies
 * of an earlier one. `--check` encodes nothing and fails when a master is missing, extra or not of its frame, or a copy is missing,
 * extra, not a WebP, or not of its size: the bytes depend on the encoder's build, which nothing in the repository pins, so they are
 * not compared.
 *
 * The masters were generated with OpenAI's image model through the Codex CLI after the owner's mobile direction of 2026-11-01
 * (`docs/design/home.webp`, each step approved by the owner): sheets of 16 icons and one of the frames, drawn on a transparent
 * background by editing the validated screens, so every asset is copied from them; then cut by script, each icon trimmed to its
 * drawing, fitted to a 240 px box (its proportions kept) and centred on a 256 px square, each frame put on its own frame. The
 * dock's ribbon and divider, the PLAY medallion, the season dial's frame and the game modes' icons left on 2026-11-02, unused once the
 * owner kept the app's layout; the player card's frame (`card-frame`) on 2026-11-03, the HUD's frame being CSS since. The profile
 * drawer's three (Avatar, Collection, Invite, 2026-11-02) were redrawn one by one from crops of the profile's mockup, on a
 * flat magenta keyed out by script, then put on the same frame (its Disconnect left with the profile's on 2026-11-04). The four
 * structures and the profile's totals (City, Road, Forest, Wonder, Stats; PROFILE-PAGE, 2026-11-04) were drawn on a transparent
 * background in the rendering of the dock's icons, three-quarters from above, each standing on one shared slab of grass (the Wonder's
 * of stone), checked side by side with the dock's at 44 and 20 points; the four structures cut with one box (the union of their
 * drawings), not each trimmed to its own, so their slabs keep one size and one place on the frame. The Stats stands alone, no slab
 * (the owner's ask), trimmed to its drawing as the dock's icons are. HOME-EDGES (2026-11-04), from the Paved UX Book's main screen
 * (the owner's approved mockups): the mission's hammer, redrawn as an icon and put on the icons' frame; the Chat tab, Codex's redraw
 * of the book's orange tab, alone on a transparent background, then redrawn at its new size (56 x 64 points, the owner's ask) from
 * that first one, its face toned to it by a per-channel gain (the book's blue tile, and three grey directions after it, were set
 * aside: the right column draws no tile). CAMERA-EXPLORE (2026-11-04): the Camera mode's icon, a house on its tile with an arrow in
 * orbit round it, the owner's choice among three Codex drew in the icons' rendering (a spyglass and an eye in a turning arrow the
 * others), alone on a transparent background; its way out, Exit, the same house with a straight arrow going out of it (the owner's
 * choice among three: a door ajar and a U-turn arrow the others). The dock's four (wood, panel, divider, medallion; HOME-DOCK,
 * 2026-11-03) were cut from the mockup's footer at 3x: Codex redrew each layer alone at the footer's framing on a flat magenta,
 * keyed out by script; each layer was registered on the mockup (scale and shift by least error, the parchment fitted box by box),
 * their restack checked against the mockup side by side, then each piece cropped (the panel's divider painted out with the
 * parchment beside it, the divider kept alone, the medallion's face toned to the mockup's by a fitted gradient). Stored as lossless
 * WebP (`cwebp -lossless -z 9 -exact`).
 *
 * MISSIONS-PAGE (2026-11-04): the missions' medallion paintings, after the owner's ask (the book's images, not the HUD's icons):
 * fourteen faces cropped from the Paved UX Book's Missions screens, each redrawn by Codex at 1024 px without its ring or its badge
 * (the book's locked ones in colour), nine more painted by Codex in their rendering for the missions the book does not draw; each
 * checked side by side with its crop of the book (the helmet, its ground not the book's, and the road, the handshake and the tower,
 * drawn by no mission, were left out); cut to their disc, transparent outside it, on a 256 px square. Then the book's painted pieces
 * (the owner's choice among a CSS rendering and these): the rings (silver, gold, green; their hole the painting's 78%), the
 * milestones' rail (its steel and its gold) and nodes (the orb, the bead), the waiting gift's halo and the done badge's green check,
 * each extracted alone from the book's Missions screens by Codex, checked side by side with them, trimmed to its opaque box.
 *
 * LEAGUE-PAGE (2026-11-05): the battle logs' Attack badge (the crossed swords on the gold shield) and the season row's calendar with
 * its crown, the Paved UX Book's League's own pixels (Codex's image tool was not available that day: its models listed no
 * `image_gen`): each cropped from the book's phone screen (about 80 px), upscaled 3x, its navy panel keyed out by a flood fill from the
 * crop's edges over the pixels bluer than they are red (the drawing's near-black outline stops it, the ring next to it ramped and
 * darkened to the outline's colour), the largest drawing kept alone (the badge's label under it dropped), checked side by side
 * with the book, then trimmed and put on the icons' frame.
 *
 * MATCH-PAGE (2026-11-05): the replay's gold Play and Pause buttons and the match's gold star, the Paved UX Book's own pixels again
 * (Codex's built-in image tool was still unavailable: its `imagegen` skill offered only a CLI on the OpenAI API, which the brief rules
 * out). Play: cropped from the book's "Battle log" phone screen (about 100 px), its navy panel keyed out as the League's badge was.
 * The star: the middle one of the book's result screen (about 170 px), cut from its glow and sparkles by a flood fill of its face from
 * its centre over the pixels lighter than its outline, then its near-black outline grown outward from the face through darker pixels
 * (at most 10 px), the outline's outer ring faded by its lightness (that cut left specks, a brown halo and light bites in the outline:
 * the star was extracted again by Codex, STAR-ART, below). Each fitted to the 240 px box by a premultiplied bicubic scale (no
 * navy bleeds into the edge) and centred on the icons' frame, checked side by side with its crop. Pause, which the book does not
 * draw: the Play master with its triangle (measured on the master, and 7 px round it for its shade) erased by interpolating the disc
 * row by row from either side, then two rounded bars painted where it stood, centred on the disc, in the triangle's own colours (its
 * face's at each row, its dark shade along their right and lower edges, its light rim along their left).
 *
 * SHOP-PAGE (2026-11-05): the themes' marks of the Shop's Themes tab (Forest's leaf, Snow's snowflake, Desert's cactus), the Paved UX
 * Book's Shop's own pixels as the League's (Codex listed no image tool that day): each cropped from the book's phone Themes screen
 * (about 60 px), its navy keyed out the same way, the largest drawing kept, trimmed, upscaled to the 240 px box and put on the icons'
 * frame, checked side by side with the book. Volcano, which the book does not draw, keeps its Font Awesome icon. Then, on the owner's
 * asks of the same day, the Shop's pieces (`ui-sources/shop/`, `SHOP_PARTS`): the rarity pills (grey, green, purple; from the book's
 * tablet Tiles screen) and a pile of stones a Cobble pack (50, 100, 500, 1,000; from its phone Cobbles screen), extracted by Codex
 * from the book's pixels (it listed no image tool: its own script keyed the navy out and decontaminated the edges, dropped the
 * "Popular" label's corner, and rebuilt each pill's middle from a text-free column so the client writes the word), each checked by
 * it and by us beside its crop; the pills kept at their size (their rounded ends measured, `RARITY_END`), the piles at the book's
 * scale on one 256 x 160 frame, their foot 4 px above its bottom.
 *
 * CHAT-PAGE (2026-11-05): the chat's Send arrow (the book's desktop World screen), its pinned post's pin (the desktop Guild chat)
 * and a request's check and cross (the tablet Private screen), each cropped at its button's inside (55 to 110 px) and redrawn by
 * Codex's built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`) from its crop, with four shipped icons
 * (close, plus, play, lock) as the style's reference: the object alone, on a transparent 1254 px square. Each trimmed to its opaque
 * box, fitted to the 240 px box by a premultiplied area average and centred on the icons' frame, checked side by side with its crop
 * on navy and on gold. They replace the same day's cuts of the book's pixels (made while Codex listed no image tool), blurred at
 * the icons' size.
 *
 * FRIENDS-PAGE (2026-11-05): a player's profile's followers (three people, also its Following) and Block's no-entry sign, the Paved UX
 * Book's own pixels as the League's (Codex listed no image tool that day): each cropped from the book's phone "friend-profile" screen
 * (60 to 100 px), upscaled 4x by a bicubic scale, its navy keyed out by a flood fill from the crop's edges over the pixels near the
 * panel's colour (Block's two halves inside its ring from a seed each), the edge next to it ramped and darkened to the outline's
 * colour, the largest drawing kept alone, then trimmed and put on the icons' frame, checked side by side with the book on navy and on
 * a light ground. Then, on the owner's ask of the same day, the gold pill of Follow back (`ui-sources/friends/`, `FRIENDS_PARTS`): cropped
 * from the book's phone "friends-followers" screen, upscaled 2x, its words (their white, outline and shadow: whatever is not the
 * pill's orange face in their box) filled by a harmonic inpainting from the face round them, the navy keyed out the same way, trimmed,
 * and every column between its rounded ends replaced by their mean, so the 3-slice stretches a clean profile. Then, on the owner's
 * ask of the same day, the guild's rank actions on a player's profile (`guild-promote`, `guild-demote`, `guild-leader`, `guild-kick`),
 * which the book does not draw: drawn by Codex's built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`, the
 * user's ChatGPT login, no API key), one prompt each, with the HUD's shield, crown, player and guild icons as its style references,
 * on a transparent background; checked on navy and on a light ground, trimmed, fitted to the 240 px box and centred on the icons' frame.
 *
 * GUILD-PAGE (2026-11-05): Post's pencil and the log's door (joined) and removed member (kicked), after the Paved UX Book (its pinned
 * announcement's pin is the chat's, CHAT-PAGE's, the same drawing): first cut from the book's own pixels (about 35 to 70 px, the Codex CLI's configured provider
 * listing no image tool), then redrawn the same day by the Codex CLI's built-in image tool (`image_gen`, its OpenAI provider), from
 * those crops (what to draw) and two contact sheets of the HUD's icons (how), each on a flat magenta ground (1254 px square), keyed out
 * as below and checked beside its crop. The log's speech bubble (posted) is the HUD's Chat icon, the same drawing. Then, on the owner's
 * ask of the same day (the menu's buttons in the game's style, its icons drawn by Codex), the menu's and a member's view's icons
 * (invite-player, find, leave, disband, promote, demote; leave is also the log's member who left): generated by the same tool from a
 * prompt naming each drawing, with the two contact sheets as its style reference, each on a flat magenta ground (1254 px square). The
 * ground keyed out by a flood fill from the edges over the
 * pixels near its colour, and the enclosed ones very near it; in a 4 px band along it the alpha from each pixel's magenta excess and
 * its colour unmixed from the ground, the pink spill clamped; trimmed and fitted to the 240 px box on the icons' frame, checked on the
 * drawer's charcoal beside the icons they stand with (kicked, joined). Then the join types' open padlock (the HUD's padlock opened) and
 * sealed letter, the members' busts, the Recruit's sprout and the Veteran's medal (unlock, letter, members, sprout, medal; the owner's
 * asks of the same day: no Font Awesome left in the settings, five ranks), drawn by the same tool on a transparent ground (their own
 * alpha kept), trimmed and fitted the same way. And the guild emblems' twenty-four charges (`ui-sources/emblems/`,
 * `GUILD_EMBLEM_CHARGES`, the owner's asks of the same day: original ones in place of Font Awesome's, flat silhouettes the leader
 * colours, four rows of six): generated by the same tool in two runs of ten and one of four, each a pure black silhouette on white (1254 px square) whose details are
 * white cut-outs, from a prompt naming each subject (the first twelve those of the icons they replace) with a sheet of painted
 * versions as its subjects' reference. Each made a mask: its alpha from its darkness (white clear, black solid, the anti-aliased edge
 * kept), its colour white; trimmed and fitted to the 240 px box on the icons' frame, checked tinted on shields at 96, 40 and 20 px;
 * copies of 64 and 128 px (`EMBLEM_FRAME`), drawn as CSS masks.
 *
 * EDIT-VILLAGE (2026-11-05), the Paved UX Book's "Edit my village" own pixels (Codex listed no image tool that day either): edit mode's
 * die (`die`, since redrawn, below), its bubble's three (Rotate's blue arrows, `rotate-tile`; Back to the inventory's crate and green arrow,
 * `to-inventory`; Cancel's red cross, `cancel`; all three left with TILE-ACTIONS, below), the Layouts' padlock (`padlock`) and Use's gold pill (the frame `save-pill`; the book's
 * Save pill). The book's reset arrow was cut too, then left out: Erase took the eraser (the owner's ask of 2026-11-05). The owner's ask: Codex decomposed the book's screens (each part's layers, measures and colours sampled from the pixels)
 * and cut them from the screen that draws each largest (the tablet's, 50 to 130 px): each crop upscaled so the drawing's longer side
 * is 240 px, keyed out of its navy as the League's (Rotate's arrows, blue themselves, by a flood held under the navy's lightness and
 * the navy trapped between them cleared; the padlock, over a coloured plan, by its own outline, the plan seen through its shackle
 * cleared), trimmed and put on the icons' frame; the pill at 4x, its word painted out row by row with the pill's own gold (a
 * retouch: the app writes the word over it). Each checked side by side with its crop of the book; Cancel is the first cut, by script,
 * which Codex found faithful. The bar's Save (`save`, a floppy disk) and Erase (`erase`, a two-tone eraser), which the book does not
 * draw: painted by Codex's built-in image tool (`image_gen`, the owner's ask, later the same day: it is listed under the provider
 * `openai`), in the rendering of `build`, `chat` and `hammer` given as references, on a transparent background (1254 px RGBA); then,
 * at the owner's asks, the die redrawn by it (the book's cut, about 80 px enlarged, was blurry: its design given as the reference,
 * a real die's faces, four on top at the corners of its rhombus as the book's, two and six on the sides) and the eraser redrawn chunky,
 * its silhouette about square (the first, long and thin, sat small on its disc), in neutral greys. Each kept among two or three attempts, checked beside those icons at 128, 32 and 24 px on the HUD's disc, then trimmed and put on the icons' frame.
 *
 * PLAY-PAGE (2026-11-06): the Play page's four mode paintings (`ui-sources/play/`, `PLAY_ART`), the Paved UX Book's "modes" screens:
 * the Challenge's trophy and coins, Attack's castle and crossed swords, Training's target, Story's book and stars (Free Challenge's
 * scroll, drawn too, left with the mode on the owner's ask). Then, on the owner's ask of the same day (the book's bushes and grass add
 * nothing), Attack, Training and Story redrawn by the same tool without any foliage, from the first drawings (what to draw) and the
 * Challenge's trophy (how, the one kept): Training's target now on a wooden easel, an arrow in its bullseye. And the HUD's gift
 * opened (`gift-open`, under a mode's rewards), drawn by the same tool from the closed gift (`invite`) and the icons' sheet, on a
 * transparent 1254 px square, trimmed and fitted to the icons' frame (left on the owner's ask of 2026-11-08, PLAY-REWARDS: the
 * rewards' icons alone in its place). And the Challenge's stake's icons (the owner's ask of the same
 * day: colourful icons for where the USDC goes and what a stake can win): the burned coin (`flow-burn`, a PAVED coin in flames), the
 * Vault (`flow-vault`, the HUD's piggy bank fed a vPAVED coin), the referral (`flow-referral`, a handshake under a coin), the top
 * win (`max-gain`, a pile of PAVED) and break even (`break-even`, a level scale, USDC's coin against PAVED's), drawn by the same tool from a prompt each with the HUD's vault, friends, PAVED, vPAVED, trophy and
 * crown as references, fitted the same way; and the split's title (`money-flow`, the owner's asks of the same day: a money flow, then
 * simpler), USDC's coin and three short straight arrows, fire, silver and green (the burn's, the Vault's and the referral's colours on
 * the bar), and the stake's (`stake`, a mark other than USDC's), a money bag with USDC coins at its foot, drawn and fitted the
 * same way. And the stake's ten paintings (`STAKE_ART`, the owner's asks of the same day: a painting per stake, as many coins as
 * its USDC, a stake being 2 USDC, in the look of the tool's first sheet of growing piles, the owner's pick): stakes 1, 2 and 5 are
 * that sheet's own piles (2, 4 and 10 coins), the seven others drawn one pile at a time by the same tool, each edited from the
 * sheet's nearest pile (6 from its stack of five, 8 and 12 from its two stacks, 14 and 16 from its pyramid, 18 and 20 from the
 * counted 16, loose coins added); each pile's coins counted (each stack's edges, a hidden foot read from the stack's height beside
 * its neighbour's, each loose face) and redrawn until right; then cut by their opaque parts, brought to one coin size (the coin's
 * width read on a stack's side), fitted to the 3:2 frame (384 x 256, a 6 px margin) at the largest pile's scale, standing on the
 * frame's foot. The mode paintings: each cropped from the book's tablet "modes-resume" screen (about 200 x 120 px) and redrawn by Codex's built-in image tool
 * (`codex exec -c model_provider=openai`, its `image_gen`, the user's ChatGPT login, no API key) from that crop, with a sheet of the
 * HUD's icons (trophy, swords, the Forest leaf, sprout, crown, Attack) as its rendering's reference, on a transparent ground (1536 x
 * 1024 RGBA); checked on the drawer's navy and on the Challenge card's gold beside its crop, then trimmed to its opaque box, fitted to
 * the 3:2 frame (384 x 256, a 4 px margin) by a premultiplied area average, centred across and standing on its foot. Stored as
 * lossless WebP.
 * AVATAR-PAGE (2026-11-06): the avatar editor's category paintings (`ui-sources/avatar/`, `AVATAR_ART` in `avatar-art.ts`), the Paved UX
 * Book's "avatar-editor" strip: Skin tone, Hair colour, Hair, Beard, Eyes, Accessory and Outfit, each cropped from the book's tablet
 * screen (about 65 px), upscaled 4x and redrawn by Codex's built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`)
 * from its crop, with three shipped icons (avatar, crown, collection) as the rendering's reference, two variants each on a transparent
 * ground, the one nearest the book kept (Hair colour's hair two-toned, so that it reads apart from Hair's); Pauldrons (a pair of steel
 * shoulder plates rimmed in gold) and Backdrop (a landscape in a golden frame), which the book does not draw, painted the same way from
 * a prompt. Headwear is the book's crown, the HUD's own (`crown`). Each checked beside the shipped icons at 128, 48 and 24 px, then
 * trimmed to its opaque box, fitted to 240 px by a premultiplied downscale and centred on 256. Stored as lossless WebP.
 * SETTINGS-PAGE (2026-11-06): the Settings' rows (graphics, ambient, skins, music, sound, tile-preview, highlight, grid), each cropped
 * from the Paved UX Book's tablet Settings screen (about 70 px), upscaled 4x and redrawn by Codex's built-in image tool (`codex exec
 * -c model_provider=openai`, its `image_gen`) from its crop, with four shipped icons (missions, settings, sun, collection) as the
 * style's reference: the object alone, on a transparent 1254 px square. Each trimmed to its opaque box, fitted to the 240 px box by a
 * premultiplied area average and centred on the icons' frame, checked beside the shipped icons on the drawer's charcoal. The book's
 * sun and scroll are the shipped `sun` and `missions`.
 * ATTACK-SCOUT (2026-11-07): the attack's first half (`ui-sources/attack/`, `attack-art.ts`), after the Paved UX Book's "search" and
 * "scout": the search's radar dish (`radar`, the gold rim, the dark face and its rings, no sweep and no crowns) and its sweep (`radar-beam`,
 * a gold line and its trailing glow, painted on pure black, the black turned into alpha from the brightest channel, the colour
 * unpremultiplied, its pivot the frame's centre), and the scout's deck, a pile of three tiles of grass, road and water, an icon of the
 * HUD's (`ui-sources/icons/tile-stack.webp`, `UI_ICONS`: the user's ask, the home's Tiles wears it too). Each cropped from the phone
 * book (the radar about 300 px, the scout's tile 100 x 80 px) and drawn by Codex's built-in image tool (`codex exec -c
 * model_provider=openai`) from that crop, with shipped icons (collection, deck, swords; crown, shield, info) as the style's reference,
 * three variants each, the first kept: the dish trimmed to its opaque box and fitted to 480 px on the 512 px frame, the pile to 240 px
 * on the icons' 256 px frame, the sweep's square scaled whole to 512 px. Stored as lossless WebP.
 *
 * VAULT-PAGE (2026-11-06): the Vault's footer tabs and exit fee (`ui-sources/vault/<name>.webp`, `VAULT_ART` in `vault-art.ts`): Deposit,
 * Withdraw and the exit fee, drawn by Codex's built-in image tool (`codex exec -c model_provider=openai`) in the HUD icons' rendering, the
 * Vault's piggy bank and the PAVED and vPAVED coins as its references, three variants each on a transparent square; the owner's set
 * chosen beside the shipped icons at 28 px. Each trimmed to its opaque box, fitted to the 240 px box and centred on the icons' frame.
 * The owner's asks of 2026-11-06 and -07: Deposit and Withdraw redrawn as a gold coin turning into the silver one and back (one of four
 * pairs: vault door, chest, coin exchange, hand), a Position tab's icon in the same rendering (their silver coins' blue rings and casts
 * then turned to a neutral grey of the same lightness, the owner's ask: no blue on them), and the vPAVED coin's silver light
 * (`VAULT_LIGHTS`: broad rays and a fine starburst, painted on pure black, the black turned to alpha by the brightest channel, then
 * each pixel turned to the neutral grey of its luminance, Rec. 709, the alpha kept: no blue, 512 px).
 * LEADERBOARD-PAGE (2026-11-07): the ranking's gold and silver medals (`ui-sources/ranking/`, `RANKING_ART`), its first two places
 * (the third is the HUD's bronze `medal`): each drawn by Codex's built-in image tool (`codex exec -c model_provider=openai`, its
 * `image_gen`) from the bronze medal, with the HUD's crown and trophy as the gold's reference, the metal alone changed, on a
 * transparent 1024 px square; trimmed to its opaque box, fitted to the 240 px box (canvas, premultiplied) and centred on the icons'
 * frame, checked beside the bronze on the drawer's charcoal.
 * TILE-ACTIONS (2026-11-07): the actions on a tile being placed, the Paved UX Book's board screen's round buttons (mockup 3 of "Resume
 * a Challenge", `screens/board.jpg`): the trash (`tile-discard`), the blue turning arrow (`tile-rotate`) and the gold check on its
 * bronze face (`tile-confirm`), each cropped from the book (about 64 px, upscaled 4x) and drawn by Codex's built-in image tool (`codex
 * exec -c model_provider=openai`, its `image_gen`) from its crop, with the HUD's `info` (the blue disc) and `close` (the red one) as the
 * style's references, the book's progress arcs left out (the app draws its rings), three variants each on a transparent 1024 px square,
 * the first kept; the editor's Back to the inventory (`tile-return`, the book draws none: a white box and its arrow going in, on the
 * blue disc; the shipped crate and its green arrow on the disc the alternative). Then, the owner's asks of the same day: the trash
 * redrawn on the red of `close` (from the blue one, three variants, the first kept), and Cancel (`tile-cancel`) on a neutral disc,
 * drawn from `close` with its red turned to greys (three variants: mid slate, charcoal, graphite; the charcoal kept). Each trimmed to its alpha
 * box, fitted to the 240 px box by a premultiplied area average and centred on the icons' frame, checked beside `close` at 128, 44,
 * 32 and 24 px on the drawer's charcoal and on a light ground. Edit mode's bubble's three (`rotate-tile`, `to-inventory`, `cancel`) left
 * with it.
 * PRESS-BUILD (2026-11-08): the home village's long press into edit mode (#799) in the tile actions' style, the owner's ask: Edit
 * village (`tile-edit`, the book draws none), a white hammer on the blue disc, drawn by Codex's built-in image tool (`codex exec -c
 * model_provider=openai`, its `image_gen`) by editing `tile-rotate` (its arrow replaced, the disc kept), the HUD's `hammer` the
 * shape's reference and `tile-confirm` and `tile-return` the style's; three variants on a transparent 1254 px square (two white
 * hammers, one in the HUD hammer's own steel and orange), the first kept, the coloured one the alternative. Trimmed to its alpha box
 * (alpha 8 and over: the tool's faint specks left out), fitted to the 240 px box by a premultiplied area average and centred on the
 * icons' frame, checked beside the other tile actions at 128, 44, 32 and 24 px on the drawer's charcoal and on a light ground.
 * STAR-ART (2026-11-07): the star (`star`: the ends', Story's and the Attack's), the owner's ask: MATCH-PAGE's flood fill had left
 * specks, a brown halo and light bites in its outline. Extracted again from the same original, the middle star of the Paved UX Book's
 * result screen (`screens/attack-end.jpg`, 768 px wide, the star about 168 px), by Codex's built-in image tool (`codex exec -c
 * model_provider=openai`, its `image_gen`): the crop (234 x 214 px, upscaled 4x) given, the star asked for alone on a transparent
 * ground, its shape, faces, colours and outline kept; three variants (1254 px RGBA), the third kept (registered on the book by least
 * colour error, its gold faces the closest, 1.5, -2.1 and -4.2 off per channel on average, and its outline the most even). Its cut
 * cleaned by script, the drawing untouched: the tool's near-opaque body (alpha 253) brought to 255, its faint fringe (alpha under 16,
 * 464 specks) cleared. Checked: one alpha island, no hole, no edge pixel lighter than the outline or blue (the old glow and ground),
 * the outline 6 to 8 px all round with no bump (the old one fell to 0); on white, black, magenta, the drawer's charcoal and the end
 * window's ground, at 256 px and 6x on each tip and notch. Trimmed to its alpha box, fitted to 240 px by a premultiplied area average
 * and centred on the icons' frame; stored as lossless WebP.
 * STORY-INTRO (2026-11-07): a Story level's tip, its opening's and the coach mark's (the book draws none): the lit bulb (`bulb`), drawn by
 * Codex's built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`) with the HUD's trophy, star, info and unlock as
 * the style's references, three variants on a transparent 1024 px square (a plain lit bulb; the same with five gold rays; an amber one
 * with a painted halo, whose halo left red fringes in its alpha), the first kept; trimmed to its alpha box, fitted to the 240 px box
 * (canvas, premultiplied, stepped by halves) and centred on the icons' frame, checked beside the trophy, star and info at 128, 40 and
 * 24 px on the drawer's charcoal and on a light ground.
 *
 * GAME-OVERLAY (2026-11-07): Story's Restart on the board (`restart`, the owner's ask: an icon held, no word), a red arrow going back
 * round counter-clockwise (the book draws none), drawn by Codex's built-in image tool from the HUD's `rotate` (whose clockwise turn it
 * must not look like), `settings`, `info` and `close` as the style's references, three variants (orange, red, white on a red disc),
 * the red kept (a destructive action, as the red trash; the disc read as `close`). Trimmed, fitted and centred as TILE-ACTIONS'.
 *
 * PLAY-MODES (2026-11-08): the Play page's cards redrawn (the owner's direction C: a hero, wide cards and two square tiles, each
 * a painted scene in an irregular stone frame, its icon breaking out of its top edge), the four mode paintings of PLAY-PAGE left.
 * Drawn by Codex's built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`; no API key, no other service), with
 * the HUD's `chests`, `crown`, `star` and `season` as the style's references. The icons (`MODE_ICONS`), one object per mode used
 * nowhere else, three variants each, the owner's picks: Attack's catapult (a battering ram and a siege tower the others), the
 * Challenge's war horn (a laurel wreath and a pennant on a summit), Training's straw dummy (a target shield, an hourglass), Story's
 * rolled map (a quill, a lantern), the Puzzle's landscape tile cut as a jigsaw piece (tiles tied with a ribbon, a sundial); each a
 * transparent 1254 px square, trimmed to its alpha box, fitted to the 240 px box (libwebp's premultiplied rescale) and centred on
 * the icons' frame, checked on the drawer's charcoal and on a light ground at 96, 32 and 24 px. The scenes (`MODE_SCENES`), 1536 x
 * 1024, whole landscapes with no hole, one series in the game's look with only its own pieces (walled towns, roads, forests, fields,
 * water, its wonders), each mode its own subject and light; drawn in three rounds (the owner: whole landscapes, then one style with
 * no invented buildings, then less alike): Attack the first round's siege at a gate at dusk (kept on the owner's ask), the
 * Challenge close on the great walled city at golden hour, Training a misty meadow with a lone farm, Story the stepped wonder on
 * its hill in the late afternoon, the Puzzle the tiles' grid from above at midday (each the first of two variants). Scaled to
 * 960 x 640 (`cwebp -resize`), stored as lossless WebP.
 *
 * RAILS (2026-11-08, the owner's asks: the score bar's ends round, its inside never stretched, any length, the painted look kept): the
 * milestones' rails (`rail-track`, `rail-fill`) recut. Their paintings taper over about twice their height at each end, so a 9-slice
 * at half their height cut into the taper and squeezed the rest with the bar's length. Each master is now its painting's middle (60
 * px past each end), its last 80 columns crossfaded into its first so it repeats without a seam (1,325 x 12 and 1,313 x 17); the
 * client repeats it along the bar at a fixed grain and rounds the ends (`missionRail`, `medallion-art.ts`). Stored as lossless WebP.
 *
 * EVENT-ICONS (2026-11-14): the icons of three events' cards, one simple object each (the owner's ask: no stacked objects on Play).
 * `mode-colossus`, the monument under its scaffold: the icon of its design proposal (its page's `img/mode-colossus.webp`, 300 x 200),
 * taken as it is. `mode-expedition`, a pocket compass, and `mode-masterpiece`, a walled city in a golden frame: drawn by Codex's
 * built-in image tool (`codex exec -c model_provider=openai`, its `image_gen`; no API key, no other service) with the crop of each
 * proposal's Play screen (the Expedition's map, lantern and compass; the Masterpiece's framed city on its easel with its tools) for
 * the look of the one object kept, and `mode-story`, `mode-puzzle`, `mode-challenge` and `mode-training` as the style's references;
 * three variants each on a transparent 1254 px square, the second kept for both (the compass tilted as the others' objects are, the
 * frame with its painting's ground so the card's scene does not show through it). Each trimmed to its alpha box (alpha 8 and over),
 * fitted to the 240 px box (libwebp's premultiplied rescale) and centred on the icons' frame.
 *
 * Per copy: resized on its frame's side and encoded as lossy WebP with its alpha (`cwebp`, `-m 6 -sharp_yuv -alpha_q 100`, no
 * metadata) at the quality of `QUALITY`, under `nice -n 10`. No package: `cwebp` is libwebp's command-line tool (`brew install
 * webp`, `apt install webp`), needed only to write. Node 24 runs this as is (type stripping): the syntax stays erasable.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_ART, ICON_FRAME, UI_FRAMES, UI_ICONS, copySize } from "../src/components/elements/ui-art.ts";
import { MEDALLION_FRAME, MISSION_PARTS, UI_MEDALLIONS, UI_MISSION_PARTS, UI_RINGS } from "../src/components/elements/medallion-art.ts";
import { SHOP_PARTS, UI_SHOP_PARTS } from "../src/components/elements/shop-art.ts";
import { EMBLEM_FRAME, GUILD_EMBLEM_CHARGES } from "../src/components/elements/emblem-art.ts";
import { FRIENDS_PARTS, UI_FRIENDS_PARTS } from "../src/components/elements/friends-art.ts";
import { MODE_ICONS, MODE_ICON_FRAME, MODE_SCENES, MODE_SCENE_FRAME, STAKE_ART, STAKE_ART_FRAME } from "../src/components/elements/play-art.ts";
import { AVATAR_ART, AVATAR_ART_FRAME } from "../src/components/elements/avatar-art.ts";
import { VAULT_ART, VAULT_ART_FRAME, VAULT_LIGHTS, VAULT_LIGHT_FRAME } from "../src/components/elements/vault-art.ts";
import { RANKING_ART, RANKING_ART_FRAME } from "../src/components/elements/ranking-art.ts";
import { RADAR_ART, RADAR_FRAME } from "../src/components/elements/attack-art.ts";
import { webpSize } from "./compress-music-art.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCE = resolve(HERE, "../ui-sources");
export const OUT = resolve(HERE, "../public/ui-art");

/** Each image as `<kind>/<name>` with its frame and its quality: the icons are seen small, the frames are mostly flat, the medallions are paintings. */
const QUALITY = { icons: 82, frames: 80, medallions: 82, missions: 82, shop: 82, friends: 82, emblems: 82, play: 82, vault: 82, avatar: 82, ranking: 82, attack: 82 } as const;
const IMAGES = [
  ...UI_ICONS.map((name) => ({ kind: "icons" as const, name, frame: ICON_FRAME })),
  ...UI_FRAMES.map((name) => ({ kind: "frames" as const, name, frame: FRAME_ART[name] })),
  ...[...UI_MEDALLIONS, ...UI_RINGS].map((name) => ({ kind: "medallions" as const, name, frame: MEDALLION_FRAME })),
  ...UI_MISSION_PARTS.map((name) => ({ kind: "missions" as const, name, frame: MISSION_PARTS[name] })),
  ...UI_SHOP_PARTS.map((name) => ({ kind: "shop" as const, name, frame: SHOP_PARTS[name] })),
  ...UI_FRIENDS_PARTS.map((name) => ({ kind: "friends" as const, name, frame: FRIENDS_PARTS[name] })),
  ...GUILD_EMBLEM_CHARGES.map((name) => ({ kind: "emblems" as const, name, frame: EMBLEM_FRAME })),
  ...MODE_ICONS.map((name) => ({ kind: "play" as const, name, frame: MODE_ICON_FRAME })),
  ...MODE_SCENES.map((name) => ({ kind: "play" as const, name, frame: MODE_SCENE_FRAME })),
  ...STAKE_ART.map((name) => ({ kind: "play" as const, name, frame: STAKE_ART_FRAME })),
  ...VAULT_ART.map((name) => ({ kind: "vault" as const, name, frame: VAULT_ART_FRAME })),
  ...VAULT_LIGHTS.map((name) => ({ kind: "vault" as const, name, frame: VAULT_LIGHT_FRAME })),
  ...AVATAR_ART.map((name) => ({ kind: "avatar" as const, name, frame: AVATAR_ART_FRAME })),
  ...RANKING_ART.map((name) => ({ kind: "ranking" as const, name, frame: RANKING_ART_FRAME })),
  ...RADAR_ART.map((name) => ({ kind: "attack" as const, name, frame: RADAR_FRAME })),
];

/** The masters a run reads, as `<kind>/<name>.webp`. */
export const masters = () => IMAGES.map((i) => `${i.kind}/${i.name}.webp`).sort();

/** The files a run writes, as `<kind>/<size>/<name>.webp`. */
export const expected = () => IMAGES.flatMap((i) => i.frame.sizes.map((size) => `${i.kind}/${size}/${i.name}.webp`)).sort();

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), base) : [join(dir, n).slice(base.length + 1)]));

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

/** What is wrong with the masters and the copies, if anything. */
export function problems(source = SOURCE, out = OUT): string[] {
  const found: string[] = [];
  const have = walk(source).sort();
  for (const f of masters()) if (!have.includes(f)) found.push(`missing master ${f}`);
  for (const f of have) if (!masters().includes(f)) found.push(`extra master ${f}`);
  for (const image of IMAGES) {
    const f = `${image.kind}/${image.name}.webp`;
    if (!have.includes(f)) continue;
    const size = webpSize(readFileSync(join(source, f)));
    if (!size) found.push(`master ${f}: not a WebP`);
    else if (size.width !== image.frame.width || size.height !== image.frame.height) found.push(`master ${f}: ${size.width}x${size.height}, not ${image.frame.width}x${image.frame.height}`);
  }
  const copies = walk(out).sort();
  for (const f of expected()) if (!copies.includes(f)) found.push(`missing ${f}`);
  for (const f of copies) if (!expected().includes(f)) found.push(`extra ${f}`);
  for (const image of IMAGES)
    for (const s of image.frame.sizes) {
      const f = `${image.kind}/${s}/${image.name}.webp`;
      if (!copies.includes(f)) continue;
      const want = copySize(image.frame, s);
      const got = webpSize(readFileSync(join(out, f)));
      if (!got) found.push(`${f}: not a WebP`);
      else if (got.width !== want.width || got.height !== want.height) found.push(`${f}: ${got.width}x${got.height}, not ${want.width}x${want.height}`);
    }
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const found = problems();
    if (found.length > 0) {
      console.error(found.map((p) => `  - ${p}`).join("\n"));
      process.exit(1);
    }
    console.log(`public/ui-art/ holds the ${expected().length} copies, each a WebP of its size.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    for (const kind of ["icons", "frames", "medallions", "missions", "shop", "friends", "emblems", "play", "vault", "avatar", "ranking", "attack"] as const) {
      let before = 0;
      const after = new Map<number, number>();
      const images = IMAGES.filter((i) => i.kind === kind);
      for (const image of images) {
        const path = join(SOURCE, kind, `${image.name}.webp`);
        before += statSync(path).size;
        for (const size of image.frame.sizes) {
          const { width, height } = copySize(image.frame, size);
          mkdirSync(join(OUT, kind, String(size)), { recursive: true });
          const out = join(OUT, kind, String(size), `${image.name}.webp`);
          const args = ["-n", "10", "cwebp", "-quiet", "-metadata", "none", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-q", String(QUALITY[kind]), "-resize", String(width), String(height), path, "-o", out];
          execFileSync("nice", args, { stdio: "inherit" });
          after.set(size, (after.get(size) ?? 0) + statSync(out).size);
        }
      }
      console.log(`${kind}: masters ${kib(before)}; ${[...after].map(([size, total]) => `${size} px ${kib(total)}`).join(", ")} (${images.length})`);
    }
  }
}
