Follows [`profile.webp`](../profile.webp), 2026-11-05.

MATCH-PAGE (2026-11-05), after the Paved UX Book's "Battle log" (a match, `/pvp/match/:id`, which a battle log row opens), the
owner's decisions of the same day, each step shown to the owner as screenshots at 375, 320 and 1440 px: no split (the board's
renderer draws one board a WebGL context, so the book's draggable split of the rival's village and the player's attack is set
aside); a full-screen page at every width, not the League's drawer, under the pages' header (`TopBar`) titled "Battle log" with
Back up to the League; on a phone the page fills the screen, from `tablet` its panels are centred at 42 rem. The one board in a
framed panel, the book's blue rim and glow (`match-frame`, `--match-rim`), its pan and zoom the board's own, its voids kept (the
rival's village red, the player's attack blue; in a defence the player's village green, the rival's attack red). The two views
are two tabs at the board's top corners, the book's own labels, "Rival" and "Your attack" (the owner's choice B among the house's
segmented bar and these: the labels bare on the board, the active one lit and underlined in gold); a defence's, "You" and "Rival"
(the owner's choice among three; the book draws only an attack). The flick across the board still switches. The book's three
gold stars over the board's foot (the earned ones gold, the others greyed), then the caption in the panel, "Attack · Wren of
Hollowmere · 4,037 · [crown] +30" (the name cut with an ellipsis at 320 px). Under it the replay's panel: the book's round gold
Play (Pause while it plays), then the moves' timeline centred on it, in the Missions' Daily and Weekly look (the owner's ask of the
same day: their painted steel rail, its gold up to the move shown, gold orbs passed and dark beads ahead, the move shown a bigger
glowing orb; as many dots as the width holds, at most the book's twelve, evenly spread; a Radix slider: drag, tap or the arrow
keys), "Move" over "14 / 23" at its right end (the owner's ask: the book has it under the bar). Play
or the timeline from the village's tab shows the build; the village's tab pauses the replay. No previous or next step buttons and
no live score (the book has neither; the timeline's keys step one move). Gaps from the book: no split; the stars and the caption
stay on both tabs (they are the match's); no blurred village behind the panels (the page's own background). The gold Play and
the star are the book's own pixels (Codex's built-in image tool was still unavailable: its `imagegen` skill offered only a CLI on
the OpenAI API), Play keyed out of its navy panel, the star cut from the result screen's glow from its face outward, each checked
side by side with its crop; Pause, which the book does not draw, derived from Play (its triangle erased, two bars painted in its
colours) (`scripts/compress-ui-art.ts`).
