import { Connector } from "@starknet-react/core";
import CartridgeConnector from "@cartridge/connector";
import { getContractByName } from "@dojoengine/core";
import { dojoConfig } from "../../dojo.config";

export const getConnectors = (): { connectors: Connector[] } => {
  const theme: string = "paved";

  const config = dojoConfig();
  const account = getContractByName(config.manifest, theme, "Account")?.address;
  const daily = getContractByName(config.manifest, theme, "Daily")?.address;
  const weekly = getContractByName(config.manifest, theme, "Weekly")?.address;
  const duel = getContractByName(config.manifest, theme, "Duel")?.address;
  const tutorial = getContractByName(
    config.manifest,
    theme,
    "Tutorial",
  )?.address;
  const paymaster = { caller: "0x414e595f43414c4c4552" };
  const rpc = import.meta.env.VITE_PUBLIC_NODE_URL;
  const policies = [
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
    // Tutorial
    {
      target: tutorial,
      method: "initialize",
    },
    {
      target: tutorial,
      method: "spawn",
    },
    {
      target: tutorial,
      method: "claim",
    },
    {
      target: tutorial,
      method: "sponsor",
    },
    {
      target: tutorial,
      method: "discard",
    },
    {
      target: tutorial,
      method: "surrender",
    },
    {
      target: tutorial,
      method: "build",
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
    // Weekly
    {
      target: weekly,
      method: "initialize",
    },
    {
      target: weekly,
      method: "spawn",
    },
    {
      target: weekly,
      method: "claim",
    },
    {
      target: weekly,
      method: "sponsor",
    },
    {
      target: weekly,
      method: "discard",
    },
    {
      target: weekly,
      method: "surrender",
    },
    {
      target: weekly,
      method: "build",
    },
    // Daily
    {
      target: duel,
      method: "initialize",
    },
    {
      target: duel,
      method: "spawn",
    },
    {
      target: duel,
      method: "claim",
    },
    {
      target: duel,
      method: "sponsor",
    },
    {
      target: duel,
      method: "discard",
    },
    {
      target: duel,
      method: "surrender",
    },
    {
      target: duel,
      method: "build",
    },
    {
      target: duel,
      method: "claim"
    },
    {
      target: duel,
      method: "start"
    },
    {
      target: duel,
      method: "leave"
    },
    {
      target: duel,
      method: "kick"
    },
    {
      target: duel,
      method: "join"
    },
    {
      target: duel,
      method: "ready"
    },
    {
      target: duel,
      method: "delete"
    },
  ];

  const cartridge = new CartridgeConnector({
    rpc,
    policies,
    paymaster,
    theme,
  }) as never as Connector;

  return { connectors: [cartridge] };
};
