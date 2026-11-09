Follows [`profile.webp`](../profile.webp), 2026-11-05.

GUILD-PAGE (2026-11-05), after the Paved UX Book's "Run my guild" (`guild`, `guild-announcements`, `guild-requests`, `guild-log`),
in the house style of the profile, the Missions, the League and the Shop (the owner's ask of the same day, after a first pass too
close to the book's gold): the Guild (`/guild`) is the HUD's drawer as the Shop, the dock's other page: a full page with Back on a
phone, from `tablet` a side panel docked at the right (the book's tablet and desktop draw a centred window, which the Shop's rule
docks at the right). The identity on the drawer's face, as the profile's: the guild's emblem; its name in the profile's name's
weight and the menu ("…") a small raised square beside it, as the profile's Edit name; the tag under it; the player's rank in a
carved pill in the medal's gold (the Leader's crown, the Officer's star, the Member's bust: the HUD's painted user, the owner's ask
of an icon for each rank). Then the profile's carved band of figures parted by the
drawer's rules: Members ("9/50"), Score (the painted crown, the sum of the crowns), Join (Open, Request, Invite only: "Request", the
owner's word, in place of "By request"). Then the
description folded to two lines, and at its right Chat, a raised tile as the profile's actions (the HUD's chat icon over its word),
the dock's red count on it for the guild chat's unread messages (the chat's overview). The tabs are the Shop's (the book's words, the
current one underlined in gold), the dock's red count on Announcements (unread) and Requests (waiting). Each list is the battle logs'
carved list, a rule between its rows. Members: each portrait in the rim of the member's league with its crest, the name, the rank's
carved pill, the painted crown and the crowns; the player's own row on a discreet wash of the primary gold, no ring (the owner's
ask), with a "You" tag as the Hall of Fame's "Now". Announcements: the newest pinned, on the same wash under the book's pin; an
officer's raised Post (the book's pencil); Edit and Delete two small raised squares on what the viewer may change. Requests (officers
and the leader): under the drawer's engraved title and its count, each request's portrait, name, level and crowns and message, a
raised Accept (its check in the success green) and Decline; then "Invitations sent", each invitation's player and when it lapses in a
carved pill. Log: newest first, each line under the book's painted icon (joined: its door; promoted: the star; removed: its member
with a red minus; posted: the speech bubble, the HUD's Chat), the HUD's crown, user, gear and banners for a new leader, a demotion,
the settings and the founding, the menu's Leave door for a member who left; "Show all 42" the battle logs' "Show more" button. The menu
and what it opens are views in the drawer, never sheets over it (the owner's ask of the same day: the navigation stays in the side
sheets, Back goes back, the red cross or a tap on the village leaves): the menu's view, titled "Guild menu" on the drawer's header,
holds raised rows, each a painted icon, its words outlined and the chevron of a view (Invite a player, Guild settings, Find guilds),
Leave or Disband apart in the destructive colour, dimmed with why when refused; each of those opens its view in turn (the player
search, the settings' form, the guild search), Back one view back. A member's row tapped opens their profile, FRIENDS-PAGE's drawer over the
guild's (the owner's ask of the same day: straight to it, no view between), the rank's actions its tiles (Promote, Demote, Leader,
Kick, named by the rank they give: "Promote to Veteran"); one's own row, one's own profile. The views slide in from the right and back from the left, as the Shop's theme's. On a phone a view's header has the red cross at its end
besides Back (`HudDrawer`, every drawer's views: the Shop's theme's too), so one press leaves. The icons of Invite a player, Find
guilds, Leave, Disband, Promote and Demote (the log's promotions and demotions) were drawn by the Codex CLI's image tool, in the HUD icons' style
(`scripts/compress-ui-art.ts`). Kept as they were: the finder for a player in no guild, the confirmations (Leave, Disband, a rank's
action), another guild in its sheet (`?guild=`, the
same identity and figures), the link to the chat, the profiles (the home's host, over the drawer). Removed from the page, the book
drawing none: a member row's level and last seen (on their profile, a tap away), the menu's sheets (their descriptions are the
views' first lines, the menu's guild name is the page's), the member header's requirements (a visitor's keeps them), a request's age, the tabs' icons. Gaps
from the book: the house's greys, raised and carved surfaces and the medal's gold in place of the book's blue panels, gold rows and
gold buttons (as Profile, Missions, League and Shop); the guild's own emblem in place of the book's banners (the emblem is the
guild's, its settings choose it); the score, members and join type on the profile's band, not the book's corner of the card; a
request's crowns beside its level, not in a column (no room for the name on a phone, and the drawer keeps the phone's layout at
every width); an invitation sent has no Cancel (the guild source cannot take one back), when it lapses in its place; Post above the
list, not in the tabs' row (no room on a phone); the times as the formatter writes them ("2h ago", the book's "2 h"); the log's lines
in the app's words; 44 px targets; the settings' form keeps the app's fields and its gold Save (shared with Create a guild). The pencil,
the door and the removed member were first cut from the book's pixels, then redrawn the same day by the Codex CLI's image tool from
those crops, in the HUD icons' style (the pinned announcement's pin is the chat's, CHAT-PAGE's, the same drawing) (`scripts/compress-ui-art.ts`). The guilds' emblems bear twenty-four charges drawn by
Codex in place of twelve Font Awesome icons (the owner's asks of the same day: original ones; flat silhouettes, no detail but their
cut-outs, so their colour is chosen; four rows of six): the first twelve keep the subjects they replace (hammer, crossed swords,
crown, tree, star, castle, tower, cogwheel, trophy, eye, flag, flame), so a guild's emblem keeps its meaning; twelve are new (lantern,
windmill, anchor, thistle, wolf, key, mountain, wheat, pickaxe, bridge, horseshoe, owl). The charge is tinted in a third colour of the
emblem (`charge`, optional), edged in the shield's dark rim. Eighteen colours, three rows of six (the metals and greys, the reds and
purples, the greens and blues): the first eight those of #953, Silver (the charge's colour before, its default), then Coal, Crimson,
Coral, Rose, Plum, Violet, Lime, Forest and Teal (Rose, Plum, Violet and Teal outside the palettes). Game-core: `GUILD_EMBLEM_ICONS`
24, `GUILD_EMBLEM_COLOURS` 18, `GUILD_EMBLEM_SILVER` (`elements/emblem-art.ts`, `GUILD_EMBLEM_PALETTE` for the picker's order).
Five ranks in place of three (the owner's choice of the same day): Recruit (who joins), Member (invites), Veteran (answers the
requests, posts announcements), Officer (kicks, once per 20 minutes, and promotes up to Veteran), Leader (the settings, the Officers'
ranks, Make leader, disband); a promotion or a demotion is one rank, to a rank under the actor's; the rotation takes the highest rank
who played. Each rank has its painted icon (the Recruit's sprout and the Veteran's medal by Codex; the HUD's bust, star and crown);
the log says the new rank. The settings and Create a guild (a view in the drawer too, no more a sheet) and the finder in the drawer's
style: the engraved titles in the display font, carved panels and fields, the charges and colours six to a row, the join types raised
tiles under Codex's open padlock and sealed letter and the HUD's padlock, Save a raised button; the finder's invitations, request and
lists on carved panels, the search carved under Codex's magnifier, Suggested and Ranking the Shop's word tabs, each card a row of the
carved list with the painted busts, crown and join type, its place in the medal's gold for the first three.
