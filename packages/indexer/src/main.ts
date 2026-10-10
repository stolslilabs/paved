#!/usr/bin/env node
// Copied from Grim World, indexer/src/main.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: `run` and `rebuild` are kept; `--from`, `--hub` and `--market` are replaced by
// `--deployment <file>` (the addresses and `deployed_block` come from it), the options of the subscriptions are removed, and
// the chain id of the node is checked against the file's. This copy is maintained by the Paved repository.
//
// The indexer's process. packages/indexer/README.md has the options and their rules.
//
//   INDEXER_RPC_URL=<url> indexer run     --deployment <file> --db <file> [options]
//   INDEXER_RPC_URL=<url> indexer rebuild --deployment <file> --db <file> [options]
//
// `run` follows the node from the database's tip (a new database: from the deployment's `deployed_block`); `rebuild`
// empties the database, then runs from there. A database remembers the deployment it was built for; `run` on another one
// is refused, and `rebuild` is the way to follow a redeployed set of contracts.
// The RPC URL may carry a provider's key: it is never logged, not even when it is refused.
import { parseArgs } from "node:util";
import { Chain, httpRpc, parseRpcUrl, redact } from "./chain.ts";
import { CrossCheck } from "./crosscheck.ts";
import {
  DeploymentError,
  defaultRpcUrl,
  readDeployment,
} from "./deployment.ts";
import { Indexer, type Depth } from "./indexer.ts";
import { DEFAULT_PORT, serve } from "./server.ts";
import { SchemaMismatch, Store, deploymentHash } from "./store.ts";

const USAGE =
  `usage: indexer run|rebuild --deployment <file> --db <file> [--port <n> (default ${DEFAULT_PORT}, 0: a free port)] [--host <h>] [--poll <ms>] [--depth <blocks>|l1] [--batch <n>] [--recheck <blocks>] [--recheck-every <ms>] [--allow-origin <origin>]... [--rpc <url>]`;

function log(message: string) {
  console.log(`[indexer ${new Date().toISOString()}] ${message}`);
}

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(2);
}

/** A whole number option, at least `min`. */
function integer(
  value: string | undefined,
  name: string,
  fallback: number | undefined,
  min = 0,
): number {
  if (value === undefined) {
    if (fallback === undefined) fail(`--${name} is required`);
    return fallback;
  }
  if (!/^\d{1,15}$/.test(value) || Number(value) < min) {
    fail(`--${name} must be a whole number of at least ${min}`);
  }
  return Number(value);
}

function parsed() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        deployment: { type: "string" },
        db: { type: "string" },
        port: { type: "string" },
        host: { type: "string" },
        poll: { type: "string" },
        depth: { type: "string" },
        batch: { type: "string" },
        recheck: { type: "string" },
        "recheck-every": { type: "string" },
        "allow-origin": { type: "string", multiple: true },
        rpc: { type: "string" },
      },
    });
  } catch (error) {
    return fail((error as Error).message);
  }
}
const { values, positionals } = parsed();

const command = positionals[0];
if (command !== "run" && command !== "rebuild") fail("run or rebuild?");
if (!values.deployment) fail("--deployment is required");
if (!values.db) fail("--db is required");
let deployment;
try {
  deployment = readDeployment(values.deployment);
} catch (error) {
  if (!(error instanceof DeploymentError)) throw error;
  fail(error.message);
}
const rpcUrl =
  values.rpc ?? process.env.INDEXER_RPC_URL ?? defaultRpcUrl(deployment);
if (!rpcUrl) fail("no RPC URL: INDEXER_RPC_URL or --rpc");
if (!parseRpcUrl(rpcUrl)) fail("the RPC URL is not an http(s) URL (not shown)");
const depth: Depth =
  values.depth === undefined || values.depth === "l1"
    ? "l1"
    : integer(values.depth, "depth", undefined, 1);
const config = {
  daily: deployment.daily,
  tutorial: deployment.tutorial,
  account: deployment.account,
  economy: deployment.economy,
  collection: deployment.collection,
  from: deployment.deployedBlock,
  chainId: deployment.chainId,
};
const batch = integer(values.batch, "batch", 100, 1);
const poll = integer(values.poll, "poll", 1000, 1);
const recheck = {
  depth: integer(values.recheck, "recheck", 10),
  everyMs: integer(values["recheck-every"], "recheck-every", 10_000, 1),
};
for (const origin of values["allow-origin"] ?? []) {
  if (!URL.canParse(origin) || new URL(origin).origin !== origin)
    fail(`--allow-origin ${origin}: an origin, scheme://host[:port]`);
}

if (command === "rebuild") {
  // Checked before anything is dropped: a refused rebuild keeps the database. The same deployment started from another
  // block is refused; another deployment (a redeploy) is what a rebuild is for.
  const built = Store.peek(values.db);
  if (
    built.deployment === deploymentHash(config) &&
    built.from !== undefined &&
    built.from !== config.from
  ) {
    fail(
      `rebuild: this database was built from block ${built.from}, the contracts' deployment block; a rebuild starts there, not at ${config.from}`,
    );
  }
}
let store: Store;
try {
  // `rebuild` drops every table first, whatever the schema; `run` refuses another schema.
  store = new Store(values.db, { rebuild: command === "rebuild" });
} catch (error) {
  if (!(error instanceof SchemaMismatch)) throw error;
  console.error(error.message);
  process.exit(2);
}
if (command === "rebuild")
  log(`rebuild: the database is empty; following from block ${config.from}`);

const chain = new Chain(httpRpc(rpcUrl), config);
let checks: CrossCheck | undefined;
let indexer: Indexer;
try {
  indexer = new Indexer({
    chain,
    store,
    config,
    depth,
    batch,
    recheck,
    log,
    afterServed: async (served) => {
      await checks?.run(served);
    },
  });
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}
checks = new CrossCheck(chain, store, log);
indexer.listen({ rewound: () => checks!.reset() });

const abort = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => abort.abort());
}

// The node must be the deployment's chain: a file for one chain read from another would index nothing, or the wrong thing.
for (;;) {
  try {
    const found = await chain.chainId();
    if (found !== config.chainId) {
      console.error(
        `the node's chain id ${found} is not the deployment file's ${config.chainId}`,
      );
      process.exit(2);
    }
    break;
  } catch (error) {
    log(`waiting for the node: ${(error as Error).message}`);
    await new Promise((resolve) => setTimeout(resolve, poll));
    if (abort.signal.aborted) process.exit(0);
  }
}

const server = serve(indexer, {
  allowedOrigins: values["allow-origin"] ?? [],
  info: {
    chainId: config.chainId,
    fromBlock: config.from,
    contracts: {
      daily: config.daily,
      tutorial: config.tutorial,
      account: config.account,
      economy: config.economy,
      collection: config.collection ?? null,
    },
    checks,
  },
});
server.listen(
  integer(values.port, "port", DEFAULT_PORT),
  values.host ?? "127.0.0.1",
  () => {
    const address = server.address();
    const where =
      typeof address === "object" && address
        ? `http://${address.address}:${address.port}`
        : String(address);
    const tip = store.tip();
    log(
      `serving on ${where}, following ${redact(rpcUrl)} from block ${config.from}; stored tip ${tip ? `${tip.number} ${tip.hash}` : "none"}; depth ${depth}`,
    );
  },
);
await indexer.run(poll, abort.signal);
if (!abort.signal.aborted) {
  // Halted: keep answering `halted` until stopped.
  await new Promise<void>((resolve) =>
    abort.signal.addEventListener("abort", () => resolve()),
  );
}
server.close();
server.closeAllConnections();
store.close();
log("stopped");
