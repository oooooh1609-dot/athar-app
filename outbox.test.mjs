import { loadTs } from "./_load-ts.mjs";
const { backoffMs, isDue } = await loadTs("../src/lib/outbox.ts", import.meta.url, [
  "backoffMs",
  "isDue",
]);

let bad = 0;
const is = (n, g, w) => { const ok = g === w; if (!ok) bad++; console.log(`${ok?"PASS":"FAIL"}  ${n}: ${g}${ok?"":` (want ${w})`}`); };

is("first retry 30s",  backoffMs(1), 30_000);
is("second retry 1m",  backoffMs(2), 60_000);
is("third retry 2m",   backoffMs(3), 120_000);
is("fourth retry 4m",  backoffMs(4), 240_000);
is("capped at 5m",     backoffMs(5), 300_000);
is("still capped",     backoffMs(12), 300_000);
is("attempt 0 safe",   backoffMs(0), 30_000);
is("negative safe",    backoffMs(-3), 30_000);
// A capped ceiling matters: uncapped, attempt 12 would be over 17 hours.
console.log(`      uncapped attempt 12 would be ${(30_000 * 2 ** 11 / 3_600_000).toFixed(1)} h`);

const now = 1_000_000;
is("due when time passed", isDue({ nextAttemptAt: now - 1 }, now), true);
is("due exactly now",      isDue({ nextAttemptAt: now }, now), true);
is("not due yet",          isDue({ nextAttemptAt: now + 1 }, now), false);
is("stalled never due",    isDue({ nextAttemptAt: now - 99999, stalled: true }, now), false);

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
