import { Connector } from "@starknet-react/core";
import CartridgeConnector from "@cartridge/connector";
import { ControllerOptions, PaymasterOptions, Policy } from "@cartridge/controller";
import { getContractByName } from "@dojoengine/core";
import { dojoConfig } from "../../dojo.config";

export const getConnectors = (): { connectors: Connector[] } => {
  const config = dojoConfig();
  const account = getContractByName(config.manifest, "account")?.address;
  const daily = getContractByName(config.manifest, "daily")?.address;
  const paymaster: PaymasterOptions = { caller: "0x414e595f43414c4c4552" };
  const theme: string = "paved" ;
  const policies: Policy[] = [
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
  ];

  const options: ControllerOptions = {
    policies,
    paymaster,
    theme
  };

  const cartridge = new CartridgeConnector(options) as Connector;
  
  return { connectors: [cartridge] };
};
