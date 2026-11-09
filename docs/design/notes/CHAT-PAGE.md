Follows [`profile.webp`](../profile.webp), 2026-11-05.

CHAT-PAGE (2026-11-05), after the Paved UX Book's Chat ("chat-world", "chat", "chat-private": every avatar in its league's rim,
with the level and the guild's tag), the Missions' method: the chat (`/chat`, `/chat/<tab>`, `/chat/private/<player>`) is the
HUD's drawer (`PageDef.drawer`), a full page with Back on a phone, from `tablet` a side panel docked at the left beside the home's
Chat tab that opens it (the book draws a centred window: the League's rule decides), its red cross at its header's right end after
the page's menu (the muted players). The book's three tabs as words, the current one lit and underlined in gold (the Shop's),
their counts in the book's red squares. The World's and the guild's conversation in one carved panel as tall as the drawer leaves
it (and above a phone's keyboard, as before): each author in the rim of their league with its crest (`LeaguePortrait`, beside
`PlayerRim` in `containers/league-control.tsx`: the League's battle logs' portrait, now shared), their name, their level in the
profile's blue star (`elements/level-star.tsx`, the level bar's star; the owner's ask: no "Lv" chip) and the time over the text in
a soft flat slate bubble (the owner's ask of the same day: softer than the drawer's raised plates); the player's own at the right
in a faint gold (the owner's ask: the book's full gold too strong) with its tail; no rule between the messages of one day, a rule
with the day ("Today", "Oct 13") where the day changes (the owner's ask); each message's menu (Profile, Mute, Report) a quiet "…"
beside its bubble, with no Delete (the owner's ask: a message is published on the ledger, and deleting it would be one more event
that leaves it readable; the source's `deleteMessage` stays, unused by the page). The guild's pinned post above its panel on a
gold plate with the book's pin, two lines at most, a tap opening the guild's page where it is whole; with none, the guild's
emblem, name and tag, the same way to its page. The composer: the field and the book's gold Send with its paper plane. The chat's
gold buttons (Send, Accept, New message, Find a guild) raised as Decline is (the owner's ask: the gold lit along its top and
deeper at its foot, the near-black outline and lip; a style in the page's chunk, as the Shop's price). Private: one carved panel,
New message at its top right, the requests under their section title, each "Wants to chat" with the book's gold check and dark
cross (a request is accepted or declined from the list too), then the conversations on a raised card, each the other player in
their rim with their level's star, the last line in a bubble, its time and its unread count in a red square; a conversation opens
over the list, headed by Back and the other player in their rim with their level's star. No guild's tag beside a level (the
owner's ask of the same day: the name opens the profile, which has it). Data: a message's author carries their league
(`ChatAuthor.league`), the mock filling it from the profiles. Gaps from the book: the side panel in place of its centred window,
and the house's greys and gold in place of its blue and navy (as every drawer); no guild's tag beside the names (the book's
"[HMW]"); the level in the house's blue star, not the book's "Lv" chip; the encryption line (#997) kept at the top of the World's
and the guild's panel, and in private the opening of an empty conversation, gone at its first message as the first conversation's
notice (the owner's ask); the message's menu kept; the draft's count shown past 80 % of the limit only (the book has none); a
private row's time on its last line (the name and its level keep the first); the private rows' times the conversations' clock
("16:49", the date past a day) in place of "11min ago". The Send's paper plane, the pin, the check and the cross are redrawn by
Codex's built-in image tool from their crops of the book (first cut from its pixels, the tool unavailable that morning), each
checked beside its crop and its cut on navy and on gold (`scripts/compress-ui-art.ts`).
