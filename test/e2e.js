import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const RISK = "risk.js";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const CASES = [
  { name: "risk: --help", args: [RISK, "--help"], code: 0, expect: /Usage:[\s\S]*suspicious history[\s\S]*get_logs/ },
  { name: "risk: invalid address", args: [RISK, "0x123"], code: 2, expect: /not a valid 0x address/ },
  { name: "risk: lookback above the limit", args: [RISK, "USDC", "--lookback", "5000"], code: 1, expect: /--lookback must be/ },
  {
    name: "risk: official USDC is CLEAR",
    args: [RISK, "USDC", "--lookback", "300"],
    code: 0,
    expect: /Verdict CLEAR[\s\S]*official USDC contract[\s\S]*token contract, not a wallet/,
  },
  {
    name: "risk: burn address is AVOID",
    args: [RISK, DEAD, "--lookback", "300"],
    code: 0,
    expect: /Verdict AVOID[\s\S]*burn/,
  },
];

function run({ args, killAfter }) {
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(process.execPath, args, { cwd: new URL("..", import.meta.url) });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), killAfter ?? 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, ms: performance.now() - start });
    });
  });
}

let failed = 0;
for (const c of CASES) {
  const { code, out, ms } = await run(c);
  const ok = code === c.code && c.expect.test(out);
  if (!ok) failed++;
  console.log(`${ok ? "ok" : "FAIL"}  ${c.name}  (${Math.round(ms)}ms, exit ${code})`);
  if (!ok) console.log(out.slice(-1500));
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\n${CASES.length} e2e tests passed`);
