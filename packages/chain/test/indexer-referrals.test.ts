/** `/v1/players/:id/referrals` (IX-COBBLES2): what a referrer earned, its games' and its packs' referrals (P10). */
import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FIXTURE_BO, FixtureIndexer } from "../src/testing";
import { IndexerClient, IndexerError } from "../src/indexer";

let fixture: FixtureIndexer;
let client: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
});

const body = (fields: Record<string, unknown>) => ({
  version: 1,
  status: "ok",
  head: { number: 1, hash: "0x1", timestamp: 1 },
  behind: 0,
  player_id: FIXTURE_ADA,
  total: "1650000",
  games: { count: 3, total: "1200000" },
  packs: { count: 1, total: "450000" },
  ...fields,
});

describe("playerReferrals", () => {
  test("reads the games' and the packs' referrals, USDC base units as exact decimal strings", async () => {
    const { data } = await client.playerReferrals(FIXTURE_ADA);
    expect(data).toEqual({ playerId: FIXTURE_ADA, total: "1650000", games: { count: 3, total: "1200000" }, packs: { count: 1, total: "450000" } });
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_ADA}/referrals`]);
  });

  test("an address in any spelling is asked as the API's player id, and a player that referred nobody answers zeros", async () => {
    const { data } = await client.playerReferrals(BigInt(FIXTURE_BO));
    expect(data).toEqual({ playerId: FIXTURE_BO, total: "0", games: { count: 0, total: "0" }, packs: { count: 0, total: "0" } });
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_BO}/referrals`]);
    await expect(client.playerReferrals("ada")).rejects.toMatchObject({ kind: "rejected" });
  });

  test("an amount past 2^53 stays exact", async () => {
    const big = "123456789012345678901234567890";
    fixture.state.rawBody = { text: JSON.stringify(body({ total: big, games: { count: 1, total: big }, packs: { count: 0, total: "0" } })), httpStatus: 200 };
    expect((await client.playerReferrals(FIXTURE_ADA)).data.total).toBe(big);
  });

  test("a bad answer is an IndexerError, never a misread figure", async () => {
    const answers = [
      body({ total: "1650001" }),
      body({ total: 1650000 }),
      body({ games: { count: -1, total: "1200000" } }),
      body({ packs: { count: 1, total: "4.5" } }),
      body({ packs: null }),
      body({ player_id: FIXTURE_BO }),
    ];
    for (const answer of answers) {
      fixture.state.rawBody = { text: JSON.stringify(answer), httpStatus: 200 };
      const error = await client.playerReferrals(FIXTURE_ADA).catch((e: unknown) => e);
      expect(error, JSON.stringify(answer)).toBeInstanceOf(IndexerError);
      expect((error as IndexerError).kind).toBe("bad-response");
    }
  });

  test("an indexer down or loading fails the read", async () => {
    fixture.state.down = true;
    await expect(client.playerReferrals(FIXTURE_ADA)).rejects.toMatchObject({ kind: "unreachable" });
    fixture.state.down = false;
    fixture.state.status = "loading";
    await expect(client.playerReferrals(FIXTURE_ADA)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
