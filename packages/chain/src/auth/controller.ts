import type { Deployment } from "../deployment";
import type { WriteAccount } from "../writer";

export interface ControllerConfig {
  rpc: string;
  /** The deployment's chain id; read from the RPC when unknown (the controller would default to mainnet). */
  chainId?: string;
  policies?: Array<{
    target: string;
    method: string;
    description?: string;
  }>;
}

/**
 * The client's writes, by contract: what `PavedWriter` sends outside devnet. `Token.mint` is left
 * out: the faucet exists on the devnet mock only, where the burner signs.
 */
export const CONTROLLER_ENTRY_POINTS = {
  Account: ["create"],
  Token: ["approve"],
  Daily: ["spawn", "build", "discard", "surrender", "claim", "sponsor"],
  Tutorial: ["spawn", "build", "discard", "surrender"],
} as const;

/** Session policies for the game's writes, on the deployment's addresses. */
export function controllerPolicies(deployment: Deployment): NonNullable<ControllerConfig["policies"]> {
  // No policy on an empty target: the deployment must be complete.
  if (!deployment.configured) throw new Error(`Not connected: ${deployment.missing.join(", ")} missing`);
  return (Object.keys(CONTROLLER_ENTRY_POINTS) as Array<keyof typeof CONTROLLER_ENTRY_POINTS>).flatMap((contract) =>
    CONTROLLER_ENTRY_POINTS[contract].map((method) => ({ target: deployment.addresses[contract], method })),
  );
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
  toSessionPolicies(policies: NonNullable<ControllerConfig["policies"]>): unknown;
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
  if (!config.policies?.length) throw new Error("No session policies: the controller cannot connect");
  const policies = config.policies;
  const load = deps.load ?? (() => import("@cartridge/controller") as unknown as Promise<ControllerModule>);
  const chainId = deps.chainId ?? rpcChainId;

  let controller: Promise<InstanceType<ControllerModule["default"]>> | null = null;
  const instance = () => {
    controller ??= (async () => {
      const module = await load();
      return new module.default({
        chains: [{ rpcUrl: config.rpc }],
        defaultChainId: config.chainId || (await chainId(config.rpc)),
        policies: module.toSessionPolicies(policies),
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
