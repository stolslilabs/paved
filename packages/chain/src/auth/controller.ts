import { getChecksumAddress } from "starknet";
import type { Deployment } from "../deployment";
import type { WriteAccount } from "../writer";

/** One session policy: a call the controller signs without a prompt. Never an `approve` (P-65). */
export interface ControllerPolicy {
  target: string;
  method: string;
  description?: string;
}

export interface ControllerConfig {
  rpc: string;
  /** The deployment's chain id; read from the RPC when unknown (the controller would default to mainnet). */
  chainId?: string;
  /** The session policies, or how to build them when the controller is first used (a cap read from the chain). */
  policies?: ControllerPolicy[] | (() => Promise<ControllerPolicy[]>);
}

/**
 * The client's writes signed in the session, by contract. No token `approve` is a policy, on any token (P-65): the
 * controller matches a session call on (target, method) alone, never on its spender or amount, so every approve prompts, in
 * the multicall of the write that needs it. Nor is a call that pulls a token (`Challenge.spawn`, `Setup.buy_pack`, the
 * Vault's `deposit`): each is sent with its approve, which prompts anyway, and in the session a bare one could spend a
 * standing allowance left by a connect from before P-65. `Faucet.mint` (the faucet, `PavedWriter.mint`) is left out here
 * too: it is a policy only where the deployment has a Faucet (Sepolia; `controllerPolicies`), never on mainnet.
 */
export const CONTROLLER_ENTRY_POINTS = {
  // `spawn_free` is Play free (a free-game credit spent): no token moves, so it is a session policy like the moves. The paid
  // `spawn` pulls USDC: not a policy (P-65), it prompts with its approve.
  Challenge: ["spawn_free", "build", "discard", "surrender"],
  // The tutorial claim (D-21) and the Cobbles claims (cobbles v1, part 1: a quest's, an achievement's, a day's and a week's
  // free game; Claim all is a multicall of them): policies only where the deployment has a Setup (`controllerPolicies`). A
  // pack's purchase (`buy_pack`, cobbles v1, part 2) pulls USDC: not a policy (P-65), it prompts with its approve. The skins
  // (cobbles v1, part 3): `buy_skin` spends Cobbles, which no token carries, and `set_skins` spends nothing.
  Setup: ["claim_tutorial", "claim_quest", "claim_achievement", "claim_daily_credit", "claim_weekly_credit", "buy_skin", "set_skins"],
} as const;

/** The Economy's only entry point in the session (P7a): anyone may settle, and it pays the game's player. */
export const ECONOMY_ENTRY_POINT = "settle";

/**
 * Session policies for the game's writes, on the deployment's addresses. No token `approve` and no call that pulls a token
 * (P-65, superseding P-56): a paid entry sends its approve and `spawn` in one multicall, which prompts once; a pack's approve
 * and `buy_pack`, and the Vault's approve and deposit, prompt the same way. `Setup.claim_tutorial`, the four Cobbles claims
 * and the two skin writes are policies when the deployment has a Setup. `Faucet.mint` is a policy when, and only when, the deployment
 * resolves a Faucet (`deployment.faucet`: Sepolia, where the player signs with the controller; never mainnet).
 *
 * `economy` is the Economy's address (the economy deployment's, not the game's): with it, `Economy.settle` is a policy, the
 * one entry point of the Economy in the session (P7a). It moves no token from the player and takes no approve; it mints the
 * reward to the game's player whoever sends it. The Vault, the purchase and every other Economy write still prompt.
 *
 * `approve` is ignored (P-65): app-web's connector still passes the entry's cap, and no approve is built from it.
 */
export function controllerPolicies(
  deployment: Deployment,
  options: { /** @deprecated Ignored (P-65): no token approve in the session. */ approve?: unknown; economy?: string | null } = {},
): ControllerPolicy[] {
  // No policy on an empty target: the deployment must be complete.
  if (!deployment.configured) throw new Error(`Not connected: ${deployment.missing.join(", ")} missing`);
  const policies: ControllerPolicy[] = (Object.keys(CONTROLLER_ENTRY_POINTS) as Array<keyof typeof CONTROLLER_ENTRY_POINTS>)
    .filter((contract) => isAddress(deployment.addresses[contract]))
    .flatMap((contract) => CONTROLLER_ENTRY_POINTS[contract].map((method) => ({ target: deployment.addresses[contract], method })));
  if (isAddress(deployment.faucet)) {
    policies.push({ target: deployment.faucet, method: "mint", description: "Test USDC faucet" });
  }
  if (options.economy && isAddress(options.economy)) policies.push({ target: options.economy, method: ECONOMY_ENTRY_POINT });
  return policies;
}

function isAddress(value: string): boolean {
  try {
    return BigInt(value) !== 0n;
  } catch {
    return false;
  }
}

/** A token's approve, allowance or transfer method, refused as a session policy (P-65). */
const TOKEN_METHOD = /approve|allowance|transfer/i;

/**
 * The controller's `SessionPolicies` (`{ contracts: { [address]: { methods } } }`). A token method is refused (P-65): any
 * name with `approve`, `allowance` or `transfer` (`increase_allowance`, `transfer_from`...). The controller would execute an
 * approve policy once at connect, leaving a standing allowance of its cap, and its session key is a wildcard that the
 * keychain filters by (target, method) alone, so such a policy would sign that call to any spender or recipient.
 */
export function toControllerSessionPolicies(policies: ControllerPolicy[]) {
  const contracts: Record<string, { methods: Array<{ entrypoint: string; description?: string }> }> = {};
  for (const p of policies) {
    if (TOKEN_METHOD.test(p.method)) throw new Error(`No token approve in the session (P-65): ${p.method} prompts with its write`);
    const target = getChecksumAddress(p.target);
    const method = { entrypoint: p.method, ...(p.description ? { description: p.description } : {}) };
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
    /** The connected account's Cartridge username; undefined when none is connected. */
    username(): Promise<string> | undefined;
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
  /**
   * The connected player's Controller username (D-25 (E): names are off chain), or null when none is connected or it cannot
   * be read. Only the connected player's: other players' names are not looked up (that would be a new external service).
   */
  username(): Promise<string | null>;
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
    async username() {
      if (!controller) return null;
      try {
        const name = await (await controller).username();
        return name ? name : null;
      } catch {
        return null;
      }
    },
  };
}
