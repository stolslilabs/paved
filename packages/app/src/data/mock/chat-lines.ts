// The mock's lines (#955, proposal 11): what the community's players write in the World, in their guilds and in private, hand
// written in the game's voice, and the word filter's list, which sits in the client on the mock (the service filters later,
// #956). The draws in `chat.ts` pick from them by index, so a line's place is part of the mock's seed: add at the end.

/** What the community writes in the World. */
export const WORLD_LINES: readonly string[] = [
  "Morning, builders. Who else is up before the carts?",
  "Finally closed that long road around the lake. Worth every tile.",
  "Anyone else get three monasteries in a row today?",
  "Tip: don't rush a city with a gap you can't fill. Ask me how I know.",
  "The daily layout is cruel. Two forks and no straight road.",
  "gg to whoever raided my village last night, that was clean",
  "My village finally hit a thousand. Taking the afternoon off.",
  "Is the Challenge harder this week or is it just me?",
  "Looking for an open guild, level 9, plays most evenings.",
  "Who keeps building farms next to my rivers?",
  "Shield's up, coffee's on. Good luck in the league today.",
  "Three stars on a Silver village with a city still open. Lucky draw.",
  "Fields first, roads later. That's the whole secret.",
  "Just pulled an epic chest. The quarry gods are kind.",
  "Wood league, I'm coming back for you. Some day.",
  "Does a wonder count for the weekly if the city stays open?",
  "The harbour road is a trap. Don't take the harbour road.",
  "Quiet day on the moors. Too quiet.",
  "Somebody built a cathedral in a forest. Respect.",
  "Crowns are up, morale is up, tea is up.",
  "Remember to claim your milestones before midnight UTC.",
  "New here. Is the tutorial's last village always this tight?",
  "Cobbles saved for the new skins. Patience, patience.",
  "My best Challenge score lasted four hours. Back to the drawing board.",
  "Anyone up for trading tips on defensive layouts?",
  "Lost a castle to a single missing corner. Classic.",
  "That feeling when the last tile is exactly the one you need.",
  "Good games today, everyone. See you on the roads.",
];

/** What a guild's members write in their guild's conversation. */
export const GUILD_LINES: readonly string[] = [
  "Evening all. Who's attacking tonight?",
  "Thanks for the tips on the city corners, it worked.",
  "Remember the announcement, shields up through the weekend.",
  "I'll take the Gold villages, someone grab the Silver ones.",
  "Back from the quarry with a new layout. Rate it?",
  "Nice three stars earlier, that was a clean run.",
  "Can an officer look at the requests? A few are waiting.",
  "Welcome to the new faces! Ask anything.",
  "Who's close to the next league? Let's push together.",
  "Dropping off for the night. Keep the roads safe.",
  "Our score passed another guild today. Keep it up.",
  "Anyone else stuck on the weekly with the long roads?",
  "I'll be away a couple of days, don't kick me!",
  "Village redone. Fewer gaps, more fields.",
  "That last raid on us was rough. Rebuilding.",
  "Good work today, team.",
];

/** What a community player answers in private, a few seconds after a message (open point 5's default). */
export const REPLY_LINES: readonly string[] = [
  "Hey! Good to hear from you.",
  "Ha, thanks. Your village looks solid too.",
  "Sure, happy to help. What's the question?",
  "On my way to the quarry, talk later!",
  "gg! That was a close one.",
  "Thanks, see you on the roads.",
  "Good luck in the league this week.",
  "Interesting idea, I'll think about it.",
];

/** What a stranger of the community writes to a player, the request the mock sends after the first visit. */
export const REQUEST_LINES: readonly string[] = [
  "Hi! Saw your village on the board, nice layout. Fancy swapping tips?",
  "Hello, are you looking for a guild? We have room.",
  "Hey, good attack earlier. How did you close that city?",
];

/**
 * The word filter's list on the mock: each listed word, as a whole word and whatever its case, becomes "•••" (game-core's
 * `filterWords`). Kept short: the service's list replaces it (#956).
 */
export const CHAT_FILTER_WORDS: readonly string[] = [
  "fuck",
  "fucking",
  "fucker",
  "shit",
  "shitty",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cunt",
  "wanker",
  "twat",
  "slut",
  "whore",
  "retard",
  "motherfucker",
];
