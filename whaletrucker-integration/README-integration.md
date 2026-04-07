# WhaleTrucker + Polkadot Integration Suite

## Executive Summary

This integration package connects the **WhaleTrucker Ecosystem** — comprising the Yields Tracker and Reef/EVM logic — with **Polkadot Hub** smart contracts and cross-chain asset tracking capabilities. By leveraging Polkadot Hub's EVM compatibility, your existing Solidity knowledge and Ethers.js tooling can be reused directly, while gaining access to Polkadot's native cross-chain messaging (XCM) and shared security model.

---

## Architecture Overview

```
WhaleTrucker Ecosystem
├── Yields Tracker (existing)
│   └── Asset data feeds
└── Reef/EVM Logic (existing)
    └── Transaction building

        ↓  Bridge via yields-tracker-integration.ts

Polkadot Hub Smart Contracts
├── asset-tracking-contract.sol
│   ├── Balance tracking
│   ├── Yield accrual
│   └── XCM cross-chain state
└── Ethers.js v6 Provider (polkadot-connection-config.ts)
    ├── Polkadot Hub TestNet
    │   ├── Chain ID : 420420417
    │   ├── RPC      : https://services.polkadothub-rpc.com/testnet/
    │   └── Explorer : blockscout-testnet.polkadot.io
    └── Polkadot Hub MainNet
        ├── Chain ID : 420420419
        ├── RPC      : https://services.polkadothub-rpc.com/mainnet/
        └── Explorer : blockscout.polkadot.io
```

---

## Network Configuration

| Network              | Chain ID    | RPC Endpoint                                          | Block Explorer                        |
|----------------------|-------------|-------------------------------------------------------|---------------------------------------|
| Polkadot Hub TestNet | `420420417` | `https://services.polkadothub-rpc.com/testnet/`       | `blockscout-testnet.polkadot.io`      |
| Polkadot Hub MainNet | `420420419` | `https://services.polkadothub-rpc.com/mainnet/`       | `blockscout.polkadot.io`              |
| Kusama Hub           | `420420418` | `https://eth-rpc-kusama.polkadot.io/`                 | `blockscout-kusama.polkadot.io`       |

---

## Repository File Structure

```
whaletrucker-integration/
├── README-integration.md          ← This file
├── SETUP.md                       ← Step-by-step setup guide
├── polkadot-connection-config.ts  ← RPC provider & network constants
├── asset-tracking-contract.sol    ← Solidity asset tracking contract
├── deployment-script.ts           ← Automated Ethers.js v6 deployer
├── yields-tracker-integration.ts  ← Bridge: Yields Tracker ↔ Polkadot
├── .env.example                   ← Environment variable template
├── package.json                   ← Node.js dependencies
└── tsconfig.json                  ← TypeScript strict-mode config
```

---

## Smart Contract Deployment Guide

### Prerequisites

- Node.js 22.13.1+
- An account funded with TestNet tokens (see [faucet](https://faucet.polkadot.io/))
- A `.env` file filled from `.env.example`

### Step 1 — Install Dependencies

```bash
cd whaletrucker-integration
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs
```

### Step 3 — Compile the Contract

The deployment script uses `solc` at runtime. Ensure `solc` is available:

```bash
npx solcjs --version
```

### Step 4 — Deploy to TestNet

```bash
npx ts-node deployment-script.ts --network testnet
```

Deployed addresses are persisted to `deployed-addresses.json`.

### Step 5 — Deploy to MainNet

```bash
npx ts-node deployment-script.ts --network mainnet
```

> **Warning:** MainNet deployment is irreversible. Verify all parameters on TestNet first.

---

## Asset Tracking Workflow

```
1. Yields Tracker emits asset data
       ↓
2. yields-tracker-integration.ts transforms data (Reef → Polkadot format)
       ↓
3. Calls updateYield() or trackAsset() on asset-tracking-contract.sol
       ↓
4. Contract emits AssetTracked / YieldUpdated events
       ↓
5. Event listeners in yields-tracker-integration.ts catch events
       ↓
6. Off-chain state is updated / exported
```

---

## XCM Precompile Integration

Polkadot Hub exposes XCM capabilities via EVM precompiles, allowing your Solidity contract to send and receive cross-chain messages. The `asset-tracking-contract.sol` includes placeholder hooks for XCM calls. Relevant Polkadot docs:

- [XCM Precompile Reference](https://docs.polkadot.network/smart-contracts/precompiles/)
- [Cross-Chain Asset Transfers](https://docs.polkadot.network/smart-contracts/precompiles/xcm/)

---

## TestNet vs MainNet Configuration

| Setting             | TestNet                                               | MainNet                                               |
|---------------------|-------------------------------------------------------|-------------------------------------------------------|
| Chain ID            | `420420417`                                           | `420420419`                                           |
| RPC URL             | `https://services.polkadothub-rpc.com/testnet/`       | `https://services.polkadothub-rpc.com/mainnet/`       |
| Native Token        | PAS (free from faucet)                                | DOT (real value)                                      |
| Explorer            | `blockscout-testnet.polkadot.io`                      | `blockscout.polkadot.io`                              |
| Recommended Use     | Development, testing, CI                              | Production only after full TestNet validation         |

Set `NETWORK=testnet` or `NETWORK=mainnet` in your `.env` file to switch between environments automatically.

---

## Troubleshooting

| Issue                          | Solution                                                                                       |
|--------------------------------|-----------------------------------------------------------------------------------------------|
| `CALL_EXCEPTION` on deploy     | Ensure your wallet has sufficient PAS/DOT for gas                                             |
| `NETWORK_ERROR` / timeout      | Check RPC URL in `.env`; try the WSS fallback endpoint                                        |
| `nonce too low`                | Reset nonce: `provider.getTransactionCount(wallet.address, 'pending')`                        |
| Contract not verified          | Re-run verification step with correct compiler version (`0.8.9`)                              |
| XCM call reverts               | Confirm target chain is reachable and XCM precompile address is correct for your network      |

---

## Support Resources

- Polkadot Developer Docs: <https://docs.polkadot.network/>
- Polkadot Stack Exchange: <https://substrate.stackexchange.com/>
- Polkadot Discord: <https://dot.li/discord>
- BlockScout TestNet Explorer: <https://blockscout-testnet.polkadot.io/>
- Faucet: <https://faucet.polkadot.io/>
