import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTypes } from "./_load-ts.mjs";

// sites.ts imports distanceBetween from geo.ts; inline it so the module
// stands alone without a resolver.
const geo = stripTypes(readFileSync(new URL("../src/lib/geo.ts", import.meta.url), "utf8"));
const dist = geo.match(/export function distanceBetween[\s\S]*?\n}/)[0].replace("export ", "");
const sitesSrc = stripTypes(readFileSync(new URL("../src/lib/sites.ts", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "athar-sites-"));
const out = join(dir, "m.mjs");
writeFileSync(out, dist + "\n" + sitesSrc);
const { groupIntoSites, toGeoJSON, toCsv } = await import(`file://${out}`);

let bad = 0;
const is = (n, g, w) => { const ok = g === w; if (!ok) bad++; console.log(`${ok?"PASS":"FAIL"}  ${n}: ${g}${ok?"":` (want ${w})`}`); };

const at = (id, lat, lon, extra = {}) => ({
  id, name: id, notes: "", kind: "inscription", versions: [], annotations: [],
  createdAt: 1_700_000_000_000,
  location: { latitude: lat, longitude: lon, accuracyM: 5, takenAt: 0, ...extra },
});

// Three panels along one cliff, ~30 m apart in a chain, plus one 2 km away.
const a = at("a", 26.78000, 37.95000);
const b = at("b", 26.78027, 37.95000);
const c = at("c", 26.78054, 37.95000);
const far = at("far", 26.80000, 37.95000);
const nowhere = { id: "n", name: "n", notes: "", kind: "inscription", versions: [], annotations: [], createdAt: 0 };

const sites = groupIntoSites([a, b, c, far, nowhere], 50);
is("two sites found", sites.length, 2);
is("chain stays together", sites[0].projects.length, 3);
// Single-link matters: c is 60 m from a, beyond the radius, but chains via b.
is("distant member chained in", sites[0].projects.some((p) => p.id === "c"), true);
is("far one is separate", sites[1].projects[0].id, "far");
is("unlocated excluded", sites.flatMap((s) => s.projects).some((p) => p.id === "n"), false);
is("spread is measured", Math.round(sites[0].spreadM), 30);

is("radius 20 splits chain", groupIntoSites([a, b, c], 20).length, 3);
is("radius 200 merges all", groupIntoSites([a, b, c, far], 200).length, 2);
is("empty input", groupIntoSites([], 50).length, 0);

const gj = toGeoJSON([a, at("h", 26.7, 37.9, { altitudeM: 812.4 }), nowhere]);
is("collection type", gj.type, "FeatureCollection");
is("unlocated skipped", gj.features.length, 2);
is("lon comes first", gj.features[0].geometry.coordinates[0], 37.95);
is("lat comes second", gj.features[0].geometry.coordinates[1], 26.78);
is("2D when no altitude", gj.features[0].geometry.coordinates.length, 2);
is("3D when altitude", gj.features[1].geometry.coordinates.length, 3);
is("altitude value", gj.features[1].geometry.coordinates[2], 812.4);
is("accuracy travels", gj.features[0].properties.gps_accuracy_m, 5);
is("no reading is marked none", gj.features[0].properties.reading_status, "none");
JSON.parse(JSON.stringify(gj));
console.log("PASS  serialises to valid JSON");

const csv = toCsv([{ ...a, name: 'Panel "A", north', notes: "line\nbreak" }]);
is("header present", csv.split("\n")[0].startsWith("name,latitude,longitude"), true);
is("quotes escaped", csv.includes('"Panel ""A"", north"'), true);
is("newline quoted", csv.includes('"line\nbreak"'), true);
is("six decimal places", csv.includes("26.780000,37.950000"), true);

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
