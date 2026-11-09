Follows [`profile.webp`](../profile.webp), 2026-11-08.

NO-ALLIANCES (2026-11-08, the owner's decision): alliances dropped, 2026-11-08; guilds stand alone, with no level above them
(their rules, mock, pages, the Ranking's tab and their paintings removed). In the same change the app names a guild an Allegiance
in what it shows (en-US, P-66): "Allegiance" and "Allegiances" for "Guild" and "Guilds", "allegiance" inside a sentence, "an
allegiance" for "a guild": the dock's and the Chat's tabs, the Ranking's tab and list, the page's title, its menu, finder, form,
refusals, confirmations, empty states and labels. The code, the routes (`/guild`, `?tab=guilds`), the data and the contracts keep
"guild". The Ranking's footer is Players, Allegiances, Friends. The dock's "Allegiance", too long at 12 px for a phone's column
(64 px of text, a 59 px column at 360 px), takes its size from its column (`min(0.75rem, 17cqw)`, the button an inline-size
container) where it would not fit, never truncated; from 390 px it is 12 px, as the other labels always are.
