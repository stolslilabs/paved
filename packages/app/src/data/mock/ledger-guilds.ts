import { layoutScore, levelStatus, blockBetween, type GuildDraft, type GuildSettings } from "@paved/game-core";
import { communityProfile, leagueIndex } from "./community";
import type { GuildBadge, GuildPlace, GuildQuery, GuildSummary, GuildView, PlayerGuild, PublicProfile } from "../social-source";
import { graphOf } from "./follows";
import { addressKey } from "../keys";
import * as guilds from "./guilds";
import * as chat from "./chat";
import { sleep } from "./ledger-state";
import { LedgerSocial } from "./ledger-social";

/** The guilds (#953, `guilds.ts`). One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerGuilds extends LedgerSocial {
  // Defined further down the chain (`chatWorld`), used here.
  protected abstract chatWorld(now: number): chat.ChatWorld;

  /**
   * Anyone's public profile, as the guilds show their members: a community player's (`community.ts`), else a device's player's
   * from the ledger (their name, avatar, level, crowns, village), last seen when they last wrote to the guilds.
   */
  protected personOf(world: guilds.GuildWorld, now: number): guilds.GuildPeople {
    const cache = new Map<string, PublicProfile>();
    return (address) => {
      const k = addressKey(address);
      let found = cache.get(k);
      if (found) return found;
      found = communityProfile(k, now) ?? undefined;
      if (!found) {
        const p = this.peek(k);
        const crowns = p.pvp?.crowns ?? 0;
        const layout = p.v2?.layout ?? [];
        found = { address: k, name: p.name ?? null, look: p.avatar ? BigInt(p.avatar) : null, level: levelStatus(p.v2?.xp ?? 0).level, crowns, league: leagueIndex(crowns), score: layoutScore(layout), lastSeen: world.players[k]?.seenAt ?? 0 };
      }
      cache.set(k, found);
      return found;
    };
  }

  /** Whether a block stands between two players at `now`, either way (#954): what the guilds' writes and settlement check. */
  private blocksAt(now: number): guilds.GuildBlocks {
    const graph = graphOf(this.followsNow(now));
    return (a, b) => blockBetween(graph, a, b) !== null;
  }

  /** The guilds' world as stored, settled at `now` under the blocks of the stored follows (a copy: the caller stores it or not). */
  protected settledGuilds(now: number): guilds.GuildWorld {
    const world = structuredClone(guilds.parseGuildWorld(this.state.guilds) ?? guilds.seededGuildWorld());
    guilds.settle(world, this.personOf(world, now), now, this.blocksAt(now));
    return world;
  }

  /** The guilds' world as stored, settled at the ledger's clock for a read (not stored: the next write settles it again). */
  protected guildRead<T>(read: (world: guilds.GuildWorld, people: guilds.GuildPeople, now: number) => T): T {
    this.sync();
    const now = this.second();
    const world = structuredClone(guilds.parseGuildWorld(this.state.guilds) ?? guilds.seededGuildWorld());
    const people = this.personOf(world, now);
    guilds.settle(world, people, now, this.blocksAt(now));
    return read(world, people, now);
  }

  /** One guild write under the lock: the world settled, the change applied and stored, or, refused, left as it was. */
  private async guildWrite<T>(player: string, change: (w: guilds.GuildWrite) => T): Promise<T> {
    await sleep(this.latency);
    return this.lock(() => {
      this.sync();
      const now = this.second();
      const world = structuredClone(guilds.parseGuildWorld(this.state.guilds) ?? guilds.seededGuildWorld());
      const people = this.personOf(world, now);
      const blocked = this.blocksAt(now);
      const w: guilds.GuildWrite = { world, people, now, player: addressKey(player), blocked };
      guilds.settle(world, people, now, blocked);
      const before = new Map(world.guilds.map((g) => [g.id, g.members.map((m) => ({ address: m.address, joinedAt: m.joinedAt }))] as const));
      const result = change(w);
      guilds.seen(w);
      // The memberships the write ended (#955): the guild's past lines keep their authors.
      const stored = chat.parseChat(this.state.chat);
      const chatState = chat.recordDepartures(stored ?? chat.freshChat(), before, world, now);
      this.state = { ...this.state, guilds: world, ...(stored || chatState.departed ? { chat: chatState } : {}) };
      // Each joining, kick or leave starts the guild's next epoch now (#997, point 4), not at the chat's next read: a leave and a
      // rejoin before it are two epochs.
      const settled = chat.settleChat(chat.parseChat(this.state.chat) ?? chat.freshChat(), this.chatWorld(now));
      if (settled.changed) this.state = { ...this.state, chat: settled.chat };
      this.save();
      return result;
    });
  }

  async playerGuild(player: string): Promise<PlayerGuild> {
    return this.guildRead((world, people, now) => guilds.playerGuildOf(world, people, now, player));
  }

  async guild(id: number, viewer: string | null): Promise<GuildView | null> {
    return this.guildRead((world, people, now) => guilds.guildViewOf(world, people, now, id, viewer));
  }

  async guildOf(address: string): Promise<GuildBadge | null> {
    return this.guildRead((world) => guilds.guildBadgeOf(world, address));
  }

  async searchGuilds(query: GuildQuery): Promise<GuildSummary[]> {
    return this.guildRead((world, people, now) => guilds.searchGuildsOf(world, people, now, query));
  }

  async suggestedGuilds(player: string): Promise<GuildSummary[]> {
    return this.guildRead((world, people, now) => guilds.suggestedGuildsOf(world, people, now, player));
  }

  async guildRanking(): Promise<GuildSummary[]> {
    return this.guildRead((world, people, now) => guilds.guildRankingOf(world, people, now));
  }

  async guildPlace(id: number): Promise<GuildPlace | null> {
    return this.guildRead((world, people, now) => guilds.guildPlaceOf(world, people, now, id));
  }

  createGuild(player: string, draft: GuildDraft): Promise<number> {
    return this.guildWrite(player, (w) => guilds.createGuildIn(w, draft));
  }

  editGuild(player: string, settings: GuildSettings): Promise<void> {
    return this.guildWrite(player, (w) => guilds.editGuildIn(w, settings));
  }

  joinGuild(player: string, guild: number): Promise<void> {
    return this.guildWrite(player, (w) => guilds.joinGuildIn(w, guild));
  }

  requestToJoin(player: string, guild: number, message: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.requestToJoinIn(w, guild, message));
  }

  cancelRequest(player: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.cancelRequestIn(w));
  }

  answerRequest(player: string, applicant: string, accept: boolean): Promise<void> {
    return this.guildWrite(player, (w) => guilds.answerRequestIn(w, applicant, accept));
  }

  invite(player: string, target: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.inviteIn(w, target));
  }

  answerInvitation(player: string, guild: number, accept: boolean, leaving = false): Promise<void> {
    return this.guildWrite(player, (w) => guilds.answerInvitationIn(w, guild, accept, leaving));
  }

  kick(player: string, target: string, reason: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.kickIn(w, target, reason));
  }

  promote(player: string, target: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.promoteIn(w, target));
  }

  demote(player: string, target: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.demoteIn(w, target));
  }

  makeLeader(player: string, target: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.makeLeaderIn(w, target));
  }

  leaveGuild(player: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.leaveGuildIn(w));
  }

  postAnnouncement(player: string, text: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.postAnnouncementIn(w, text));
  }

  editAnnouncement(player: string, id: number, text: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.editAnnouncementIn(w, id, text));
  }

  deleteAnnouncement(player: string, id: number): Promise<void> {
    return this.guildWrite(player, (w) => guilds.editAnnouncementIn(w, id, null));
  }

  readAnnouncements(player: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.readAnnouncementsIn(w));
  }

  visitGuildTab(player: string): Promise<void> {
    return this.guildWrite(player, (w) => guilds.visitGuildTabIn(w));
  }
}
