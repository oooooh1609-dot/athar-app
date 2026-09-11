import { loadTs } from "./_load-ts.mjs";
const m = await loadTs("../src/lib/panorama.ts", import.meta.url, [
  "wrapYaw", "clampPitch", "clampFov", "normaliseView",
  "samplePoint", "projectHotspot", "hotspotFromScreen", "looksEquirectangular",
]);
const { wrapYaw, normaliseView: _nv, clampPitch, clampFov, samplePoint, projectHotspot, hotspotFromScreen, looksEquirectangular } = m;

let bad = 0;
const is = (n, g, w) => { const ok = g === w; if (!ok) bad++; console.log(`${ok?"PASS":"FAIL"}  ${n}: ${g}${ok?"":` (want ${w})`}`); };
const near = (n, g, w, tol = 1e-6) => { const ok = Math.abs(g - w) <= tol; if (!ok) bad++; console.log(`${ok?"PASS":"FAIL"}  ${n}: ${typeof g === "number" ? g.toFixed(4) : g}${ok?"":` (want ~${w})`}`); };

console.log("— angle handling —");
is("no wrap needed", wrapYaw(90), 90);
is("wraps past 180", wrapYaw(190), -170);
is("wraps below -180", wrapYaw(-190), 170);
is("full turn is zero", wrapYaw(360), 0);
is("many turns", wrapYaw(721), 1);
is("-180 normalises to 180", wrapYaw(-180), 180);
is("pitch clamps up", clampPitch(120), 85);
is("pitch clamps down", clampPitch(-120), -85);
is("fov floor", clampFov(1), 25);
is("fov ceiling", clampFov(200), 110);

console.log("— projection —");
const V = { yaw: 0, pitch: 0, fov: 90 };
const W = 800, H = 400, SW = 4000, SH = 2000;

// Centre of the canvas looks straight ahead = centre of the source image.
const c = samplePoint(W / 2, H / 2, W, H, V, SW, SH);
near("centre maps to source centre x", c.x, SW / 2, 0.5);
near("centre maps to source centre y", c.y, SH / 2, 0.5);

// Turning right moves the sampled column right by the same proportion.
const turned = samplePoint(W / 2, H / 2, W, H, { ...V, yaw: 90 }, SW, SH);
near("90° right is a quarter across", turned.x, SW * 0.75, 1);

// Yaw must wrap in the source, not run off the edge.
const wrapped = samplePoint(W / 2, H / 2, W, H, { ...V, yaw: 180 }, SW, SH);
const ok = Math.abs(wrapped.x - SW) < 1 || wrapped.x < 1;
is("180° wraps within bounds", ok, true);

// Looking up must sample above the horizon (smaller y).
const up = samplePoint(W / 2, H / 2, W, H, { ...V, pitch: 45 }, SW, SH);
is("looking up samples upper half", up.y < SH / 2, true);
const down = samplePoint(W / 2, H / 2, W, H, { ...V, pitch: -45 }, SW, SH);
is("looking down samples lower half", down.y > SH / 2, true);

// Every output pixel must land inside the source, at any view.
let out = 0;
for (const yaw of [-180, -90, 0, 90, 179]) for (const pitch of [-85, -40, 0, 40, 85])
  for (const px of [0, W / 2, W - 1]) for (const py of [0, H / 2, H - 1]) {
    const p = samplePoint(px, py, W, H, { yaw, pitch, fov: 90 }, SW, SH);
    if (!(p.x >= 0 && p.x <= SW && p.y >= 0 && p.y <= SH && Number.isFinite(p.x) && Number.isFinite(p.y))) out++;
  }
is("225 samples all in bounds", out, 0);

// A narrower field must sample a narrower slice of the source.
const wide = samplePoint(0, H / 2, W, H, { ...V, fov: 100 }, SW, SH);
const narrow = samplePoint(0, H / 2, W, H, { ...V, fov: 30 }, SW, SH);
is("zoom narrows the slice", Math.abs(narrow.x - SW / 2) < Math.abs(wide.x - SW / 2), true);

console.log("— hotspots —");
const centre = projectHotspot({ yaw: 0, pitch: 0 }, V, W, H);
near("hotspot ahead is centred x", centre.x, W / 2, 0.001);
near("hotspot ahead is centred y", centre.y, H / 2, 0.001);
is("hotspot behind is hidden", projectHotspot({ yaw: 180, pitch: 0 }, V, W, H), null);
is("hotspot 91° right is hidden", projectHotspot({ yaw: 91, pitch: 0 }, V, W, H), null);
const right = projectHotspot({ yaw: 30, pitch: 0 }, V, W, H);
is("hotspot right of centre", right.x > W / 2, true);
const above = projectHotspot({ yaw: 0, pitch: 30 }, V, W, H);
is("hotspot above centre", above.y < H / 2, true);
// Following the viewer: a hotspot at yaw 30 recentres when the view turns to 30.
const followed = projectHotspot({ yaw: 30, pitch: 0 }, { ...V, yaw: 30 }, W, H);
near("hotspot recentres with view", followed.x, W / 2, 0.001);

console.log("— screen to direction round trip —");
for (const [px, py, view] of [
  [W / 2, H / 2, V],
  [100, 80, V],
  [700, 350, { yaw: 45, pitch: 20, fov: 70 }],
  [10, 390, { yaw: -120, pitch: -30, fov: 100 }],
]) {
  const dir = hotspotFromScreen(px, py, W, H, view);
  const back = projectHotspot(dir, view, W, H);
  const okx = back && Math.abs(back.x - px) < 0.01 && Math.abs(back.y - py) < 0.01;
  if (!okx) bad++;
  console.log(`${okx ? "PASS" : "FAIL"}  round trip (${px},${py}) yaw ${view.yaw}`);
}

console.log("— aspect guard —");
is("2:1 accepted", looksEquirectangular(4000, 2000), true);
is("slightly cropped accepted", looksEquirectangular(3960, 2000), true);
is("ordinary 4:3 photo rejected", looksEquirectangular(4000, 3000), false);
is("16:9 rejected", looksEquirectangular(1920, 1080), false);
is("zero height safe", looksEquirectangular(100, 0), false);

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
