import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRisk, officialOf, recommendation, ZERO_ADDRESS, BURN_ADDRESS } from "../lib/risk-score.js";
import { presentRisk, resolveRiskTarget } from "../lib/risk.js";
import { PACIFIC_REGISTRY } from "../lib/combo-functions.js";

test("resolves official tokens and rejects junk", () => {
  assert.equal(resolveRiskTarget("USDC").address, PACIFIC_REGISTRY.USDC.address);
  assert.equal(resolveRiskTarget("wpros").symbol, "WPROS");
  assert.equal(resolveRiskTarget(PACIFIC_REGISTRY.LINK.address).symbol, "LINK");
  assert.equal(resolveRiskTarget("0x123").error, "invalid");
  assert.equal(resolveRiskTarget("USDT").error, "unknown");
  assert.equal(resolveRiskTarget("").error, "empty");
});

test("zero and burn addresses are avoid / critical", () => {
  const zero = evaluateRisk({ address: ZERO_ADDRESS, lookback: 1000, isContract: false, codeBytes: 0, nonce: 0, nativeWei: "0", tokenBalances: {}, transfers: [] });
  assert.equal(zero.verdict, "avoid");
  assert.ok(zero.flags.some((f) => f.id === "zero-address" && f.severity === "critical"));
  const burn = evaluateRisk({ address: BURN_ADDRESS, lookback: 1000, isContract: false, codeBytes: 0, nonce: 0, nativeWei: "0", tokenBalances: {}, transfers: [] });
  assert.equal(burn.verdict, "avoid");
  assert.ok(burn.flags.some((f) => f.id === "burn-address"));
});

test("USDC blacklist is critical even on an otherwise quiet wallet", () => {
  const r = evaluateRisk({
    address: "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647",
    lookback: 1000,
    isContract: false,
    codeBytes: 0,
    nonce: 4,
    nativeWei: "1",
    tokenBalances: { USDC: "1" },
    transfers: [{ direction: "in", from: ZERO_ADDRESS, to: "0x912c9aDe24D44d8922f0866D8Dcb079f1363f647" }],
    blacklist: { USDC: true },
  });
  assert.equal(r.verdict, "avoid");
  assert.ok(r.flags.some((f) => f.id === "usdc-blacklisted"));
});

test("official USDC is labelled and a proxy there stays informational", () => {
  const usdc = PACIFIC_REGISTRY.USDC.address;
  assert.equal(officialOf(usdc).symbol, "USDC");
  const r = evaluateRisk({
    address: usdc,
    official: PACIFIC_REGISTRY.USDC,
    lookback: 1000,
    isContract: true,
    codeBytes: 1798,
    nonce: 1,
    nativeWei: "0",
    tokenBalances: {},
    transfers: [],
    tokenMeta: { symbol: "USDC", paused: false, proxy: { standard: "ZeppelinOS" } },
  });
  assert.equal(r.verdict, "clear");
  assert.ok(r.flags.some((f) => f.id === "official-token"));
  assert.ok(r.flags.some((f) => f.id === "dont-send-to-token"));
  assert.ok(r.flags.some((f) => f.id === "upgradeable-proxy" && f.severity === "info"));
  assert.ok(!r.flags.some((f) => f.id === "unofficial-contract"));
});

test("paused unofficial token and unknown contract raise the verdict", () => {
  const paused = evaluateRisk({
    address: "0x1111111111111111111111111111111111111111",
    lookback: 1000,
    isContract: true,
    codeBytes: 200,
    nonce: 1,
    nativeWei: "0",
    tokenBalances: {},
    transfers: [],
    tokenMeta: { symbol: "SCAM", paused: true },
  });
  assert.equal(paused.verdict, "avoid");
  assert.ok(paused.flags.some((f) => f.id === "token-paused" && f.severity === "high"));

  const unknown = evaluateRisk({
    address: "0x2222222222222222222222222222222222222222",
    lookback: 1000,
    isContract: true,
    codeBytes: 80,
    nonce: 1,
    nativeWei: "0",
    tokenBalances: {},
    transfers: [],
    tokenMeta: null,
  });
  assert.equal(unknown.verdict, "caution");
  assert.ok(unknown.flags.some((f) => f.id === "unofficial-contract"));
});

test("new idle wallet is caution; recommendation mentions the lookback cap", () => {
  const r = evaluateRisk({
    address: "0x3333333333333333333333333333333333333333",
    lookback: 1000,
    isContract: false,
    codeBytes: 0,
    nonce: 0,
    nativeWei: "0",
    tokenBalances: { USDC: "0", WPROS: "0" },
    transfers: [],
  });
  assert.equal(r.verdict, "caution");
  assert.ok(r.flags.some((f) => f.id === "unused-new"));
  assert.match(recommendation("caution", 1000, "en"), /last 1000 blocks/);
  assert.match(recommendation("avoid", 300, "pt"), /Não transacione/);
});

test("inbound-only and empty-after-activity fire on the right facts", () => {
  const inbound = evaluateRisk({
    address: "0x4444444444444444444444444444444444444444",
    lookback: 1000,
    isContract: false,
    codeBytes: 0,
    nonce: 1,
    nativeWei: "0",
    tokenBalances: { USDC: "100" },
    transfers: [{ direction: "in", from: PACIFIC_REGISTRY.USDC.address, to: "0x4444444444444444444444444444444444444444" }],
  });
  assert.ok(inbound.flags.some((f) => f.id === "inbound-only"));

  const drained = evaluateRisk({
    address: "0x5555555555555555555555555555555555555555",
    lookback: 1000,
    isContract: false,
    codeBytes: 0,
    nonce: 12,
    nativeWei: "0",
    tokenBalances: { USDC: "0", WPROS: "0" },
    transfers: [],
  });
  assert.ok(drained.flags.some((f) => f.id === "empty-after-activity"));
});

test("recent transfer report includes the transaction hash", () => {
  const tx = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const text = presentRisk({
    address: "0x4444444444444444444444444444444444444444",
    verdict: "clear",
    score: 0,
    recommendation: "ok",
    isContract: false,
    native: "0",
    nonce: 1,
    official: null,
    block: 1,
    lookback: 1000,
    tokens: {
      USDC: { balance: "0", in: "10", out: "0", count: 1 },
      WPROS: { balance: "0", in: "0", out: "0", count: 0 },
    },
    flags: [],
    recent: [{
      block: 99,
      direction: "in",
      amount: "10",
      symbol: "USDC",
      from: "0x1111111111111111111111111111111111111111",
      to: "0x4444444444444444444444444444444444444444",
      tx,
    }],
    explorer: "https://www.pharosscan.xyz/address/0x4444",
  }, "en");
  assert.match(text, new RegExp(tx));
});
