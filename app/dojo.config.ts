import dev from "../contracts/manifests/dev/deployment/manifest.json";

// Use dev manifest as slot fallback for local development
const slot = dev;

const {
  VITE_PUBLIC_NODE_URL,
  VITE_PUBLIC_TORII,
  VITE_PUBLIC_MASTER_ADDRESS,
  VITE_PUBLIC_MASTER_PRIVATE_KEY,
  VITE_PUBLIC_ACCOUNT_CLASS_HASH,
  VITE_PUBLIC_SLOT,
  VITE_PUBLIC_SEPOLIA,
  VITE_PUBLIC_STARKNET,
  VITE_PUBLIC_FEE_TOKEN_ADDRESS,
} = import.meta.env;

export type Config = ReturnType<typeof dojoConfig>;

export function dojoConfig() {
  return {
    rpcUrl: VITE_PUBLIC_NODE_URL || "http://localhost:5050",
    toriiUrl: VITE_PUBLIC_TORII || "http://localhost:8080",
    masterAddress:
      VITE_PUBLIC_MASTER_ADDRESS ||
      "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    masterPrivateKey:
      VITE_PUBLIC_MASTER_PRIVATE_KEY ||
      "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
    accountClassHash:
      VITE_PUBLIC_ACCOUNT_CLASS_HASH ||
      "0x07dc7899aa655b0aae51eadff6d801a58e97dd99cf4666ee59e704249e51adf2",
    feeTokenAddress:
      VITE_PUBLIC_FEE_TOKEN_ADDRESS ||
      "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    manifest: VITE_PUBLIC_STARKNET
      ? slot
      : VITE_PUBLIC_SEPOLIA
        ? slot
        : VITE_PUBLIC_SLOT
          ? slot
          : dev,
  };
}
