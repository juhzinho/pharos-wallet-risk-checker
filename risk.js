#!/usr/bin/env node
import { connect, takeCallLog, CHAIN_MCP_URL, DOCS_MCP_URL } from "./lib/mcp.js";
import { MAX_WINDOW, checkRisk, presentRisk } from "./lib/risk.js";

function summarizeCalls(names) {
  const counts = names.reduce((acc, n) => ((acc[n] = (acc[n] ?? 0) + 1), acc), {});
  return Object.entries(counts)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(", ");
}

const USAGE = `Usage: node risk.js <address|USDC|WPROS|LINK|WETH> [options]

Wallet Risk Checker. Flags a wallet or contract's suspicious history on
Pharos Pacific Mainnet before you transact with it. Uses Chain MCP
(get_code, get_balance, get_transaction_count, eth_call, get_logs) and
the official token registry via Developer Docs MCP.

Read-only. No wallet, no private key, no sending.

  npm run risk -- USDC
  npm run risk -- 0x912c9aDe24D44d8922f0866D8Dcb079f1363f647
  npm run risk -- 0x000000000000000000000000000000000000dEaD --lang pt

Options:
  --lookback <blocks>   USDC/WPROS transfer history, 1 to ${MAX_WINDOW} (default 1000)
  --lang en|pt          report language (default en)
  --json                print the structured result
  --help
`;

function fail(message) {
  console.log(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { target: null, lookback: 1000, lang: "en", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (a === "--json") opts.json = true;
    else if (a === "--lookback") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--") || !/^\d+$/.test(v)) fail("--lookback needs a number.");
      opts.lookback = Number(v);
    } else if (a === "--lang") {
      const v = argv[++i];
      if (v !== "en" && v !== "pt") fail("--lang must be en or pt.");
      opts.lang = v;
    } else if (a.startsWith("--")) fail(`Unknown option: ${a}`);
    else if (!opts.target) opts.target = a;
    else fail(`Unexpected argument: ${a}`);
  }
  if (!opts.target) fail("Pass a 0x address or a token symbol.");
  if (!Number.isInteger(opts.lookback) || opts.lookback < 1 || opts.lookback > MAX_WINDOW) {
    fail(`--lookback must be 1 to ${MAX_WINDOW}.`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

let chainClient;
let docsClient;
try {
  [chainClient, docsClient] = await Promise.all([
    connect(CHAIN_MCP_URL, "pharos-wallet-risk-checker"),
    connect(DOCS_MCP_URL, "pharos-wallet-risk-checker-docs").catch(() => null),
  ]);
} catch (e) {
  console.error(`Error: could not connect to Pharos MCP (${e.message})`);
  process.exit(1);
}

try {
  takeCallLog(chainClient);
  if (docsClient) takeCallLog(docsClient);
  const report = await checkRisk(chainClient, opts.target, { lookback: opts.lookback, docsClient, lang: opts.lang });
  const chainLog = takeCallLog(chainClient);
  const docsLog = docsClient ? takeCallLog(docsClient) : [];
  if (opts.json) {
    console.log(JSON.stringify({ ...report, calls: summarizeCalls([...docsLog, ...chainLog]) }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } else {
    process.stdout.write(presentRisk(report, opts.lang));
    console.log(`MCP: ${summarizeCalls([...docsLog, ...chainLog])}`);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(e.status === 400 ? 2 : 1);
} finally {
  await Promise.all([chainClient?.close?.(), docsClient?.close?.()].map((p) => p?.catch?.(() => {})));
}
