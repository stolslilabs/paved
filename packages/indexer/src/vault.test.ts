// D-31: the claims of the Vault's USDC (`vault_claims`), the history of the Vault page: `GET /v1/players/{id}/vault/claims`.
import { describe, expect, test } from "vitest";
import { padded } from "./events.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { FakeNode, VAULT, ev, unknownEvent } from "./testing/fake-node.ts";
import { indexerOf, indexerWithVault, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
/** A contract holder (a pool, say): the owner collects its USDC. */
const C = 0xc3n;
const OWNER = 0x0en;
const PA = padded(A);
const PC = padded(C);

/**
 * Ada claims twice (the second a u256 past 2^128), around a purchase's `Paid` and a transfer of shares, which are never
 * fetched; the owner collects the contract holder's USDC once. Block 1 is the empty genesis of the fake node.
 */
function history(node = new FakeNode()) {
  node.mine([ev.vaultPaid(0xe, 600_000n)], [ev.vaultClaimed(A, 1_500_000n)]);
  node.mine([ev.vaultTransfer(A, B, 10n ** 18n), unknownEvent("vault", "Deposit", [B, B], [1, 0, 1, 0]), ev.vaultCollected(C, OWNER, 250_000n)]);
  node.mine([ev.vaultClaimed(A, 2n ** 130n)]);
  return node;
}

async function open(build: (node: FakeNode) => void = history) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerWithVault(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

const txOf = (node: FakeNode, block: number, tx: number) => padded(node.blocks[block]!.transactions[tx]!.hash);

describe("the Vault's claims", () => {
  test("a claim and a collect, each the holder's; newest first; the totals apart", async () => {
    const { node, indexer, queries, head } = await open();
    expect(indexer.status).toBe("ok");
    const ada = queries.playerVaultClaims(head, PA, 20, undefined);
    expect(ada).toEqual({
      player_id: PA,
      claimed: String(2n ** 130n + 1_500_000n),
      count: 2,
      collected: "0",
      collected_count: 0,
      claims: [
        { kind: "claim", amount: String(2n ** 130n), recipient: null, block: 3, tx: 0, idx: 0, transaction_hash: txOf(node, 3, 0), claimed_at: node.blocks[3]!.timestamp },
        { kind: "claim", amount: "1500000", recipient: null, block: 1, tx: 1, idx: 0, transaction_hash: txOf(node, 1, 1), claimed_at: node.blocks[1]!.timestamp },
      ],
      next: null,
    });
    // The collect is the contract holder's, paid to the owner; its position counts the events the filter left out.
    expect(queries.playerVaultClaims(head, PC, 20, undefined)).toEqual({
      player_id: PC,
      claimed: "0",
      count: 0,
      collected: "250000",
      collected_count: 1,
      claims: [{ kind: "collect", amount: "250000", recipient: padded(OWNER), block: 2, tx: 0, idx: 2, transaction_hash: txOf(node, 2, 0), claimed_at: node.blocks[2]!.timestamp }],
      next: null,
    });
    expect(ada.claims[0]!.transaction_hash).toMatch(/^0x[0-9a-f]{64}$/);
    // At an earlier head, the later claim had not happened.
    expect(queries.playerVaultClaims(2, PA, 20, undefined)).toMatchObject({ claimed: "1500000", count: 1, claims: [{ block: 1 }] });
    // The Vault's other events are not stored, and a holder is not a player.
    const dump = indexer.store.dump();
    expect(dump.events.map((e) => [e.source, e.name])).toEqual([
      ["vault", "Claimed"],
      ["vault", "Collected"],
      ["vault", "Claimed"],
    ]);
    expect(dump.players).toEqual([]);
    expect(dump.vault_claims.map((r) => [r.account, r.kind, r.recipient, r.amount])).toEqual([
      [PA, "claim", null, "1500000"],
      [PC, "collect", padded(OWNER), "250000"],
      [PA, "claim", null, String(2n ** 130n)],
    ]);
  });

  test("GET /v1/players/{id}/vault/claims: the envelope, an account with none, the pages and the parameters", async () => {
    const { indexer } = await open();
    const path = (id: string, query = "") => `/v1/players/${id}/vault/claims${query}`;
    const all = respond(indexer, "GET", path(PA));
    expect(all.code).toBe(200);
    expect(all.body).toMatchObject({
      version: 1,
      status: "ok",
      head: { number: 3 },
      behind: 0,
      player_id: PA,
      claimed: String(2n ** 130n + 1_500_000n),
      count: 2,
      collected: "0",
      collected_count: 0,
      next: null,
    });
    // An account with none: zeros, 200.
    const none = respond(indexer, "GET", path(padded(B)));
    expect(none.code).toBe(200);
    expect(none.body).toMatchObject({ player_id: padded(B), claimed: "0", count: 0, collected: "0", collected_count: 0, claims: [], next: null });
    // Pages: the totals stay those of every claim.
    const first = respond(indexer, "GET", path(PA, "?limit=1"));
    expect(first.body).toMatchObject({ count: 2, claims: [{ block: 3 }], next: "3:0:0" });
    const second = respond(indexer, "GET", path(PA, "?limit=1&before=3:0:0"));
    expect(second.body).toMatchObject({ count: 2, claimed: all.body.claimed, claims: [{ block: 1, amount: "1500000" }], next: null });
    // The id in any case is the padded lowercase one.
    expect(respond(indexer, "GET", path(PA.toUpperCase().replace("0X", "0x"))).body).toMatchObject({ player_id: PA, count: 2 });
    for (const bad of ["?limit=0", "?limit=101", "?before=x", "?before=1:2", "?day=1", "?limit=1&limit=2"]) {
      expect(respond(indexer, "GET", path(PA, bad)).code, bad).toBe(400);
    }
    expect(respond(indexer, "GET", path("0x1")).code).toBe(400);
    expect(respond(indexer, "GET", `/v1/players/${PA}/vault`).code).toBe(404);
    expect(respond(indexer, "GET", `/v1/players/${PA}/vault/claims/1`).code).toBe(404);
    // `/claims` stays the cobbles' claims of a day (IX-GEMS1).
    expect(respond(indexer, "GET", `/v1/players/${PA}/claims`).body).toHaveProperty("credits");
    // The head names the Vault it reads.
    expect(respond(indexer, "GET", "/v1/head").body.contracts).toMatchObject({ vault: VAULT });
  });

  test("a reorg takes the claims back, and the tables are those of a rebuild", async () => {
    const { node, indexer, queries } = await open();
    node.reorg(1, [[[ev.vaultClaimed(B, 7n)]]]);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(queries.playerVaultClaims(node.tip, PA, 20, undefined)).toMatchObject({ claimed: "1500000", count: 1 });
    expect(queries.playerVaultClaims(node.tip, padded(B), 20, undefined)).toMatchObject({ claimed: "7", count: 1 });
    const fresh = indexerWithVault(node);
    await settle(fresh);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
    node.reorg(3, [[], [], []]);
    await settle(indexer);
    expect(indexer.store.dump().vault_claims).toEqual([]);
  });

  test("the catch-up by range leaves the claims as block by block does", async () => {
    for (const span of [1, 2, 50]) {
      const node = history();
      for (let i = 0; i < 4; i++) node.mine();
      node.mine([ev.vaultClaimed(B, 9n)], [ev.vaultCollected(C, OWNER, 3n)]);
      node.l1Accepted = node.tip;
      const blockwise = indexerWithVault(node);
      const ranged = indexerWithVault(node, span);
      await settle(blockwise);
      await settle(ranged);
      expect(ranged.status, `span ${span}`).toBe("ok");
      expect(ranged.store.dump().vault_claims, `span ${span}`).toEqual(blockwise.store.dump().vault_claims);
      expect(ranged.store.dump().vault_claims).toHaveLength(5);
    }
  });

  test("a deployment without a Vault reads no claim and names none", async () => {
    const node = history();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.store.dump().vault_claims).toEqual([]);
    expect(respond(indexer, "GET", `/v1/players/${PA}/vault/claims`).body).toMatchObject({ count: 0, claims: [] });
    expect(respond(indexer, "GET", "/v1/head").body.contracts).not.toHaveProperty("vault");
  });
});
