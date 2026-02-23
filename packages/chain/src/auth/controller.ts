export interface ControllerConfig {
  rpc: string;
  policies?: Array<{
    target: string;
    method: string;
    description?: string;
  }>;
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
