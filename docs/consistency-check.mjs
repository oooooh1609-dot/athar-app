import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = process.cwd();
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.git/.test(p)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
};
const files = walk(join(ROOT, "src"));
const problems = [];

// ---------- 1. every local import resolves ----------
const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".js"];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/from\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
    const spec = m[1].split("?")[0];
    const base = spec.startsWith("@/")
      ? join(ROOT, "src", spec.slice(2))
      : resolve(dirname(f), spec);
    if (/\.(css|svg|png|json)$/.test(spec)) continue;
    if (!EXT.some((e) => existsSync(base + e) && statSync(base + e).isFile()))
      problems.push(`UNRESOLVED  ${f.replace(ROOT + "/", "")} → ${spec}`);
  }
}

// ---------- 2. every named import exists in the target ----------
const exportsOf = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const names = new Set();
  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g,
  ))
    names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g))
    for (const part of m[1].split(",")) {
      const n = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (n) names.add(n);
    }
  if (/export\s+\*/.test(src)) names.add("*STAR*");
  exportsOf.set(f, names);
}
const resolveFile = (f, spec) => {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : resolve(dirname(f), spec);
  for (const e of EXT) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  return null;
};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](@\/[^"']+|\.[^"']+)["']/g,
  )) {
    const target = resolveFile(f, m[2]);
    if (!target) continue;
    const avail = exportsOf.get(target);
    if (!avail || avail.has("*STAR*")) continue;
    for (const part of m[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name && !avail.has(name))
        problems.push(
          `MISSING EXPORT  ${f.replace(ROOT + "/", "")} imports "${name}" from ${m[2]}`,
        );
    }
  }
}

// ---------- 3. every t("key") is defined ----------
const dictFiles = files.filter((f) => /dict\.ts$/.test(f));
const defined = new Set();
for (const f of dictFiles)
  for (const m of readFileSync(f, "utf8").matchAll(/^\s*"([\w.]+)":/gm)) defined.add(m[1]);
const used = new Set();
for (const f of files)
  for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
for (const k of [...used].sort()) if (!defined.has(k)) problems.push(`MISSING i18n KEY  ${k}`);

// ---------- 4. every dictionary covers every language ----------
for (const f of dictFiles) {
  const src = readFileSync(f, "utf8");
  const perLang = new Map();
  for (const m of src.matchAll(/\n  (\w{2}): \{([\s\S]*?)\n  \},/g))
    perLang.set(m[1], new Set([...m[2].matchAll(/"([\w.]+)":/g)].map((x) => x[1])));
  const langs = [...perLang.keys()];
  const base = perLang.get("en");
  if (!base) continue;
  for (const l of langs.filter((x) => x !== "en")) {
    for (const k of base)
      if (!perLang.get(l).has(k))
        problems.push(`UNTRANSLATED  ${f.replace(ROOT + "/", "")} [${l}] missing ${k}`);
    for (const k of perLang.get(l))
      if (!base.has(k))
        problems.push(`ORPHAN KEY  ${f.replace(ROOT + "/", "")} [${l}] has ${k} with no English`);
  }
}

console.log(`scanned ${files.length} files, ${defined.size} i18n keys defined, ${used.size} used`);
console.log(problems.length ? "\n" + problems.join("\n") : "\nNo problems found.");
process.exit(problems.length ? 1 : 0);
