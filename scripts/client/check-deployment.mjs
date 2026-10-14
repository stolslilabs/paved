#!/usr/bin/env node
// Read-only check of a deployment file against a chain (F0, docs/client/f-release.md). It sends no transaction: only
// `starknet_chainId`, `starknet_blockNumber`, `starknet_getClassHashAt` and `starknet_call` of view functions.
//
//   CHECK_RPC_URL=<url> node scripts/client/check-deployment.mjs --file contracts/deployments/sepolia.json [--rpc <url>]
//
// The RPC URL is read from CHECK_RPC_URL (an argument shows in `ps`); `--rpc` is for a local node and wins when both are set.
// Node 24; starknet.js is used for the selectors when it is installed (see below).
// Exit 0 when every check passes, 1 when one fails, 2 on a usage error. A line starts with PASS, FAIL or SKIP.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

// The entry point selectors are starknet_keccak of the name, derived at run time with starknet.js (`hash.getSelectorFromName`) when
// it resolves from packages/chain (a full `bun install`). A host that installed only the indexer has no starknet: the pinned
// values below are then used, the same ones (checked against a real devnet deployment in F0, #356), and the first line says which.
const PINNED = {
  wiring: "0x181ce878c45381d5be10e5505af16363d8e99e447e64fe9ae455468e4163bab",
  router: "0x36d4e9bb70c9d2aa50e18560b4cdd1b23b30d62b60873d5f23b103e5d7d0185",
  addresses: "0x210e5b5e314de2f302893e9e54a8d74cdb13aabc4483e34a1abb30c0ae64e1b",
};
let derive = null;
try {
  derive = createRequire(new URL("../../packages/chain/package.json", import.meta.url))("starknet").hash.getSelectorFromName;
} catch {
  // not installed here: PINNED
}
const SELECTORS = Object.fromEntries(Object.keys(PINNED).map((name) => [name, derive ? derive(name) : PINNED[name]]));
console.log(`selectors: ${derive ? "derived with starknet.js" : "pinned (starknet.js is not installed here)"}`);
const CHAIN_IDS = { sepolia: "0x534e5f5345504f4c4941", mainnet: "0x534e5f4d41494e" };
// The keys the client reads (packages/chain/src/{deployment.ts,economy/deployment.ts}); MockRouter only where the file has one.
const REQUIRED = ["Challenge", "Setup", "Economy", "PavedToken", "Vault", "Collection", "Faucet"];

const { values } = parseArgs({ options: { file: { type: "string" }, rpc: { type: "string" } } });
if (!values.file) {
  console.error("usage: CHECK_RPC_URL=<url> check-deployment.mjs --file <deployment.json> [--rpc <url>]");
  process.exit(2);
}
const rpcUrl = values.rpc ?? process.env.CHECK_RPC_URL;
if (!rpcUrl || !/^https?:\/\/\S+$/.test(rpcUrl)) {
  console.error("no RPC URL: set CHECK_RPC_URL (or --rpc for a local node)");
  process.exit(2);
}
const file = JSON.parse(readFileSync(values.file, "utf8"));
const contracts = file.contracts ?? {};

let failed = 0;
const report = (ok, line) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${line}`);
};
const skip = (line) => console.log(`SKIP ${line}`);
const big = (value) => {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};
const same = (a, b) => big(a) !== null && big(a) === big(b);

let id = 0;
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}
const view = (address, name) =>
  rpc("starknet_call", { request: { contract_address: address, entry_point_selector: SELECTORS[name], calldata: [] }, block_id: "latest" });

// 1. The chain id: the node's, the file's, and for a public network the known one.
const node = await rpc("starknet_chainId", []);
report(same(node, file.chain_id), `chain id: the node answers ${node}, the file says ${file.chain_id}`);
if (CHAIN_IDS[file.network]) report(same(file.chain_id, CHAIN_IDS[file.network]), `chain id: the file's ${file.network} is ${CHAIN_IDS[file.network]}`);
const tip = await rpc("starknet_blockNumber", []);
report(Number.isInteger(file.deployed_block) && file.deployed_block <= tip, `deployed_block ${file.deployed_block} is an integer at or below the tip ${tip}`);

// 2. The keys the client reads, each with an address; then every address answers with the file's class hash.
const names = [...REQUIRED, ...(contracts.MockRouter ? ["MockRouter"] : [])];
if (!contracts.MockRouter) skip("MockRouter: the file has none (a purchase is then refused on devnet and Sepolia)");
for (const name of names) {
  const entry = contracts[name];
  const address = entry?.address;
  if (!big(address)) {
    report(false, `${name}: no non-zero address in the file`);
    continue;
  }
  report(true, `${name}: key present, address ${address}`);
  try {
    const found = await rpc("starknet_getClassHashAt", { block_id: "latest", contract_address: address });
    if (!entry.class_hash) report(false, `${name}: the file has no class_hash to compare with ${found}`);
    else report(same(found, entry.class_hash), `${name}: getClassHashAt ${found}, the file's class_hash ${entry.class_hash}`);
  } catch (error) {
    report(false, `${name}: ${error.message}`);
  }
}

// 3. The wiring, read from the chain: Setup.wiring() = (economy, collection), Economy.addresses() = (paved, usdc, vault, router, game).
try {
  const [economy, collection] = await view(contracts.Setup?.address, "wiring");
  report(same(economy, contracts.Economy?.address), `Setup.wiring().economy ${economy}, the file's Economy ${contracts.Economy?.address}`);
  report(same(collection, contracts.Collection?.address), `Setup.wiring().collection ${collection}, the file's Collection ${contracts.Collection?.address}`);
} catch (error) {
  report(false, `Setup.wiring(): ${error.message}`);
}
try {
  const [router] = await view(contracts.Economy?.address, "router");
  if (contracts.MockRouter) report(same(router, contracts.MockRouter.address), `Economy.router() ${router}, the file's MockRouter ${contracts.MockRouter.address}`);
  else report(false, `Economy.router() ${router}, but the file has no MockRouter to compare with`);
  const [paved, usdc, vault, , game] = await view(contracts.Economy?.address, "addresses");
  report(same(paved, contracts.PavedToken?.address), `Economy.addresses().paved ${paved}, the file's PavedToken ${contracts.PavedToken?.address}`);
  report(same(usdc, contracts.Faucet?.address), `Economy.addresses().usdc ${usdc}, the file's Faucet ${contracts.Faucet?.address}`);
  report(same(vault, contracts.Vault?.address), `Economy.addresses().vault ${vault}, the file's Vault ${contracts.Vault?.address}`);
  report(same(game, contracts.Challenge?.address), `Economy.addresses().game ${game}, the file's Challenge ${contracts.Challenge?.address}`);
} catch (error) {
  report(false, `Economy views: ${error.message}`);
}

console.log(failed === 0 ? "every check passed; nothing was sent" : `${failed} check(s) failed; nothing was sent`);
process.exit(failed === 0 ? 0 : 1);
