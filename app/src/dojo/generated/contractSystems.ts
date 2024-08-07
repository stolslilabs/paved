/* Autogenerated file. Do not edit manually. */

import { DojoProvider } from "@dojoengine/core";
import { Config } from "../../../dojo.config.ts";
import { Mode } from "../game/types/mode";
import { Account, UniversalDetails, shortString } from "starknet";

export interface Signer {
  account: Account;
}

export interface Initialize extends Signer {
  world: string;
}

export interface CreateGame extends Signer {
  mode?: Mode;
}

export interface Claim extends Signer {
  tournament_id: number;
  rank: number;
  mode?: Mode;
}

export interface Sponsor extends Signer {
  mode?: Mode;
  amount: string;
}

export interface CreatePlayer extends Signer {
  name: string;
  master: string;
}

export interface Discard extends Signer {
  game_id: number;
  mode?: Mode;
}

export interface Surrender extends Signer {
  game_id: number;
  mode?: Mode;
}

export interface Build extends Signer {
  game_id: number;
  tile_id: number;
  orientation: number;
  x: number;
  y: number;
  role: number;
  spot: number;
  mode?: Mode;
}
export type IWorld = Awaited<ReturnType<typeof setupWorld>>;

export const getContractByName = (manifest: any, name: string) => {
  const contract = manifest.contracts.find((contract: any) =>
    contract.name.includes("::" + name),
  );
  if (contract) {
    return contract.address;
  } else {
    return "";
  }
};

export async function setupWorld(provider: DojoProvider, config: Config) {
  const details: UniversalDetails | undefined = undefined; // { maxFee: 1e15 };

  function account() {
    const contract_name = "account";
    const contract = config.manifest.contracts.find((c) =>
      c.name.includes(contract_name),
    );
    if (!contract) {
      throw new Error(`Contract ${contract_name} not found in manifest`);
    }

    const create = async ({ account, name, master }: CreatePlayer) => {
      const contract_address = getContractByName(
        config.manifest,
        contract_name,
      );
      const encoded_name = shortString.encodeShortString(name);
      const calls = [
        {
          contractAddress: config.feeTokenAddress,
          entrypoint: "mint",
          calldata: [account?.address, `0x${(1e21).toString(16)}`, "0x0"],
        },
        {
          contractAddress: contract_address,
          entrypoint: "create",
          calldata: [encoded_name, master],
        },
      ];
      try {
        return await provider.execute(account, calls, details);
      } catch (error) {
        console.error("Error executing initialize:", error);
        throw error;
      }
    };

    return {
      address: contract.address,
      create,
    };
  }

  function daily() {
    const contract_name = "daily";
    const contract = config.manifest.contracts.find((c) =>
      c.name.includes(contract_name),
    );
    if (!contract) {
      throw new Error(`Contract ${contract_name} not found in manifest`);
    }

    const spawn = async ({ account }: CreateGame) => {
      const contract_address = getContractByName(
        config.manifest,
        contract_name,
      );
      const calls = [
        {
          contractAddress: config.feeTokenAddress,
          entrypoint: "approve",
          calldata: [contract_address, `0x${(1e18).toString(16)}`, "0x0"],
        },
        {
          contractAddress: contract_address,
          entrypoint: "spawn",
          calldata: [],
        },
      ];
      try {
        return await provider.execute(account, calls, details);
      } catch (error) {
        console.error("Error executing spawn:", error);
        throw error;
      }
    };

    const claim = async ({ account, tournament_id, rank }: Claim) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "claim",
            calldata: [tournament_id, rank],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing claim:", error);
        throw error;
      }
    };

    const sponsor = async ({ account, amount }: Sponsor) => {
      const contract_address = getContractByName(
        config.manifest,
        contract_name,
      );
      const calls = [
        {
          contractAddress: config.feeTokenAddress,
          entrypoint: "approve",
          calldata: [contract_address, amount, "0x0"],
        },
        {
          contractAddress: contract_address,
          entrypoint: "sponsor",
          calldata: [amount],
        },
      ];
      try {
        return await provider.execute(account, calls, details);
      } catch (error) {
        console.error("Error executing sponsor:", error);
        throw error;
      }
    };

    const discard = async ({ account, game_id }: Discard) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "discard",
            calldata: [game_id],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing discard:", error);
        throw error;
      }
    };

    const surrender = async ({ account, game_id }: Surrender) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "surrender",
            calldata: [game_id],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing surrender:", error);
        throw error;
      }
    };

    const build = async ({
      account,
      game_id,
      orientation,
      x,
      y,
      role,
      spot,
    }: Build) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "build",
            calldata: [game_id, orientation, x, y, role, spot],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing build:", error);
        throw error;
      }
    };

    return {
      address: contract.address,
      spawn,
      claim,
      sponsor,
      discard,
      surrender,
      build,
    };
  }

  function tutorial() {
    const contract_name = "tutorial";
    const contract = config.manifest.contracts.find((c) =>
      c.name.includes(contract_name),
    );
    if (!contract) {
      throw new Error(`Contract ${contract_name} not found in manifest`);
    }

    const spawn = async ({ account }: CreateGame) => {
      const contract_address = getContractByName(
        config.manifest,
        contract_name,
      );
      const calls = [
        {
          contractAddress: contract_address,
          entrypoint: "spawn",
          calldata: [],
        },
      ];
      try {
        return await provider.execute(account, calls, details);
      } catch (error) {
        console.error("Error executing spawn:", error);
        throw error;
      }
    };

    const discard = async ({ account, game_id }: Discard) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "discard",
            calldata: [game_id],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing discard:", error);
        throw error;
      }
    };

    const surrender = async ({ account, game_id }: Surrender) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "surrender",
            calldata: [game_id],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing surrender:", error);
        throw error;
      }
    };

    const build = async ({ account, game_id }: Build) => {
      try {
        return await provider.execute(
          account,
          {
            contractName: contract_name,
            entrypoint: "build",
            calldata: [game_id],
          },
          details,
        );
      } catch (error) {
        console.error("Error executing build:", error);
        throw error;
      }
    };

    return {
      address: contract.address,
      spawn,
      discard,
      surrender,
      build,
    };
  }

  return {
    account: account(),
    daily: daily(),
    tutorial: tutorial(),
  };
}
