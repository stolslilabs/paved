import { Connector } from "@starknet-react/core";
import CartridgeConnector from "@cartridge/connector";
import { getContractByName } from "@dojoengine/core";
import { dojoConfig } from "../../dojo.config";

export const getConnectors = (): { connectors: Connector[] } => {
  const config = dojoConfig();
  const account = getContractByName(config.manifest, "account")?.address;
  const daily = getContractByName(config.manifest, "daily")?.address;
  const options: any = { theme: "paved" };
  const cartridge = new CartridgeConnector(
    [
      {
        target: config.feeTokenAddress,
        method: "mint",
      },
      {
        target: config.feeTokenAddress,
        method: "approve",
      },
      {
        target: config.accountClassHash,
        method: "initialize",
      },
      {
        target: config.accountClassHash,
        method: "create",
      },
      // Account
      {
        target: account,
        method: "initialize",
      },
      {
        target: account,
        method: "create",
      },
      // Daily
      {
        target: daily,
        method: "initialize",
      },
      {
        target: daily,
        method: "spawn",
      },
      {
        target: daily,
        method: "claim",
      },
      {
        target: daily,
        method: "sponsor",
      },
      {
        target: daily,
        method: "discard",
      },
      {
        target: daily,
        method: "surrender",
      },
      {
        target: daily,
        method: "build",
      },
    ],
    options,
  ) as never as Connector;
  return { connectors: [cartridge] };
};
