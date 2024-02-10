import { getSyncEntities } from "@dojoengine/state";
import * as torii from "@dojoengine/torii-client";
import { createClientComponents } from "../createClientComponents";
import { createCustomEvents } from "../createCustomEvents.ts";
import { createSystemCalls } from "../createSystemCalls";

import { defineContractComponents } from "./contractComponents";
import { world } from "./world";
import { Config } from "../../../dojoConfig";
import { setupWorld } from "./generated";
import { DojoProvider } from "@dojoengine/core";
import { BurnerManager } from "@dojoengine/create-burner";
import { Account, RpcProvider } from "starknet";

export type SetupResult = Awaited<ReturnType<typeof setup>>;

export async function setup({ ...config }: Config) {
  // torii client
  const toriiClient = await torii.createClient([], {
    rpcUrl: config.rpcUrl,
    toriiUrl: config.toriiUrl,
    worldAddress: config.manifest.world.address,
  });

  // create contract components
  const contractComponents = defineContractComponents(world);

  // create client components
  const clientComponents = createClientComponents({ contractComponents });

  // create event subscriptions
  const contractEvents = await createCustomEvents(config.toriiUrl);

  // fetch all existing entities from torii
  await getSyncEntities(toriiClient, contractComponents as any);

  const client = await setupWorld(
    new DojoProvider(config.manifest, config.rpcUrl)
  );

  const rpcProvider = new RpcProvider({
    nodeUrl: config.rpcUrl,
  });

  const burnerManager = new BurnerManager({
    masterAccount: new Account(
      rpcProvider,
      config.masterAddress,
      config.masterPrivateKey
    ),
    accountClassHash: config.accountClassHash,
    rpcProvider,
  });

  if (burnerManager.list().length === 0) {
    try {
      await burnerManager.create();
    } catch (e) {
      console.error(e);
    }
  }

  burnerManager.init();

  return {
    client,
    clientComponents,
    contractComponents,
    contractEvents,
    systemCalls: createSystemCalls(
      { client },
      contractComponents,
      clientComponents
    ),
    config,
    world,
    burnerManager,
  };
}
