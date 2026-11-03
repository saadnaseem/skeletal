// ChemDraft edge-case suite (Lone Pair landscape, docs/landscape/test-suite.md).
//
// Runs sections A (SMILES), C1/C2/C5/C7 and D1-D5 against ChemDraft's headless CLI, called
// in-process through its exported `runCli`, plus a few library calls (chem-core molfile writers,
// clipboard-adapter molfile reader, the vendored RDKit MinimalLib, the NMR plugin).
//
// Run it under tsx from a ChemDraft checkout (the CLI is TypeScript):
//   CHEMDRAFT_DIR=/path/to/ChemDraft CHEMDRAFT_NMR_DIR=/path/to/ChemDraft-NMR-Plugin \
//   node $CHEMDRAFT_DIR/node_modules/tsx/dist/cli.mjs --tsconfig $CHEMDRAFT_DIR/tsconfig.json \
//     chemdraft_suite.mjs [outDir]
// Prereqs: `pnpm install` in ChemDraft, `npm ci` in the NMR plugin. Node 22 works (24 is pinned).
// The NMR plugin is loaded through a trust file written into outDir and passed as an embedding
// option, so nothing is written to ~/.config.

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const CD = resolve(process.env.CHEMDRAFT_DIR ?? "./chemdraft");
const NMR = resolve(process.env.CHEMDRAFT_NMR_DIR ?? join(CD, "..", "chemdraft-nmr"));
const OUT = resolve(process.argv[2] ?? "./chemdraft-suite-out");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
process.chdir(OUT); // the CLI refuses absolute/parent output paths, so write relative to OUT

const imp = (p) => import(pathToFileURL(join(CD, p)).href);
const { runCli } = await imp("packages/chemdraft-cli/src/cli.ts");
const { moleculeToMolfileV3000 } = await imp("packages/chem-core/src/index.ts");
const { nativeBondOrderResolution } = await imp("packages/layout-engine/src/index.ts");
const { parseMolfileGraph } = await imp("packages/clipboard-adapter/src/index.ts");
const { installNodeRdkitModuleLoader } = await imp("packages/rdkit-adapter/src/node.ts");
const { ensureRdkit } = await imp("packages/rdkit-adapter/src/conformer.ts");
installNodeRdkitModuleLoader();
const RDKit = await ensureRdkit();

/** Run one CLI command in-process; returns exit code, parsed JSON lines, stderr text, ms. */
async function cli(...argv) {
  const lines = [], err = [];
  const t0 = performance.now();
  let code;
  try {
    code = await runCli(argv, { stdout: (l) => lines.push(l), stderr: (l) => err.push(l) });
  } catch (e) { code = "throw"; err.push(String(e?.stack ?? e)); }
  const ms = Math.round(performance.now() - t0);
  const json = lines.flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  return { code, json, stdout: lines.join("\n"), stderr: err.join("\n"), ms };
}

/** Reference canonical SMILES from ChemDraft's own vendored RDKit (null if it will not parse). */
function rdCanon(input) {
  const m = RDKit.get_mol(input);
  if (!m || !m.is_valid()) { m?.delete(); return null; }
  const s = m.get_smiles(); m.delete(); return s;
}

/** Geometry checks on a native document: bond-length spread, crossings, closest non-bonded pair. */
function geometry(doc) {
  const mols = doc.pages.flatMap((p) => p.objects.filter((o) => o.type === "molecule"));
  let crossings = 0, minNonBonded = Infinity, lens = [], close = [];
  for (const m of mols) {
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    const bonds = m.bonds.map((b) => [at.get(b.fromAtomId ?? b.from ?? b.a1), at.get(b.toAtomId ?? b.to ?? b.a2)]).filter(([a, b]) => a && b);
    for (const [a, b] of bonds) lens.push(Math.hypot(a.x - b.x, a.y - b.y));
    const bonded = new Set(bonds.map(([a, b]) => `${a.id}|${b.id}`).concat(bonds.map(([a, b]) => `${b.id}|${a.id}`)));
    for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
      const a = m.atoms[i], b = m.atoms[j];
      if (bonded.has(`${a.id}|${b.id}`)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y); close.push(d);
      minNonBonded = Math.min(minNonBonded, d);
    }
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    for (let i = 0; i < bonds.length; i++) for (let j = i + 1; j < bonds.length; j++) {
      const [p1, p2] = bonds[i], [p3, p4] = bonds[j];
      if ([p1, p2].some((x) => x === p3 || x === p4)) continue;
      const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
      if (d1 * d2 < 0 && d3 * d4 < 0) crossings++;
    }
  }
  lens.sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)] ?? 0;
  const r = (x) => Math.round(x * 100) / 100;
  return { molecules: mols.length, atoms: mols.reduce((n, m) => n + m.atoms.length, 0), crossings,
    bondLenMinMaxOverMedian: med ? [r(lens[0] / med), r(lens.at(-1) / med)] : null,
    minNonBondedOverBond: med ? r(minNonBonded / med) : null,
    nonBondedPairsUnderHalfBond: med ? close.filter((d) => d < 0.5 * med).length : null };
}

const peptide = "N[C@@H](C)C(=O)" + "N[C@@H](C)C(=O)".repeat(59) + "O"; // Ala60, 301 heavy atoms
const A = [
  ["A1", "CCO"], ["A2", "c1ccccc1"], ["A3", "C1=CC=CC=C1"], ["A4", "c1ccc2ccccc2c1"], ["A5", "c1cc[nH]c1"],
  ["A6", "C[C@H](N)C(=O)O"], ["A7a", "F/C=C/F"], ["A7b", "F/C=C\\F"], ["A8", "[NH4+].[Cl-]"],
  ["A9", "C[N+](=O)[O-]"], ["A10", "CS(=O)(=O)C"], ["A11", "[13CH4]"], ["A12", "[CH3]"],
  ...[3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => [`A13-${n}`, `C1${"C".repeat(n - 1)}1`]),
  ["A14", "C12C3C4C1C5C2C3C45"], ["A15", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1"],
  ["A17a", "CC1=CC=CC=C1"], ["A17b", "Cc1ccccc1"], ["A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"],
  ["A19a", "xyz"], ["A19b", "C1CC"], ["A20", peptide]
];

const results = { tool: "ChemDraft", when: new Date().toISOString(), A: {}, C: {}, D: {} };
const short = (s, n = 160) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

for (const [id, smi] of A) {
  const r = { input: smi.length > 60 ? `${smi.slice(0, 40)}… (${smi.length} chars)` : smi, rdkitCanonical: rdCanon(smi) };
  const name = id.replace(/[^A-Za-z0-9-]/g, "_");
  // 1. Build the native document (the same path the canvas uses for SMILES paste).
  const doc = await cli("document", "--smiles", smi, "--out", `${name}.json`);
  r.documentExit = doc.code; r.documentMs = doc.ms;
  r.documentWarnings = doc.json[0]?.warnings ?? [];
  if (doc.code !== 0) r.documentError = short(doc.json[0]?.error ?? doc.stderr, 240);
  if (doc.code === 0 && existsSync(`${name}.json`)) r.geometry = geometry(JSON.parse(readFileSync(`${name}.json`, "utf8")));
  // 2. SMILES export (verified by the CLI against the input's canonical SMILES).
  const smiOut = await cli("export", "--smiles", smi, "--out", `${name}.smi`, "--format", "smi");
  r.smiExit = smiOut.code;
  if (smiOut.code === 0) r.smilesOut = readFileSync(`${name}.smi`, "utf8").trim().split(/\s+/)[0];
  else r.smiError = short(smiOut.json[0]?.error ?? smiOut.stderr, 240);
  // 3. MOL export, then reimport with ChemDraft's molfile reader and its RDKit.
  const mol = await cli("export", "--smiles", smi, "--out", `${name}.mol`, "--format", "mol");
  r.molExit = mol.code;
  if (mol.code === 0) {
    const text = readFileSync(`${name}.mol`, "utf8");
    r.molVersion = text.includes("V3000") ? "V3000" : "V2000";
    r.molReimportCanonical = rdCanon(text);
    try { const g = parseMolfileGraph(text); r.molReaderAtoms = g.atoms?.length; } catch (e) { r.molReaderError = short(String(e)); }
  } else r.molError = short(mol.json[0]?.error ?? mol.stderr, 240);
  // 4. Composition / masses.
  const an = await cli("analyze", "--smiles", smi, "--methods", "rdkit.composition,rdkit.average-mass,rdkit.monoisotopic-mass,rdkit.canonical-smiles");
  const s = an.json[0]?.summary;
  if (s) r.analysis = { formula: s.formula?.value, avg: s.averageMass?.value && +s.averageMass.value.toFixed(3), mono: s.monoisotopicMass?.value && +s.monoisotopicMass.value.toFixed(4) };
  else r.analyzeError = short(an.json[0]?.error ?? an.stderr, 200);
  results.A[id] = r;
  console.error(`${id} doc=${r.documentExit} smi=${r.smiExit} mol=${r.molExit} ${r.smilesOut ?? r.smiError ?? ""}`);
}

// Stereo for A6, A7, A18.
for (const [id, smi] of [["A6", "C[C@H](N)C(=O)O"], ["A7a", "F/C=C/F"], ["A7b", "F/C=C\\F"], ["A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"]]) {
  const st = await cli("stereo", "--smiles", smi);
  results.A[id].stereo = st.json[0] ? { centers: st.json[0].stereoCenters ?? st.json[0].tetrahedral, doubleBonds: st.json[0].doubleBonds, raw: short(JSON.stringify(st.json[0]), 500) } : short(st.stderr);
}

// A16: reaction SMILES through the reaction command.
{
  const rx = await cli("reaction", "--rxn", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O", "--out", "A16.svg");
  results.A.A16 = { input: "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O", exit: rx.code, ms: rx.ms, result: short(JSON.stringify(rx.json[0]), 600), error: rx.code ? short(rx.stderr, 300) : undefined };
  const sm = await cli("document", "--smiles", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O", "--out", "A16doc.json");
  results.A.A16.asSmilesToDocument = { exit: sm.code, error: short(sm.json[0]?.error ?? sm.stderr, 200) };
}

// A20 render time.
{
  const rd = await cli("render", "--smiles", peptide, "--out", "A20.svg");
  results.A.A20.renderSvgMs = rd.ms; results.A.A20.renderExit = rd.code;
}

// C1 V2000 round trip with stereo; C2 V3000 via chem-core writer (the CLI writes V3000 only for dative bonds).
for (const smi of ["C[C@H](N)C(=O)O", "F/C=C\\F", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"]) {
  const tag = rdCanon(smi);
  const ex = await cli("export", "--smiles", smi, "--out", "c1.mol", "--format", "mol");
  const text = ex.code === 0 ? readFileSync("c1.mol", "utf8") : "";
  const doc = await cli("document", "--smiles", smi, "--out", "c2.json");
  let v3 = null, v3Canon = null, v3Reader = null;
  if (doc.code === 0) {
    const d = JSON.parse(readFileSync("c2.json", "utf8"));
    const m = d.pages[0].objects.find((o) => o.type === "molecule");
    const warnings = [];
    v3 = moleculeToMolfileV3000(m, { fromDocFrame: true, kekuleBondOrders: nativeBondOrderResolution(m.atoms, m.bonds).kekuleOrders, warnings }).contents;
    writeFileSync(`v3000-${(results.C.C2?.length ?? 0) + 1}.mol`, v3);
    v3Canon = rdCanon(v3);
    try { v3Reader = parseMolfileGraph(v3).atoms?.length ?? "parsed"; } catch (e) { v3Reader = short(String(e)); }
  }
  (results.C.C1 ??= []).push({ smiles: smi, inputCanonical: tag, v2000Exit: ex.code, v2000Reimport: text ? rdCanon(text) : null, same: text ? rdCanon(text) === tag : false, chiralFlagLine: text.split("\n")[3]?.slice(0, 39) });
  (results.C.C2 ??= []).push({ smiles: smi, hasV3000Header: !!v3 && /V3000/.test(v3) && /M  V30 BEGIN CTAB/.test(v3), reimport: v3Canon, same: v3Canon === tag, chemdraftReaderAtoms: v3Reader, firstLines: v3?.split("\n").slice(3, 6).join(" | ") });
}

// C5 SVG export: text as <text> or paths?
{
  const rd = await cli("render", "--smiles", "CC(=O)Oc1ccccc1C(=O)O", "--out", "C5.svg");
  const svg = existsSync("C5.svg") ? readFileSync("C5.svg", "utf8") : "";
  const docSvg = await cli("render", "--smiles", "CC(=O)Oc1ccccc1C(=O)O", "--out", "C5doc.svg", "--style", "document");
  const svg2 = existsSync("C5doc.svg") ? readFileSync("C5doc.svg", "utf8") : "";
  results.C.C5 = { exit: rd.code, bytes: svg.length, textElements: (svg.match(/<text/g) ?? []).length, paths: (svg.match(/<path/g) ?? []).length,
    root: short(svg.match(/<svg[^>]*>/)?.[0], 220), documentStyle: { exit: docSvg.code, bytes: svg2.length, textElements: (svg2.match(/<text/g) ?? []).length, root: short(svg2.match(/<svg[^>]*>/)?.[0], 220) },
    validXmlRoot: svg.trimStart().startsWith("<?xml") || svg.trimStart().startsWith("<svg") };
}

// C7 InChI/InChIKey for L-alanine.
{
  const an = await cli("analyze", "--smiles", "C[C@H](N)C(=O)O", "--methods", "rdkit.inchi,rdkit.inchikey");
  const s = an.json[0]?.summary ?? {};
  const run = an.json[0]?.run?.results ?? [];
  const inchi = run.find((x) => x.methodId === "rdkit.inchi");
  results.C.C7 = { inchiKey: s.inchiKey?.value, expected: "QNAYBMKLOCPYGJ-REOHCLBHSA-N", pass: s.inchiKey?.value === "QNAYBMKLOCPYGJ-REOHCLBHSA-N", inchi: short(JSON.stringify(inchi?.value ?? inchi?.values ?? s.inchi), 200) };
}

// D1/D2 caffeine; D3 CIP; D5 aspirin full report.
{
  const caf = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
  const an = await cli("analyze", "--smiles", caf);
  const s = an.json[0]?.summary ?? {};
  results.D.D1 = { formula: s.formula?.value, averageMass: s.averageMass?.value, pass: s.formula?.value === "C8H10N4O2" && Math.abs(s.averageMass?.value - 194.19) < 0.01 };
  results.D.D2 = { monoisotopicMass: s.monoisotopicMass?.value, pass: Math.abs(s.monoisotopicMass?.value - 194.0804) < 0.0001 };
  const methods = an.json[0]?.run?.results ?? [];
  results.D.caffeineMethodCount = methods.length;
  results.D.caffeineMethodStatuses = methods.reduce((m, x) => ((m[x.status ?? "?"] = (m[x.status ?? "?"] ?? 0) + 1), m), {});
  writeFileSync("caffeine-analyze.json", JSON.stringify(an.json[0], null, 1));

  const st = await cli("stereo", "--smiles", "C[C@H](N)C(=O)O");
  results.D.D3 = { centers: st.json[0]?.stereoCenters, pass: st.json[0]?.stereoCenters?.[0]?.descriptor === "S" };

  const asp = await cli("analyze", "--smiles", "CC(=O)Oc1ccccc1C(=O)O");
  const a = asp.json[0] ?? {};
  const md = await cli("analyze", "--smiles", "CC(=O)Oc1ccccc1C(=O)O", "--format", "md");
  a.report = md.json[0]?.report;
  writeFileSync("aspirin-analyze.json", JSON.stringify(a, null, 1));
  const logp = (a.run?.results ?? []).find((x) => x.methodId === "rdkit.crippen-logp");
  results.D.D5 = { logP: a.summary?.logP?.value, tpsa: a.summary?.tpsa?.value, pka: a.summary?.pka?.value, logPMethod: logp ? { methodId: logp.methodId, version: logp.methodVersion, classification: logp.classification, conventions: logp.conventions?.slice(0, 2) } : null,
    pkaMethod: (a.run?.results ?? []).find((x) => x.methodId === "dimorphite.ionizable-sites")?.classification,
    engines: a.run?.engines?.map((e) => `${e.name} ${e.version}`), sourceHash: a.run?.sourceHash, reportHead: short(a.report, 400), ms: asp.ms };
}

// D4 NMR for ethyl acetate via the plugin, trust file passed as an embedding option.
{
  const { runNmrCommand } = await imp("packages/chemdraft-cli/src/commands/nmr.ts");
  const trust = join(OUT, "trusted-plugins.json");
  writeFileSync(trust, JSON.stringify({ version: 1, trustedPlugins: [{ id: "org.chemdraft.nmr.predictor", dir: NMR }] }));
  process.env.CHEMDRAFT_NMR_PLUGIN_DIR = NMR;
  const lines = [], err = [];
  const t0 = performance.now();
  const code = await runNmrCommand(["--smiles", "CCOC(C)=O", "--spectrum", "D4.svg"], { stdout: (l) => lines.push(l), stderr: (l) => err.push(l) }, { trustConfigPath: trust });
  const j = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)[0];
  writeFileSync("ethyl-acetate-nmr.json", JSON.stringify(j, null, 1));
  const pick = (nuc) => (j?.resonances ?? []).filter((x) => x.nucleus === nuc).map((x) => ({ ppm: x.shiftPpm, mult: x.multiplicity, nH: x.nEquivalent, J: x.jHz, sphere: x.hoseSphere, refs: x.referenceCount, source: x.source }));
  const h1 = pick("1H"), c13 = pick("13C");
  results.D.D4 = { exit: code, ms: Math.round(performance.now() - t0), method: j?.method, database: j?.database?.name, license: j?.database?.license, warnings: j?.warnings, h1, c13, pass: h1.length === 3 && c13.length === 4 };
}

writeFileSync("results.json", JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
