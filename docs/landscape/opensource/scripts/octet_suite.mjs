// Edge-case suite (docs/landscape/test-suite.md) against Octet Draw's own TypeScript modules, in Node.
// Run:  OCTET=/path/to/Octet-Draw node --experimental-strip-types --no-warnings octet_suite.mjs
// Needs Node >= 22.6 (type stripping; Octet targets Node 24) and `npm ci` in the Octet checkout.
// Everything here is offline: Indigo WASM, OPSIN (TeaVM JS), the Wikidata dictionary and the nmrshiftdb2 table are
// all local files. PubChem (the only online name step) lives in Rust (src-tauri/src/pubchem.rs) and is not reachable.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const OCTET = process.env.OCTET ?? process.argv[2];
if (!OCTET) { console.error("set OCTET=/path/to/Octet-Draw"); process.exit(2); }
const src = (f) => pathToFileURL(join(OCTET, "src", f)).href;

// Browser stand-ins, as src/chem.check.ts uses.
const g = globalThis;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
const realFetch = g.fetch;
g.fetch = async (u) => (String(u).startsWith("file:") ? new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } }) : realFetch(u));

const t0 = performance.now();
const chem = await import(src("chem.ts"));
await chem.ready;
const { render } = await import(src("render.ts"));
const { toCdxml, fromCdxml } = await import(src("cdxml.ts"));
const { xmlToCdx, cdxToXml } = await import(src("cdx.ts"));
const { DEFAULT_STYLE } = await import(src("docstyle.ts"));
const naming = await import(src("naming.ts"));
const { iupacName } = await import(src("namer.ts"));
const { complexName } = await import(src("complexes.ts"));
const names = await import(src("names.ts"));
const dict = await import(src("dictionary.ts"));
const { DRUGS } = await import(src("drugs.ts"));
const nmr = await import(src("nmr.ts"));
const { properties } = await import(src("props.ts"));

// OPSIN (TeaVM build) with its resource pack, as the checks load it.
const dir = join(OCTET, "src/vendor/opsin");
const pack = readFileSync(join(dir, "opsin-data.bin"));
const files = new Map();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
g.opsinResource = (name) => files.get(name) ?? null;
const opsin = await import(pathToFileURL(join(dir, "opsin.js")).href);
opsin.init();
names.attachOpsin(opsin, readFileSync(join(dir, "names.txt"), "utf8"), JSON.parse(readFileSync(join(OCTET, "src/nameindex.json"), "utf8")), DRUGS,
  JSON.parse(readFileSync(join(OCTET, "src/abbreviations.json"), "utf8")));
await dict.attachDictionary(gunzipSync(readFileSync(join(OCTET, "data/names/dictionary.tsv.gz"))).toString("utf8"));
nmr.readTables(new Uint8Array(gunzipSync(readFileSync(join(OCTET, "data/nmr/shifts.bin.gz")))));
const loadMs = performance.now() - t0;

naming.setNamer(iupacName);
naming.setComplexNamer((m) => complexName(m, { read: names.nameToSmiles, atoms: names.nameToAtoms, inchi: chem.toInchi, aux: chem.toInchiAux, cip: chem.cipOf }));
const inchiOf = (s) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s) : s); } catch { return undefined; } };
// Structure to Name exactly as Editor.tsx namedPart does it (checked by reading the name back with OPSIN).
const nameOf = (m) => { try { return naming.checkedName(m, chem.expandLabels(m), names.nameToSmiles, inchiOf, chem.cipOf, names.knownName); } catch (e) { return `ERR ${e.message}`; } };
const keyOf = (smiles) => { try { return chem.toInchiKey(chem.parseStructure(smiles)); } catch { return undefined; } };

const S = { bond: 19.2, line: 0.8, bold: 2.67, spacing: 3.46, hash: 3.33, margin: 2.25, size: 13.33 };
const box = [[0, 0], [9.6, 0], [9.6, -9.5], [0, -9.5]];
const measure = () => ({ width: 9.6, ascent: 9.5, outline: box });
const rows = [];
const row = (id, input, result, notes) => { rows.push({ id, input, result, notes }); console.log(`${id}\t${result}\t${input}\t${notes}`); };
const time = (f) => { const t = performance.now(); const v = f(); return [v, performance.now() - t]; };
const overlaps = (m) => {
  let n = 0;
  for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
    const [a, b] = [m.atoms[i].location, m.atoms[j].location];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.3) n++;
  }
  return n;
};
const describe = (m) => `${m.atoms.length} atoms, ${m.bonds.length} bonds${m.arrows ? `, ${m.arrows.length} arrow(s)` : ""}`;

// ---------- A. SMILES ----------
const A = [
  ["A1", "CCO"], ["A2", "c1ccccc1"], ["A3", "C1=CC=CC=C1"], ["A4", "c1ccc2ccccc2c1"], ["A5", "c1cc[nH]c1"],
  ["A6", "C[C@H](N)C(=O)O"], ["A7a", "F/C=C/F"], ["A7b", "F/C=C\\F"], ["A8", "[NH4+].[Cl-]"], ["A9", "C[N+](=O)[O-]"],
  ["A10", "CS(=O)(=O)C"], ["A11", "[13CH4]"], ["A12", "[CH3]"], ["A13a", "C1CC1"], ["A13b", "C1CCCCCCCCCCC1"],
  ["A14", "C12C3C4C1C5C2C3C45"], ["A15", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1"], ["A16", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O"],
  ["A17a", "CC1=CC=CC=C1"], ["A17b", "Cc1ccccc1"], ["A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"], ["A19a", "xyz"], ["A19b", "C1CC"],
];
const res = ["N[C@@H](Cc1ccccc1)C(=O)", "N[C@@H](C)C(=O)", "N[C@@H](CO)C(=O)", "NCC(=O)"];
const peptide = Array.from({ length: 48 }, (_, i) => res[i % 4]).join("") + "O";
A.push(["A20", peptide]);
const mols = {};
for (const [id, smi] of A) {
  try {
    const looks = names.looksLikeSmiles(smi);
    const [m, ms] = time(() => chem.parseStructure(smi));
    mols[id] = m;
    const out = chem.toSmiles(m), an = chem.analyse(m) ?? [];
    const f = an.map((x) => `${x.formula} ${x.weight.toFixed(2)}`).join(" + ");
    const extra = [];
    if (id === "A6" || id === "A18") extra.push(`CIP ${chem.cipOf(m).atoms.filter(Boolean).join(",")}`);
    if (id === "A7a" || id === "A7b") extra.push(`CIP bonds ${chem.cipOf(m).bonds.filter(Boolean).join(",")}`);
    if (id === "A11") extra.push(`exact ${an[0]?.exact?.toFixed(4)}; isotope ${m.atoms[0].isotope}`);
    if (id === "A12") extra.push(`radical ${m.atoms[0].radical}`);
    if (id === "A8" || id === "A9" || id === "A15") extra.push(`charges ${m.atoms.map((a) => a.charge ?? 0).filter(Boolean).join(",")}`);
    if (id === "A13b" || id === "A14" || id === "A20") extra.push(`overlapping atom pairs ${overlaps(m)}`);
    if (id === "A20") { const [, rms] = time(() => render(m, S, measure, S.bond)); extra.push(`render ${rms.toFixed(0)} ms`); }
    if (id === "A16") extra.push(`toReaction smiles: ${(() => { try { return chem.toSmiles(m); } catch (e) { return e.message; } })()}`);
    row(id, smi.length > 60 ? `${smi.slice(0, 40)}… (${smi.length} chars)` : smi, "?", `looksLikeSmiles=${looks}; ${describe(m)}; out ${out.length > 80 ? out.slice(0, 60) + "…" : out}; ${f}; ${extra.join("; ")}; ${ms.toFixed(0)} ms`);
  } catch (e) {
    row(id, smi, "error", `looksLikeSmiles=${names.looksLikeSmiles(smi)}; nameToSmiles=${names.nameToSmiles(smi) ?? "none"}; Indigo threw: ${String(e?.message ?? e).slice(0, 160)}`);
  }
}
const A3same = mols.A2 && mols.A3 && chem.toSmiles(mols.A2) === chem.toSmiles(mols.A3);
const A17same = mols.A17a && mols.A17b && chem.toSmiles(mols.A17a) === chem.toSmiles(mols.A17b);
console.log(`A3 same SMILES as A2: ${A3same}; A17 same: ${A17same}`);

// ---------- C. Interop ----------
const ala = mols.A6;
const v2 = chem.toMolfile(ala, true), v3 = chem.toMolfile(ala);
const back = chem.importStructure(v2);
row("C1", "A6 → V2000 → reimport", "?", `V2000 header ${/V2000/.test(v2)}; same InChI ${chem.toInchi(back) === chem.toInchi(ala)}; CIP back ${chem.cipOf(back).atoms.filter(Boolean)}`);
row("C2", "A6 → V3000", "?", `V3000 ${/V3000/.test(v3) && /M  V30 BEGIN CTAB/.test(v3)}; lines ${v3.split("\n").length}; reimport InChI same ${chem.toInchi(chem.importStructure(v3)) === chem.toInchi(ala)}`);
// C3: no ChemDraw-made fixture is available; use (a) Octet's own CDXML of a reaction with text, and (b) Indigo's CDXML
// of the A16 reaction, a "foreign" CDXML. Also CDX round trip of (a).
{
  const rx = { ...mols.A16, captions: [...(mols.A16.captions ?? []), { id: 9001, text: "H2SO4, 80 °C", x: 3, y: 1, align: "centre" }] };
  const xml = toCdxml(rx, DEFAULT_STYLE);
  const read = fromCdxml(xml);
  const cdx = xmlToCdx(cdxToXml(xmlToCdx((await import(src("cdxml.ts"))).parseXml(xml))));
  const readCdx = (await import(src("oct.ts"))).readCdx(cdx);
  row("C3a", "Octet CDXML of A16 + caption, read back", "?", `${xml.length} chars; read ${describe(read.mol)}, captions ${read.mol.captions?.length ?? 0}; lost ${JSON.stringify(read.lost)}; CDX ${cdx.length} B → ${describe(readCdx.mol)}`);
  // A CDXML written by another program (Indigo), with a hand-added ChemDraw <graphic> arrow and <t> text.
  const ind = await (await import(pathToFileURL(join(OCTET, "node_modules/indigo-ketcher/indigo-ketcher-norender.js")).href)).default();
  const o = new ind.MapStringString();
  // layout(), not convert(): convert() writes nodes with no p= coordinates, and Octet drops unplaced atoms ("lost atom").
  let foreign = ind.layout("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "cdxml", o); o.delete();
  foreign = foreign.replace("</page>", `<graphic id="9990" BoundingBox="300 100 200 100" GraphicType="Line" ArrowType="FullHead" HeadSize="1000"/><arrow id="9991" Head3D="300 100 0" Tail3D="200 100 0" ArrowheadHead="Full" ArrowheadType="Solid"/><t id="9992" p="250 90"><s font="3" size="10" face="0">reflux</s></t></page>`);
  try {
    const r = fromCdxml(foreign);
    row("C3b", "Indigo-written CDXML (caffeine) + ChemDraw arrow + text", "?", `${describe(r.mol)}, captions ${r.mol.captions?.length ?? 0} (${r.mol.captions?.map((c) => c.text).join("|")}); same InChI ${chem.toInchi(r.mol) === inchiOf("CN1C=NC2=C1C(=O)N(C(=O)N2C)C")}; lost ${JSON.stringify(r.lost)}`);
  } catch (e) { row("C3b", "Indigo CDXML", "error", e.message); }
}
// C5: SVG export needs the DOM (src/export.ts standaloneSvg serializes the live <svg>); the Node path is render().
{
  const d = render(mols.A4, S, measure, S.bond);
  row("C5", "render(A4)", "?", `Node gives polygons=${d.polygons.length}, labels=${d.labels.length}; SVG file needs the webview (XMLSerializer)`);
}
row("C7", "A6 InChIKey", "?", chem.toInchiKey(ala));
row("C8a", "caffeine", "?", `${names.nameToSmiles("caffeine")} key ${keyOf(names.nameToSmiles("caffeine") ?? "")}`);
row("C8b", "aspirin", "?", `${names.nameToSmiles("aspirin")} key ${keyOf(names.nameToSmiles("aspirin") ?? "")}`);
row("C9", "A6 structure → name", "?", String(nameOf(ala)));

// ---------- D. Analysis ----------
const caf = chem.parseStructure(names.nameToSmiles("caffeine"));
const an = chem.analyse(caf)[0];
row("D1", "caffeine formula/MW", "?", `${an.formula} ${an.weight.toFixed(2)}`);
row("D2", "caffeine exact mass", "?", an.exact.toFixed(4));
row("D3", "A6 CIP", "?", chem.cipOf(ala).atoms.filter(Boolean).join(","));
{
  const ea = chem.parseStructure("CCOC(C)=O"), gr = naming.graphOf(chem.expandLabels(ea));
  const h = nmr.predict(gr, "1H"), c = nmr.predict(gr, "13C");
  row("D4", "ethyl acetate NMR", "?", `1H ${h?.signals.length} signals: ${h?.signals.map((s) => `${s.shift.toFixed(2)} (${s.nuclei}H, ${nmr.multiplicity(s)})`).join("; ")} | 13C ${c?.signals.length}: ${c?.signals.map((s) => s.shift.toFixed(1)).join(", ")}`);
  row("D4b", "acsText", "?", nmr.acsText(h, 400, "CDCl₃"));
}
{
  const asp = chem.parseStructure(names.nameToSmiles("aspirin")), st = chem.structures(asp)[0], p = properties(naming.graphOf(chem.expandLabels(asp)));
  row("D5", "aspirin properties", "?", `logP ${st.logP?.toFixed(2)} (Crippen via Indigo), MR ${st.mr?.toFixed(2)}, tPSA ${p.tpsa.toFixed(2)} (Ertl), pKa ${p.pka.map((x) => `${x.kind} ${x.pka}`).join("; ")}, Joback Tb ${p.joback?.tb?.toFixed(0)} K`);
}

// ---------- Name to structure stress set ----------
const STRESS = ["caffeine", "aspirin", "Tylenol", "asprin", "50-78-2", "BSTFJNMPWXRSBF-UHFFFAOYSA-N", "2-acetoxybenzoic acid", "(2S)-2-aminopropanoic acid",
  "Ac-Ala-Gly-OH", "CH3CH2OCH2CH3", "taxol", "tetrakis(triphenylphosphine)palladium(0)", "1,2,3,4-tetrahydronaphthalene", "trans-but-2-enedioic acid", "flurbonium xyz",
  // extras: CAS with a bad check digit, a brand, a misspelling with suggestion
  "50-78-3", "acetaminophin", "Advil"];
const which = (s) => {
  if (dict.beforeOpsinSmiles(s)) return "dictionary (before OPSIN)";
  try { if (opsin.parseToSmiles(s)) return "OPSIN"; } catch { /* not OPSIN */ }
  if (dict.dictionarySmiles(s, names.nameToSmiles)) return /^\d+-\d\d-\d$/.test(s) ? "dictionary CAS" : dict.inchiKeyOf(s) ? "dictionary InChIKey" : dict.peptideName(s) ? "peptide rule → OPSIN" : "dictionary / condensed";
  return "Octet tables / salts / lists";
};
for (const s of STRESS) {
  const [smi, ms] = time(() => names.nameToSmiles(s));
  if (smi) {
    let m; try { m = chem.parseStructure(smi); } catch { /* */ }
    const f = m ? chem.analyse(m)?.map((x) => x.formula).join(".") : "?";
    row("N", s, "?", `${smi.length > 70 ? smi.slice(0, 60) + "…" : smi} | ${f} | key ${keyOf(smi)} | via ${which(s)} | name back: ${m ? nameOf(m) : "-"} | ${ms.toFixed(1)} ms`);
  } else {
    const sug = names.suggestName(s), cas = dict.casProblem(s);
    row("N", s, "none", `no structure; suggestion: ${sug ?? "none"}${cas ? `; CAS message: ${cas}` : ""}; ${ms.toFixed(1)} ms`);
  }
}
console.log(`\nload (Indigo + OPSIN + dictionary + NMR table): ${loadMs.toFixed(0)} ms`);
console.log(`dictionary first line sample check: casValid(50-78-2)=${dict.casValid("50-78-2")}`);
