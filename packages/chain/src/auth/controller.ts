import { getChecksumAddress } from "starknet";
import type { Deployment } from "../deployment";
import type { WriteAccount } from "../writer";

/** One session policy: a call the controller signs without a prompt. An `approve` names its spender and cap. */
export interface ControllerPolicy {
  target: string;
  method: string;
  description?: string;
  /** `approve` only: the one spender the session may approve. */
  spender?: string;
  /** `approve` only: the most the session may approve, in the token's base unit. */
  amount?: bigint;
}

export interface ControllerConfig {
  rpc: string;
  /** The deployment's chain id; read from the RPC when unknown (the controller would default to mainnet). */
  chainId?: string;
  /** The session policies, or how to build them when the controller is first used (a cap read from the chain). */
  policies?: ControllerPolicy[] | (() => Promise<ControllerPolicy[]>);
}

/**
 * The client's writes, by contract: what `PavedWriter` sends outside devnet. `Token.approve` is not
 * here: it is a session policy only with its spender and a cap (`controllerPolicies`). `Token.mint`
 * is left out: the faucet exists on the devnet mock only, where the burner signs.
 */
export const CONTROLLER_ENTRY_POINTS = {
  Account: ["create"],
  Daily: ["spawn", "build", "discard", "surrender", "claim", "sponsor"],
  Tutorial: ["spawn", "build", "discard", "surrender"],
} as const;

/**
 * Session policies for the game's writes, on the deployment's addresses. With `approveCap` (above
 * 0), the session may also approve the Daily contract, and it alone, up to that amount; without it,
 * every approve goes through the controller's own prompt.
 */
export function controllerPolicies(deployment: Deployment, options: { approveCap?: bigint | null } = {}): ControllerPolicy[] {
  // No policy on an empty target: the deployment must be complete.
  if (!deployment.configured) throw new Error(`Not connected: ${deployment.missing.join(", ")} missing`);
  const policies: ControllerPolicy[] = (Object.keys(CONTROLLER_ENTRY_POINTS) as Array<keyof typeof CONTROLLER_ENTRY_POINTS>).flatMap(
    (contract) => CONTROLLER_ENTRY_POINTS[contract].map((method) => ({ target: deployment.addresses[contract], method })),
  );
  if (options.approveCap && options.approveCap > 0n) {
    policies.push({ target: deployment.addresses.Token, method: "approve", spender: deployment.addresses.Daily, amount: options.approveCap });
  }
  return policies;
}

/**
 * The controller's `SessionPolicies` (`{ contracts: { [address]: { methods } } }`). Built here, not
 * by the package's `toSessionPolicies`, which drops `spender` and `amount`: an `approve` without
 * both becomes a policy on any spender and any amount.
 */
export function toControllerSessionPolicies(policies: ControllerPolicy[]) {
  const contracts: Record<string, { methods: Array<{ entrypoint: string; description?: string; spender?: string; amount?: string }> }> = {};
  for (const p of policies) {
    if (p.method === "approve" && (!p.spender || !p.amount || p.amount <= 0n)) {
      throw new Error("An approve policy needs its spender and a cap above 0");
    }
    const target = getChecksumAddress(p.target);
    const method = {
      entrypoint: p.method,
      ...(p.description ? { description: p.description } : {}),
      ...(p.method === "approve" ? { spender: getChecksumAddress(p.spender!), amount: `0x${p.amount!.toString(16)}` } : {}),
    };
    (contracts[target] ??= { methods: [] }).methods.push(method);
  }
  return { contracts };
}

/** The part of `@cartridge/controller` the connector uses; tests give a fake one. */
export interface ControllerModule {
  default: new (options: {
    chains: Array<{ rpcUrl: string }>;
    defaultChainId: string;
    policies: unknown;
    lazyload?: boolean;
  }) => {
    probe(): Promise<WriteAccount | undefined>;
    connect(): Promise<WriteAccount | undefined>;
    disconnect(): Promise<void>;
  };
}

export interface ControllerConnector {
  id: "controller";
  name: string;
  config: ControllerConfig;
  /** The account of a session already approved in this browser, without a prompt; null when there is none. */
  probe(): Promise<WriteAccount | null>;
  /** Opens the controller; rejects when the player closes it without connecting. */
  connect(): Promise<WriteAccount>;
  disconnect(): Promise<void>;
}

async function rpcChainId(rpc: string): Promise<string> {
  const { RpcProvider } = await import("starknet");
  return new RpcProvider({ nodeUrl: rpc }).getChainId();
}

const sameChain = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
};

/**
 * The chain the controller signs on: the deployment's and the RPC's must agree when both are known;
 * either alone is taken. Neither: refused, rather than the controller's mainnet default.
 */
async function resolveChainId(config: ControllerConfig, read: (rpc: string) => Promise<string>): Promise<string> {
  let fromRpc: string | null = null;
  try {
    fromRpc = await read(config.rpc);
  } catch (error) {
    if (!config.chainId) throw new Error(`Cannot read the chain id from the RPC: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (config.chainId && fromRpc && !sameChain(config.chainId, fromRpc)) {
    throw new Error(`Chain id mismatch: the deployment says ${config.chainId}, the RPC says ${fromRpc}`);
  }
  return config.chainId || fromRpc!;
}

/**
 * The Cartridge controller on the deployment's RPC, with the session policies of `config`. The
 * package is loaded on first use, so a devnet build never fetches it. Without policies it refuses:
 * the controller would then ask for each call instead of the game's session.
 */
export function createControllerConnector(
  config: ControllerConfig,
  deps: { load?: () => Promise<ControllerModule>; chainId?: (rpc: string) => Promise<string> } = {},
): ControllerConnector {
  if (!config.rpc) throw new Error("No RPC URL: the controller cannot connect");
  const given = config.policies;
  if (!given || (Array.isArray(given) && !given.length)) throw new Error("No session policies: the controller cannot connect");
  const load = deps.load ?? (() => import("@cartridge/controller") as unknown as Promise<ControllerModule>);
  const chainId = deps.chainId ?? rpcChainId;

  let controller: Promise<InstanceType<ControllerModule["default"]>> | null = null;
  const instance = () => {
    controller ??= (async () => {
      const defaultChainId = await resolveChainId(config, chainId);
      const policies = typeof given === "function" ? await given() : given;
      if (!policies.length) throw new Error("No session policies: the controller cannot connect");
      const module = await load();
      return new module.default({
        chains: [{ rpcUrl: config.rpc }],
        defaultChainId,
        policies: toControllerSessionPolicies(policies),
        lazyload: true,
      });
    })();
    // A failed load is tried again at the next call.
    controller.catch(() => (controller = null));
    return controller;
  };

  return {
    id: "controller",
    name: "Cartridge Controller",
    config,
    async probe() {
      return (await (await instance()).probe()) ?? null;
    },
    async connect() {
      const account = await (await instance()).connect();
      if (!account) throw new Error("The controller did not connect");
      return account;
    },
    async disconnect() {
      if (controller) await (await controller).disconnect();
    },
  };
}
