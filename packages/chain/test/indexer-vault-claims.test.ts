/** `/v1/players/:id/vault/claims` (D-31): a holder's claims of the Vault's USDC, newest first, and its totals. */
import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FIXTURE_BO, FixtureIndexer } from "../src/testing";
import { IndexerClient, IndexerError } from "../src/indexer";

let fixture: FixtureIndexer;
let client: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
});

const HASH = `0x${"ab".repeat(32)}`;
const OWNER = `0x${"0e".padStart(64, "0")}`;
const BIG = String(2n ** 130n);

const claim = (fields: Record<string, unknown> = {}) => ({
  kind: "claim",
  amount: "1500000",
  recipient: null,
  block: 12,
  tx: 1,
  idx: 0,
  transaction_hash: HASH,
  claimed_at: 1791878004,
  ...fields,
});

const body = (fields: Record<string, unknown> = {}) => ({
  version: 1,
  status: "ok",
  head: { number: 20, hash: "0x1", timestamp: 1791878100 },
  behind: 0,
  player_id: FIXTURE_ADA,
  claimed: String(2n ** 130n + 1_500_000n),
  count: 2,
  collected: "250000",
  collected_count: 1,
  claims: [claim({ amount: BIG, block: 19, tx: 0 }), claim({ kind: "collect", amount: "250000", recipient: OWNER, block: 15, idx: 2 }), claim()],
  next: null,
  ...fields,
});

const serve = (answer: unknown) => {
  fixture.state.rawBody = { text: JSON.stringify(answer), httpStatus: 200 };
};

describe("playerVaultClaims", () => {
  test("reads the claims newest first and the totals, USDC base units as exact decimal strings", async () => {
    serve(body());
    const { data } = await client.playerVaultClaims(FIXTURE_ADA);
    expect(data).toEqual({
      playerId: FIXTURE_ADA,
      claimed: String(2n ** 130n + 1_500_000n),
      count: 2,
      collected: "250000",
      collectedCount: 1,
      claims: [
        { kind: "claim", amount: BIG, recipient: null, block: 19, tx: 0, idx: 0, transactionHash: HASH, claimedAt: 1791878004 },
        { kind: "collect", amount: "250000", recipient: OWNER, block: 15, tx: 1, idx: 2, transactionHash: HASH, claimedAt: 1791878004 },
        { kind: "claim", amount: "1500000", recipient: null, block: 12, tx: 1, idx: 0, transactionHash: HASH, claimedAt: 1791878004 },
      ],
      next: null,
    });
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_ADA}/vault/claims`]);
  });

  test("an address in any spelling is asked as the API's player id; a page passes limit and before", async () => {
    serve(body({ player_id: FIXTURE_BO, claimed: "0", count: 0, collected: "0", collected_count: 0, claims: [] }));
    expect((await client.playerVaultClaims(BigInt(FIXTURE_BO))).data).toMatchObject({ playerId: FIXTURE_BO, claims: [], claimed: "0" });
    // A later page holds some of the claims only: the totals are every claim's, not the page's.
    serve(body({ claims: [claim()], next: "12:1:0" }));
    const { data } = await client.playerVaultClaims(FIXTURE_ADA, { limit: 1, before: "19:0:0" });
    expect(data).toMatchObject({ count: 2, claims: [{ block: 12 }], next: "12:1:0" });
    expect(fixture.requests).toEqual([`/v1/players/${FIXTURE_BO}/vault/claims`, `/v1/players/${FIXTURE_ADA}/vault/claims?limit=1&before=19%3A0%3A0`]);
    await expect(client.playerVaultClaims("ada")).rejects.toMatchObject({ kind: "rejected" });
  });

  test("a bad answer is an IndexerError, never a misread figure", async () => {
    const answers = [
      body({ claimed: "1" }),
      body({ count: 3 }),
      body({ collected: "250001" }),
      body({ collected_count: 0 }),
      body({ claimed: 1 }),
      body({ player_id: FIXTURE_BO }),
      body({ claims: [claim({ kind: "stake" })], claimed: "1500000", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: [claim({ recipient: OWNER })], claimed: "1500000", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: [claim({ kind: "collect" })], claimed: "0", count: 0, collected: "1500000", collected_count: 1 }),
      body({ claims: [claim({ amount: "1.5" })], claimed: "1500000", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: [claim({ amount: "0" })], claimed: "0", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: [claim({ transaction_hash: "0x1" })], claimed: "1500000", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: [claim({ claimed_at: -1 })], claimed: "1500000", count: 1, collected: "0", collected_count: 0 }),
      body({ claims: null }),
    ];
    for (const answer of answers) {
      serve(answer);
      const error = await client.playerVaultClaims(FIXTURE_ADA).catch((e: unknown) => e);
      expect(error, JSON.stringify(answer)).toBeInstanceOf(IndexerError);
      expect((error as IndexerError).kind).toBe("bad-response");
    }
  });

  test("an indexer down or loading fails the read", async () => {
    fixture.state.down = true;
    await expect(client.playerVaultClaims(FIXTURE_ADA)).rejects.toMatchObject({ kind: "unreachable" });
    fixture.state.down = false;
    fixture.state.status = "loading";
    await expect(client.playerVaultClaims(FIXTURE_ADA)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
