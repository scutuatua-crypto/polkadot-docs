/**
 * @file polkadot-connection-config.ts
 * @description RPC provider setup and network configuration constants for
 *   connecting to Polkadot Hub (TestNet & MainNet) using Ethers.js v6.
 *
 * Usage:
 *   import { getProvider, NETWORKS } from './polkadot-connection-config';
 *   const provider = await getProvider('testnet');
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Supported network identifiers. */
export type NetworkName = 'testnet' | 'mainnet' | 'kusama';

/** Full configuration for a single Polkadot-compatible network. */
export interface NetworkConfig {
  /** Human-readable network name. */
  name: string;
  /** EVM chain ID. */
  chainId: number;
  /** HTTPS JSON-RPC endpoint. */
  rpcUrl: string;
  /** WebSocket JSON-RPC endpoint (for subscriptions). */
  wssUrl: string;
  /** Block explorer base URL. */
  explorerUrl: string;
  /** Native currency symbol. */
  nativeCurrency: string;
  /** Maximum number of automatic reconnect attempts. */
  maxRetries: number;
  /** Delay in milliseconds between reconnect attempts. */
  retryDelayMs: number;
}

// ---------------------------------------------------------------------------
// Network Constants
// ---------------------------------------------------------------------------

/**
 * Configuration map for all supported Polkadot Hub networks.
 * Values can be overridden via environment variables for CI or custom deployments.
 */
export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: 'Polkadot Hub TestNet',
    chainId: 420_420_417,
    rpcUrl:
      process.env.POLKADOT_TESTNET_RPC_URL ??
      'https://services.polkadothub-rpc.com/testnet/',
    wssUrl:
      process.env.POLKADOT_TESTNET_WSS_URL ??
      'wss://services.polkadothub-rpc.com/testnet/',
    explorerUrl: 'https://blockscout-testnet.polkadot.io',
    nativeCurrency: 'PAS',
    maxRetries: 5,
    retryDelayMs: 2_000,
  },
  mainnet: {
    name: 'Polkadot Hub MainNet',
    chainId: 420_420_419,
    rpcUrl:
      process.env.POLKADOT_MAINNET_RPC_URL ??
      'https://services.polkadothub-rpc.com/mainnet/',
    wssUrl:
      process.env.POLKADOT_MAINNET_WSS_URL ??
      'wss://services.polkadothub-rpc.com/mainnet/',
    explorerUrl: 'https://blockscout.polkadot.io',
    nativeCurrency: 'DOT',
    maxRetries: 3,
    retryDelayMs: 3_000,
  },
  kusama: {
    name: 'Kusama Hub',
    chainId: 420_420_418,
    rpcUrl:
      process.env.POLKADOT_KUSAMA_RPC_URL ??
      'https://eth-rpc-kusama.polkadot.io/',
    wssUrl:
      process.env.POLKADOT_KUSAMA_WSS_URL ??
      'wss://eth-rpc-kusama.polkadot.io/',
    explorerUrl: 'https://blockscout-kusama.polkadot.io',
    nativeCurrency: 'KSM',
    maxRetries: 3,
    retryDelayMs: 3_000,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the active network name from the `NETWORK` environment variable,
 * falling back to `'testnet'` if unset or invalid.
 */
export function resolveNetworkName(): NetworkName {
  const env = (process.env.NETWORK ?? 'testnet').toLowerCase();
  if (env === 'mainnet' || env === 'kusama' || env === 'testnet') {
    return env as NetworkName;
  }
  console.warn(
    `[polkadot-connection-config] Unknown NETWORK="${env}", defaulting to "testnet".`,
  );
  return 'testnet';
}

/**
 * Sleep helper used for retry back-off.
 * @param ms - Milliseconds to wait.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/**
 * Creates and verifies an Ethers.js v6 `JsonRpcProvider` for the given network.
 * Automatically retries on transient connection failures.
 *
 * @param network - Target network identifier. Defaults to `resolveNetworkName()`.
 * @returns A ready-to-use `ethers.JsonRpcProvider`.
 * @throws Error if the provider cannot be verified after all retry attempts.
 *
 * @example
 * ```typescript
 * const provider = await getProvider('testnet');
 * const blockNumber = await provider.getBlockNumber();
 * ```
 */
export async function getProvider(
  network: NetworkName = resolveNetworkName(),
): Promise<ethers.JsonRpcProvider> {
  const config = NETWORKS[network];
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
        chainId: config.chainId,
        name: config.name,
      });

      // Verify connectivity by fetching the current block number.
      await provider.getBlockNumber();

      console.log(
        `[polkadot-connection-config] Connected to ${config.name} ` +
          `(chainId: ${config.chainId}) on attempt ${attempt}.`,
      );

      return provider;
    } catch (err) {
      lastError = err;
      console.warn(
        `[polkadot-connection-config] Connection attempt ${attempt}/${config.maxRetries} ` +
          `failed for ${config.name}: ${(err as Error).message}`,
      );

      if (attempt < config.maxRetries) {
        await sleep(config.retryDelayMs);
      }
    }
  }

  throw new Error(
    `[polkadot-connection-config] Failed to connect to ${config.name} ` +
      `after ${config.maxRetries} attempts. Last error: ${(lastError as Error)?.message}`,
  );
}

/**
 * Creates a `WebSocketProvider` for real-time event subscriptions.
 *
 * @param network - Target network identifier. Defaults to `resolveNetworkName()`.
 * @returns A ready-to-use `ethers.WebSocketProvider`.
 *
 * @example
 * ```typescript
 * const wsProvider = getWssProvider('mainnet');
 * wsProvider.on('block', (blockNumber) => console.log('New block:', blockNumber));
 * ```
 */
export function getWssProvider(
  network: NetworkName = resolveNetworkName(),
): ethers.WebSocketProvider {
  const config = NETWORKS[network];
  return new ethers.WebSocketProvider(config.wssUrl, {
    chainId: config.chainId,
    name: config.name,
  });
}

/**
 * Creates an `ethers.Wallet` connected to the given provider, using the
 * `PRIVATE_KEY` environment variable.
 *
 * @param provider - A connected `JsonRpcProvider`.
 * @returns Signer `Wallet` instance ready to send transactions.
 * @throws Error if `PRIVATE_KEY` is not set.
 */
export function getWallet(
  provider: ethers.JsonRpcProvider,
): ethers.Wallet {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      '[polkadot-connection-config] PRIVATE_KEY environment variable is not set.',
    );
  }
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Creates an `ethers.HDNodeWallet` from a BIP-39 mnemonic phrase connected
 * to the given provider.
 *
 * @param provider - A connected `JsonRpcProvider`.
 * @param derivationPath - BIP-44 derivation path (default: `m/44'/60'/0'/0/0`).
 * @returns Signer `HDNodeWallet` instance.
 * @throws Error if `MNEMONIC` is not set.
 */
export function getWalletFromMnemonic(
  provider: ethers.JsonRpcProvider,
  derivationPath = "m/44'/60'/0'/0/0",
): ethers.HDNodeWallet {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      '[polkadot-connection-config] MNEMONIC environment variable is not set.',
    );
  }
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
  return wallet.connect(provider) as ethers.HDNodeWallet;
}
