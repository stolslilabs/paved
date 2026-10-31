import { CHAT_MESSAGE_MAX, CHAT_WORLD_INTERVAL_S, WORLD_CONVERSATION, guildConversation, guildTag, privateConversation } from "@paved/game-core";
import type { ChatConversationProps } from "../components/containers/chat-conversation";
import type { ChatListProps } from "../components/containers/chat-list";
import { community, communityProfile } from "../data/mock/community";
import type { ChatAuthor, ChatMessage, ChatOverview, ChatPageHead, ConversationSummary, GuildLogEntry, PublicProfile } from "../data/social-source";
import { DAY, HOUR, MOCK_NOW, MOCK_TIME_ZONE } from "./clock";
import { GUILD_BADGE } from "./guilds";
import { generatedLook } from "./avatar";
import { LONG_ADDRESS, LONG_NAME, LONG_WORD } from "./stress";

// The messages' mocks (#955): players of the mock community writing in the World, in the Quarrymen's conversation (its
// announcement pinned, its log's lines among the messages) and in private, set against `MOCK_NOW`; the states of the Chat tab
// and of a conversation.

/** The connected player of the stories. */
export const CHAT_ME = "0x5eed00c0ffee";

/** The community's member at `index`, seen `ago` seconds before `MOCK_NOW`. */
const member = (index: number, ago = 60): PublicProfile => ({ ...communityProfile(community()[index]!.address, MOCK_NOW)!, lastSeen: MOCK_NOW - ago });
const authorOf = (p: PublicProfile, guild: string | null = null): ChatAuthor => ({ address: p.address, name: p.name, look: p.look, level: Math.max(2, p.level), guildTag: guild });
const ME_AUTHOR: ChatAuthor = { address: CHAT_ME, name: "builder_ada", look: generatedLook(CHAT_ME), level: 7, guildTag: GUILD_BADGE.member.tag };

let serial = 0;
/** A message of `author` in `conversation`, `ago` seconds before `MOCK_NOW`. */
function msg(conversation: string, author: ChatAuthor, ago: number, text: string, over: Partial<ChatMessage> = {}): ChatMessage {
  const mine = author.address === CHAT_ME;
  return { id: `m${++serial}`, conversation, kind: "message", author, text, at: MOCK_NOW - ago, deleted: false, event: null, mine, mayDelete: mine, mayReport: !mine, ...over };
}
/** An event of the guild's log, as a line of its conversation. */
function event(conversation: string, entry: Omit<GuildLogEntry, "at" | "reason"> & { reason?: string | null }, ago: number): ChatMessage {
  return { id: `e${++serial}`, conversation, kind: "event", author: null, text: "", at: MOCK_NOW - ago, deleted: false, event: { reason: null, ...entry, at: MOCK_NOW - ago }, mine: false, mayDelete: false, mayReport: false };
}

const P = [member(3), member(11), member(7), member(26), member(15), member(18), member(22), member(9), member(1), member(29)];
const GUILD = GUILD_BADGE.member;
const GUILD_ID = guildConversation(GUILD.id);
const tag = (i: number) => (i % 3 === 0 ? GUILD.tag : i % 3 === 1 ? guildTag(41) : null);

/** The World: the community's lines, a link and an address kept as plain text, one of the player's own. */
const WORLD_MESSAGES: ChatMessage[] = [
  msg(WORLD_CONVERSATION, authorOf(P[0]!, tag(0)), 40 * 60, "Morning, builders. Who else is up before the carts?"),
  msg(WORLD_CONVERSATION, authorOf(P[1]!, tag(1)), 32 * 60, "Finally closed that long road around the lake. Worth every tile."),
  msg(WORLD_CONVERSATION, authorOf(P[2]!, tag(2)), 25 * 60, "Free cobbles at paved-gifts.example/claim, just connect your wallet!"),
  msg(WORLD_CONVERSATION, authorOf(P[3]!, tag(3)), 21 * 60, "Don't click that. Paved never asks for your key."),
  msg(WORLD_CONVERSATION, ME_AUTHOR, 18 * 60, "Thanks. Reported it."),
  msg(WORLD_CONVERSATION, authorOf(P[4]!, tag(4)), 12 * 60, "My village is 0x04a3…91fe if anyone wants a friendly look."),
  msg(WORLD_CONVERSATION, authorOf(P[5]!, tag(5)), 8 * 60, "Is the Challenge harder this week or is it just me?"),
  msg(WORLD_CONVERSATION, authorOf(P[6]!, tag(6)), 5 * 60, "", { deleted: true, mayReport: false }),
  msg(WORLD_CONVERSATION, authorOf(P[7]!, tag(7)), 2 * 60, "Three stars on a Silver village with a city still open. Lucky draw. 🎉"),
  msg(WORLD_CONVERSATION, authorOf(P[8]!, tag(8)), 30, "Fields first, roads later. That's the whole secret."),
];

/** The Quarrymen's conversation, as an Officer reads it: the members' messages and the log's lines among them. */
const guildAuthor = (i: number) => authorOf(P[i]!, GUILD.tag);
const GUILD_MESSAGES: ChatMessage[] = [
  event(GUILD_ID, { kind: "joined", actor: P[5]!.address, actorName: P[5]!.name, target: null, targetName: null }, 3 * HOUR),
  msg(GUILD_ID, guildAuthor(0), 2 * HOUR + 50 * 60, "Welcome! Read the announcement up top, and say hi."),
  msg(GUILD_ID, guildAuthor(5), 2 * HOUR + 45 * 60, "Hi all, glad to be here."),
  event(GUILD_ID, { kind: "promoted", actor: P[0]!.address, actorName: P[0]!.name, target: P[1]!.address, targetName: P[1]!.name }, 2 * HOUR),
  msg(GUILD_ID, guildAuthor(1), HOUR + 40 * 60, "Thanks for the trust. I'll keep the requests moving."),
  event(GUILD_ID, { kind: "kicked", actor: P[1]!.address, actorName: P[1]!.name, target: P[9]!.address, targetName: P[9]!.name, reason: "Inactive for a month" }, HOUR),
  msg(GUILD_ID, guildAuthor(2), 40 * 60, "Who's up for raiding together tonight?"),
  msg(GUILD_ID, ME_AUTHOR, 30 * 60, "Me! After dinner."),
  event(GUILD_ID, { kind: "left", actor: P[6]!.address, actorName: P[6]!.name, target: null, targetName: null }, 20 * 60),
  msg(GUILD_ID, guildAuthor(3), 10 * 60, "Spam spam spam ••• spam", { mayDelete: true }),
  msg(GUILD_ID, guildAuthor(4), 4 * 60, "Ignore that one, an officer will tidy it up.", { mayDelete: true }),
];

const FRIEND = member(3, 40);
const STRANGER = member(33, 120);
const DM_FRIEND = privateConversation(CHAT_ME, FRIEND.address);
const DM_STRANGER = privateConversation(CHAT_ME, STRANGER.address);
const FRIEND_AUTHOR = authorOf(FRIEND, GUILD.tag);
const STRANGER_AUTHOR = authorOf(STRANGER);

const PRIVATE_MESSAGES: ChatMessage[] = [
  msg(DM_FRIEND, FRIEND_AUTHOR, DAY + 2 * HOUR, "Hey, nice raid yesterday."),
  msg(DM_FRIEND, ME_AUTHOR, DAY + HOUR, "Thanks! Your walls were tough."),
  msg(DM_FRIEND, FRIEND_AUTHOR, 15 * 60, "Want to join the Quarrymen? We have room."),
  msg(DM_FRIEND, ME_AUTHOR, 12 * 60, "", { deleted: true, mayDelete: false }),
  msg(DM_FRIEND, ME_AUTHOR, 11 * 60, "Sure, send me an invitation."),
];
const REQUEST_MESSAGES: ChatMessage[] = [msg(DM_STRANGER, STRANGER_AUTHOR, 5 * 60, "Hi! Saw you in the World. Want to trade tips on the Challenge?")];

const summary = (s: Partial<ConversationSummary> & Pick<ConversationSummary, "id" | "kind">): ConversationSummary => ({ guild: null, other: null, last: null, unread: 0, ...s });
const WORLD = summary({ id: WORLD_CONVERSATION, kind: "world", last: WORLD_MESSAGES.at(-1)!, unread: 14 });
const GUILD_SUMMARY = summary({ id: GUILD_ID, kind: "guild", guild: GUILD, last: GUILD_MESSAGES.at(-1)!, unread: 3 });
const FRIEND_SUMMARY = summary({ id: DM_FRIEND, kind: "private", other: FRIEND, last: PRIVATE_MESSAGES.at(-1)!, unread: 0 });
const OTHER_DMS = [member(11, HOUR), member(7, 3 * HOUR)].map((p, i) =>
  summary({ id: privateConversation(CHAT_ME, p.address), kind: "private", other: p, last: msg(privateConversation(CHAT_ME, p.address), authorOf(p), (i + 1) * 3 * HOUR, i === 0 ? "gg! rematch tomorrow?" : "Thanks for the follow."), unread: i === 0 ? 2 : 0 }),
);
const REQUEST = summary({ id: DM_STRANGER, kind: "private", other: STRANGER, last: REQUEST_MESSAGES[0]!, unread: 1 });

const overview = (o: Partial<ChatOverview>): ChatOverview => ({ conversations: [WORLD, GUILD_SUMMARY, FRIEND_SUMMARY, ...OTHER_DMS], requests: [], badge: 5, noticeSeen: true, ...o });

/** WRAP360: the longest name and address, the largest counts, a message at the limit of one long word. */
const STRESS_PROFILE: PublicProfile = { address: LONG_ADDRESS, name: LONG_NAME, look: generatedLook(LONG_ADDRESS), level: 20, crowns: 5_320, league: 22, score: 123_456_789, lastSeen: MOCK_NOW - 400 * DAY };
const STRESS_NONAME: PublicProfile = { ...STRESS_PROFILE, address: `${LONG_ADDRESS.slice(0, -1)}9`, name: null };
const STRESS_AUTHOR: ChatAuthor = { address: LONG_ADDRESS, name: LONG_NAME, look: STRESS_PROFILE.look, level: 1_000, guildTag: GUILD_BADGE.stress.tag };
const STRESS_TEXT = `${LONG_WORD}${LONG_WORD}${LONG_WORD}${LONG_WORD}`.slice(0, CHAT_MESSAGE_MAX);

type ListData = Omit<ChatListProps, "onOpen" | "onRetry" | "onUnmute" | "onOpenPlayer">;
const list = (l: Partial<ListData>): ListData => ({ overview: overview({}), now: MOCK_NOW, mutes: [], ...l });

/** The Chat tab's states (#955). */
export const CHAT_LIST = {
  /** The World, the guild, then the private conversations by their last message, each with its unread count. */
  conversations: list({}),
  /** A player in no guild with no private conversation yet: the World alone. */
  guildless: list({ overview: overview({ conversations: [{ ...WORLD, unread: 0 }], badge: 0 }) }),
  /** A stranger's request, waiting above the conversations. */
  request: list({ overview: overview({ requests: [REQUEST], badge: 6 }) }),
  /** The tab's menu: a muted player, with Unmute. */
  muted: list({ mutes: [P[2]!], initialMutedOpen: true }),
  /** The menu with no one muted. */
  noneMuted: list({ initialMutedOpen: true }),
  loading: list({ overview: null, mutes: null }),
  failed: list({ overview: null, error: "The chat did not answer: try again in a moment." }),
  /** WRAP360: the longest names and addresses, three-digit counts, a long last line. */
  stress: list({
    overview: overview({
      conversations: [
        { ...WORLD, unread: 1_234 },
        { ...GUILD_SUMMARY, guild: GUILD_BADGE.stress, unread: 999, last: msg(GUILD_ID, STRESS_AUTHOR, 30, STRESS_TEXT) },
        summary({ id: privateConversation(CHAT_ME, LONG_ADDRESS), kind: "private", other: STRESS_PROFILE, last: msg("dm", STRESS_AUTHOR, 400 * DAY, STRESS_TEXT), unread: 150 }),
        summary({ id: privateConversation(CHAT_ME, STRESS_NONAME.address), kind: "private", other: STRESS_NONAME, last: null }),
      ],
      requests: Array.from({ length: 3 }, (_, i) => ({ ...REQUEST, id: `${REQUEST.id}${i}`, other: i === 0 ? STRESS_PROFILE : STRESS_NONAME, unread: 120 })),
      badge: 1_500,
    }),
    mutes: [STRESS_PROFILE, STRESS_NONAME],
  }),
} satisfies Record<string, ListData>;

const head = (conversation: ConversationSummary, over: Partial<ChatPageHead> = {}): ChatPageHead => ({ conversation, pinned: null, standing: null, awaitsReply: false, writeRefusal: null, nextSendAt: MOCK_NOW, ...over });
const ANNOUNCEMENT = { id: 7, author: P[0]!.address, authorName: P[0]!.name, text: "Raid night is Thursday, 20:00 UTC. Officers: please answer the requests within a day. Be kind in the chat.", at: MOCK_NOW - 2 * DAY, editedAt: null };

type ConversationData = Omit<ChatConversationProps, "onBack" | "onSend" | "onAction" | "onAnswer" | "onOpenPlayer" | "onOpenTitle" | "onLoadOlder" | "onRetry" | "onSeeNotice">;
const conversation = (c: Partial<ConversationData> & Pick<ConversationData, "head" | "messages">): ConversationData => ({ now: MOCK_NOW, timeZone: MOCK_TIME_ZONE, hasOlder: false, noticeSeen: true, ...c });

/** A conversation's states (#955). */
export const CHAT_CONVERSATION = {
  /** The World: a guild's tag beside each name; a link and an address kept as plain text; a deleted message. */
  world: conversation({ head: head(WORLD), messages: WORLD_MESSAGES, hasOlder: true }),
  /** Below level 2: the World is read, not written. */
  worldLevelLow: conversation({ head: head(WORLD, { writeRefusal: "level-low" }), messages: WORLD_MESSAGES }),
  /** The rate limit: the player just wrote in the World; Send counts down the 5 seconds. */
  rateLimited: conversation({ head: head(WORLD, { nextSendAt: MOCK_NOW + CHAT_WORLD_INTERVAL_S }), messages: [...WORLD_MESSAGES, msg(WORLD_CONVERSATION, ME_AUTHOR, 0, "Good luck in the league today!")], initialDraft: "And one more" }),
  /** The guild: its announcement pinned, the log's joins, promotions, kicks and leaves among the messages; an Officer may delete. */
  guild: conversation({ head: head(GUILD_SUMMARY, { pinned: ANNOUNCEMENT }), messages: GUILD_MESSAGES }),
  /** A private conversation with a friend; the first one shows the notice. */
  private: conversation({ head: head(FRIEND_SUMMARY, { standing: "open" }), messages: PRIVATE_MESSAGES, noticeSeen: false }),
  /** A stranger's request: Accept or Decline; replying accepts it too. */
  request: conversation({ head: head(REQUEST, { standing: "request" }), messages: REQUEST_MESSAGES }),
  /** The player's own request to a stranger, waiting in their Requests. */
  awaitingReply: conversation({ head: head(summary({ id: DM_STRANGER, kind: "private", other: STRANGER }), { standing: "open", awaitsReply: true }), messages: [msg(DM_STRANGER, ME_AUTHOR, 60, "Hello! Fancy a friendly raid?")] }),
  /** A player who blocks the viewer, or declined their request: only "not available". */
  unavailable: conversation({ head: head(summary({ id: DM_STRANGER, kind: "private", other: STRANGER }), { standing: "none", writeRefusal: "blocked" }), messages: [] }),
  /** The report dialog open on a scam. */
  report: conversation({ head: head(WORLD), messages: WORLD_MESSAGES, initialReport: WORLD_MESSAGES[2]!.id }),
  /** An empty conversation: a friend with no message yet. */
  empty: conversation({ head: head(summary({ id: DM_FRIEND, kind: "private", other: FRIEND }), { standing: "open" }), messages: [] }),
  loading: conversation({ head: undefined, messages: [] }),
  failed: conversation({ head: undefined, messages: [], error: "The chat did not answer: try again in a moment." }),
  /** WRAP360: the longest name and address, the guild's longest tag, a message of 200 characters in one word, a long announcement. */
  stress: conversation({
    head: head({ ...GUILD_SUMMARY, guild: GUILD_BADGE.stress }, { pinned: { ...ANNOUNCEMENT, authorName: LONG_NAME, text: STRESS_TEXT.repeat(3) } }),
    messages: [
      msg(GUILD_ID, STRESS_AUTHOR, 400 * DAY, STRESS_TEXT),
      msg(GUILD_ID, { ...STRESS_AUTHOR, address: STRESS_NONAME.address, name: null }, 3 * DAY, `${LONG_ADDRESS} ${STRESS_TEXT}`.slice(0, CHAT_MESSAGE_MAX)),
      event(GUILD_ID, { kind: "kicked", actor: LONG_ADDRESS, actorName: LONG_NAME, target: STRESS_NONAME.address, targetName: LONG_NAME, reason: LONG_WORD }, DAY),
      msg(GUILD_ID, ME_AUTHOR, 60, STRESS_TEXT),
    ],
    initialDraft: STRESS_TEXT + "!",
  }),
} satisfies Record<string, ConversationData>;
