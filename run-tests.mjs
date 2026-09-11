/** Runs every check. No dependencies: `node docs/run-tests.mjs` */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
const suites = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort();

let failed = 0;
for (const suite of suites) {
  const res = spawnSync(process.execPath, [dir + suite], { encoding: "utf8" });
  const passes = (res.stdout.match(/^PASS/gm) ?? []).length;
  const ok = res.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${suite.padEnd(20)} ${String(passes).padStart(3)} checks`);
  if (!ok) console.log(res.stdout.split("\n").filter((l) => l.startsWith("FAIL")).join("\n"));
}
console.log(failed === 0 ? "\nAll suites passed." : `\n${failed} suite(s) failed.`);
process.exit(failed ? 1 : 0);
