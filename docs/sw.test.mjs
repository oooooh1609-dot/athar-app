import { readFileSync } from "node:fs";

// Extract and evaluate the real chooseStrategy from the shipped worker,
// so this tests the code that actually runs rather than a copy of it.
const src = readFileSync("/home/claude/athar/public/sw.js", "utf8");
const hosts = src.match(/const FONT_HOSTS = new Set\(\[[\s\S]*?\]\);/)[0];
const fn = src.match(/function chooseStrategy[\s\S]*?\n}/)[0];
const chooseStrategy = eval(`${hosts}\n${fn}\nchooseStrategy`);

const ORIGIN = "https://athar.example";
let bad = 0;
const is = (name, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${got}${ok ? "" : ` (want ${want})`}`);
};
const s = (path, mode = "no-cors", method = "GET") =>
  chooseStrategy(new URL(path, ORIGIN), mode, method, ORIGIN);

is("page load", s("/", "navigate"), "navigate");
is("deep page load", s("/admin", "navigate"), "navigate");
is("hashed js", s("/_build/assets/index-a1b2c3.js"), "asset");
is("css", s("/assets/styles.css"), "asset");
is("image", s("/icons/icon-512.png"), "asset");
is("3D model", s("/models/thing.glb"), "asset");
is("wasm", s("/pkg/kernel.wasm"), "asset");

// The rules that matter most.
is("api never cached", s("/api/analyze", "cors", "POST"), "passthrough");
is("api GET never cached", s("/api/three-d/status/abc"), "network-only");
is("api navigate still uncached", s("/api/admin/login", "navigate"), "network-only");
is("POST anywhere", s("/", "navigate", "POST"), "passthrough");
is("PUT asset", s("/assets/x.png", "no-cors", "PUT"), "passthrough");

// Cross-origin.
is(
  "third-party script",
  chooseStrategy(new URL("https://cdn.other/x.js"), "no-cors", "GET", ORIGIN),
  "passthrough",
);
is(
  "supabase call",
  chooseStrategy(new URL("https://xyz.supabase.co/rest/v1/t"), "cors", "GET", ORIGIN),
  "passthrough",
);
is(
  "google fonts css",
  chooseStrategy(new URL("https://fonts.googleapis.com/css2?family=X"), "cors", "GET", ORIGIN),
  "font",
);
is(
  "gstatic font file",
  chooseStrategy(new URL("https://fonts.gstatic.com/s/a.woff2"), "cors", "GET", ORIGIN),
  "font",
);
is(
  "font host but POST",
  chooseStrategy(new URL("https://fonts.gstatic.com/s/a.woff2"), "cors", "POST", ORIGIN),
  "passthrough",
);

// Extension-looking paths that are not assets.
is("unknown path", s("/some/route"), "passthrough");
is("query string on asset", s("/assets/app.js?v=2"), "asset");
is("uppercase extension", s("/img/PHOTO.JPG"), "asset");

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
