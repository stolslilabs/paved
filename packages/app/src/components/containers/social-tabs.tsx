import { Icon } from "../ui/icon";
import { cn } from "../../lib/utils";

/** The Social page's tabs (#952), left to right: the guilds (#953), the follows and friends (#954), the messages (#955). */
export type SocialTab = "guild" | "friends" | "chat";

/** What waits in each tab, counted by its issue: the guild's requests and invitations, new followers, unread messages. */
export type SocialBadges = Readonly<Record<SocialTab, number>>;

/** Nothing waits: the counts until #953 to #955 give theirs. */
export const NO_SOCIAL_BADGES: SocialBadges = { guild: 0, friends: 0, chat: 0 };

/** The Social button's count on the home (#952): the three tabs' badges together. */
export const socialTotal = (badges: SocialBadges): number => badges.guild + badges.friends + badges.chat;

/** Each tab: its label, its icon, and its empty state until its issue fills it. */
export const SOCIAL_TABS: readonly { id: SocialTab; label: string; icon: string; empty: { title: string; text: string } }[] = [
  { id: "guild", label: "Guild", icon: "shield-halved", empty: { title: "No guild yet", text: "Connect to create a guild, or to join one." } },
  { id: "friends", label: "Friends", icon: "user-group", empty: { title: "No friends yet", text: "Follow players you meet: when they follow you back, you are friends." } },
  { id: "chat", label: "Chat", icon: "comments", empty: { title: "No messages yet", text: "Talk with the World, your guild, or a friend in private." } },
];

/** A stored or typed value, as one of the tabs; anything else: none. */
export const socialTabOf = (value: string | null | undefined): SocialTab | null => SOCIAL_TABS.find((t) => t.id === value)?.id ?? null;

/** A tab's empty state (#952): its icon, what will be there, and how it starts. Each issue replaces its tab's. */
export function SocialEmptyTab({ tab, className }: { tab: SocialTab; className?: string }) {
  const { icon, empty } = SOCIAL_TABS.find((t) => t.id === tab)!;
  return (
    <div data-slot="social-empty" className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center", className)}>
      <Icon name={icon} size="lg" className="text-muted-foreground" />
      <p className="font-semibold">{empty.title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{empty.text}</p>
    </div>
  );
}
