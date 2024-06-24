import { getSyncEntities } from "@dojoengine/state";
import * as torii from "@dojoengine/torii-client";
import { models } from "./models.ts";
import { createCustomEvents } from "./events.ts";
import { systems } from "./systems.ts";

import { defineContractComponents } from "./generated/contractModels";
import { world } from "./world.ts";
import { Config } from "../../dojo.config.ts";
import { setupWorld } from "./generated/contractSystems.ts";
import { DojoProvider } from "@dojoengine/core";
import { BurnerManager } from "@dojoengine/create-burner";
import { Account, RpcProvider } from "starknet";

export type SetupResult = Awaited<ReturnType<typeof setup>>;

export async function setup({ ...config }: Config) {
  // torii client
  const toriiClient = await torii.createClient([], {
    rpcUrl: config.rpcUrl,
    toriiUrl: config.toriiUrl,
    relayUrl: "",
    worldAddress: config.manifest.world.address || "",
  });

  // create contract components
  const contractModels = defineContractComponents(world);

  // create client components
  const clientModels = models({ contractModels });

  // create event subscriptions
  const contractEvents = await createCustomEvents(config.toriiUrl);

  // fetch all existing entities from torii
  await getSyncEntities(toriiClient, contractModels as any, [], 1000);

  const client = await setupWorld(
    new DojoProvider(config.manifest, config.rpcUrl),
    config,
  );

  const rpcProvider = new RpcProvider({
    nodeUrl: config.rpcUrl,
  });

  const burnerManager = new BurnerManager({
    masterAccount: new Account(
      rpcProvider,
      config.masterAddress,
      config.masterPrivateKey,
    ),
    feeTokenAddress: config.feeTokenAddress,
    accountClassHash: config.accountClassHash,

    rpcProvider,
  });

  await burnerManager.init();

  return {
    client,
    clientModels,
    contractComponents: clientModels,
    contractEvents,
    systemCalls: systems({ client, clientModels }),
    config,
    world,
    burnerManager,
    rpcProvider,
  };
}
