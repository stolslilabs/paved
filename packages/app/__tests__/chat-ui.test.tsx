import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatConversation, type ChatConversationProps } from "../src/components/containers/chat-conversation";
import { ChatList } from "../src/components/containers/chat-list";
import { ChatRefusedError, type ChatMessage } from "../src/data/social-source";
import { CHAT_CONVERSATION, CHAT_LIST } from "../src/mocks/chat";

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

describe("the Chat tab's list (#955)", () => {
  it("lists the World, the guild and the private conversations with their unread counts, and the requests above", async () => {
    const onOpen = vi.fn();
    render(wrap(<ChatList {...CHAT_LIST.request} onOpen={onOpen} />));
    const requests = screen.getByRole("region", { name: "Requests" });
    expect(within(requests).getAllByRole("button")).toHaveLength(1);
    const rows = within(screen.getByRole("region", { name: "Conversations" })).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("World, 14 unread");
    expect(rows[1]!.getAttribute("aria-label")).toMatch(/, 3 unread$/);
    await userEvent.click(rows[0]!);
    expect(onOpen).toHaveBeenCalledWith("world");
  });

  it("lists the muted players in its menu, each with Unmute", async () => {
    const onUnmute = vi.fn(async () => {});
    render(wrap(<ChatList {...CHAT_LIST.muted} onUnmute={onUnmute} />));
    const sheet = await screen.findByRole("dialog", { name: "Muted players" });
    await userEvent.click(within(sheet).getByRole("button", { name: /^Unmute / }));
    expect(onUnmute).toHaveBeenCalledWith(CHAT_LIST.muted.mutes![0]!.address);
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
    expect(screen.getByText("Paved never asks for your key or your password.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onSeeNotice).toHaveBeenCalled();
  });
});
