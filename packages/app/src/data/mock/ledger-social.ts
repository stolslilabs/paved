import { areFriends, blockBetween, blockPlayer, followCounts, followPlayer, isBlocking, isFollowing, playerKey, removeFollower, suggestFollows, unblockPlayer, unfollowPlayer, type Follow, type FollowGraph, type GraphWrite, playerPlace, rankPlayers } from "@paved/game-core";
import { communityMember, communityProfile, community, searchCommunity } from "./community";
import { FollowRefusedError, type FollowLists, type FollowStatus, type FollowWriteRefusal, type PlayerRanking, type PublicProfile } from "../social-source";
import { freshFollows, graphOf, listsOf, seededFollows, settleFollows, type StoredFollows } from "./follows";
import { freshV2 } from "./v2";
import { addressKey } from "../keys";
import * as guilds from "./guilds";
import { sleep } from "./ledger-state";
import { LedgerVillage } from "./ledger-village";

/** The social source (#952) and the follows (#954). One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerSocial extends LedgerVillage {
  // Defined further down the chain (`guildRead`, `settledGuilds`), used here.
  protected abstract guildRead<T>(read: (world: guilds.GuildWorld, people: guilds.GuildPeople, now: number) => T): T;
  protected abstract settledGuilds(now: number): guilds.GuildWorld;

  /** Another player's public profile (`community.ts`): a seeded player or a rival, last seen by the ledger's clock; null for any other ID. */
  async publicProfile(address: string): Promise<PublicProfile | null> {
    return communityProfile(address, this.now());
  }

  /** The community's players a query finds (game-core's `searchPlayers`), last seen by the ledger's clock. */
  async searchPlayers(query: string): Promise<PublicProfile[]> {
    return searchCommunity(query, this.now());
  }

  /**
   * The players' ranking (LEADERBOARD-PAGE): the community's players, the device's and the guilds' members, by crowns (game-core's
   * `rankPlayers`), each as the guilds read them (`personOf`, whose crowns a guild's score sums: every crown of a score is a ranked
   * player's), and the viewer's place among all of them.
   */
  async playerRanking(viewer: string | null): Promise<PlayerRanking> {
    return this.guildRead((world, people) => {
      const members = world.guilds.flatMap((g) => g.members.map((m) => m.address));
      const keys = new Set([...community().map((m) => m.address), ...Object.keys(this.state.players), ...members].map(addressKey));
      const all = [...keys].map(people);
      const place = viewer === null ? null : playerPlace(all, viewer);
      return { players: rankPlayers(all), me: place === null ? null : { place, profile: people(addressKey(viewer!)) } };
    });
  }

  /** The stored follows at the ledger's clock, the follow backs due made (`settleFollows`). Not saved: a read stores nothing. */
  protected followsNow(now: number): StoredFollows {
    return settleFollows(this.state.follows ?? freshFollows(), now);
  }

  /** The player's own lists (`follows.ts`): friends, following and followers by presence, the new followers, the blocks. */
  async followLists(player: string): Promise<FollowLists> {
    this.sync();
    const now = this.second();
    return listsOf(this.followsNow(now), player, now);
  }

  /** Another player as `player` sees them: the marks, and the counts every profile shows. Never whether they block `player`. */
  async followStatus(player: string, other: string): Promise<FollowStatus> {
    this.sync();
    const graph = graphOf(this.followsNow(this.second()));
    const counts = followCounts(graph, other);
    return {
      following: isFollowing(graph, player, other),
      followsYou: isFollowing(graph, other, player),
      friend: areFriends(graph, player, other),
      blocking: isBlocking(graph, player, other),
      followers: counts.followers,
      followed: counts.following,
    };
  }

  /**
   * Whom `player` may follow (game-core's `suggestFollows`): the followers not followed back, their guild's members (#953, by
   * rank then crowns), the recent PvP opponents (newest first), then the community. Only the community's members: the mock
   * shows no other player's profile.
   */
  async followSuggestions(player: string): Promise<PublicProfile[]> {
    this.sync();
    const now = this.second();
    const v2 = this.peek(player).v2 ?? freshV2();
    const opponents = [...v2.attacks.filter((a) => a.status !== "open").map((a) => ({ address: a.defender, at: a.finishedAt })), ...(v2.defences ?? []).map((d) => ({ address: d.attacker, at: d.finishedAt }))]
      .sort((x, y) => y.at - x.at)
      .map((o) => o.address)
      .filter((a) => communityMember(a) !== null);
    const guildmates = this.guildRead((world, people, at) => guilds.playerGuildOf(world, people, at, player).guild?.roster.map((m) => m.profile.address) ?? []).filter((a) => communityMember(a) !== null);
    const members = community().map((m) => m.address);
    return suggestFollows(graphOf(this.followsNow(now)), player, [guildmates, opponents, members]).flatMap((address) => communityProfile(address, now) ?? []);
  }

  /**
   * One follow write of `player`, under the lock: the follow backs due made, then `change` on the whole graph by game-core's
   * rules; a refusal throws a `FollowRefusedError` and leaves the ledger as it was. `target`, when given, must be a player the
   * mock knows.
   */
  private async writeFollows(player: string, target: string | null, change: (graph: FollowGraph, now: number) => GraphWrite<FollowWriteRefusal>, after?: (stored: StoredFollows, now: number) => StoredFollows): Promise<void> {
    await sleep(this.latency);
    return this.lock(() => {
      this.sync();
      if (target !== null && communityMember(target) === null) throw new FollowRefusedError("unknown-player");
      const now = this.second();
      const stored = this.followsNow(now);
      const w = change(graphOf(stored), now);
      if (!w.ok) throw new FollowRefusedError(w.reason);
      const drawn = new Set<Follow>(seededFollows());
      let next: StoredFollows = { ...stored, follows: w.graph.follows.filter((f) => !drawn.has(f)), blocks: [...w.graph.blocks] };
      if (after) next = after(next, now);
      // A block or an unblock judges what the guilds do from now on, never what they did before (#953): what came due until now
      // is settled under the blocks as they stood, and stored, before the new ones apply. A new block also withdraws the
      // invitations and requests still pending between the two players; the joins already made stay.
      let guildWorld: guilds.GuildWorld | null = null;
      if (w.graph.blocks !== stored.blocks) {
        const after = graphOf(next);
        guildWorld = guilds.dropBlocked(this.settledGuilds(now), (a, b) => blockBetween(after, a, b) !== null);
      }
      this.state = { ...this.state, follows: next, ...(guildWorld ? { guilds: guildWorld } : {}) };
      this.save();
    });
  }

  /** The writes of the follow source, for the connected player. */
  followWrites() {
    return {
      follow: (player: string, target: string) => this.writeFollows(player, target, (g, now) => followPlayer(g, player, target, now)),
      unfollow: (player: string, target: string) => this.writeFollows(player, null, (g) => unfollowPlayer(g, player, target)),
      removeFollower: (player: string, follower: string) => this.writeFollows(player, null, (g) => removeFollower(g, player, follower)),
      block: (player: string, target: string) => this.writeFollows(player, target, (g, now) => blockPlayer(g, player, target, now)),
      unblock: (player: string, target: string) => this.writeFollows(player, null, (g) => unblockPlayer(g, player, target)),
      seeFollowers: (player: string) =>
        this.writeFollows(
          player,
          null,
          (graph) => ({ ok: true, graph, changed: false }),
          (stored, now) => ({ ...stored, seen: { ...stored.seen, [playerKey(player)]: now } }),
        ),
    };
  }
}
