# WhaleTrucker Polkadot Integration — Setup Guide

This guide walks you through every step needed to go from a fresh clone to a
running integration on Polkadot Hub TestNet (and ultimately MainNet).

---

## Prerequisites

| Requirement   | Minimum Version | Notes                              |
|---------------|-----------------|------------------------------------|
| Node.js       | 22.0.0+         | Install via [nvm](https://github.com/nvm-sh/nvm) |
| npm           | 10+             | Bundled with Node.js 22            |
| Git           | any             |                                    |
| A code editor | —               | VS Code recommended                |

---

## 1 — Clone the Repository

```bash
git clone https://github.com/scutuatua-crypto/polkadot-docs.git
cd polkadot-docs/whaletrucker-integration
```

---

## 2 — Install Dependencies

```bash
npm install
```

This installs:

- `ethers` v6 — EVM provider & wallet
- `solc` — Solidity compiler (runs locally, no Hardhat required)
- `dotenv` — Environment variable loader
- `typescript` + `ts-node` — TypeScript execution
- `@types/node` — Node.js type definitions

---

## 3 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable                     | Description                                  |
|------------------------------|----------------------------------------------|
| `NETWORK`                    | `testnet` (development) or `mainnet`         |
| `POLKADOT_TESTNET_RPC_URL`   | TestNet RPC (pre-filled with public endpoint)|
| `POLKADOT_MAINNET_RPC_URL`   | MainNet RPC (pre-filled with public endpoint)|
| `PRIVATE_KEY`                | Your deployer wallet's private key           |
| `MNEMONIC`                   | Alternative: BIP-39 mnemonic (12/24 words)   |
| `GAS_LIMIT`                  | Optional gas override (leave blank for auto) |

> **Security:** Never commit your `.env` file. It is already listed in `.gitignore`.

---

## 4 — Get TestNet Tokens from the Faucet

TestNet PAS tokens are required to pay for deployment gas.

1. Navigate to <https://faucet.polkadot.io/>
2. Connect your MetaMask wallet (ensure network is set to Polkadot Hub TestNet,
   chain ID `420420417`)
3. Request PAS tokens
4. Wait ~30 seconds and verify your balance on
   <https://blockscout-testnet.polkadot.io/>

---

## 5 — Add Polkadot Hub TestNet to MetaMask (optional)

| Field           | Value                                                  |
|-----------------|--------------------------------------------------------|
| Network Name    | Polkadot Hub TestNet                                   |
| RPC URL         | `https://services.polkadothub-rpc.com/testnet/`        |
| Chain ID        | `420420417`                                            |
| Currency Symbol | PAS                                                    |
| Block Explorer  | `https://blockscout-testnet.polkadot.io`               |

---

## 6 — (Optional) Local Type Check

Before deploying, verify TypeScript compiles cleanly:

```bash
npm run type-check
```

---

## 7 — Deploy to TestNet

```bash
npm run deploy:testnet
```

The script will:

1. Compile `asset-tracking-contract.sol` with `solc`
2. Connect to the Polkadot Hub TestNet
3. Estimate gas for deployment
4. Deploy the contract and wait for confirmation
5. Save the contract address to `deployed-addresses.json`
6. Print a BlockScout link for verification

Example output:

```
============================================================
  WhaleTrucker AssetTracker Deployment
  Network : Polkadot Hub TestNet
  Chain ID: 420420417
  RPC     : https://services.polkadothub-rpc.com/testnet/
============================================================

[deploy] Connected to Polkadot Hub TestNet ...
[deploy] Deployer address : 0xYourAddress
[deploy] Deploying AssetTracker ...
[deploy] Transaction hash : 0xTxHash

============================================================
  ✅  AssetTracker deployed successfully!
  Address : 0xContractAddress
  Explorer: https://blockscout-testnet.polkadot.io/address/0xContractAddress
============================================================
```

---

## 8 — Initialize the Yields Tracker Bridge

```typescript
import { createBridge } from './yields-tracker-integration';

const bridge = await createBridge(
  '0xYourDeployedContractAddress',
  'testnet',
);

// Sync an asset balance from your Yields Tracker
await bridge.syncAsset('0xUserAddress', '0xTokenAddress', '1000000000000000000');

// Query on-chain balance
const balance = await bridge.queryBalance('0xUserAddress', '0xTokenAddress');
console.log('On-chain balance:', balance.toString());
```

---

## 9 — Connect Event Listeners

```typescript
bridge.listenAssetTracked((user, token, oldAmount, newAmount) => {
  console.log(`Asset updated for ${user}: ${oldAmount} → ${newAmount}`);
});

bridge.listenYieldUpdated((user, token, yieldAmount, totalYield) => {
  console.log(`Yield recorded for ${user}: +${yieldAmount} (total: ${totalYield})`);
});
```

---

## 10 — Deploy to MainNet

> **⚠️ Warning:** MainNet deployment uses real DOT. Test thoroughly on TestNet first.

1. Update `.env`: set `NETWORK=mainnet`
2. Ensure your wallet is funded with DOT
3. Run:

```bash
npm run deploy:mainnet
```

The deployed address is saved under the `mainnet` key in `deployed-addresses.json`.

---

## 11 — Monitoring and Verification

- **TestNet Explorer:** <https://blockscout-testnet.polkadot.io/>
- **MainNet Explorer:** <https://blockscout.polkadot.io/>

To verify the contract source on BlockScout:
1. Navigate to `{explorerUrl}/address/{contractAddress}#code`
2. Click "Verify and Publish"
3. Select the exact compiler version used during deployment (matches the `solc` version in `package.json`), optimisation enabled (200 runs)
4. Paste the flattened Solidity source and select MIT licence

---

## Build for Production

```bash
npm run build
```

Compiled JavaScript and type declarations are output to `dist/`.

---

## Troubleshooting

| Problem                         | Solution                                                                |
|---------------------------------|-------------------------------------------------------------------------|
| `PRIVATE_KEY not set`           | Add `PRIVATE_KEY=...` to your `.env` file                              |
| Deployment fails with low gas   | Increase `GAS_LIMIT` in `.env` or add more PAS/DOT to the wallet       |
| `NETWORK_ERROR` on connect      | Verify RPC URL in `.env`; try the WSS endpoint as a fallback           |
| `nonce too low`                 | Reset pending transactions in MetaMask or wait for them to confirm      |
| Contract not visible on explorer| Wait 1–2 minutes and refresh; new blocks take ~6 s on Polkadot Hub     |
