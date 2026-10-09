// Test setup only: a local starknet-devnet 0.10 and the players that play on it. The contracts are deployed by
// `scripts/deploy.sh devnet` (not here), which also writes `contracts/deployments/devnet.json`: the test saves that file
// and writes it back when it is done, so a run leaves the repository as it found it.
//
// Every process this module starts is stopped by its PID.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, RpcProvider, hash } from "starknet";

export const ROOT = resolve(import.meta.dirname, "../../../..");
export const CENTER = 0x7fffffff;

export async function rpc(url: string, method: string, params: unknown = []): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: unknown };
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

export interface Node {
  url: string;
  pid: number;
  stop(): void;
}

/**
 * Starts a fresh seeded node on `port` (DEVNET_BIN, else the asdf 0.10.0 install). `archive` keeps every block's state, which
 * `devnet_abortBlocks` needs.
 */
export async function startNode(port: number, seed = 42, archive = false): Promise<Node> {
  const bin =
    process.env.DEVNET_BIN || `${process.env.ASDF_DATA_DIR || `${homedir()}/.asdf`}/installs/starknet-devnet/0.10.0/bin/starknet-devnet`;
  const child: ChildProcess = spawn(bin, [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--seed",
    String(seed),
    ...(archive ? ["--state-archive-capacity", "full"] : []),
  ], {
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => void child.kill();
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`starknet-devnet exited with ${child.exitCode}`);
    try {
      await rpc(url, "starknet_specVersion");
      return { url, pid: child.pid!, stop };
    } catch {
      if (Date.now() > deadline) {
        stop();
        throw new Error("starknet-devnet did not answer within 30 s");
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/**
 * Runs `scripts/deploy.sh devnet` against `url`; throws with its output on a failure. With PAVED_DEPLOY_UNMERGED=1 it
 * passes `--unmerged` (a pull request's sources): the script then writes the deployment file to a temporary path, which
 * `writtenFile` reads from its output.
 */
export function deploy(url: string): string {
  const args = process.env.PAVED_DEPLOY_UNMERGED === "1" ? ["devnet", "--unmerged"] : ["devnet"];
  const result = spawnSync(resolve(ROOT, "scripts/deploy.sh"), args, {
    cwd: ROOT,
    env: { ...process.env, RPC_URL: url },
    encoding: "utf8",
    timeout: 900_000,
  });
  if (result.status !== 0) throw new Error(`deploy.sh failed (${result.status}): ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** The deployment file an `--unmerged` run wrote (its `== wrote <path>` line), or null for the committed one. */
export function writtenFile(stdout: string): string | null {
  const match = /^== wrote (\/.+\.json)$/m.exec(stdout);
  return match ? match[1]! : null;
}

export interface Receipt {
  transaction_hash: string;
  execution_status: string;
  block_number: number;
  events: { from_address: string; keys: string[]; data: string[] }[];
}

export interface Player {
  address: string;
  account: Account;
  /** Executes calls as this player and returns the receipt; a revert throws (at the fee estimate). */
  send(calls: { contractAddress: string; entrypoint: string; calldata: (string | number | bigint)[] } | { contractAddress: string; entrypoint: string; calldata: (string | number | bigint)[] }[]): Promise<Receipt>;
  /** A read-only call: the felts of the answer. */
  call(contractAddress: string, entrypoint: string, calldata?: (string | number | bigint)[]): Promise<bigint[]>;
}

export async function players(url: string, count: number): Promise<Player[]> {
  const provider = new RpcProvider({ nodeUrl: url });
  const accounts: { address: string; private_key: string }[] = await rpc(url, "devnet_getPredeployedAccounts", { with_balance: false });
  return accounts.slice(0, count).map((a) => {
    const account = new Account({ provider, address: a.address, signer: a.private_key });
    return {
      address: a.address,
      account,
      async send(calls) {
        const { transaction_hash } = await account.execute(calls, { tip: 0n });
        for (let i = 0; i < 100; i++) {
          try {
            const receipt = (await rpc(url, "starknet_getTransactionReceipt", [transaction_hash])) as Receipt;
            if (receipt.execution_status !== "SUCCEEDED") throw new Error(`transaction ${transaction_hash} reverted`);
            return receipt;
          } catch (error) {
            if (!String((error as Error).message).includes("29")) throw error; // 29: transaction hash not found
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        throw new Error(`no receipt for ${transaction_hash}`);
      },
      async call(contractAddress, entrypoint, calldata = []) {
        const felts = (await rpc(url, "starknet_call", {
          request: {
            contract_address: contractAddress,
            entry_point_selector: hash.getSelectorFromName(entrypoint),
            calldata: calldata.map((felt) => `0x${BigInt(felt).toString(16)}`),
          },
          block_id: "latest",
        })) as string[];
        return felts.map((felt) => BigInt(felt));
      },
    } satisfies Player;
  });
}

export interface Contracts {
  Account: string;
  Daily: string;
  Tutorial: string;
  Token: string;
}

const num = (value: string) => BigInt(value);

export class Game {
  private readonly player: Player;
  private readonly daily: string;
  readonly id: number;
  private readonly placed: [number, number][] = [[CENTER, CENTER]];

  constructor(player: Player, daily: string, id: number) {
    this.player = player;
    this.daily = daily;
    this.id = id;
  }

  /**
   * Builds the held tile on the first legal placement around the placed tiles; true when one was built. With
   * `character`, it also tries to put a character on it (a Lord or an Adventurer on a spot), which is what scores.
   */
  async build(character = false): Promise<boolean> {
    const candidates = this.placed.flatMap(([x, y]) => [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as [number, number][]);
    const roles = character ? [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [0, 0]] : [[0, 0]];
    for (const [x, y] of candidates) {
      if (this.placed.some(([px, py]) => px === x && py === y)) continue;
      for (const orientation of [1, 2, 3, 4]) {
        for (const [role, spot] of roles) {
          try {
            await this.player.send({
              contractAddress: this.daily,
              entrypoint: "build",
              calldata: [this.id, orientation, x, y, role!, spot!],
            });
            this.placed.push([x, y]);
            return true;
          } catch {
            // not a legal placement: next
          }
        }
      }
    }
    return false;
  }
}

export { num };
