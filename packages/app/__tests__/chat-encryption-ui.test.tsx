import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChatConversation } from "../src/components/containers/chat-conversation";
import { CHAT_CONVERSATION } from "../src/mocks/chat";

// End-to-end encryption on the pages (#997, PR 2): the line at the top of each conversation, the Encryption sheet and its safety
// code, the other's key change, an unreadable message, a joiner's line and the report's warning.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

const line = () => document.querySelector<HTMLElement>("[data-slot=chat-encryption-line]");
const REVEAL = "This message and the 5 before it go to Paved's moderators, decrypted. Nothing else of this conversation.";

describe("what a conversation's encryption is (#997, point 8)", () => {
  it("says the World is public, the guild's is for its members, and a private one is the two players'", () => {
    const { unmount } = render(wrap(<ChatConversation {...CHAT_CONVERSATION.world} />));
    expect(line()).toHaveTextContent("Public: every player can read the World");
    expect(line()!.tagName).toBe("P");
    unmount();
    const guild = render(wrap(<ChatConversation {...CHAT_CONVERSATION.guild} />));
    expect(line()).toHaveTextContent("End-to-end encrypted for the guild's members");
    expect(screen.queryByText("Messages from before you joined are not shown")).toBeNull();
    guild.unmount();
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.private} />));
    const other = CHAT_CONVERSATION.private.head!.conversation.other!.name!;
    expect(line()).toHaveTextContent(`End-to-end encrypted: only you and ${other} can read these messages`);
  });

  it("tells a joiner that the guild's messages from before are not shown", () => {
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.guildJoiner} />));
    expect(screen.getByText("Messages from before you joined are not shown")).toBeInTheDocument();
  });
});

describe("the Encryption sheet (#997, point 9)", () => {
  it("opens from the private conversation's menu, with what is encrypted and the safety code in 4 groups of 5", async () => {
    const data = CHAT_CONVERSATION.private;
    render(wrap(<ChatConversation {...data} />));
    const other = data.head!.conversation.other!.name!;
    await userEvent.click(screen.getByRole("button", { name: `Menu of the conversation with ${other}` }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Encryption" }));
    const sheet = await screen.findByRole("dialog", { name: "Encryption" });
    expect(within(sheet).getByText(`Your messages with ${other} are sealed on your device and opened only on yours and theirs.`)).toBeInTheDocument();
    const code = data.head!.encryption.safetyCode!;
    expect(code).toMatch(/^\d{5} \d{5} \d{5} \d{5}$/);
    expect(within(sheet).getByLabelText(`Safety code ${code}`).textContent).toBe(code.replaceAll(" ", ""));
  });

  it("opens from the private line too", async () => {
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.private} />));
    await userEvent.click(line()!);
    expect(await screen.findByRole("dialog", { name: "Encryption" })).toBeInTheDocument();
  });

  it("has no Encryption menu in the World or the guild", () => {
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.guild} />));
    expect(screen.queryByRole("button", { name: /^Menu of the conversation/ })).toBeNull();
  });

  it("says the code shows later while one of the two has no key", async () => {
    const data = CHAT_CONVERSATION.private;
    render(wrap(<ChatConversation {...data} head={{ ...data.head!, encryption: { ...data.head!.encryption, safetyCode: null } }} initialEncryptionOpen />));
    expect(await screen.findByText("The code shows once both of you have a security key.")).toBeInTheDocument();
  });
});

describe("the other's key change (#997, point 10)", () => {
  it("shows a line among the messages, at its time, whose View code opens the sheet on the new code", async () => {
    const data = CHAT_CONVERSATION.keyChanged;
    render(wrap(<ChatConversation {...data} />));
    const other = data.head!.conversation.other!.name!;
    const rows = within(screen.getByRole("log", { name: "Messages" })).getAllByRole("listitem");
    const at = rows.findIndex((r) => r.dataset.slot === "chat-key-change");
    expect(rows[at]).toHaveTextContent(`${other}'s security key changed`);
    // After the messages from before it, before those after.
    const change = data.head!.encryption.keyChanges[0]!.at;
    expect(data.messages.filter((m) => m.at < change)).toHaveLength(at);
    await userEvent.click(within(rows[at]!).getByRole("button", { name: "View code" }));
    const sheet = await screen.findByRole("dialog", { name: "Encryption" });
    expect(within(sheet).getByLabelText(`Safety code ${data.head!.encryption.safetyCode}`)).toBeInTheDocument();
  });

  it("waits for the older page when the change is older than the page read", () => {
    const data = CHAT_CONVERSATION.keyChanged;
    const head = { ...data.head!, encryption: { ...data.head!.encryption, keyChanges: [{ at: data.messages[0]!.at - 60, version: 2 }] } };
    const { rerender } = render(wrap(<ChatConversation {...data} head={head} hasOlder />));
    expect(document.querySelector("[data-slot=chat-key-change]")).toBeNull();
    rerender(wrap(<ChatConversation {...data} head={head} hasOlder={false} />));
    expect(document.querySelector("[data-slot=chat-key-change]")).not.toBeNull();
  });
});

describe("a message that cannot be read (#997, point 6)", () => {
  it("says so in the place of the text, and cannot be reported", async () => {
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.unreadable} />));
    expect(screen.getAllByText("This message can't be read on this device")).toHaveLength(2);
    // The other's unreadable message has nothing to report (and no Mute in private): no menu. Their readable one keeps Report.
    const data = CHAT_CONVERSATION.unreadable;
    const other = data.messages[0]!.author!.name!;
    const rows = within(screen.getByRole("log", { name: "Messages" })).getAllByRole("listitem");
    expect(within(rows[0]!).queryByRole("button", { name: `More for ${other}'s message` })).toBeNull();
    const readable = rows[data.messages.findIndex((m, i) => i > 0 && !m.mine && !m.unreadable)]!;
    await userEvent.click(within(readable).getByRole("button", { name: `More for ${other}'s message` }));
    expect(await screen.findByRole("menuitem", { name: "Report" })).toBeInTheDocument();
  });
});

describe("the report's warning (#997, point 12)", () => {
  it("says what goes to the moderators, decrypted, in private and in the guild", async () => {
    const { unmount } = render(wrap(<ChatConversation {...CHAT_CONVERSATION.reportPrivate} />));
    expect(within(await screen.findByRole("dialog")).getByText(REVEAL)).toBeInTheDocument();
    unmount();
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.reportGuild} />));
    expect(within(await screen.findByRole("dialog")).getByText(REVEAL)).toBeInTheDocument();
  });

  it("says nothing of it in the public World", async () => {
    render(wrap(<ChatConversation {...CHAT_CONVERSATION.report} />));
    expect(within(await screen.findByRole("dialog")).queryByText(REVEAL)).toBeNull();
  });
});
