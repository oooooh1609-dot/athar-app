import { loadTs } from "./_load-ts.mjs";
const { normalise, tokenise, searchProjects } = await loadTs(
  "../src/lib/search.ts",
  import.meta.url,
);

let bad = 0;
const is = (n, g, w) => {
  const ok = g === w;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}: "${g}"${ok ? "" : ` (want "${w}")`}`);
};

console.log("— Arabic folding —");
is("strips harakat", normalise("مُحَمَّد"), "محمد");
is("folds hamza forms", normalise("أحمد"), "احمد");
is("folds alif madda", normalise("آثار"), "اثار");
is("folds ta marbuta", normalise("كتابة"), "كتابه");
is("folds alif maqsura", normalise("مصطفى"), "مصطفي");
is("strips tatweel", normalise("نقــــش"), "نقش");
is("folds waw hamza", normalise("مؤرخ"), "مورخ");
is("arabic-indic digits", normalise("سنة ٢٠٢٦"), "سنه 2026");
is("persian digits", normalise("۱۲۳"), "123");

console.log("— transliteration folding —");
is("emphatic consonants", normalise("ḥḏr"), "hdr");
is("glottal markers drop", normalise("ʾlh"), "lh");
is("ayin drops", normalise("bʿl"), "bl");
is("macrons", normalise("Ṣalāḥ"), "salah");
is("decomposed equals composed", normalise("h\u0323"), normalise("ḥ"));
is("mixed script", normalise("Wadd ʾb"), "wadd b");

console.log("— tokenising —");
is("punctuation splits", tokenise("s¹lm / bn-ʿbd").join("|"), "slm|bn|bd");
is("empty query", tokenise("   ").length, 0);

console.log("— ranking —");
const P = (o) => ({
  name: "",
  notes: "",
  versions: [],
  annotations: [],
  createdAt: Date.now(),
  ...o,
});
const projects = [
  P({ id: "a", name: "Hdr stone", notes: "" }),
  P({ id: "b", name: "Unrelated", notes: "contains shdrq inside a word" }),
  P({
    id: "c",
    name: "Boulder 4",
    machineReading: {
      transliteration: "ḥḏr bn ʾlh",
      proposedReading: "",
      meaning: "",
      script: "Thamudic",
      references: [],
    },
  }),
];
const hits = searchProjects(projects, "hdr");
is("all three match", hits.length, 3);
is("whole-word name wins", hits[0].project.id, "a");
is("substring ranks last", hits[2].project.id, "b");
is(
  "arabic query finds arabic",
  searchProjects([P({ id: "d", name: "نقش مُحَمَّد" })], "محمد").length,
  1,
);
is("typed plain finds diacritics", searchProjects([P({ id: "e", name: "ḥḏr" })], "hdr").length, 1);
is("every token must match", searchProjects(projects, "hdr zzzz").length, 0);
is("two tokens narrow", searchProjects(projects, "hdr stone")[0].project.id, "a");
is("no query no hits", searchProjects(projects, "").length, 0);
is("reports matched field", hits[0].fields[0], "name");

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
