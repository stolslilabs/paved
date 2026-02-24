import { models } from "./models.ts";
import { systems } from "./systems.ts";

import { defineContractComponents } from "./bindings/models.gen";
import { world } from "./world.ts";
import { Config } from "../../dojo.config.ts";
import { setupWorld } from "./bindings/contracts.gen";
import { DojoProvider } from "@dojoengine/core";
import { BurnerManager } from "@dojoengine/create-burner";
import { Account, RpcProvider } from "starknet";

export type SetupResult = Awaited<ReturnType<typeof setup>>;

export async function setup({ ...config }: Config) {
  // create contract components
  const contractModels = defineContractComponents(world);

  // create client components
  const clientModels = models({ contractModels });

  // Skip Torii gRPC sync for local dev (SDK version mismatch with Torii 1.8.x)
  // Entity sync will not work, but contract interactions will
  let toriiClient: any = null;
  let sync: any = null;
  try {
    const torii = await import("@dojoengine/torii-client");
    const { getSyncEntities } = await import("@dojoengine/state");
    toriiClient = await torii.createClient({
      rpcUrl: config.rpcUrl,
      toriiUrl: config.toriiUrl,
      relayUrl: "",
      worldAddress: config.manifest.world.address || "",
    });
    sync = await getSyncEntities(
      toriiClient,
      contractModels as any,
      [],
      1000,
    );
  } catch (e) {
    console.warn("Torii sync unavailable (version mismatch). Contract calls still work.", e);
  }

  const client = await setupWorld(
    new DojoProvider(config.manifest, config.rpcUrl),
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

  try {
    await burnerManager.init();
  } catch (e) {
    console.error(e);
  }

  return {
    client,
    clientModels,
    contractComponents: clientModels,
    systemCalls: systems({ client, clientModels }),
    config,
    world,
    burnerManager,
    rpcProvider,
    sync,
  };
}
