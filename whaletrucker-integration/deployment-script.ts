/**
 * @file deployment-script.ts
 * @description Automated deployment utility for AssetTracker smart contract
 *   using Ethers.js v6.  Deploys to Polkadot Hub TestNet or MainNet and
 *   persists the deployed address to `deployed-addresses.json`.
 *
 * Usage:
 *   npx ts-node deployment-script.ts [--network testnet|mainnet]
 *
 * Environment variables (via .env):
 *   NETWORK         - "testnet" | "mainnet" (default: "testnet")
 *   PRIVATE_KEY     - Deployer wallet private key
 *   MNEMONIC        - Alternatively, BIP-39 mnemonic phrase
 *   GAS_LIMIT       - Override gas limit (optional)
 */

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import solc from 'solc';
import * as dotenv from 'dotenv';
import {
  getProvider,
  getWallet,
  getWalletFromMnemonic,
  NETWORKS,
  resolveNetworkName,
  type NetworkName,
} from './polkadot-connection-config';

dotenv.config();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTRACT_SOURCE_PATH = path.resolve(__dirname, 'asset-tracking-contract.sol');
const ADDRESSES_FILE = path.resolve(__dirname, 'deployed-addresses.json');
const CONTRACT_NAME = 'AssetTracker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads, compiles and returns the ABI + bytecode for AssetTracker. */
function compileContract(): { abi: object[]; bytecode: string } {
  console.log(`\n[deploy] Reading contract source from: ${CONTRACT_SOURCE_PATH}`);
  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, 'utf-8');

  const input = {
    language: 'Solidity',
    sources: { 'asset-tracking-contract.sol': { content: source } },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  console.log('[deploy] Compiling contract with solc ...');
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts: Record<
      string,
      Record<string, { abi: object[]; evm: { bytecode: { object: string } } }>
    >;
  };

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === 'error');
    if (fatal.length > 0) {
      fatal.forEach((e) => console.error('[compile error]', e.formattedMessage));
      throw new Error('[deploy] Compilation failed with errors.');
    }
    output.errors
      .filter((e) => e.severity === 'warning')
      .forEach((w) => console.warn('[compile warning]', w.formattedMessage));
  }

  const contract = output.contracts['asset-tracking-contract.sol'][CONTRACT_NAME];
  if (!contract) {
    throw new Error(`[deploy] Contract "${CONTRACT_NAME}" not found in compilation output.`);
  }

  console.log('[deploy] Compilation successful.');
  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
  };
}

/** Loads existing deployed-addresses.json or returns an empty object. */
function loadAddresses(): Record<string, Record<string, string>> {
  if (fs.existsSync(ADDRESSES_FILE)) {
    return JSON.parse(fs.readFileSync(ADDRESSES_FILE, 'utf-8')) as Record<
      string,
      Record<string, string>
    >;
  }
  return {};
}

/** Persists a contract address to deployed-addresses.json. */
function saveAddress(networkName: string, contractName: string, address: string): void {
  const addresses = loadAddresses();
  addresses[networkName] = addresses[networkName] ?? {};
  addresses[networkName][contractName] = address;
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2));
  console.log(`[deploy] Address saved to: ${ADDRESSES_FILE}`);
}

/** Parses --network flag from argv; falls back to NETWORK env var. */
function parseNetworkArg(): NetworkName {
  const idx = process.argv.indexOf('--network');
  if (idx !== -1 && process.argv[idx + 1]) {
    const val = process.argv[idx + 1].toLowerCase();
    if (val === 'mainnet' || val === 'testnet' || val === 'kusama') {
      return val as NetworkName;
    }
    console.warn(`[deploy] Unknown --network value "${val}", ignoring.`);
  }
  return resolveNetworkName();
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/**
 * Deploys the AssetTracker contract to the specified network.
 *
 * Steps:
 *  1. Compile the Solidity source.
 *  2. Connect to the network via Ethers.js.
 *  3. Estimate gas.
 *  4. Deploy the contract.
 *  5. Wait for confirmation.
 *  6. Persist the address.
 *  7. Print block explorer link.
 */
async function deploy(): Promise<void> {
  const networkName = parseNetworkArg();
  const networkConfig = NETWORKS[networkName];

  console.log('='.repeat(60));
  console.log(`  WhaleTrucker AssetTracker Deployment`);
  console.log(`  Network : ${networkConfig.name}`);
  console.log(`  Chain ID: ${networkConfig.chainId}`);
  console.log(`  RPC     : ${networkConfig.rpcUrl}`);
  console.log('='.repeat(60));

  // -- Step 1: Compile --
  const { abi, bytecode } = compileContract();

  // -- Step 2: Connect --
  console.log('\n[deploy] Connecting to network ...');
  const provider = await getProvider(networkName);

  let wallet: ethers.Wallet | ethers.HDNodeWallet;
  if (process.env.PRIVATE_KEY) {
    wallet = getWallet(provider);
  } else if (process.env.MNEMONIC) {
    wallet = getWalletFromMnemonic(provider);
  } else {
    throw new Error(
      '[deploy] Neither PRIVATE_KEY nor MNEMONIC is set in the environment.',
    );
  }

  const deployerAddress = await wallet.getAddress();
  console.log(`[deploy] Deployer address : ${deployerAddress}`);

  const balanceWei = await provider.getBalance(deployerAddress);
  const balanceFormatted = ethers.formatEther(balanceWei);
  console.log(
    `[deploy] Deployer balance : ${balanceFormatted} ${networkConfig.nativeCurrency}`,
  );

  if (balanceWei === 0n) {
    throw new Error(
      '[deploy] Deployer wallet has zero balance. ' +
        'Fund it via the faucet before deploying.',
    );
  }

  // -- Step 3: Estimate gas --
  console.log('\n[deploy] Estimating deployment gas ...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();

  const gasEstimate = await provider.estimateGas(deployTx);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
  const estimatedCost = gasEstimate * gasPrice;

  console.log(`[deploy] Estimated gas   : ${gasEstimate.toString()}`);
  console.log(
    `[deploy] Gas price       : ${ethers.formatUnits(gasPrice, 'gwei')} gwei`,
  );
  console.log(
    `[deploy] Estimated cost  : ${ethers.formatEther(estimatedCost)} ${networkConfig.nativeCurrency}`,
  );

  const gasLimit = process.env.GAS_LIMIT
    ? BigInt(process.env.GAS_LIMIT)
    : (gasEstimate * 120n) / 100n; // +20 % buffer

  // -- Step 4: Deploy --
  console.log(`\n[deploy] Deploying ${CONTRACT_NAME} ...`);
  const contract = await factory.deploy({ gasLimit });
  const deployTxHash = contract.deploymentTransaction()?.hash ?? 'unknown';
  console.log(`[deploy] Transaction hash: ${deployTxHash}`);
  console.log('[deploy] Waiting for confirmation ...');

  // -- Step 5: Wait --
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log('\n' + '='.repeat(60));
  console.log(`  ✅  ${CONTRACT_NAME} deployed successfully!`);
  console.log(`  Address : ${contractAddress}`);
  console.log(
    `  Explorer: ${networkConfig.explorerUrl}/address/${contractAddress}`,
  );
  console.log('='.repeat(60));

  // -- Step 6: Persist --
  saveAddress(networkName, CONTRACT_NAME, contractAddress);

  // -- Step 7: Verification hint --
  console.log(
    `\n[deploy] To verify the contract on BlockScout, navigate to:\n` +
      `  ${networkConfig.explorerUrl}/address/${contractAddress}#code\n` +
      `  and upload the flattened source with the exact solc version used\n` +
      `  during compilation (check the compiler output or package.json solc\n` +
      `  devDependency), optimisation enabled (200 runs), MIT licence.\n`,
  );
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

deploy().catch((err: unknown) => {
  console.error('\n[deploy] ❌ Deployment failed:', (err as Error).message);
  process.exitCode = 1;
});
