/**
 * Loads a TypeScript module for testing, with no build step.
 *
 * These checks exist so they can be run by anyone with Node and nothing else
 * — no bundler, no ts-node, no `npm install` first. That is worth a small,
 * blunt type-stripper: it handles the subset of syntax these particular
 * modules use and nothing more.
 *
 * It is a test harness, not a compiler. If a module later grows generics,
 * enums or decorators, this will not cope and the honest fix is to add a real
 * toolchain rather than to make the regexes cleverer.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TYPE_NAMES = [
  "Record<string, string \\| undefined>",
  "Record<string, string>",
  "Promise<string>",
  "Provider",
  "VisionRequest",
  "OutboxEntry",
  "SearchHit",
  "AtharProject",
  "GeoFix",
  "Site",
  "Field",
  "Response",
  "View",
  "Point2",
  "Direction",
  "Hotspot",
  "ImageData",
  "void",
  "string",
  "number",
  "boolean",
  "unknown",
].join("|");

export function stripTypes(source) {
  const kept = [];
  let inTypeBlock = false;

  for (const line of source.split("\n")) {
    if (/^\s*import type/.test(line)) continue;
    if (/^\s*import \{[^}]*\} from "\.\//.test(line)) continue;
    if (inTypeBlock) {
      if (line.startsWith("};")) inTypeBlock = false;
      continue;
    }
    if (/^(export )?type \w+ =.*;\s*$/.test(line)) continue;
    if (/^(export )?type \w+ = \{\s*$/.test(line)) {
      inTypeBlock = true;
      continue;
    }
    kept.push(line);
  }

  let js = kept.join("\n");
  // Array annotations before bare ones, or ": Site" eats the name and leaves "[]".
  js = js.replace(new RegExp(`:\\s*(?:${TYPE_NAMES})\\[\\]`, "g"), "");
  js = js.replace(new RegExp(`:\\s*(?:${TYPE_NAMES})\\s*\\|\\s*null`, "g"), "");
  js = js.replace(new RegExp(`:\\s*(?:${TYPE_NAMES})(?![\\w<])`, "g"), "");
  js = js.replace(/: \w+ is [\w &{}:;]+ =>/g, " =>"); // type predicates
  js = js.replace(/\bas const\b/g, "");
  js = js.replace(/ as \w+(?![\w(])/g, "");
  js = js.replace(/!(?=[.\])])/g, ""); // non-null assertions
  js = js.replace(/new Set<string>\(\)/g, "new Set()");
  return js;
}

/**
 * Pulls named exports out of a .ts file and imports them.
 *
 * `pick` lists the functions to extract. Passing it is the reliable path:
 * a module that also contains IndexedDB plumbing or generics will not strip
 * cleanly as a whole, but its pure functions will. Omit `pick` only for
 * modules that are pure throughout.
 */
export async function loadTs(relativePath, importMetaUrl, pick) {
  const source = readFileSync(new URL(relativePath, importMetaUrl), "utf8");

  let js;
  if (pick?.length) {
    // Module-level constants come along: a picked function that reads
    // MAX_PITCH is not testable without it.
    const parts = [...source.matchAll(/^const \w+ = [^\n]*;$/gm)]
      .map((m) => m[0])
      .filter((line) => !/[<>]/.test(line));
    for (const name of pick) {
      const fn = source.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}`));
      const arrow = source.match(new RegExp(`export const ${name} = [\\s\\S]*?;\\n`));
      const found = fn?.[0] ?? arrow?.[0];
      if (!found) throw new Error(`loadTs: "${name}" not found in ${relativePath}`);
      parts.push(found);
    }
    js = stripTypes(parts.join("\n\n"));
  } else {
    js = stripTypes(source);
  }

  const dir = mkdtempSync(join(tmpdir(), "athar-test-"));
  const out = join(dir, "module.mjs");
  writeFileSync(out, js);
  return import(`file://${out}`);
}
