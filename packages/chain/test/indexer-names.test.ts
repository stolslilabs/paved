/** `/v1/names/:name` (PLAYER-RENAME): who holds a player name, whatever its case: the chain's name, else a Cartridge username. */
import { beforeEach, describe, expect, test } from "vitest";
import { FIXTURE_ADA, FixtureIndexer } from "../src/testing";
import { IndexerClient, IndexerError } from "../src/indexer";
import { nameKey } from "../src/avatar";

let fixture: FixtureIndexer;
let client: IndexerClient;
beforeEach(() => {
  fixture = new FixtureIndexer();
  client = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
});

const body = (fields: Record<string, unknown>) => ({ version: 1, status: "ok", head: { number: 20, hash: "0x1", timestamp: 1791878100 }, behind: 0, ...fields });

describe("nameHolder", () => {
  test("the holder and where its name is; nobody", async () => {
    fixture.holders.set(nameKey("élodie")!, { playerId: FIXTURE_ADA, source: "chain" });
    expect((await client.nameHolder("ÉLODIE")).data).toEqual({ name: "ÉLODIE", playerId: FIXTURE_ADA, source: "chain" });
    expect((await client.nameHolder("李小龙 Lee")).data).toEqual({ name: "李小龙 Lee", playerId: null, source: null });
    // Percent-encoded in the path: UTF-8, the space
    expect(fixture.requests).toEqual(["/v1/names/%C3%89LODIE", "/v1/names/%E6%9D%8E%E5%B0%8F%E9%BE%99%20Lee"]);
  });

  test("a text that is not a name is refused before any request; a bad answer is a bad answer", async () => {
    await expect(client.nameHolder("a  b")).rejects.toBeInstanceOf(IndexerError);
    await expect(client.nameHolder("ab")).rejects.toBeInstanceOf(IndexerError);
    expect(fixture.requests).toEqual([]);
    for (const answer of [
      body({ name: "Mason", player_id: FIXTURE_ADA, source: "nowhere" }),
      body({ name: "Mason", player_id: FIXTURE_ADA, source: null }),
      body({ name: "Mason", player_id: null, source: "chain" }),
      body({ name: "Other", player_id: null, source: null }),
    ]) {
      fixture.state.rawBody = { text: JSON.stringify(answer), httpStatus: 200 };
      await expect(client.nameHolder("Mason"), JSON.stringify(answer)).rejects.toMatchObject({ kind: "bad-response" });
    }
  });
});
