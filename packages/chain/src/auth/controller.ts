import type { Deployment } from "../deployment";

export interface ControllerConfig {
  rpc: string;
  policies?: Array<{
    target: string;
    method: string;
    description?: string;
  }>;
}

/** Session policies for the game's writes, on the deployment's addresses. */
export function controllerPolicies(deployment: Deployment): NonNullable<ControllerConfig["policies"]> {
  const { Account, Daily, Tutorial, Token } = deployment.addresses;
  return [
    { target: Account, method: "create" },
    { target: Token, method: "approve" },
    ...["spawn", "build", "discard", "surrender", "claim", "sponsor"].map((method) => ({ target: Daily, method })),
    ...["spawn", "build", "discard", "surrender"].map((method) => ({ target: Tutorial, method })),
  ];
}

export function createControllerConnector(config: ControllerConfig) {
  // Placeholder: actual implementation uses @cartridge/connector
  // const connector = new ControllerConnector({
  //   rpc: config.rpc,
  //   policies: config.policies,
  // });
  return {
    id: "controller",
    name: "Cartridge Controller",
    config,
  };
}
