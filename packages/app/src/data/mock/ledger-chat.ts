import { communityMember } from "./community";
import { graphOf } from "./follows";
import type { ConversationId } from "@paved/game-core";
import { addressKey } from "../keys";
import * as chat from "./chat";
import { type MockChatSource, type ChatSubscriber, sleep } from "./ledger-state";
import { LedgerGuilds } from "./ledger-guilds";

/** The messages (#955, `chat.ts`). One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerChat extends LedgerGuilds {
  private readonly chatSubscribers = new Set<ChatSubscriber>();

  /** What the chat reads at `now`: anyone's profile, the follows' graph and the guilds, settled; the players the mock knows. */
  protected chatWorld(now: number): chat.ChatWorld {
    const world = this.settledGuilds(now);
    const known = (address: string) => {
      const k = addressKey(address);
      return communityMember(k) !== null || k in this.state.players || k in world.players || k in (this.state.chat?.players ?? {});
    };
    return { now, people: this.personOf(world, now), graph: graphOf(this.followsNow(now)), guilds: world, known };
  }

  /**
   * The stored chat at the ledger's clock for `player`'s read, what is due made (`settleChat`). Stored only when settling made
   * something that must not be made twice: a key, an epoch, a sealed answer (their random bytes), or version 1 sealed.
   */
  private chatRead<T>(player: string, read: (stored: chat.StoredChat, w: chat.ChatWorld) => T): T {
    this.sync();
    const w = this.chatWorld(this.second());
    const settled = chat.settleChat(chat.parseChat(this.state.chat) ?? chat.freshChat(), w, addressKey(player));
    if (settled.changed) {
      this.state = { ...this.state, chat: settled.chat };
      this.save();
    }
    return read(settled.chat, w);
  }

  /** One chat write under the lock: the chat settled, the change applied and stored, or, refused, left as it was. */
  private async chatWrite<T>(player: string, change: (write: chat.ChatWrite) => T): Promise<T> {
    await sleep(this.latency);
    return this.lock(() => {
      this.sync();
      const w = this.chatWorld(this.second());
      const stored = chat.settleChat(chat.parseChat(this.state.chat) ?? chat.freshChat(), w, addressKey(player)).chat;
      const result = change({ chat: stored, w, player: addressKey(player) });
      this.state = { ...this.state, chat: stored };
      this.save();
      return result;
    }).finally(() => {
      // A write may make a line due sooner (an answer, a request): each subscriber's timer is set again.
      for (const sub of this.chatSubscribers) {
        if (sub.timer) clearTimeout(sub.timer);
        sub.timer = null;
        this.wakeChat(sub);
      }
    });
  }

  /** Tells the subscribers of `conversation` who see `message` (null: it is gone from their view) what came: a write of this device. */
  private tellChat(conversation: ConversationId, message: string, type: "message" | "deleted"): void {
    for (const sub of this.chatSubscribers) {
      if (sub.conversation !== null && sub.conversation !== conversation) continue;
      const [seen, head] = this.chatRead(sub.player, (stored, w) => [chat.messageView(stored, w, sub.player, conversation, message), chat.headOf(stored, w, sub.player, conversation)] as const);
      if (!seen || !head) continue;
      if (type === "deleted") sub.listener({ type, conversation, id: message, head });
      else if (!sub.heard.has(message)) {
        sub.heard.add(message);
        sub.listener({ type, message: seen, head });
      }
    }
  }

  /** A subscriber hears what came by itself since it last heard (the community's lines, the answers, the requests). */
  private hearChat(sub: ChatSubscriber): void {
    const now = this.second();
    const [arrived, heads] = this.chatRead(sub.player, (stored, w) => {
      const messages = chat.arrivals(stored, w, sub.player, sub.conversation, sub.since);
      const ids = [...new Set(messages.map((m) => m.conversation))];
      return [messages, new Map(ids.map((id) => [id, chat.headOf(stored, w, sub.player, id)] as const))] as const;
    });
    sub.since = now;
    for (const m of arrived) {
      const head = heads.get(m.conversation);
      if (sub.heard.has(m.id) || !head) continue;
      sub.heard.add(m.id);
      sub.listener({ type: "message", message: m, head });
    }
  }

  /** Sets a subscriber's timer to the next line due for it (`nextDue`): no polling, one timer to what comes next. */
  private wakeChat(sub: ChatSubscriber): void {
    if (!this.chatSubscribers.has(sub)) return;
    const due = this.chatRead(sub.player, (stored, w) => chat.nextDue(stored, w, sub.player, sub.conversation));
    if (due === null) return;
    sub.timer = setTimeout(
      () => {
        sub.timer = null;
        if (!this.chatSubscribers.has(sub)) return;
        this.hearChat(sub);
        this.wakeChat(sub);
      },
      Math.max(0, due - this.now()) * 1000 + 20,
    );
  }

  /**
   * The chat source of the ledger (#955): every read and write of `ChatSource`, on game-core's rules (`chat.ts`), sealed end
   * to end (#997); and `rotateKeys`, the mock's own, for the tests and the stories (no page calls it).
   */
  chatSource(): MockChatSource {
    return {
      overview: async (player) => this.chatRead(player, (stored, w) => chat.overviewOf(stored, w, player)),
      conversation: async (player, id, before = null) => this.chatRead(player, (stored, w) => chat.pageOf(stored, w, player, id, before)),
      subscribe: (player, conversation, listener) => {
        const sub: ChatSubscriber = { player: addressKey(player), conversation, listener, since: this.second(), heard: new Set(), timer: null };
        this.chatSubscribers.add(sub);
        this.wakeChat(sub);
        return () => {
          if (sub.timer) clearTimeout(sub.timer);
          this.chatSubscribers.delete(sub);
        };
      },
      send: async (player, id, text) => {
        const message = await this.chatWrite(player, (write) => chat.sendIn(write, id, text));
        this.tellChat(id, message, "message");
        return this.chatRead(player, (stored, w) => chat.messageView(stored, w, player, id, message))!;
      },
      deleteMessage: async (player, id, message) => {
        await this.chatWrite(player, (write) => chat.deleteIn(write, id, message));
        this.tellChat(id, message, "deleted");
      },
      report: (player, id, message, reason) => this.chatWrite(player, (write) => chat.reportIn(write, id, message, reason)),
      mute: (player, target) => this.chatWrite(player, (write) => chat.muteIn(write, target)),
      unmute: (player, target) => this.chatWrite(player, (write) => chat.unmuteIn(write, target)),
      mutes: async (player) => this.chatRead(player, (stored, w) => chat.mutesOf(stored, w, player)),
      answerRequest: (player, id, accept) => this.chatWrite(player, (write) => chat.answerRequestIn(write, id, accept)),
      markRead: (player, id) => this.chatWrite(player, (write) => chat.markReadIn(write, id)),
      seeNotice: (player) => this.chatWrite(player, (write) => chat.seeNoticeIn(write)),
      visitChat: (player) => this.chatWrite(player, (write) => chat.visitChatIn(write)),
      rotateKeys: (player) => this.chatWrite(player, (write) => chat.rotateKeysIn(write)),
    };
  }
}
