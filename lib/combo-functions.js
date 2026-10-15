import { getAddress, isAddress, parseAbi, parseUnits } from "viem";

/** Official Pacific Mainnet tokens from https://docs.pharos.xyz/getting-started/token-registry */
export const PACIFIC_REGISTRY = {
  USDC: {
    symbol: "USDC",
    name: { en: "USDC (Circle)", pt: "USDC (Circle)" },
    address: getAddress("0xc879c018db60520f4355c26ed1a6d572cdac1815"),
    decimals: 6,
  },
  WPROS: {
    symbol: "WPROS",
    name: { en: "Wrapped PROS", pt: "Wrapped PROS" },
    address: getAddress("0x52c48d4213107b20bc583832b0d951fb9ca8f0b0"),
    decimals: 18,
  },
  LINK: {
    symbol: "LINK",
    name: { en: "Chainlink Token", pt: "Token Chainlink" },
    address: getAddress("0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29"),
    decimals: 18,
  },
  WETH: {
    symbol: "WETH",
    name: { en: "Wrapped ETH", pt: "ETH envelopado" },
    address: getAddress("0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9"),
    decimals: 18,
  },
};

export const TOKEN_REGISTRY_URL = "https://docs.pharos.xyz/getting-started/token-registry";
export const ETH_CALL_DOCS_URL = "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods";

const TOKEN_ALIASES = {
  usdc: "USDC",
  "usd coin": "USDC",
  circle: "USDC",
  wpros: "WPROS",
  "wrapped pros": "WPROS",
  link: "LINK",
  chainlink: "LINK",
  weth: "WETH",
  "wrapped eth": "WETH",
};

const TESTNET_ONLY = ["usdt", "tether", "dai", "wbtc", "wphrs"];

/**
 * Functions the agent can explain and then call (view) or encode without sending (write).
 * ABI strings stay next to the id so encode/decode never drift from the catalog.
 */
export const FUNCTIONS = [
  {
    id: "decimals",
    aliases: ["decimals", "decimais", "casas", "decimal places", "divisible", "divisivel"],
    abi: "function decimals() view returns (uint8)",
    kind: "view",
    args: [],
    result: "uint8",
    format: "uint",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official ${symbol} contract address and how many decimals does the token registry list? How do I read decimals() with eth_call?`,
  },
  {
    id: "totalSupply",
    aliases: ["totalsupply", "total supply", "supply", "circulacao", "circulating", "circulating supply", "quantos existem", "quantas existem"],
    abi: "function totalSupply() view returns (uint256)",
    kind: "view",
    args: [],
    result: "uint256",
    format: "amount",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official ${symbol} address? What does an ERC-20 totalSupply() function return, and how do I call it with eth_call?`,
  },
  {
    id: "name",
    aliases: ["name", "nome", "token name"],
    abi: "function name() view returns (string)",
    kind: "view",
    args: [],
    result: "string",
    format: "string",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official name of ${symbol} in the token registry? How do I read name() with eth_call?`,
  },
  {
    id: "symbol",
    aliases: ["symbol", "simbolo", "ticker"],
    abi: "function symbol() view returns (string)",
    kind: "view",
    args: [],
    result: "string",
    format: "string",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what ticker/symbol does the token registry list for ${symbol}? How do I read symbol() with eth_call?`,
  },
  {
    id: "owner",
    aliases: ["owner", "dono", "proprietario", "who owns", "quem e o dono"],
    abi: "function owner() view returns (address)",
    kind: "view",
    args: [],
    result: "address",
    format: "address",
    docsAsk: (symbol) =>
      `On Pharos, how do I read a contract with eth_call? What is the official ${symbol} address on Pacific Mainnet?`,
  },
  {
    id: "paused",
    aliases: ["paused", "pausado", "pausa", "is it paused"],
    abi: "function paused() view returns (bool)",
    kind: "view",
    args: [],
    result: "bool",
    format: "bool",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official ${symbol} address? How do I call a view function such as paused() with eth_call?`,
  },
  {
    id: "balanceOf",
    aliases: ["balanceof", "balance of", "balance", "saldo", "quanto tem", "how much"],
    abi: "function balanceOf(address account) view returns (uint256)",
    kind: "view",
    args: [{ name: "account", type: "address" }],
    result: "uint256",
    format: "amount",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official ${symbol} address and decimals? How do I read an ERC-20 balanceOf(address) with eth_call?`,
  },
  {
    id: "allowance",
    aliases: ["allowance", "aprovacao", "allowance of"],
    abi: "function allowance(address owner, address spender) view returns (uint256)",
    kind: "view",
    args: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    result: "uint256",
    format: "amount",
    docsAsk: (symbol) =>
      `On Pharos, how do I call ERC-20 allowance(owner, spender) with eth_call? What is the official ${symbol} address on Pacific Mainnet?`,
  },
  {
    id: "currency",
    aliases: ["currency", "moeda"],
    abi: "function currency() view returns (string)",
    kind: "view",
    args: [],
    result: "string",
    format: "string",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, is ${symbol} the Circle-deployed USDC? How do I read a view function with eth_call?`,
  },
  {
    id: "isBlacklisted",
    aliases: ["isblacklisted", "blacklisted", "blacklist"],
    abi: "function isBlacklisted(address account) view returns (bool)",
    kind: "view",
    args: [{ name: "account", type: "address" }],
    result: "bool",
    format: "bool",
    docsAsk: (symbol) =>
      `On Pharos Pacific Mainnet, what is the official ${symbol} (Circle USDC) address? How do I call a view function with eth_call?`,
  },
  {
    id: "transfer",
    aliases: ["transfer", "transferir", "enviar", "send"],
    abi: "function transfer(address to, uint256 value)",
    kind: "write",
    args: [
      { name: "to", type: "address" },
      { name: "value", type: "amount" },
    ],
    result: null,
    format: "none",
    docsAsk: (symbol) =>
      `On Pharos, how does eth_call differ from sending a transaction? What is the official ${symbol} address on Pacific Mainnet?`,
  },
  {
    id: "approve",
    aliases: ["approve", "aprovar", "approval"],
    abi: "function approve(address spender, uint256 value)",
    kind: "write",
    args: [
      { name: "spender", type: "address" },
      { name: "value", type: "amount" },
    ],
    result: null,
    format: "none",
    docsAsk: (symbol) =>
      `On Pharos, how do I interact with an ERC-20 without sending a transaction? What is the official ${symbol} address on Pacific Mainnet?`,
  },
];

export function functionById(id) {
  return FUNCTIONS.find((f) => f.id.toLowerCase() === String(id ?? "").toLowerCase()) ?? null;
}

export function abiOf(fn) {
  return parseAbi([fn.abi]);
}

export function signatureOf(fn) {
  return fn.abi.replace(/^function\s+/, "");
}

export function registryBySymbol(symbol) {
  if (!symbol) return null;
  return PACIFIC_REGISTRY[String(symbol).toUpperCase()] ?? null;
}

export function registryByAddress(address) {
  if (!isAddress(address)) return null;
  const key = getAddress(address);
  return Object.values(PACIFIC_REGISTRY).find((t) => t.address === key) ?? null;
}

export function resolveRegistryToken(text) {
  const raw = String(text ?? "");
  for (const [alias, symbol] of Object.entries(TOKEN_ALIASES)) {
    if (new RegExp(`(^|[^a-z0-9])${alias.replace(/ /g, "\\s+")}([^a-z0-9]|$)`).test(raw)) {
      return PACIFIC_REGISTRY[symbol];
    }
  }
  return null;
}

export function testnetOnlyToken(text) {
  const raw = String(text ?? "");
  return TESTNET_ONLY.find((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(raw)) ?? null;
}

export function listFunctionIds() {
  return FUNCTIONS.map((f) => f.id);
}

/** Pull official Pacific Mainnet rows out of the token-registry page (ignore Atlantic). */
export function extractPacificRegistry(markdown) {
  const body = String(markdown ?? "");
  const pacific = body.split(/Pacific Mainnet/i)[1] ?? "";
  const hits = [];
  const re = /\b(WPROS|USDC|LINK|WETH)\b[\s\S]{0,160}?(0x[a-fA-F0-9]{40})/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(pacific))) {
    const symbol = m[1].toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    hits.push({ symbol, address: getAddress(m[2]) });
  }
  return hits;
}

export function encodeArgs(fn, rawArgs, decimals) {
  return fn.args.map((spec, i) => {
    const value = rawArgs[i];
    if (value === undefined || value === null || value === "") {
      throw new Error(`${fn.id} needs argument ${spec.name} (${spec.type})`);
    }
    if (spec.type === "address") {
      if (!isAddress(value)) throw new Error(`${fn.id}: ${spec.name} is not a valid address`);
      return getAddress(value);
    }
    if (spec.type === "amount") {
      const text = String(value).trim();
      if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`${fn.id}: ${spec.name} must be a number`);
      return parseUnits(text, Number(decimals ?? 18));
    }
    return value;
  });
}
