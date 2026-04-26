import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

const MAGICBLOCK_DEVNET_ROUTER_HTTPS = "https://devnet-router.magicblock.app";
const MAGICBLOCK_PRIVATE_PAYMENTS_API_DEFAULT = "https://payments.magicblock.app";
const MAGICBLOCK_PRIVATE_TEE_RPC_DEFAULT = "https://tee.magicblock.app";
const DEFAULT_MAGICBLOCK_TIMEOUT_MS = 4500;

const normalizeUrl = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parsePositiveIntEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveNetwork = (): WalletAdapterNetwork => {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet").trim().toLowerCase();

  if (raw === "mainnet" || raw === "mainnet-beta") {
    return WalletAdapterNetwork.Mainnet;
  }

  if (raw === "testnet") {
    return WalletAdapterNetwork.Testnet;
  }

  return WalletAdapterNetwork.Devnet;
};

const network = resolveNetwork();
const defaultWalletRpcUrl = clusterApiUrl(network);
const defaultMagicRouterRpcUrl = network === WalletAdapterNetwork.Devnet ? MAGICBLOCK_DEVNET_ROUTER_HTTPS : null;

const walletRpcUrl = normalizeUrl(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ?? defaultWalletRpcUrl;
const fallbackRpcUrl = normalizeUrl(process.env.NEXT_PUBLIC_SOLANA_FALLBACK_RPC_URL) ?? walletRpcUrl;
const magicRouterRpcUrl = normalizeUrl(process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL) ?? defaultMagicRouterRpcUrl;
const magicRouterEnabled =
  parseBooleanEnv(process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_ENABLED, network === WalletAdapterNetwork.Devnet) &&
  Boolean(magicRouterRpcUrl);
const magicRouterTimeoutMs = parsePositiveIntEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_TIMEOUT_MS,
  DEFAULT_MAGICBLOCK_TIMEOUT_MS
);
const erPermissionLifecycleEnabled = parseBooleanEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_ER_PERMISSION_ENABLED,
  network === WalletAdapterNetwork.Devnet
);
const erPermissionLifecycleRequired = parseBooleanEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_ER_PERMISSION_REQUIRED,
  false
);
const erPermissionAutoCommitEnabled = parseBooleanEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_ER_AUTO_COMMIT_ENABLED,
  true
);
const magicPrivateEnabled = parseBooleanEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_ENABLED,
  network === WalletAdapterNetwork.Devnet
);
const magicPrivateApiUrl = normalizeUrl(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_API_URL) ??
  MAGICBLOCK_PRIVATE_PAYMENTS_API_DEFAULT;
const magicPrivateTeeRpcUrl = normalizeUrl(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_TEE_RPC_URL) ??
  MAGICBLOCK_PRIVATE_TEE_RPC_DEFAULT;
const magicPrivateEphemeralRpcUrl = normalizeUrl(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_EPHEMERAL_RPC_URL);
const magicPrivateMint =
  normalizeUrl(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_MINT) ??
  (network === WalletAdapterNetwork.Mainnet
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const magicPrivateTokenDecimals = parsePositiveIntEnv(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_TOKEN_DECIMALS, 6);
const magicPrivateVerifyTeeIntegrity = parseBooleanEnv(
  process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_VERIFY_TEE_INTEGRITY,
  false
);

interface SolanaConfig {
  network: WalletAdapterNetwork;
  rpcUrl: string;
  walletRpcUrl: string;
  fallbackRpcUrl: string;
  magicRouterRpcUrl: string | null;
  magicRouterEnabled: boolean;
  magicRouterTimeoutMs: number;
  erPermissionLifecycleEnabled: boolean;
  erPermissionLifecycleRequired: boolean;
  erPermissionAutoCommitEnabled: boolean;
  magicPrivateEnabled: boolean;
  magicPrivateApiUrl: string;
  magicPrivateTeeRpcUrl: string;
  magicPrivateEphemeralRpcUrl: string | null;
  magicPrivateMint: string;
  magicPrivateTokenDecimals: number;
  magicPrivateVerifyTeeIntegrity: boolean;
  explorerBaseUrl: string;
}

interface AppConfig {
  solana: SolanaConfig;
  site: {
    name: string;
    description: string;
    links: {
      twitterX: string;
      github: string;
      docs: string;
    };
  };
}

export const appConfig: AppConfig = {
  solana: {
    network,
    rpcUrl: walletRpcUrl,
    walletRpcUrl,
    fallbackRpcUrl,
    magicRouterRpcUrl,
    magicRouterEnabled,
    magicRouterTimeoutMs,
    erPermissionLifecycleEnabled,
    erPermissionLifecycleRequired,
    erPermissionAutoCommitEnabled,
    magicPrivateEnabled,
    magicPrivateApiUrl,
    magicPrivateTeeRpcUrl,
    magicPrivateEphemeralRpcUrl,
    magicPrivateMint,
    magicPrivateTokenDecimals,
    magicPrivateVerifyTeeIntegrity,
    explorerBaseUrl: process.env.NEXT_PUBLIC_SOLANA_EXPLORER_BASE_URL ?? "https://explorer.solana.com"
  },
  site: {
    name: "WhisperPay",
    description: "Private crypto payments with private notes",
    links: {
      twitterX: "https://x.com/Nurarihyasa",
      github: "https://github.com/Pterodactyl681",
      docs: "https://github.com/Pterodactyl681/whisperpay#readme"
    }
  }
};

export const getExplorerTxUrl = (signature: string): string => {
  const base = appConfig.solana.explorerBaseUrl.replace(/\/$/, "");

  if (appConfig.solana.network === WalletAdapterNetwork.Mainnet || base.includes("cluster=")) {
    return `${base}/tx/${signature}`;
  }

  return `${base}/tx/${signature}?cluster=${appConfig.solana.network}`;
};
