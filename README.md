# Pharos Wallet Risk Checker

Flags a **wallet or contract’s suspicious history before you transact with it**.

Read-only. No wallet, no private key, no sending.

**Pharos Season of AI** · Medium · Chain MCP

**Live demo:** https://pharos-contract-reader.vercel.app/#risk

## Requirements

| Requirement | How |
|---|---|
| Flags a wallet or contract | Accepts a `0x` address or an official token symbol (USDC, WPROS, LINK, WETH) |
| Suspicious history | Independent signals from live Chain MCP data: zero/burn address, USDC `isBlacklisted`, unofficial/unknown contract, paused token, upgradeable proxy, brand-new idle wallet, inbound-only, drained after activity, self-transfer |
| Before you transact | Verdict **CLEAR / CAUTION / AVOID** with a recommendation. High or critical flags refuse a green light |
| Beyond the brief | Official Pacific token registry via Developer Docs MCP (`getPage`) so Circle USDC is not treated as an unknown contract. Transfer history uses `get_logs` filtered by Transfer + the address as from/to (1000-block cap, disclosed) |

## What it reads (Chain MCP)

Pinned to one block (`get_chain_info`):

- `get_code` — EOA vs contract, bytecode size
- `get_balance` / `get_transaction_count` — PROS and nonce
- `eth_call` — `balanceOf` USDC/WPROS, `isBlacklisted` on official Circle USDC, and `name` / `symbol` / `decimals` / `owner` / `paused` plus EIP-1967 / ZeppelinOS proxy slots when the target is a contract
- `get_logs` — USDC and WPROS `Transfer` events involving the address (topic1 / topic2)

Official endpoints: [Chain MCP](https://mcp.pharos.xyz/mcp) · [Developer Docs](https://docs.pharos.xyz/) · [MCP tools](https://docs.pharos.xyz/tooling-and-infrastructure/mcp)

## Verdict

| Verdict | When |
|---|---|
| **AVOID** | Any **critical** or **high** flag (zero, burn, USDC blacklist, paused token), or score ≥ 50 |
| **CAUTION** | Medium signals (new idle wallet, unknown contract, inbound-only) |
| **CLEAR** | Only informational flags (official token, EOA/contract, expected proxy on Circle USDC) |

History cannot go past 1000 blocks — that is the Chain MCP `get_logs` window.

## Install and run

```bash
npm install
npm start -- USDC
npm start -- 0x912c9aDe24D44d8922f0866D8Dcb079f1363f647
npm start -- 0x000000000000000000000000000000000000dEaD --lang pt
```

## Tests

```bash
npm test
```
