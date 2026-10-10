import { describe, expect, test } from "vitest";
import { AbiCodec, MAX_BYTE_ARRAY_WORDS } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import { FIXTURE_ADA, FixtureIndexer } from "../src/testing";
import { IndexerClient, IndexerError } from "../src/indexer";
import {
  COLLECTION_ABI,
  FakeCollectionViews,
  MAX_TOKEN_URI_LENGTH,
  NftMetadataError,
  RpcCollectionViews,
  TOKEN_LIMIT,
  TUTORIAL_TOKEN_OFFSET,
  collectionAddress,
  nftLabel,
  nftOf,
  parseTokenUri,
  shortAddress,
  tokenIdOf,
} from "../src/nft";

/** The felts of a Cairo `ByteArray`: full 31-byte words, then the pending word and its length. */
function byteArrayFelts(text: string): string[] {
  const bytes = new TextEncoder().encode(text);
  const words: string[] = [];
  let at = 0;
  for (; at + 31 <= bytes.length; at += 31) words.push("0x" + Buffer.from(bytes.subarray(at, at + 31)).toString("hex"));
  const rest = bytes.subarray(at);
  return [`0x${words.length.toString(16)}`, ...words, rest.length ? "0x" + Buffer.from(rest).toString("hex") : "0x0", `0x${rest.length.toString(16)}`];
}

const dataUri = (json: string) => `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
// The URI of the contract's own test (contracts/src/tests/collection.cairo): token 7, score 0, not over, day 20000.
const CONTRACT_URI = "data:application/json;base64,eyJuYW1lIjoiUGF2ZWQgR2FtZXMgIzciLCJkZXNjcmlwdGlvbiI6IkEgZ2FtZSBvZiBQYXZlZC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU2NvcmUiLCJ2YWx1ZSI6MH0seyJ0cmFpdF90eXBlIjoiT3ZlciIsInZhbHVlIjpmYWxzZX0seyJ0cmFpdF90eXBlIjoiRGF5IiwidmFsdWUiOjIwMDAwfV19";

describe("nftOf", () => {
  test("a Daily token id is the game id", () => {
    expect(nftOf("daily", 1)).toBe(1n);
    expect(nftOf("daily", 912)).toBe(912n);
    expect(nftOf("daily", 0xffffffff)).toBe(0xffffffffn);
  });

  test("a Tutorial token id is 2^32 + the game id, in BigInt", () => {
    expect(TUTORIAL_TOKEN_OFFSET).toBe(2n ** 32n);
    expect(nftOf("tutorial", 1)).toBe(4294967297n);
    expect(nftOf("tutorial", 55)).toBe(4294967351n);
    expect(nftOf("tutorial", 0xffffffff)).toBe(2n ** 33n - 1n);
    expect(nftOf("tutorial", 0xffffffff)).toBeLessThan(TOKEN_LIMIT);
    expect(nftOf("tutorial", 7n)).toBe(2n ** 32n + 7n);
  });

  test("an id that is not a u32 game id is refused, not rounded", () => {
    expect(() => nftOf("daily", -1)).toThrow(RangeError);
    expect(() => nftOf("daily", 1.5)).toThrow(RangeError);
    expect(() => nftOf("daily", 2 ** 32)).toThrow(RangeError);
    expect(() => nftOf("tutorial", Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => nftOf("tutorial", NaN)).toThrow(RangeError);
  });

  test("tokenIdOf reads an indexer token id only if it is a safe non-negative integer", () => {
    expect(tokenIdOf(4294967351)).toBe(4294967351n);
    expect(() => tokenIdOf(-1)).toThrow(RangeError);
    expect(() => tokenIdOf(1.5)).toThrow(RangeError);
    expect(() => tokenIdOf(2 ** 53)).toThrow(RangeError);
  });

  test("the label", () => {
    expect(shortAddress("0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef")).toBe("0x04d1…99ef");
    expect(shortAddress("0x5")).toBe("0x5");
    expect(nftLabel("0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef", 4294967297n)).toBe("NFT: 0x04d1…99ef #4294967297");
  });
});

describe("the Collection's address", () => {
  const FILE = { rpc_url: "http://x", contracts: { Account: { address: "0x1" }, Daily: { address: "0x2" }, Tutorial: { address: "0x3" }, Token: { address: "0x4" } } };

  test("from the deployments file when it has one; none without, and the deployment stays configured", () => {
    const without = resolveDeployment({ network: "devnet", file: FILE });
    expect(without.collection).toBe("");
    expect(without.configured).toBe(true);
    expect(without.missing).toEqual([]);
    const withIt = resolveDeployment({ network: "devnet", file: { ...FILE, contracts: { ...FILE.contracts, Collection: { address: "0x9" } } } });
    expect(withIt.collection).toBe("0x9");
    expect(withIt.configured).toBe(true);
  });

  test("the env overrides the file, and a zero or garbage address is none", () => {
    const file = { ...FILE, contracts: { ...FILE.contracts, Collection: { address: "0x9" } } };
    expect(resolveDeployment({ network: "devnet", file, env: { collection: "0xa" } }).collection).toBe("0xa");
    expect(resolveDeployment({ network: "devnet", file, env: { collection: "nope" } }).collection).toBe("0x9");
    expect(resolveDeployment({ network: "devnet", file: { ...file, contracts: { ...file.contracts, Collection: { address: "0x0" } } } }).collection).toBe("");
  });

  test("the deployment's address (env, then file) comes first, then the indexer's, else null", () => {
    expect(collectionAddress({ collection: "0x9" }, "0x5")).toBe("0x9");
    expect(collectionAddress({ collection: "" }, "0x5")).toBe("0x5");
    expect(collectionAddress({ collection: "0x9" }, null)).toBe("0x9");
    expect(collectionAddress({ collection: "0x9" })).toBe("0x9");
    expect(collectionAddress({ collection: "" }, undefined)).toBeNull();
    expect(collectionAddress({ collection: "" }, "0x0")).toBeNull();
    expect(collectionAddress({ collection: "" }, "junk")).toBeNull();
  });
});

describe("the indexer's token_id and contracts.collection", () => {
  test("a row with token_id (a number or null) parses; one without parses as no token (undefined)", async () => {
    const fixture = new FixtureIndexer();
    const client = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
    const { data } = await client.playerGames(FIXTURE_ADA);
    expect(data.games.map((g) => g.tokenId)).toEqual([912, 4294967351]);

    fixture.games = fixture.games.map((g, i) => (i === 0 ? { ...g, token_id: null } : (({ token_id: _t, ...rest }) => rest)(g)));
    expect((await client.playerGames(FIXTURE_ADA)).data.games.map((g) => g.tokenId)).toEqual([null, undefined]);
  });

  test("a token_id that is not a safe integer or null is a bad answer", async () => {
    for (const bad of ["12", 1.5, -1, 2 ** 53, true, {}]) {
      const fixture = new FixtureIndexer();
      const client = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
      fixture.games = fixture.games.map((g) => ({ ...g, token_id: bad }));
      const error = await client.playerGames(FIXTURE_ADA).then(() => null, (e: IndexerError) => e);
      expect(error?.kind, String(bad)).toBe("bad-response");
    }
  });

  test("/v1/head: contracts.collection is read, and null (no Collection) is left out instead of failing the head", async () => {
    const fixture = new FixtureIndexer();
    const client = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
    expect((await client.head()).data.contracts.collection).toBeUndefined();
    fixture.state.collection = "0x5";
    expect((await client.head()).data.contracts.collection).toBe("0x5");
    fixture.state.collection = null;
    const { data } = await client.head();
    expect(data.contracts.collection).toBeUndefined();
    expect(data.contracts.daily).toBe("0x2");
  });

  test("a null in any other contracts key stays a bad answer", async () => {
    const fixture = new FixtureIndexer();
    const client = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
    for (const key of ["daily", "account", "economy"]) {
      fixture.state.rawBody = {
        text: JSON.stringify({ version: 1, status: "ok", head: { number: 1, hash: "0x1", timestamp: 1 }, behind: 0, state: "ok", chain_id: "0x1", from_block: 3, contracts: { daily: "0x2", collection: null, [key]: null } }),
        httpStatus: 200,
      };
      const error = await client.head().then(() => null, (e: IndexerError) => e);
      expect(error?.kind, key).toBe("bad-response");
    }
  });
});

describe("ByteArray in the codec", () => {
  const codec = new AbiCodec(COLLECTION_ABI);

  test("token_uri's result decodes to the text, for each length around the 31-byte word", () => {
    for (const length of [0, 1, 30, 31, 32, 61, 62, 63, 300]) {
      const text = "a".repeat(length);
      expect(codec.decodeResult("token_uri", byteArrayFelts(text)), String(length)).toBe(text);
    }
    expect(codec.decodeResult("token_uri", byteArrayFelts(CONTRACT_URI))).toBe(CONTRACT_URI);
  });

  test("UTF-8 crosses word boundaries", () => {
    const text = "é".repeat(40) + "✓";
    expect(codec.decodeResult("token_uri", byteArrayFelts(text))).toBe(text);
  });

  test("a malformed ByteArray is an ABI mismatch, never a guess", () => {
    const bad = (felts: string[]) => expect(() => codec.decodeResult("token_uri", felts)).toThrow(/token_uri/);
    bad([]); // nothing
    bad(["0x1", "0x61"]); // a word promised, no pending word
    bad(["0x0", "0x61", "0x1f"]); // pending length above 30
    bad(["0x0", "0x100", "0x1"]); // pending word wider than its length
    bad([`0x${(MAX_BYTE_ARRAY_WORDS + 1).toString(16)}`]); // above the bound
    bad([...byteArrayFelts("hello"), "0x1"]); // felts left over
  });

  test("encodes a u256 token id for the call", () => {
    expect(codec.encodeCall("token_uri", [4294967351n])).toEqual(["0x100000037", "0x0"]);
  });

  test("RpcCollectionViews calls the Collection with the id's two limbs and decodes the answer", async () => {
    const seen: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
    const provider = {
      callContract: async (call: { contractAddress: string; entrypoint: string; calldata: string[] }) => {
        seen.push(call);
        return call.entrypoint === "token_uri" ? byteArrayFelts(CONTRACT_URI) : ["0xabc"];
      },
    };
    const views = new RpcCollectionViews(provider, "0x77");
    expect(await views.tokenUri(2n ** 32n + 7n)).toBe(CONTRACT_URI);
    expect(await views.ownerOf(7n)).toBe("0xabc");
    expect(seen).toEqual([
      { contractAddress: "0x77", entrypoint: "token_uri", calldata: ["0x100000007", "0x0"] },
      { contractAddress: "0x77", entrypoint: "owner_of", calldata: ["0x7", "0x0"] },
    ]);
  });

  test("a revert is a view error, and no address is not-configured", async () => {
    const failing = new RpcCollectionViews({ callContract: async () => Promise.reject(new Error("boom")) }, "0x77");
    await expect(failing.tokenUri(1n)).rejects.toMatchObject({ kind: "rpc" });
    await expect(new RpcCollectionViews({ callContract: async () => [] }, "").tokenUri(1n)).rejects.toMatchObject({ kind: "not-configured" });
  });

  test("the fake serves what it was given and fails for an unknown token", async () => {
    const fake = new FakeCollectionViews();
    fake.uris.set("7", "u");
    expect(await fake.tokenUri(7n)).toBe("u");
    await expect(fake.tokenUri(8n)).rejects.toMatchObject({ kind: "rpc" });
  });
});

describe("parseTokenUri", () => {
  test("the contract's own token_uri", () => {
    const m = parseTokenUri(CONTRACT_URI);
    expect(m.name).toBe("Paved Games #7");
    expect(m.description).toBe("A game of Paved.");
    expect(m.attributes).toEqual([
      { traitType: "Score", value: "0" },
      { traitType: "Over", value: "false" },
      { traitType: "Day", value: "20000" },
    ]);
    expect(JSON.parse(m.json)).toMatchObject({ name: "Paved Games #7" });
  });

  test("a percent-encoded data URI reads too", () => {
    const m = parseTokenUri(`data:application/json;charset=utf-8,${encodeURIComponent('{"name":"x y"}')}`);
    expect(m).toMatchObject({ name: "x y", description: null, attributes: [] });
  });

  test("hostile strings stay strings: markup, scripts and odd types are data", () => {
    const hostile = {
      name: '<img src=x onerror="alert(1)">',
      description: "</script><script>alert(2)</script>",
      attributes: [
        { trait_type: "<b>t</b>", value: "javascript:alert(3)" },
        { trait_type: "n", value: { nested: "<i>" } }, // not text: dropped
        { trait_type: "ok", value: 5 },
        "<u>x</u>", // not an object: dropped
        null,
      ],
    };
    const m = parseTokenUri(dataUri(JSON.stringify(hostile)));
    expect(m.name).toBe('<img src=x onerror="alert(1)">');
    expect(m.description).toBe("</script><script>alert(2)</script>");
    expect(m.attributes).toEqual([
      { traitType: "<b>t</b>", value: "javascript:alert(3)" },
      { traitType: "ok", value: "5" },
    ]);
  });

  test("a name that is not text is none; a non-array attributes is empty", () => {
    expect(parseTokenUri(dataUri('{"name":{"a":1},"description":null,"attributes":"x"}'))).toMatchObject({ name: null, description: null, attributes: [] });
  });

  test("anything else is refused with a NftMetadataError: other schemes, HTML, bad base64, bad JSON, non-objects, huge", () => {
    const refused = (uri: string) => expect(() => parseTokenUri(uri), uri.slice(0, 40)).toThrow(NftMetadataError);
    refused("https://example.com/1.json");
    refused("ipfs://Qm123");
    refused("");
    refused("data:text/html;base64,PGI+eDwvYj4=");
    refused("data:text/html,<script>alert(1)</script>");
    refused("data:application/json;base64,@@@@");
    refused("data:application/json;base64,bm90IGpzb24="); // "not json"
    refused(dataUri("[1,2]"));
    refused(dataUri("null"));
    refused(dataUri('"str"'));
    refused(`data:application/json,${"a".repeat(MAX_TOKEN_URI_LENGTH)}`);
    refused("data:application/json;base64,/+8="); // bytes that are not UTF-8
  });
});
