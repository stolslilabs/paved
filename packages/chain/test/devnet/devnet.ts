/**
 * Test setup only: starts a local starknet-devnet and declares the Lobby class and deploys the four contracts from
 * the classes `scarb build` leaves in `contracts/target/dev/`. Not deploy tooling (that is CORE's).
 *
 * Needs `starknet-devnet` 0.10 (`DEVNET_BIN`, default on the PATH) and `universal-sierra-compiler`
 * (`USC_BIN`, default on the PATH), and `scarb build` run in `contracts/` first.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Account, RpcProvider, json } from "starknet";
import type { ContractName } from "../../src/abis";

const CLASSES = resolve(__dirname, "../../../../contracts/target/dev");

export interface DevAccount {
  address: string;
  privateKey: string;
  account: Account;
}

export interface Devnet {
  rpcUrl: string;
  provider: RpcProvider;
  accounts: DevAccount[];
  addresses: Record<ContractName, string>;
  /** Class hash of the declared Lobby library class. */
  lobbyClass: string;
  /** Block of the last deployment. */
  deployedBlock: number;
  stop(): void;
}

async function rpc(url: string, method: string, params: unknown = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function waitReady(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`starknet-devnet exited with ${child.exitCode}`);
    try {
      await rpc(url, "starknet_specVersion");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`starknet-devnet did not answer within ${timeoutMs} ms`);
}

export async function startDevnet(port: number): Promise<Devnet> {
  const bin = process.env.DEVNET_BIN || "starknet-devnet";
  const child = spawn(bin, ["--host", "127.0.0.1", "--port", String(port), "--seed", "0"], { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}/rpc`;
  const work = mkdtempSync(join(tmpdir(), "paved-devnet-"));
  const stop = () => {
    child.kill();
    rmSync(work, { recursive: true, force: true });
  };
  try {
    await waitReady(rpcUrl, child, 30_000);
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const predeployed: Array<{ address: string; private_key: string }> = await rpc(
      rpcUrl,
      "devnet_getPredeployedAccounts",
    );
    const accounts = predeployed.slice(0, 2).map((a) => ({
      address: a.address,
      privateKey: a.private_key,
      account: new Account({ provider, address: a.address, signer: a.private_key }),
    }));
    const deployer = accounts[0].account;
    const owner = accounts[0].address;

    const compile = (name: string) => {
      const sierraPath = join(CLASSES, `paved_${name}.contract_class.json`);
      const casmPath = join(work, `${name}.casm.json`);
      execFileSync(process.env.USC_BIN || "universal-sierra-compiler", [
        "compile-contract",
        "--sierra-path",
        sierraPath,
        "--output-path",
        casmPath,
      ]);
      return { contract: json.parse(readFileSync(sierraPath, "utf8")), casm: json.parse(readFileSync(casmPath, "utf8")) };
    };

    const deploy = async (name: ContractName, constructorCalldata: string[]) => {
      const result = await deployer.declareAndDeploy(
        { ...compile(name), constructorCalldata, salt: "0x1", unique: false },
        { tip: 0n, retryInterval: 200 },
      );
      return result.deploy.contract_address;
    };

    // Lobby (P-26) is declared and never deployed: Daily and Tutorial store its class hash and run it
    // through library calls. Declared before them, as scripts/deploy.sh does.
    const declared = await deployer.declare(compile("Lobby"), { tip: 0n });
    await provider.waitForTransaction(declared.transaction_hash, { retryInterval: 200 });
    const lobbyClass = declared.class_hash;

    const Token = await deploy("Token", []);
    const AccountAddress = await deploy("Account", [owner]);
    const Tutorial = await deploy("Tutorial", [owner, AccountAddress, lobbyClass]);
    const Daily = await deploy("Daily", [owner, AccountAddress, Token, lobbyClass]);
    const deployedBlock = (await provider.getBlockNumber()) as number;

    return {
      rpcUrl,
      provider,
      accounts,
      addresses: { Account: AccountAddress, Daily, Tutorial, Token },
      lobbyClass,
      deployedBlock,
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}
