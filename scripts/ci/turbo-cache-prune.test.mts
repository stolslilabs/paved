/** The turbo cache prune of the client jobs (scripts/ci/turbo-cache-prune.mts): `node --test scripts/ci/turbo-cache-prune.test.mts`. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hashOf, prune, usedHashes } from "./turbo-cache-prune.mts";

const dirs = () => {
  const root = mkdtempSync(join(tmpdir(), "turbo-prune-"));
  const cache = join(root, "cache");
  const runs = join(root, "runs");
  mkdirSync(cache);
  mkdirSync(runs);
  return { cache, runs };
};
const entry = (cache: string, hash: string) => {
  for (const suffix of [".tar.zst", "-meta.json", "-manifest.json"]) writeFileSync(join(cache, hash + suffix), "x");
};

test("reads the task hashes of every run summary", () => {
  const { runs } = dirs();
  writeFileSync(join(runs, "a.json"), JSON.stringify({ tasks: [{ taskId: "@paved/ui#build", hash: "aaaa" }, { hash: "bbbb" }] }));
  writeFileSync(join(runs, "b.json"), JSON.stringify({ tasks: [{ hash: "cccc" }, { hash: "aaaa" }] }));
  writeFileSync(join(runs, "notes.txt"), "not a summary");
  assert.deepEqual([...usedHashes(runs)].sort(), ["aaaa", "bbbb", "cccc"]);
  assert.equal(usedHashes(join(runs, "missing")).size, 0);
});

test("an entry's hash is its name up to the first dot or dash", () => {
  assert.equal(hashOf("6962caa2fbb57949.tar.zst"), "6962caa2fbb57949");
  assert.equal(hashOf("6962caa2fbb57949-meta.json"), "6962caa2fbb57949");
  assert.equal(hashOf("6962caa2fbb57949-manifest.json"), "6962caa2fbb57949");
});

test("keeps the entries of the hashes used and deletes every other", () => {
  const { cache } = dirs();
  entry(cache, "aaaa");
  entry(cache, "dddd");
  const { kept, deleted } = prune(cache, new Set(["aaaa", "cccc"]));
  assert.deepEqual(kept.sort(), ["aaaa-manifest.json", "aaaa-meta.json", "aaaa.tar.zst"]);
  assert.deepEqual(deleted.sort(), ["dddd-manifest.json", "dddd-meta.json", "dddd.tar.zst"]);
  assert.deepEqual(readdirSync(cache).sort(), kept.sort());
});

test("a missing cache folder prunes nothing", () => {
  const { cache } = dirs();
  assert.deepEqual(prune(join(cache, "missing"), new Set(["aaaa"])), { kept: [], deleted: [] });
});
