# Task 6 — Wallet Risk Checker (Medium · Chain MCP)

Flags a **wallet or contract’s suspicious history before you transact with it**.

Read-only. No wallet, no private key, no sending.

**Live demo:** https://pharos-contract-reader.vercel.app/#risk  
**GitHub:** https://github.com/juhzinho/pharos-wallet-risk-checker

## Requirements

| Requirement | How |
|---|---|
| Flags a wallet or contract | Accepts a `0x` address or an official token symbol (USDC, WPROS, LINK, WETH) |
| Suspicious history | Independent signals scored from live Chain MCP data: zero/burn address, USDC `isBlacklisted`, unofficial/unknown contract, paused token, upgradeable proxy, brand-new idle wallet, inbound-only, drained after activity, self-transfer |
| Before you transact | Verdict **CLEAR / CAUTION / AVOID** with a recommendation. High or critical flags refuse a green light |
| Beyond the brief | Official Pacific token registry via Developer Docs MCP (`getPage`) so Circle USDC is not treated as an unknown contract. Transfer history uses `get_logs` filtered by Transfer + the address as from/to, **paged in 1000-block windows** (up to 50,000 on the CLI, 10,000 on the live page). Every report states that this is not a guarantee |

## What it reads (Chain MCP)

Pinned to one block (`get_chain_info`):

- `get_code` — EOA vs contract, bytecode size
- `get_balance` / `get_transaction_count` — PROS and nonce
- `eth_call` — `balanceOf` USDC/WPROS, `isBlacklisted` on official Circle USDC, and `name` / `symbol` / `decimals` / `owner` / `paused` plus EIP-1967 / ZeppelinOS proxy slots when the target is a contract
- `get_logs` — USDC and WPROS `Transfer` events involving the address (topic1 / topic2)

## Verdict

| Verdict | When |
|---|---|
| **AVOID** | Any **critical** or **high** flag (zero, burn, USDC blacklist, paused token), or score ≥ 50 |
| **CAUTION** | Medium signals (new idle wallet, unknown contract, inbound-only) |
| **CLEAR** | Only informational flags (official token, EOA/contract, expected proxy on Circle USDC) |

Each `get_logs` call covers 1000 blocks. The agent splits a larger lookback into those windows, runs them in parallel, and retries rate limits — the same pattern the Pharos workshop used for a full-month USDC scan.

## Install and run

```bash
npm install
npm run risk -- USDC
npm run risk -- 0x912c9aDe24D44d8922f0866D8Dcb079f1363f647
npm run risk -- 0x000000000000000000000000000000000000dEaD --lang pt
npm run risk -- 0x… --lookback 300 --json
```

| Option | Default | Meaning |
|---|---|---|
| `--lookback` | 1000 | Transfer window (1–50,000, paged at 1000) |
| `--lang` | en | `en` or `pt` |
| `--json` | off | Structured result |

## Tests

```bash
npm run test:unit          # includes scoring cases
npm run test:e2e -- risk   # --help, USDC official, burn address, validation
```
