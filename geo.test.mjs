const dms = (value, positive, negative) => {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${String(min).padStart(2, "0")}′${sec.toFixed(2).padStart(5, "0")}″${hemisphere}`;
};
const formatDms = (f) => `${dms(f.latitude,"N","S")} ${dms(f.longitude,"E","W")}`;
function distanceBetween(a, b) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude), lat2 = toRad(b.latitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
let bad = 0;
const eq=(n,g,w)=>{const ok=g===w;if(!ok)bad++;console.log(`${ok?"PASS":"FAIL"}  ${n}: ${g}${ok?"":" want "+w}`)};
const near=(n,g,w,t)=>{const ok=Math.abs(g-w)<=t;if(!ok)bad++;console.log(`${ok?"PASS":"FAIL"}  ${n}: ${g.toFixed(2)} (want ~${w})`)};

// Al-Ula / Hegra, roughly
eq("dms north-east", formatDms({latitude:26.786111, longitude:37.955278}), "26°47′10.00″N 37°57′19.00″E");
// Southern + western hemispheres must flip the letters.
eq("dms south-west", formatDms({latitude:-33.918861, longitude:-18.423300}), "33°55′07.90″S 18°25′23.88″W");
// Zero pads seconds below ten.
eq("dms pads seconds", formatDms({latitude:1.001, longitude:1.001}), "1°00′03.60″N 1°00′03.60″E");

// One degree of latitude is ~111.2 km.
near("1° latitude", distanceBetween({latitude:0,longitude:0},{latitude:1,longitude:0}), 111195, 200);
// Same point is zero.
near("same point", distanceBetween({latitude:26.78,longitude:37.95},{latitude:26.78,longitude:37.95}), 0, 1e-6);
// 0.0001° of latitude is ~11.1 m — the scale that matters for a findspot.
near("11 m step", distanceBetween({latitude:26.7800,longitude:37.95},{latitude:26.7801,longitude:37.95}), 11.1, 0.2);
// Antipodal sanity: half the circumference.
near("antipodal", distanceBetween({latitude:0,longitude:0},{latitude:0,longitude:180}), 20015086, 2000);

console.log(bad===0?"\nAll checks passed.":`\n${bad} FAILED`);
process.exit(bad?1:0);
