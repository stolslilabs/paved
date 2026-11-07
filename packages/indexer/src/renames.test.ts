// PLAYER-RENAME: the names the players set on `Avatar` (`renames`): a name set on chain wins over the Cartridge username wherever a
// name is served, and `GET /v1/names/{name}` says who holds a name, whatever its case.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { keysOf } from "./chain.ts";
import { DecodeError, SELECTORS, decode, padded, playerName } from "./events.ts";
import { NameResolver, type Lookup } from "./names.ts";
import { Queries } from "./queries.ts";
import { respond } from "./server.ts";
import { AVATAR, FakeNode, byteArray, ev } from "./testing/fake-node.ts";
import { indexerOf, indexerWithAvatar, settle } from "./testing/setup.ts";

const A = 0xa1n;
const B = 0xb2n;
const C = 0xc3n;
const PA = padded(A);
const PB = padded(B);
const PC = padded(C);
const DAY = 100;
const felts = (text: string) => byteArray(text).map((v) => `0x${v.toString(16)}`);

type AbiMember = { name: string; type: string; kind: string };
type AbiItem = { type: string; name: string; kind?: string; members?: AbiMember[] };

/**
 * Ada and Bob play; Ada renames herself twice (free, then 50 Cobbles: "Mossy Mason", then "李小龙"), Cid (who never plays) once
 * ("Élodie"); Avatar's look is set between, never fetched. Block 1 is the empty genesis of the fake node.
 */
function history(node = new FakeNode()) {
  node.mine([ev.spawned("challenge", 1, A, { day: DAY })], [ev.spawned("challenge", 2, B, { day: DAY })]);
  node.mine([ev.renamed(A, "Mossy Mason")], [ev.avatarSet(A, 0x101n), ev.renamed(C, "Élodie")]);
  node.mine([ev.renamed(A, "李小龙", 50, 2)]);
  return node;
}

async function open(build: (node: FakeNode) => void = history) {
  const node = new FakeNode();
  build(node);
  const indexer = indexerWithAvatar(node);
  await settle(indexer);
  return { node, indexer, queries: new Queries(indexer.store), head: node.tip };
}

/** A resolver whose cache knows `known` (address -> Cartridge username): no request is made. */
function cached(indexer: Awaited<ReturnType<typeof open>>["indexer"], known: Record<string, string>) {
  indexer.store.putNames(Object.entries(known).map(([address, name]) => ({ address, name, checked_at: Date.now() })));
  const lookup: Lookup = async () => new Map();
  return new NameResolver({ store: indexer.store, lookup });
}

describe("Avatar's Renamed (PLAYER-RENAME)", () => {
  test("Avatar.json declares it as the decoder reads it: key player_id; data name, cobbles, count", () => {
    const abi = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../contracts/abis/Avatar.json"), "utf8")) as AbiItem[];
    const item = abi.find((i) => i.type === "event" && i.kind === "struct" && i.name.endsWith("::Renamed"))!;
    expect(item.members!.filter((m) => m.kind === "key").map((m) => m.name)).toEqual(["player_id"]);
    expect(item.members!.filter((m) => m.kind === "data").map((m) => [m.name, m.type.split("::").at(-1)])).toEqual([
      ["name", "ByteArray"],
      ["cobbles", "u16"],
      ["count", "u32"],
    ]);
    // Only it is fetched of Avatar's events.
    expect(keysOf("avatar")).toEqual([[SELECTORS.Renamed]]);
  });

  test("decodes strictly: a ByteArray of UTF-8 that is a player name, the widths, a count of 0 refused", () => {
    const e = ev.renamed(A, "Mossy-Mason 27", 50, 2);
    expect(decode("avatar", e.keys, e.data)).toEqual({ name: "Renamed", playerId: A, text: "Mossy-Mason 27", cobbles: 50, count: 2 });
    // 15 Chinese characters: 45 bytes, one full word and a pending one
    const long = "李小龙李小龙李小龙李小龙李小龙";
    const l = ev.renamed(B, long);
    expect(decode("avatar", l.keys, l.data)).toMatchObject({ text: long });
    expect(playerName(felts("Élodie"), 0)).toEqual({ text: "Élodie", next: 3 });
    const bad = (data: string[]) => () => decode("avatar", e.keys, data);
    for (const name of ["ab", "a  b c", "1234567890123456", " abc", "b\u0430l7hazar", "a\u200bbc"]) expect(bad([...felts(name), "0x0", "0x1"]), name).toThrow(DecodeError);
    // Not UTF-8, a pending word wider than its length, two full words, a cobbles past u16, a count of 0, a field missing or left over
    expect(bad(["0x0", "0x61ff62", "0x3", "0x0", "0x1"])).toThrow(DecodeError);
    expect(bad(["0x0", "0x61626364", "0x3", "0x0", "0x1"])).toThrow(DecodeError);
    expect(bad(["0x2", "0x1", "0x1", "0x0", "0x0", "0x0", "0x1"])).toThrow(DecodeError);
    expect(bad([...felts("Mason"), "0x10000", "0x1"])).toThrow(DecodeError);
    expect(bad([...felts("Mason"), "0x0", "0x0"])).toThrow(DecodeError);
    expect(bad([...felts("Mason"), "0x0"])).toThrow(DecodeError);
    expect(bad([...felts("Mason"), "0x0", "0x1", "0x1"])).toThrow(DecodeError);
    expect(() => decode("setup", e.keys, e.data)).toThrow(DecodeError);
  });

  test("each rename is a row at its position; the look is never fetched; a renamer is not a player", async () => {
    const { indexer, queries, head } = await open();
    expect(indexer.status).toBe("ok");
    const dump = indexer.store.dump();
    expect(dump.events.filter((e) => e.source === "avatar").map((e) => e.name)).toEqual(["Renamed", "Renamed", "Renamed"]);
    expect(dump.renames.map((r) => [r.player_id, r.name, r.name_key, r.cobbles, r.count])).toEqual([
      [PA, "Mossy Mason", "mossy mason", 0, 1],
      [PC, "Élodie", "élodie", 0, 1],
      [PA, "李小龙", "李小龙", 50, 2],
    ]);
    expect(dump.players.map((p) => p.player_id)).toEqual([PA, PB]);
    // The latest name of each, at the head and earlier.
    expect(queries.chainNames(head, [PA, PB, PC])).toEqual(new Map([[PA, "李小龙"], [PC, "Élodie"]]));
    expect(queries.chainNames(head - 1, [PA])).toEqual(new Map([[PA, "Mossy Mason"]]));
    expect(queries.chainNames(head - 2, [PA])).toEqual(new Map());
  });

  test("a name set on chain wins over the Cartridge username everywhere a name is served; the others keep theirs", async () => {
    const { indexer } = await open();
    const resolver = cached(indexer, { [PA]: "ada", [PB]: "bob" });
    const get = (path: string) => respond(indexer, "GET", path, undefined, resolver).body;
    expect(get(`/v1/players/${PA}`)).toMatchObject({ player: { player_id: PA, name: "李小龙" } });
    expect(get(`/v1/players/${PB}`)).toMatchObject({ player: { player_id: PB, name: "bob" } });
    // Without a resolver, the chain's names still.
    expect(respond(indexer, "GET", `/v1/players/${PA}`).body).toMatchObject({ player: { name: "李小龙" } });
    expect(respond(indexer, "GET", `/v1/players/${PB}`).body).toMatchObject({ player: { name: null } });
  });

  test("GET /v1/names/{name}: the chain's holder in any case, else a Cartridge username's, a renamed player's username freed", async () => {
    const { indexer } = await open();
    cached(indexer, { [PA]: "ada", [PB]: "bob" });
    const holder = (name: string) => respond(indexer, "GET", `/v1/names/${encodeURIComponent(name)}`).body;
    expect(holder("李小龙")).toMatchObject({ version: 1, status: "ok", name: "李小龙", player_id: PA, source: "chain" });
    expect(holder("ÉLODIE")).toMatchObject({ name: "ÉLODIE", player_id: PC, source: "chain" });
    expect(holder("Bob")).toMatchObject({ player_id: PB, source: "cartridge" });
    // The names Ada left, on chain and Cartridge's: free.
    expect(holder("Mossy Mason")).toMatchObject({ player_id: null, source: null });
    expect(holder("ada")).toMatchObject({ player_id: null, source: null });
    expect(holder("Nobody42")).toMatchObject({ player_id: null, source: null });
    for (const bad of ["ab", "a--b", "1234567890123456", " abc", "%E0%A4"]) expect(respond(indexer, "GET", `/v1/names/${bad.startsWith("%") ? bad : encodeURIComponent(bad)}`).code, bad).toBe(400);
    expect(respond(indexer, "GET", "/v1/names/Mason?x=1").code).toBe(400);
    expect(respond(indexer, "GET", "/v1/names/Mason/x").code).toBe(404);
    expect(respond(indexer, "GET", "/v1/head").body.contracts).toMatchObject({ avatar: AVATAR });
  });

  test("a reorg takes a rename back, and the tables are those of a rebuild", async () => {
    const { node, indexer, queries } = await open();
    node.reorg(1, [[[ev.renamed(B, "Bobby")]]]);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(queries.chainNames(node.tip, [PA, PB])).toEqual(new Map([[PA, "Mossy Mason"], [PB, "Bobby"]]));
    const fresh = indexerWithAvatar(node);
    await settle(fresh);
    expect(indexer.store.dump()).toEqual(fresh.store.dump());
  });

  test("a deployment without an Avatar reads no name and names none", async () => {
    const node = history();
    const indexer = indexerOf(node);
    await settle(indexer);
    expect(indexer.status).toBe("ok");
    expect(indexer.store.dump().renames).toEqual([]);
    expect(respond(indexer, "GET", `/v1/players/${PA}`).body).toMatchObject({ player: { name: null } });
    expect(respond(indexer, "GET", "/v1/head").body.contracts).not.toHaveProperty("avatar");
  });
});

describe("the names' rules (player-name.ts)", () => {
  test("are @paved/chain's: the same vectors, the same keys", async () => {
    const { nameKey } = await import("./player-name.ts");
    const valid = ["abc", "MossyMason27", "Mossy Mason", "Jean-Luc", "李小龙", "Élodie", "Анна", "李小龙 Lee 7", "佐々木", "मोहन", "محمد"];
    const invalid = ["", "ab", "1234567890123456", " abc", "abc ", "ab  c", "ab--c", "ab_c", "a\u00a0bc", "a\u200bbc", "E\u0301lo", "ab\u{1F600}", "b\u0430l7hazar", "\u0391bc"];
    for (const name of valid) expect(nameKey(name), name).not.toBeNull();
    for (const name of invalid) expect(nameKey(name), JSON.stringify(name)).toBeNull();
    expect(nameKey("ÉLODIE")).toBe(nameKey("élodie"));
    expect(nameKey("АННА")).toBe("анна");
    // The source of truth is the chain package's copy: the two files hold the same rules
    const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");
    const rules = (text: string) => text.slice(text.indexOf("const SPACE = 0x20;"), text.indexOf("/** Unicode's letters, marks and numbers") === -1 ? undefined : text.indexOf("/** Unicode's letters, marks and numbers"));
    expect(rules(read("./player-name.ts")).trim()).toBe(rules(read("../../chain/src/avatar.ts")).trim());
  });
});
