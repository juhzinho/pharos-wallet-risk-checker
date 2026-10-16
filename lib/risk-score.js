import { getAddress, isAddress } from "viem";
import { PACIFIC_REGISTRY } from "./combo-functions.js";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

export const WEIGHT = { info: 0, low: 12, medium: 28, high: 48, critical: 80 };

export function officialOf(address) {
  if (!isAddress(address)) return null;
  const key = getAddress(address);
  return Object.values(PACIFIC_REGISTRY).find((t) => t.address === key) ?? null;
}

/**
 * Pure scoring. `facts` is the snapshot gathered on-chain; this function never
 * calls the network so the verdict is unit-testable.
 */
export function evaluateRisk(facts) {
  const flags = [];
  const addr = facts.address;
  const official = facts.official ?? officialOf(addr);

  if (addr?.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    flags.push(flag("zero-address", "critical", {
      en: "This is the zero address. Funds sent here are destroyed.",
      pt: "Este é o endereço zero. Token enviado aqui se perde.",
    }));
  }
  if (addr?.toLowerCase() === BURN_ADDRESS.toLowerCase()) {
    flags.push(flag("burn-address", "critical", {
      en: "This is a burn address (0x…dead). Funds sent here cannot be recovered.",
      pt: "Este é um endereço de queima (0x…dead). O que entrar não volta.",
    }));
  }
  if (facts.blacklist?.USDC === true) {
    flags.push(flag("usdc-blacklisted", "critical", {
      en: "Circle USDC reports isBlacklisted(this address) = true. Transfers of official USDC to or from it can revert.",
      pt: "O USDC da Circle responde isBlacklisted(este endereço) = true. Transferências de USDC oficial podem reverter.",
    }));
  }
  if (official) {
    flags.push(flag("official-token", "info", {
      en: `This is the official ${official.symbol} contract from the Pharos Pacific Mainnet token registry.`,
      pt: `Este é o contrato oficial de ${official.symbol} no token registry da Pacific Mainnet.`,
    }));
    flags.push(flag("dont-send-to-token", "info", {
      en: `This is a token contract, not a wallet. Sending ${official.symbol} here as if it were a recipient can lock the funds. Use transfer(to, amount) with a real wallet.`,
      pt: `Isto é um contrato de token, não uma carteira. Enviar ${official.symbol} para cá como se fosse destinatário pode travar os fundos. Use transfer(to, amount) com uma carteira real.`,
    }));
  }
  if (facts.isContract) {
    flags.push(flag("is-contract", "info", {
      en: `This address has contract bytecode (${facts.codeBytes} bytes). You are transacting with code, not a plain wallet.`,
      pt: `Este endereço tem bytecode de contrato (${facts.codeBytes} bytes). Você está falando com código, não com uma carteira simples.`,
    }));
    if (!official && !facts.tokenMeta?.symbol) {
      flags.push(flag("unofficial-contract", "medium", {
        en: "Unknown contract: not in the official token registry and it did not answer as a standard ERC-20. Read the code before sending.",
        pt: "Contrato desconhecido: não está no token registry oficial e não respondeu como ERC-20 padrão. Leia o código antes de enviar.",
      }));
    }
    if (facts.tokenMeta?.paused === true) {
      flags.push(flag("token-paused", "high", {
        en: "The contract reports paused() = true. Transfers are likely blocked right now.",
        pt: "O contrato responde paused() = true. Transferências provavelmente estão bloqueadas agora.",
      }));
    }
    if (facts.tokenMeta?.proxy) {
      flags.push(flag("upgradeable-proxy", official ? "info" : "low", {
        en: `Upgradeable proxy (${facts.tokenMeta.proxy.standard}). The public address stays; the logic can change.`,
        pt: `Proxy atualizável (${facts.tokenMeta.proxy.standard}). O endereço público permanece; a lógica pode mudar.`,
      }));
    }
  } else if (facts.codeBytes === 0) {
    flags.push(flag("is-eoa", "info", {
      en: "Externally owned account (no bytecode). Anyone with the key can move funds.",
      pt: "Conta externa (sem bytecode). Quem tiver a chave move os fundos.",
    }));
  }

  const transfers = facts.transfers ?? [];
  const inbound = transfers.filter((t) => t.direction === "in").length;
  const outbound = transfers.filter((t) => t.direction === "out").length;
  const nonce = Number(facts.nonce ?? 0);

  if (!official && !facts.isContract && nonce <= 1 && transfers.length === 0 && !isSpecial(addr)) {
    flags.push(flag("unused-new", "medium", {
      en: `Very new or idle in the last ${facts.lookback} blocks: nonce ${nonce} and no USDC/WPROS transfers. Brand-new wallets are a common social-engineering pattern.`,
      pt: `Muito nova ou parada nos últimos ${facts.lookback} blocos: nonce ${nonce} e nenhum Transfer de USDC/WPROS. Carteira nova é um padrão comum de golpe.`,
    }));
  }
  if (!official && inbound > 0 && outbound === 0 && nonce <= 2 && !isSpecial(addr)) {
    flags.push(flag("inbound-only", "medium", {
      en: "Received tokens in this window and never sent any, with a tiny nonce. Could be a deposit address — or a trap that will not send back.",
      pt: "Recebeu tokens nesta janela e nunca enviou, com nonce baixo. Pode ser depósito — ou uma armadilha que não devolve.",
    }));
  }
  if (!official && nonce >= 5 && isEmpty(facts) && !isSpecial(addr)) {
    flags.push(flag("empty-after-activity", "low", {
      en: `Nonce ${nonce} but native and token balances are now 0. The account looks drained.`,
      pt: `Nonce ${nonce}, mas saldo nativo e de tokens agora é 0. A conta parece esvaziada.`,
    }));
  }
  if (transfers.some((t) => t.from?.toLowerCase() === t.to?.toLowerCase())) {
    flags.push(flag("self-transfer", "low", {
      en: "At least one self-transfer (from = to) in this window.",
      pt: "Há pelo menos um self-transfer (de = para) nesta janela.",
    }));
  }

  const score = Math.min(100, flags.reduce((sum, f) => sum + WEIGHT[f.severity], 0));
  const hasCritical = flags.some((f) => f.severity === "critical");
  const hasHigh = flags.some((f) => f.severity === "high");
  const verdict = hasCritical || hasHigh || score >= 50 ? "avoid" : score >= 20 ? "caution" : "clear";

  return {
    address: addr,
    score,
    verdict,
    flags,
    official: official ? official.symbol : null,
  };
}

export function recommendation(verdict, lookback, lang = "en") {
  if (lang === "pt") {
    const line =
      verdict === "avoid"
        ? "Não transacione até entender estes sinais."
        : verdict === "caution"
          ? "Revise as flags antes de enviar qualquer coisa."
          : "Nenhum sinal grave nesta janela — ainda confira o endereço por conta própria.";
    return `${line} Histórico dos últimos ${lookback} blocos, fatiado em janelas de 1000 (limite por chamada do get_logs). Isto não é garantia.`;
  }
  const line =
    verdict === "avoid"
      ? "Do not transact until you understand these flags."
      : verdict === "caution"
        ? "Review the flags before you send anything."
        : "No severe signal in this window — still verify the address yourself.";
  return `${line} History covers the last ${lookback} blocks, paged in 1000-block get_logs windows (Chain MCP per-call limit). This is not a guarantee.`;
}

function flag(id, severity, text) {
  return { id, severity, text };
}

function isSpecial(address) {
  if (!address) return true;
  const a = address.toLowerCase();
  return a === ZERO_ADDRESS.toLowerCase() || a === BURN_ADDRESS.toLowerCase();
}

function isEmpty(facts) {
  if (BigInt(facts.nativeWei ?? 0) > 0n) return false;
  const bals = facts.tokenBalances ?? {};
  return Object.values(bals).every((v) => BigInt(v ?? 0) === 0n);
}
