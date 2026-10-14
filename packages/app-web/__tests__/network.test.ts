import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEconomyNetwork } from "../src/utils/economy-network";
import { resolveAppNetwork, resolvePlayerAccount, signerOf } from "../src/utils/network";

const DEVNET = {
  rpc_url: "http://127.0.0.1:5050/rpc",
  deployed_block: 3,
  contracts: { Challenge: { address: "0x2" }, Setup: { address: "0x3" }, Token: { address: "0x4" } },
};
const FILES = { "../../../../contracts/deployments/devnet.json": { default: DEVNET } };

describe("resolveAppNetwork", () => {
  it("reads contracts/deployments/devnet.json by default", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork({}, FILES);
    expect(deployment).toMatchObject({ network: "devnet", configured: true, deployedBlock: 3, rpcUrl: DEVNET.rpc_url });
    expect(supportsMint).toBe(true);
    expect(tip).toBe(0n);
  });

  it("env overrides the file", () => {
    const { deployment } = resolveAppNetwork({ VITE_CHALLENGE_ADDRESS: "0x22", VITE_RPC_URL: "http://x/rpc" }, FILES);
    expect(deployment.addresses.Challenge).toBe("0x22");
    expect(deployment.rpcUrl).toBe("http://x/rpc");
  });

  it("no file for the network and no env: not configured", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, FILES);
    expect(deployment.configured).toBe(false);
    expect(deployment.missing).toContain("Challenge address");
    // The faucet is a property of the network; it still needs a Faucet (none without a file).
    expect(supportsMint).toBe(true);
    expect(deployment.faucet).toBe("");
    expect(tip).toBeUndefined();
  });

  it("env alone can configure the app", () => {
    const { deployment } = resolveAppNetwork(
      { VITE_RPC_URL: "http://x", VITE_CHALLENGE_ADDRESS: "0x2", VITE_SETUP_ADDRESS: "0x3" },
      {},
    );
    expect(deployment.configured).toBe(true);
    expect(deployment.addresses.Setup).toBe("0x3");
  });
});

// The committed sepolia.json is the fresh deployment F (part B): every value below is read from it, none is copied here.
const SEPOLIA = JSON.parse(readFileSync(resolve(__dirname, "../../../contracts/deployments/sepolia.json"), "utf8")) as {
  chain_id: string;
  deployed_block: number;
  contracts: Record<string, { address: string }>;
};
const SEPOLIA_FILES = { "../../../contracts/deployments/sepolia.json": { default: SEPOLIA }, ...FILES };
const SEPOLIA_RPC = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10";

describe("the Sepolia build (VITE_NETWORK=sepolia, D-16)", () => {
  const env = { VITE_NETWORK: "sepolia", VITE_RPC_URL: SEPOLIA_RPC, VITE_INDEXER_URL: "https://api.paved.bal7hazar.com" };

  it("reads sepolia.json and is configured: the file's Challenge, Setup and Faucet, the economy on the Faucet, the router MockRouter", () => {
    const { deployment, indexer } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment).toMatchObject({ network: "sepolia", configured: true, missing: [], rpcUrl: SEPOLIA_RPC, deployedBlock: SEPOLIA.deployed_block, chainId: SEPOLIA.chain_id });
    expect(deployment.addresses.Challenge).toBe(SEPOLIA.contracts.Challenge.address);
    expect(deployment.addresses.Setup).toBe(SEPOLIA.contracts.Setup.address);
    expect(deployment.faucet).toBe(SEPOLIA.contracts.Faucet.address);
    expect(indexer).not.toBeNull();
    const economy = resolveEconomyNetwork(deployment, {}, SEPOLIA_FILES);
    expect(economy.configured).toBe(true);
    expect(economy.missing).toEqual([]);
    expect(economy.addresses).toEqual({
      Economy: SEPOLIA.contracts.Economy.address,
      PavedToken: SEPOLIA.contracts.PavedToken.address,
      Vault: SEPOLIA.contracts.Vault.address,
      USDC: SEPOLIA.contracts.Faucet.address,
    });
    expect(economy.expectedRouter).toBe(SEPOLIA.contracts.MockRouter.address);
  });

  it("without VITE_RPC_URL it is not connected and says it plainly: the file's placeholder is not a URL", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, SEPOLIA_FILES);
    expect(deployment.configured).toBe(false);
    expect(deployment.rpcUrl).toBe("");
    expect(deployment.missing).toEqual(["RPC URL"]);
    expect(signerOf(deployment)).toBe("none");
    expect(supportsMint).toBe(true);
  });

  it("the faucet is on and is the file's Faucet; starknet.js's own tip; the controller signs on the configured deployment", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment.faucet).toBe(SEPOLIA.contracts.Faucet.address);
    expect(supportsMint).toBe(true);
    expect(tip).toBeUndefined();
    expect(signerOf(deployment)).toBe("controller");
  });

  // A file from before F (keys Daily and MockUSDC, no Challenge, Setup or Faucet), as a fixture: the not-configured path.
  it("a file from before F is not configured: Challenge and USDC are missing, no faucet, no signer (fixture)", () => {
    const old = {
      rpc_url: "$STARKNET_RPC_URL",
      deployed_block: 16421420,
      contracts: { Daily: { address: "0x1" }, MockUSDC: { address: "0x5" }, Economy: { address: "0x7" }, PavedToken: { address: "0x8" }, Vault: { address: "0x9" } },
    };
    const { deployment } = resolveAppNetwork(env, { "x/sepolia.json": { default: old } });
    expect(deployment).toMatchObject({ configured: false, missing: ["Challenge address"], deployedBlock: 16421420 });
    expect(deployment.addresses).toEqual({ Challenge: "", Setup: "" });
    expect(deployment.faucet).toBe("");
    expect(signerOf(deployment)).toBe("none");
    const economy = resolveEconomyNetwork(deployment, {}, { "x/sepolia.json": { default: old } });
    expect(economy.missing).toEqual(["Challenge address", "USDC address"]);
    expect(economy.addresses.USDC).toBe("");
  });

  it("the faucet can be turned off by VITE_SUPPORTS_TOKEN_MINT=false", () => {
    expect(resolveAppNetwork({ ...env, VITE_SUPPORTS_TOKEN_MINT: "false" }, SEPOLIA_FILES).supportsMint).toBe(false);
  });
});

describe("the faucet is the file's contracts.Faucet and nothing else", () => {
  it("VITE_FAUCET_ADDRESS (no longer a setting) changes nothing on devnet or Sepolia", () => {
    const file = { rpc_url: "http://n/rpc", contracts: { ...DEVNET.contracts, Faucet: { address: "0x9" } } };
    for (const network of ["devnet", "sepolia"]) {
      const files = { [`x/${network}.json`]: { default: file } };
      const plain = resolveAppNetwork({ VITE_NETWORK: network, VITE_RPC_URL: "http://n/rpc" }, files).deployment;
      const stray = resolveAppNetwork({ VITE_NETWORK: network, VITE_RPC_URL: "http://n/rpc", VITE_FAUCET_ADDRESS: "0xa" }, files).deployment;
      expect(plain.faucet, network).toBe("0x9");
      expect(stray.faucet, network).toBe("0x9");
    }
  });
});

describe("mainnet never has the faucet", () => {
  const MAINNET = { rpc_url: "http://m/rpc", contracts: { ...DEVNET.contracts, Faucet: { address: "0x9" } } };
  const files = { "x/mainnet.json": { default: MAINNET } };

  it("resolves no Faucet from its file, and does not offer the faucet", () => {
    for (const env of [{}, { VITE_FAUCET_ADDRESS: "0xa" }]) {
      const { deployment, supportsMint, tip } = resolveAppNetwork({ VITE_NETWORK: "mainnet", ...env }, files);
      expect(deployment.configured).toBe(true);
      expect(deployment.faucet).toBe("");
      expect(supportsMint).toBe(false);
      expect(tip).toBeUndefined();
    }
  });

  it("even with VITE_SUPPORTS_TOKEN_MINT=true there is no Faucet, so the Landing (supportsMint && faucet) offers none", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "mainnet", VITE_SUPPORTS_TOKEN_MINT: "true" }, files);
    expect(supportsMint).toBe(true);
    expect(deployment.faucet).toBe("");
  });
});

describe("resolvePlayerAccount", () => {
  it("reads the indexer URL from VITE_INDEXER_URL, and has no client without it", () => {
    expect(resolveAppNetwork({}, FILES).indexer).toBeNull();
    expect(resolveAppNetwork({ VITE_INDEXER_URL: "  " }, FILES).indexer).toBeNull();
    expect(resolveAppNetwork({ VITE_INDEXER_URL: "http://localhost:8080" }, FILES).indexer).not.toBeNull();
  });

  it("is null without a key, or when the deployment is not configured", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    expect(resolvePlayerAccount({}, deployment)).toBeNull();
    const off = resolveAppNetwork({ VITE_NETWORK: "none" }, {}).deployment;
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, off)).toBeNull();
  });

  it("takes a key from the env on devnet only", () => {
    const sepolia = { rpc_url: "http://s/rpc", contracts: DEVNET.contracts };
    const { deployment } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, { "x/sepolia.json": { default: sepolia } });
    expect(deployment.configured).toBe(true);
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment)).toBeNull();
  });

  it("builds an account from the player's address and key", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment)?.address).toBe("0x5");
  });

  it("elsewhere returns the controller's account once connected, and never the env's key (P-14)", () => {
    const sepolia = { rpc_url: "http://s/rpc", contracts: DEVNET.contracts };
    const { deployment } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, { "x/sepolia.json": { default: sepolia } });
    const controller = { address: "0xc", execute: async () => ({ transaction_hash: "0x0" }) };
    const keys = { VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" };
    expect(signerOf(deployment)).toBe("controller");
    expect(resolvePlayerAccount(keys, deployment, controller)).toBe(controller);
    expect(resolvePlayerAccount(keys, deployment, null)).toBeNull();
  });

  it("devnet keeps the burner; a deployment not configured has no signer", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    const controller = { address: "0xc", execute: async () => ({ transaction_hash: "0x0" }) };
    expect(signerOf(deployment)).toBe("burner");
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment, controller)?.address).toBe("0x5");
    const off = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, {}).deployment;
    expect(signerOf(off)).toBe("none");
    expect(resolvePlayerAccount({}, off, controller)).toBeNull();
  });
});
