import { Icon } from "../ui/icon";
import { cn } from "../../lib/utils";

/** The social pages (#973, the Social page's tabs of #952 before): the chat (#955), the guild (#953), the friends (#954). */
export type SocialPage = "chat" | "guild" | "friends";

/** Each page's icon and its empty state: what a guest sees, with how it starts. */
export const SOCIAL_EMPTY: Readonly<Record<SocialPage, { icon: string; title: string; text: string }>> = {
  chat: { icon: "comments", title: "No messages yet", text: "Talk with the World, your guild, or a friend in private." },
  guild: { icon: "shield-halved", title: "No guild yet", text: "Connect to create a guild, or to join one." },
  friends: { icon: "user-group", title: "No friends yet", text: "Follow players you meet: when they follow you back, you are friends." },
};

/** A social page's empty state (#952): its icon, what will be there, and how it starts. */
export function SocialEmpty({ page, className }: { page: SocialPage; className?: string }) {
  const { icon, title, text } = SOCIAL_EMPTY[page];
  return (
    <div data-slot="social-empty" className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center", className)}>
      <Icon name={icon} size="lg" className="text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** A social page's word when its source is not on the network (the mock serves them all). */
export function SocialUnavailable({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
