import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_PORT } from "./server.ts";
import { afterAll, describe, expect, test } from "vitest";

const main = resolve(import.meta.dirname, "main.ts");
const dir = mkdtempSync(join(tmpdir(), "paved-indexer-main-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (...args: string[]) =>
  spawnSync(process.execPath, [main, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    env: { PATH: process.env.PATH ?? "", INDEXER_RPC_URL: "" },
  });

const deployment = join(dir, "devnet.json");
writeFileSync(
  deployment,
  JSON.stringify({
    network: "devnet",
    chain_id: "0x534e5f5345504f4c4941",
    rpc_url: "http://127.0.0.1:5050",
    deployed_block: 5,
    contracts: {
      Account: { address: "0x3" },
      Daily: { address: "0x1" },
      Tutorial: { address: "0x2" },
    },
  }),
);

describe("the command line", () => {
  test.each([
    [["serve"], /run or rebuild/],
    [["run"], /--deployment is required/],
    [["run", "--deployment", deployment], /--db is required/],
    [["run", "--deployment", join(dir, "missing.json"), "--db", join(dir, "a.db")], /cannot read the deployment file/],
    [["run", "--deployment", deployment, "--db", join(dir, "a.db"), "--rpc", "ws://x"], /not an http\(s\) URL/],
    [["run", "--deployment", deployment, "--db", join(dir, "a.db"), "--rpc", "http://127.0.0.1:1", "--poll", "0"], /--poll must be/],
    [["run", "--deployment", deployment, "--db", join(dir, "a.db"), "--rpc", "http://127.0.0.1:1", "--allow-origin", "http://x/path"], /an origin/],
    [["run", "--deployment", deployment, "--db", join(dir, "a.db"), "--rpc", "http://127.0.0.1:1", "--hub", "0x1"], /Unknown option/i],
  ])("%j exits 2 with a reason", (args, message) => {
    const result = run(...args);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(message);
  });

  test("the usage names the default port, 8787 (P-20)", () => {
    expect(DEFAULT_PORT).toBe(8787);
    expect(run("serve").stderr).toMatch(/--port <n> \(default 8787, 0: a free port\)/);
  });

  test("without any RPC URL, a non-local deployment is refused, a local one defaults to its file's", () => {
    const remote = join(dir, "sepolia.json");
    writeFileSync(remote, JSON.stringify({ ...JSON.parse(JSON.stringify({ network: "sepolia", chain_id: "0x1", rpc_url: "https://rpc.example.com", deployed_block: 1, contracts: { Account: { address: "0x3" }, Daily: { address: "0x1" }, Tutorial: { address: "0x2" } } })) }));
    const result = run("run", "--deployment", remote, "--db", join(dir, "b.db"));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no RPC URL/);
  });
});
