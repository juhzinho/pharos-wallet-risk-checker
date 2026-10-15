import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  hexToString,
  isAddress,
  parseAbi,
  sliceHex,
} from "viem";
import { callJson, isTransient } from "./mcp.js";
import { getDocsPage } from "./docs.js";
import { extractPacificRegistry, PACIFIC_REGISTRY, TOKEN_REGISTRY_URL } from "./combo-functions.js";
import { fetchTransfers, MAX_WINDOW } from "./transfers.js";
import { explorerAddress, formatAmount, formatInteger, labeled, short } from "./format.js";
import { BURN_ADDRESS, evaluateRisk, officialOf, recommendation, ZERO_ADDRESS } from "./risk-score.js";

export { MAX_WINDOW, evaluateRisk, officialOf, recommendation, ZERO_ADDRESS, BURN_ADDRESS };

const extraAbi = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function isBlacklisted(address account) view returns (bool)",
]);
const bytes32Abi = parseAbi(["function name() view returns (bytes32)", "function symbol() view returns (bytes32)"]);

const PROXY_SLOTS = {
  "EIP-1967": {
    implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  },
  ZeppelinOS: {
    implementation: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
    admin: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b",
  },
};

const ZERO_WORD = /^0x0*$/;
const WATCH_TOKENS = ["USDC", "WPROS"];

function slotToAddress(value) {
  if (!value || ZERO_WORD.test(value)) return null;
  return getAddress(sliceHex(value, 12));
}

async function latest(client) {
  try {
    const chain = await callJson(client, "get_chain_info");
    return { block: Number(chain.latestBlock ?? chain.blockNumber), chainId: chain.chainId ?? 1672 };
  } catch {
    const n = await callJson(client, "get_block_number");
    return { block: Number(n.blockNumber), chainId: 1672 };
  }
}

async function ethCall(client, to, abi, functionName, args, block) {
  const data = encodeFunctionData({ abi, functionName, args });
  const { result } = await callJson(client, "eth_call", { transaction: { to, data }, block });
  if (!result || result === "0x") throw new Error(`${functionName} empty`);
  return decodeFunctionResult({ abi, functionName, data: result });
}

async function tokenText(client, to, functionName, block) {
  const raw = await ethCall(client, to, erc20Abi, functionName, [], block);
  try {
    return typeof raw === "string" ? raw : hexToString(raw, { size: 32 }).replace(/\0+$/, "");
  } catch {
    return hexToString(await ethCall(client, to, bytes32Abi, functionName, [], block), { size: 32 }).replace(/\0+$/, "");
  }
}

async function probeToken(client, address, block) {
  const tasks = {
    name: tokenText(client, address, "name", block),
    symbol: tokenText(client, address, "symbol", block),
    decimals: ethCall(client, address, erc20Abi, "decimals", [], block),
    owner: ethCall(client, address, extraAbi, "owner", [], block),
    paused: ethCall(client, address, extraAbi, "paused", [], block),
    ...Object.fromEntries(
      Object.entries(PROXY_SLOTS).flatMap(([standard, slots]) => [
        [`${standard}:implementation`, callJson(client, "get_storage_at", { address, position: slots.implementation, block })],
        [`${standard}:admin`, callJson(client, "get_storage_at", { address, position: slots.admin, block })],
      ])
    ),
  };
  const keys = Object.keys(tasks);
  const results = await Promise.allSettled(Object.values(tasks));
  const net = results.find((r) => r.status === "rejected" && isTransient(r.reason));
  if (net) throw net.reason;
  const r = Object.fromEntries(keys.map((k, i) => [k, results[i].status === "fulfilled" ? results[i].value : null]));
  let proxy = null;
  for (const standard of Object.keys(PROXY_SLOTS)) {
    const implementation = slotToAddress(r[`${standard}:implementation`]?.value);
    if (implementation) {
      proxy = { standard, implementation, admin: slotToAddress(r[`${standard}:admin`]?.value) };
      break;
    }
  }
  if (r.name == null && r.symbol == null && r.decimals == null && !proxy) return null;
  return {
    name: r.name,
    symbol: r.symbol,
    decimals: r.decimals != null ? Number(r.decimals) : null,
    owner: r.owner && isAddress(r.owner) ? getAddress(r.owner) : null,
    paused: typeof r.paused === "boolean" ? r.paused : null,
    proxy,
  };
}

export function resolveRiskTarget(input) {
  const text = String(input ?? "").trim();
  if (!text) return { error: "empty" };
  const asSymbol = PACIFIC_REGISTRY[text.toUpperCase()];
  if (asSymbol) return { address: asSymbol.address, symbol: asSymbol.symbol };
  if (isAddress(text)) return { address: getAddress(text), symbol: officialOf(text)?.symbol ?? null };
  const broken = text.match(/0x[0-9a-zA-Z]+/);
  if (broken) return { error: "invalid", raw: broken[0] };
  return { error: "unknown", raw: text };
}

/**
 * Scan a wallet or contract through Chain MCP (and the official token registry via Docs MCP when available).
 */
export async function checkRisk(chainClient, target, { lookback = 1000, docsClient = null, lang = "en" } = {}) {
  const resolved = typeof target === "object" && target.address ? target : resolveRiskTarget(target);
  if (resolved.error === "empty") throw Object.assign(new Error(lang === "pt" ? "Cole um endereço 0x ou um token (USDC, WPROS, LINK, WETH)." : "Paste a 0x address or a token (USDC, WPROS, LINK, WETH)."), { status: 400 });
  if (resolved.error === "invalid") throw Object.assign(new Error(lang === "pt" ? `${resolved.raw} não é um endereço 0x válido.` : `${resolved.raw} is not a valid 0x address.`), { status: 400 });
  if (resolved.error === "unknown") throw Object.assign(new Error(lang === "pt" ? `Não reconheci “${resolved.raw}”. Use USDC, WPROS, LINK, WETH ou um endereço.` : `I do not recognize “${resolved.raw}”. Use USDC, WPROS, LINK, WETH or an address.`), { status: 400 });
  if (!Number.isInteger(lookback) || lookback < 1 || lookback > MAX_WINDOW) {
    throw Object.assign(new Error(`lookback must be 1 to ${MAX_WINDOW}`), { status: 400 });
  }

  const address = resolved.address;
  const tools = [];
  const head = await latest(chainClient);
  tools.push("get_chain_info");
  const fromBlock = Math.max(0, head.block - lookback + 1);

  const [codeRes, balRes, nonceRes] = await Promise.all([
    callJson(chainClient, "get_code", { address, block: head.block }),
    callJson(chainClient, "get_balance", { address, block: head.block }),
    callJson(chainClient, "get_transaction_count", { address, block: head.block }),
  ]);
  tools.push("get_code", "get_balance", "get_transaction_count");

  const bytecode = codeRes.code ?? codeRes.result ?? "0x";
  const isContract = Boolean(bytecode && bytecode !== "0x");
  const codeBytes = isContract ? (bytecode.length - 2) / 2 : 0;
  const nativeWei = BigInt(balRes.balanceWei ?? balRes.balance ?? balRes.result ?? 0);
  const nonce = Number(nonceRes.transactionCount ?? nonceRes.count ?? nonceRes.result ?? nonceRes.nonce ?? 0);

  let tokenMeta = null;
  if (isContract) {
    tokenMeta = await probeToken(chainClient, address, head.block);
    tools.push("eth_call", "get_storage_at");
  }

  let blacklisted = null;
  const selfIsUsdc = address.toLowerCase() === PACIFIC_REGISTRY.USDC.address.toLowerCase();
  if (!selfIsUsdc) {
    try {
      blacklisted = Boolean(await ethCall(chainClient, PACIFIC_REGISTRY.USDC.address, extraAbi, "isBlacklisted", [address], head.block));
      tools.push("eth_call");
    } catch (e) {
      if (isTransient(e)) throw e;
      blacklisted = null;
    }
  }

  const tokenBalances = {};
  const transfers = [];
  const flows = {};
  for (const symbol of WATCH_TOKENS) {
    const token = PACIFIC_REGISTRY[symbol];
    let balance = 0n;
    try {
      balance = await ethCall(chainClient, token.address, erc20Abi, "balanceOf", [address], head.block);
      tools.push("eth_call");
    } catch (e) {
      if (isTransient(e)) throw e;
    }
    tokenBalances[symbol] = balance;
    const { transfers: logs } = await fetchTransfers(chainClient, token.address, fromBlock, head.block, { parties: [address] });
    tools.push("get_logs");
    const mine = logs.filter((t) => t.from.toLowerCase() === address.toLowerCase() || t.to.toLowerCase() === address.toLowerCase());
    let inn = 0n;
    let out = 0n;
    for (const t of mine) {
      const direction = t.to.toLowerCase() === address.toLowerCase() ? "in" : "out";
      if (direction === "in") inn += t.value;
      else out += t.value;
      transfers.push({
        ...t,
        symbol,
        direction,
        amount: formatAmount(t.value, token.decimals, 6, lang),
      });
    }
    flows[symbol] = { in: inn, out, count: mine.length, decimals: token.decimals };
  }
  transfers.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

  let official = officialOf(address);
  let docsSources = [];
  if (docsClient) {
    try {
      const page = await getDocsPage(docsClient, TOKEN_REGISTRY_URL);
      tools.push("getPage");
      const hits = extractPacificRegistry(page);
      const hit = hits.find((h) => h.address.toLowerCase() === address.toLowerCase());
      if (hit) official = official ?? PACIFIC_REGISTRY[hit.symbol] ?? { symbol: hit.symbol, address: hit.address };
      docsSources = [{ title: "Token Registry", url: TOKEN_REGISTRY_URL }];
    } catch (e) {
      if (isTransient(e)) throw e;
    }
  }

  const facts = {
    address,
    lookback,
    official,
    isContract,
    codeBytes,
    nonce,
    nativeWei: nativeWei.toString(),
    tokenBalances: Object.fromEntries(Object.entries(tokenBalances).map(([k, v]) => [k, v.toString()])),
    transfers: transfers.map((t) => ({ from: t.from, to: t.to, direction: t.direction, symbol: t.symbol })),
    blacklist: { USDC: blacklisted },
    tokenMeta,
  };
  const scored = evaluateRisk(facts);

  return {
    ok: true,
    language: lang,
    block: head.block,
    chainId: head.chainId,
    fromBlock,
    lookback,
    address,
    explorer: explorerAddress(address),
    label: official?.symbol ? official.name?.[lang] ?? official.symbol : labeled(address, {}, lang),
    isContract,
    codeBytes,
    nonce,
    native: formatAmount(nativeWei, 18, 4, lang),
    nativeWei: nativeWei.toString(),
    tokens: Object.fromEntries(
      WATCH_TOKENS.map((symbol) => {
        const token = PACIFIC_REGISTRY[symbol];
        const flow = flows[symbol];
        return [
          symbol,
          {
            balance: formatAmount(tokenBalances[symbol], token.decimals, 6, lang),
            in: formatAmount(flow.in, token.decimals, 6, lang),
            out: formatAmount(flow.out, token.decimals, 6, lang),
            count: flow.count,
          },
        ];
      })
    ),
    tokenMeta: tokenMeta
      ? {
          ...tokenMeta,
          owner: tokenMeta.owner,
          ownerLabel: tokenMeta.owner ? labeled(tokenMeta.owner, {}, lang) : null,
        }
      : null,
    blacklist: { USDC: blacklisted },
    official: official?.symbol ?? null,
    verdict: scored.verdict,
    score: scored.score,
    flags: scored.flags,
    recommendation: recommendation(scored.verdict, lookback, lang),
    recommendationByLang: {
      en: recommendation(scored.verdict, lookback, "en"),
      pt: recommendation(scored.verdict, lookback, "pt"),
    },
    recent: transfers.slice(-12).reverse().map((t) => ({
      block: t.block,
      symbol: t.symbol,
      direction: t.direction,
      amount: t.amount,
      from: t.from,
      to: t.to,
      tx: t.tx,
    })),
    docsSources,
    tools: [...new Set(tools)],
  };
}

export function presentRisk(report, lang = report.language ?? "en") {
  const v = report.verdict.toUpperCase();
  const lines = [];
  lines.push(lang === "pt" ? `RISCO — ${report.address}` : `RISK — ${report.address}`);
  lines.push(lang === "pt" ? `Veredito ${v}  (${report.score}/100)  bloco ${formatInteger(report.block, lang)}` : `Verdict ${v}  (${report.score}/100)  block ${formatInteger(report.block, lang)}`);
  lines.push(report.recommendation);
  lines.push("");
  lines.push(`${report.isContract ? (lang === "pt" ? "Contrato" : "Contract") : "EOA"} · ${report.native} PROS · nonce ${report.nonce}${report.official ? ` · ${report.official}` : ""}`);
  lines.push(`USDC  hold ${report.tokens.USDC.balance} · in ${report.tokens.USDC.in} / out ${report.tokens.USDC.out} · ${report.tokens.USDC.count} transfers`);
  lines.push(`WPROS hold ${report.tokens.WPROS.balance} · in ${report.tokens.WPROS.in} / out ${report.tokens.WPROS.out} · ${report.tokens.WPROS.count} transfers`);
  if (report.tokenMeta?.symbol) lines.push(`${report.tokenMeta.symbol}  ${report.tokenMeta.name ?? ""}  decimals ${report.tokenMeta.decimals ?? "—"}`);
  if (report.flags.length) {
    lines.push("");
    lines.push(lang === "pt" ? "Flags" : "Flags");
    for (const f of report.flags) {
      lines.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.text[lang] ?? f.text.en}`);
    }
  }
  if (report.recent.length) {
    lines.push("");
    lines.push(lang === "pt" ? `Transfers recentes (USDC/WPROS, ${report.lookback} blocos)` : `Recent transfers (USDC/WPROS, ${report.lookback} blocks)`);
    for (const t of report.recent.slice(0, 8)) {
      lines.push(`  [${t.block}] ${t.direction.toUpperCase()} ${t.amount} ${t.symbol}  ${short(t.from)} → ${short(t.to)}`);
    }
  }
  lines.push("");
  lines.push(report.explorer);
  return `${lines.join("\n")}\n`;
}
