import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatConversation, type ChatConversationProps } from "../src/components/containers/chat-conversation";
import { ChatList } from "../src/components/containers/chat-list";
import { ChatMenu } from "../src/components/containers/chat-menu";
import { ChatNewMessage } from "../src/components/containers/chat-new-message";
import { ChatTabs } from "../src/components/containers/chat-tabs";
import { chatBadges } from "../src/routes/social/chat-content";
import { ChatRefusedError, type ChatMessage } from "../src/data/social-source";
import { CHAT_BADGES, CHAT_CONVERSATION, CHAT_LIST, CHAT_MENU, CHAT_NEW_MESSAGE } from "../src/mocks/chat";

// The messages' views (#955): the list's rows and requests, a conversation's menus, refusals and request, links kept as plain
// text, the rate limit's countdown, and the reading place (older pages keep it, a new message while reading older ones shows
// the "New messages" pill).

const wrap = (ui: ReactNode, reduced: "always" | "never" = "always") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);

/** Gives the messages' box a scroll geometry jsdom lacks: `content` px of content in a `view` px window. */
function geometry(el: HTMLElement, sizes: { content: number; view: number }) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => sizes.content });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => sizes.view });
}

describe("the chat page's Private tab (#973)", () => {
  it("lists the private conversations with their unread counts, then the requests, and New message", async () => {
    const onOpen = vi.fn();
    const onNewMessage = vi.fn();
    render(wrap(<ChatList {...CHAT_LIST.request} onOpen={onOpen} onNewMessage={onNewMessage} />));
    const rows = within(screen.getByRole("region", { name: "Conversations" })).getAllByRole("button");
    // The World and the guild have their own tabs: only the three private conversations here.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("aria-label"))).not.toContain("World, 14 unread");
    expect(rows[1]!.getAttribute("aria-label")).toMatch(/, 2 unread$/);
    const requests = screen.getByRole("region", { name: "Requests" });
    expect(within(requests).getAllByRole("button")).toHaveLength(1);
    // The requests come after the conversations.
    expect(rows[0]!.compareDocumentPosition(requests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith(CHAT_LIST.request.overview!.conversations[2]!.id);
    await userEvent.click(screen.getByRole("button", { name: "New message" }));
    expect(onNewMessage).toHaveBeenCalled();
  });

  it("says when there is no private conversation yet", () => {
    render(wrap(<ChatList {...CHAT_LIST.guildless} />));
    expect(screen.getByText(/No private messages yet/)).toBeInTheDocument();
  });
});

describe("the chat page's menu (#973)", () => {
  it("lists the muted players, each with Unmute", async () => {
    const onUnmute = vi.fn(async () => {});
    render(wrap(<ChatMenu {...CHAT_MENU.muted} onUnmute={onUnmute} />));
    const sheet = await screen.findByRole("dialog", { name: "Muted players" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Unmute / }));
    expect(onUnmute).toHaveBeenCalledWith(CHAT_MENU.muted.mutes[0]!.address);
  });
});

describe("New message (#973)", () => {
  it("lists the friends, then the guildmates who are not friends, then the search; a pick closes it and opens the conversation", async () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    const data = CHAT_NEW_MESSAGE.contacts;
    render(wrap(<ChatNewMessage {...data} open onOpenChange={onOpenChange} onPick={onPick} />));
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    const friends = within(within(sheet).getByRole("region", { name: "Friends" })).getAllByRole("button");
    const mates = within(within(sheet).getByRole("region", { name: "Guildmates" })).getAllByRole("button");
    expect(friends).toHaveLength(data.friends.length);
    // The first guildmate is a friend too: listed once, among the friends.
    expect(mates).toHaveLength(data.guildmates.length - 1);
    expect(within(sheet).getByRole("searchbox", { name: "Name or player ID" })).toBeInTheDocument();
    expect(friends[0]!.compareDocumentPosition(mates[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(mates[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPick).toHaveBeenCalledWith(data.guildmates[1]!.address);
  });

  it("has no guildmates' list for a player in no guild, and picks a player found", async () => {
    const onPick = vi.fn();
    const data = CHAT_NEW_MESSAGE.searching;
    render(wrap(<ChatNewMessage {...data} open onOpenChange={vi.fn()} onPick={onPick} />));
    const sheet = await screen.findByRole("dialog", { name: "New message" });
    expect(within(sheet).queryByRole("region", { name: "Guildmates" })).toBeNull();
    const found = within(within(sheet).getByRole("list", { name: "Players found" })).getAllByRole("button");
    await userEvent.click(found[0]!);
    expect(onPick).toHaveBeenCalledWith(data.search.results[0]!.address);
  });
});

describe("the chat page's tabs (#973)", () => {
  it("shows World, Guild and Private, Guild and Private with their badges, the World none", async () => {
    const onTabChange = vi.fn();
    render(
      wrap(
        <ChatTabs tab="world" badges={{ guild: 3, private: 120 }} onTabChange={onTabChange}>
          <p>world content</p>
        </ChatTabs>,
      ),
    );
    const tabs = within(screen.getByRole("tablist", { name: "Conversations" })).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["World", "Guild, 3 waiting", "Private, 120 waiting"]);
    expect(within(tabs[2]!).getByText("99+")).toBeInTheDocument();
    expect(screen.getByText("world content")).toBeInTheDocument();
    await userEvent.click(tabs[2]!);
    expect(onTabChange).toHaveBeenCalledWith("private");
  });

  it("counts the guild's unread on Guild, the private unread and the requests on Private", () => {
    expect(chatBadges(CHAT_LIST.request.overview!)).toEqual(CHAT_BADGES.request);
    expect(chatBadges(CHAT_LIST.conversations.overview!)).toEqual(CHAT_BADGES.conversations);
    expect(chatBadges(CHAT_LIST.guildless.overview!)).toEqual(CHAT_BADGES.guildless);
    expect(chatBadges(undefined)).toEqual({ guild: 0, private: 0 });
  });
});

describe("a conversation (#955)", () => {
  const props = (over: Partial<ChatConversationProps> = {}): ChatConversationProps => ({ ...CHAT_CONVERSATION.world, onSend: vi.fn(async () => {}), onAction: vi.fn(async () => {}), ...over });

  it("keeps links and addresses as plain text, and shows a deleted message as such", () => {
    render(wrap(<ChatConversation {...props()} />));
    const log = screen.getByRole("log", { name: "Messages" });
    expect(within(log).getByText(/paved-gifts\.example\/claim/)).toBeInTheDocument();
    expect(within(log).getByText(/0x04a3c9d2e1f0b7a6958473625140f3e2d1c0b9a8f7e6d5c4b3a2918070605091fe/)).toBeInTheDocument();
    expect(log.querySelectorAll("a")).toHaveLength(0);
    expect(within(log).getByText("Message deleted")).toBeInTheDocument();
  });

  it("sends the trimmed text, counts the characters, and refuses over 200", async () => {
    const onSend = vi.fn(async () => {});
    render(wrap(<ChatConversation {...props({ onSend })} />));
    const field = screen.getByRole("textbox", { name: "Message World" });
    await userEvent.type(field, "  hello  {enter}");
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hello"));
    await waitFor(() => expect(field).toHaveValue(""));
    fireEvent.change(field, { target: { value: "x".repeat(201) } });
    expect(screen.getByText("201/200")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("says why a send is refused, and counts down a rate limit's wait", async () => {
    const now = CHAT_CONVERSATION.world.now;
    const onSend = vi.fn(async () => Promise.reject(new ChatRefusedError("too-fast", now + 4)));
    const { rerender } = render(wrap(<ChatConversation {...props({ onSend })} />));
    await userEvent.type(screen.getByRole("textbox", { name: "Message World" }), "again{enter}");
    expect(await screen.findByText("You are writing too fast: wait a moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send, in 4 s" })).toBeDisabled();
    rerender(wrap(<ChatConversation {...props({ onSend, now: now + 4 })} />));
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    // The level rule: no field, the reason.
    rerender(wrap(<ChatConversation {...CHAT_CONVERSATION.worldLevelLow} />));
    expect(screen.getByText("Writing in the World opens at level 2.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("lets an officer delete a member's message once confirmed, and reports or mutes another's", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.guild} onAction={onAction} />));
    const spam = CHAT_CONVERSATION.guild.messages.find((m) => m.text.startsWith("Spam"))!;
    const row = screen.getByText(spam.text).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /^More for / }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this message?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: "delete", id: spam.id }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Report, with a reason.
    await userEvent.click(within(row).getByRole("button", { name: /^More for / }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Report" }));
    const report = await screen.findByRole("dialog", { name: /^Report / });
    expect(within(report).getByRole("button", { name: "Report" })).toBeDisabled();
    await userEvent.click(within(report).getByRole("radio", { name: /^Spam/ }));
    await userEvent.click(within(report).getByRole("button", { name: "Report" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: "report", id: spam.id, reason: "spam" }));
    // Mute its author.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(row).getByRole("button", { name: /^More for / }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mute" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: "mute", address: spam.author!.address }));
    // The log's lines are in the conversation, the announcement pinned.
    expect(screen.getByText(/promoted .* to Officer/)).toBeInTheDocument();
    expect(screen.getByText(/Raid night is Thursday/)).toBeInTheDocument();
  });

  it("offers no Mute in private, and a request's Accept and Decline", async () => {
    const onAnswer = vi.fn(async () => {});
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.request} onAnswer={onAnswer} />));
    await userEvent.click(screen.getByRole("button", { name: /^More for / }));
    expect(await screen.findByRole("menuitem", { name: "Report" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mute" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it("keeps the reading place when older messages come, and shows New messages for one that comes while reading them", async () => {
    const base = CHAT_CONVERSATION.world;
    const [older, latest] = [base.messages.slice(0, 4), base.messages.slice(4)];
    const sizes = { content: 600, view: 300 };
    const { rerender } = render(wrap(<ChatConversation {...props({ messages: latest, hasOlder: true })} />, "never"));
    const log = screen.getByRole("log", { name: "Messages" });
    geometry(log, sizes);
    // The reader scrolls up to the top: the older page is asked for.
    const onLoadOlder = vi.fn();
    rerender(wrap(<ChatConversation {...props({ messages: latest, hasOlder: true, onLoadOlder })} />, "never"));
    log.scrollTop = 0;
    fireEvent.scroll(log);
    expect(onLoadOlder).toHaveBeenCalled();
    // It comes on top: the messages read stay where they were (400 px more above them).
    log.scrollTop = 50;
    fireEvent.scroll(log);
    sizes.content = 1_000;
    rerender(wrap(<ChatConversation {...props({ messages: [...older, ...latest], hasOlder: false })} />, "never"));
    expect(log.scrollTop).toBe(450);
    // A new message while reading older ones: the pill, which brings the reader down.
    const fresh: ChatMessage = { ...latest.at(-1)!, id: "fresh", at: base.now + 1, text: "just now" };
    sizes.content = 1_060;
    rerender(wrap(<ChatConversation {...props({ messages: [...older, ...latest, fresh] })} />, "never"));
    const pill = await screen.findByRole("button", { name: "New messages" });
    act(() => pill.click());
    expect(log.scrollTop).toBe(1_060);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("shows the first private conversation's notice until Got it", async () => {
    const onSeeNotice = vi.fn();
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.private} onSeeNotice={onSeeNotice} />));
    expect(screen.getByText("Your private messages are end-to-end encrypted. Paved never asks for your key or your password.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onSeeNotice).toHaveBeenCalled();
  });
});
