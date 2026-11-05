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
import { ChatScene } from "../src/components/scenes/chat-scene";
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
  it("lists the requests, each with its check and cross, then the private conversations with their unread counts, and New message", async () => {
    const onOpen = vi.fn();
    const onAnswer = vi.fn(async () => {});
    const onNewMessage = vi.fn();
    render(wrap(<ChatList {...CHAT_LIST.request} onOpen={onOpen} onAnswer={onAnswer} onNewMessage={onNewMessage} />));
    const rows = within(screen.getByRole("region", { name: "Conversations" })).getAllByRole("button");
    // The World and the guild have their own tabs: only the three private conversations here.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("aria-label"))).not.toContain("World, 14 unread");
    expect(rows[1]!.getAttribute("aria-label")).toMatch(/, 2 unread$/);
    // CHAT-PAGE: every avatar in its league's rim, with the level in the profile's blue star.
    expect(rows.every((r) => r.querySelector("[data-slot=league-portrait][data-tier]") !== null)).toBe(true);
    expect(within(rows[0]!).getByRole("img", { name: /^Level \d+$/ })).toBeInTheDocument();
    const requests = screen.getByRole("region", { name: "Requests" });
    const request = CHAT_LIST.request.overview!.requests[0]!;
    const [open, accept, decline] = within(requests).getAllByRole("button");
    expect(within(requests).getByText("Wants to chat")).toBeInTheDocument();
    // The book's order: the requests first, then the conversations.
    expect(requests.compareDocumentPosition(rows[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith(CHAT_LIST.request.overview!.conversations[2]!.id);
    await userEvent.click(open!);
    expect(onOpen).toHaveBeenLastCalledWith(request.id);
    expect(accept).toHaveAccessibleName(`Accept ${request.other!.name}`);
    await userEvent.click(accept!);
    expect(onAnswer).toHaveBeenCalledWith(request.id, true);
    await userEvent.click(decline!);
    expect(onAnswer).toHaveBeenLastCalledWith(request.id, false);
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

  it("keeps links and addresses as plain text, and shows a message the data says deleted as such, with no menu", () => {
    // The page offers no Delete (CHAT-PAGE); a message the source marks deleted still reads "Message deleted".
    const first = CHAT_CONVERSATION.world.messages[0]!;
    const gone = { ...first, id: "gone", text: "", deleted: true, mayReport: false };
    render(wrap(<ChatConversation {...props({ messages: [...CHAT_CONVERSATION.world.messages, gone] })} />));
    const log = screen.getByRole("log", { name: "Messages" });
    expect(within(log).getByText(/paved-gifts\.example\/claim/)).toBeInTheDocument();
    expect(within(log).getByText(/0x04a3c9d2e1f0b7a6958473625140f3e2d1c0b9a8f7e6d5c4b3a2918070605091fe/)).toBeInTheDocument();
    expect(log.querySelectorAll("a")).toHaveLength(0);
    const deleted = within(log).getByText("Message deleted").closest("li")!;
    expect(within(deleted).queryByRole("button", { name: /^More for / })).toBeNull();
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

  it("offers no Delete, even to an officer (a message stays on the ledger), and reports or mutes another's", async () => {
    const onAction = vi.fn(async () => {});
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.guild} onAction={onAction} />));
    const spam = CHAT_CONVERSATION.guild.messages.find((m) => m.text.startsWith("Spam"))!;
    const row = screen.getByText(spam.text).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /^More for / }));
    // Report, with a reason; no Delete beside it, though the data lets an officer delete.
    expect(spam.mayDelete).toBe(true);
    const reportItem = await screen.findByRole("menuitem", { name: "Report" });
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(reportItem);
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

  it("shows the first private conversation's notice before its first message only, until Got it", async () => {
    const NOTICE = "Your private messages are end-to-end encrypted. Paved never asks for your key or your password.";
    const onSeeNotice = vi.fn();
    const { rerender } = render(wrap(<ChatConversation {...CHAT_CONVERSATION.empty} onSeeNotice={onSeeNotice} />));
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onSeeNotice).toHaveBeenCalled();
    // The first message hides it, though not seen yet (CHAT-PAGE, the owner's ask).
    rerender(wrap(<ChatConversation {...CHAT_CONVERSATION.private} noticeSeen={false} onSeeNotice={onSeeNotice} />));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe("CHAT-PAGE: the Paved UX Book's chat", () => {
  it("draws every author in their league's rim, with the level in the blue star and no guild's tag; the player's own at the right", () => {
    const data = CHAT_CONVERSATION.guild;
    render(wrap(<ChatConversation {...data} fill />));
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-slot=chat-message]"));
    expect(rows.length).toBe(data.messages.filter((m) => m.kind === "message").length);
    for (const row of rows) {
      const author = data.messages.find((m) => m.kind === "message" && row.textContent?.includes(m.author!.name ?? "\u0000"))!.author!;
      expect(row.querySelector("[data-slot=league-portrait]")).toHaveAttribute("data-tier");
      expect(within(row).getByRole("img", { name: `Level ${author.level}` })).toBeInTheDocument();
      // The owner's ask: no tag beside the level (the name opens the profile).
      expect(within(row).queryByText(author.guildTag!)).toBeNull();
    }
    const mine = rows.filter((r) => r.dataset.mine !== undefined);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toHaveClass("flex-row-reverse");
  });

  it("draws a rule between two messages only where the day changes, the day in its middle", () => {
    const { unmount } = render(wrap(<ChatConversation {...CHAT_CONVERSATION.world} />));
    // The World's lines are all of today: no rule between them.
    expect(document.querySelectorAll("[data-slot=chat-day]")).toHaveLength(0);
    unmount();
    const data = CHAT_CONVERSATION.private;
    render(wrap(<ChatConversation {...data} />));
    const rules = Array.from(document.querySelectorAll<HTMLElement>("[data-slot=chat-day]"));
    // Two messages yesterday, then today's: one rule, before the first of today.
    expect(rules).toHaveLength(1);
    expect(rules[0]).toHaveTextContent("Today");
    const today = screen.getByText(data.messages[2]!.text).closest("li")!;
    expect(rules[0]!.nextElementSibling).toBe(today);
  });

  it("pins the guild's announcement above its conversation, a tap away from the guild's page; with none, the guild's name", async () => {
    const onOpenTitle = vi.fn();
    const { unmount } = render(wrap(<ChatConversation {...CHAT_CONVERSATION.guild} onOpenTitle={onOpenTitle} fill />));
    const pinned = document.querySelector<HTMLElement>("[data-slot=chat-pinned]")!;
    expect(pinned).toHaveTextContent(/Raid night is Thursday/);
    expect(within(pinned).getByRole("img", { name: "Pinned announcement" })).toBeInTheDocument();
    // Above the conversation's panel, not in it.
    expect(screen.getByRole("region", { name: /conversation$/ }).contains(pinned)).toBe(false);
    await userEvent.click(pinned);
    expect(onOpenTitle).toHaveBeenCalled();
    unmount();
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.guildUnpinned} onOpenTitle={onOpenTitle} fill />));
    expect(document.querySelector("[data-slot=chat-pinned]")).toHaveTextContent(CHAT_CONVERSATION.guildUnpinned.head!.conversation.guild!.name);
  });

  it("heads a private conversation with Back and the other player in their rim and their level", async () => {
    const onBack = vi.fn();
    const onOpenTitle = vi.fn();
    const data = CHAT_CONVERSATION.private;
    render(wrap(<ChatConversation {...data} onBack={onBack} onOpenTitle={onOpenTitle} fill />));
    const region = screen.getByRole("region", { name: /conversation$/ });
    const header = region.querySelector("header")!;
    const other = data.head!.conversation.other!;
    expect(header.querySelector("[data-slot=league-portrait]")).toHaveAttribute("data-tier");
    expect(within(header).getByRole("img", { name: `Level ${other.level}` })).toBeInTheDocument();
    await userEvent.click(within(header).getByRole("button", { name: "Back to the conversations" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("sends with the book's gold button and shows the count only near the limit", async () => {
    const onSend = vi.fn(async () => {});
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.world} onSend={onSend} />));
    const field = screen.getByRole("textbox", { name: "Message World" });
    expect(field).toHaveAttribute("placeholder", "Message the World");
    expect(screen.queryByText(/\/200$/)).toBeNull();
    await userEvent.type(field, "Hello, world!{enter}");
    expect(onSend).toHaveBeenCalledWith("Hello, world!");
    fireEvent.change(field, { target: { value: "x".repeat(170) } });
    expect(screen.getByText("170/200")).toBeInTheDocument();
  });
});

describe("CHAT-DRAWER-KEYBOARD (#1025)", () => {
  it("fits the drawer's conversation to the room the keyboard leaves, its 20rem minimum too, and gives it back once closed", () => {
    // The review's figures: a 700 px layout viewport, the keyboard leaving 360 px. jsdom has neither a visual viewport nor a
    // layout: the conversation's top is the World's in the drawer at 360 px (136 px, measured in `e2e/chat-keyboard.e2e.ts`).
    const vv = { height: 700, offsetTop: 0, onresize: null as null | (() => void) };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { top: this.dataset.slot === "chat-conversation" ? 136 : 0 } as DOMRect;
    });
    try {
      render(
        wrap(
          <ChatScene tab="world" badges={CHAT_BADGES.conversations}>
            <ChatConversation {...CHAT_CONVERSATION.world} fill onSend={async () => {}} />
          </ChatScene>,
        ),
      );
      const box = screen.getByRole("region", { name: "World conversation" });
      // The keyboard closed: as tall as the drawer leaves it, never under 20rem.
      expect(box.style.maxHeight).toBe("556px");
      expect(box.style.minHeight).toBe("min(20rem, 556px)");
      screen.getByRole("textbox", { name: /^Message/ }).focus();
      act(() => {
        vv.height = 360;
        vv.onresize?.();
      });
      // Open: 360 - 136 - 8 px of gap, the minimum included (a 20rem floor kept the field under the keyboard).
      expect(box.style.maxHeight).toBe("216px");
      expect(box.style.minHeight).toBe("min(20rem, 216px)");
      expect(within(box).getByRole("log", { name: "Messages" })).toBeInTheDocument();
      act(() => {
        vv.height = 700;
        vv.onresize?.();
      });
      expect(box.style.maxHeight).toBe("556px");
    } finally {
      rect.mockRestore();
      delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });

  it("keeps Back to the list on a private conversation that is not there any more", async () => {
    const onBack = vi.fn();
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.gone} onBack={onBack} fill />));
    expect(screen.getByText("This conversation is not there any more.")).toBeInTheDocument();
    // No skeleton for a title that will not come, and no field.
    const box = screen.getByRole("region", { name: "Conversation" });
    expect(box.querySelector("header [data-slot=skeleton]")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back to the conversations" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
