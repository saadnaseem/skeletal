/* ================= NMR structure-solving guide: calculators =================
   Pure functions behind the guide's worked steps (unit-tested). The reference tables live with the guide UI. */
const NMRG = (()=>{
  const HAL=new Set(['F','Cl','Br','I']), TRI=new Set(['N','P','As','B']), TETRA=new Set(['C','Si','Ge']);
  // "C9H8O4", "C2H5Br", "CH3(CH2)2OH" -> {C:9,H:8,O:4}
  function parseFormula(str){
    const s=String(str).replace(/\s+/g,'').replace(/[₀-₉]/g,c=>String(c.charCodeAt(0)-0x2080));
    const out={}; let i=0;
    const group=()=>{ const g={};
      while (i<s.length && s[i]!==')'){
        if (s[i]==='('){ i++; const inner=group(); if (s[i]!==')') throw new Error('Unbalanced parentheses'); i++; const m=/^\d+/.exec(s.slice(i)); const k=m? +m[0] : 1; if (m) i+=m[0].length; for (const [e,n] of Object.entries(inner)) g[e]=(g[e]||0)+n*k; continue; }
        const m=/^([A-Z][a-z]?)(\d*)/.exec(s.slice(i)); if (!m) throw new Error(`Can't read the formula at "${s.slice(i)}"`);
        g[m[1]]=(g[m[1]]||0)+(m[2]? +m[2] : 1); i+=m[0].length; }
      return g; };
    Object.assign(out, group()); if (i<s.length) throw new Error('Unbalanced parentheses');
    return out;
  }
  // degree of unsaturation (rings + π bonds): tetravalent atoms count like C, trivalent like N, halogens like H; O and S drop out
  function dbe(c){
    let t=0, tri=0, mono=0;
    for (const [e,n] of Object.entries(c)){ if (TETRA.has(e)) t+=n; else if (TRI.has(e)) tri+=n; else if (e==='H' || HAL.has(e)) mono+=n; }
    return (2*t + 2 + tri - mono)/2;
  }
  // Rule of 13 (nominal mass M): base hydrocarbon CnH(n+r); each heteroatom replaces the CxHy of the same nominal mass
  const SWAP={O:{C:1,H:4}, N:{C:1,H:2}, S:{C:2,H:8}, F:{C:1,H:7}, Cl:{C:2,H:11}, Br:{C:6,H:7}, I:{C:9,H:19}, P:{C:2,H:7}, Si:{C:2,H:4}};
  function rule13(M, hetero={}){
    M=Math.round(+M); if (!(M>0)) throw new Error('Give the nominal molecular mass');
    const n=Math.floor(M/13), r=M-13*n; const c={C:n, H:n+r};
    for (const [e,k] of Object.entries(hetero)){ if (!k) continue; const sw=SWAP[e]; if (!sw) throw new Error(`No Rule-of-13 swap for ${e}`);
      c.C-=sw.C*k; c.H-=sw.H*k; c[e]=(c[e]||0)+k; }
    // a negative H count can be fixed by trading C for H12 (both 12 u)
    while (c.H<0 && c.C>1){ c.C-=1; c.H+=12; }
    const ok=c.C>0 && c.H>=0, u=ok? dbe(c) : NaN;
    return {formula:c, dbe:u, plausible: ok && u>=0 && Number.isInteger(u), nitrogenRuleOk: ((c.N||0)%2)===(M%2)};
  }
  // integrals (any units) -> whole H counts that add up to the formula's total H
  function scaleIntegrals(vals, totalH){
    const v=vals.map(Number).filter(x=>x>0); const sum=v.reduce((a,b)=>a+b,0); if (!v.length || !(sum>0)) return [];
    if (!(totalH>0)){ const m=Math.min(...v); return v.map(x=>({raw:x, h:x/m})); } // ratio to the smallest signal
    const exact=v.map(x=>x/sum*totalH), fl=exact.map(Math.floor); let left=totalH-fl.reduce((a,b)=>a+b,0);
    const order=exact.map((x,i)=>[x-fl[i],i]).sort((a,b)=>b[0]-a[0]); for (const [,i] of order){ if (left<=0) break; fl[i]++; left--; }
    return v.map((x,i)=>({raw:x, exact:exact[i], h:fl[i]}));
  }
  const hill=c=>{ const ks=Object.keys(c).filter(k=>c[k]>0); const o=c.C? ['C','H',...ks.filter(k=>k!=='C'&&k!=='H').sort()] : ks.sort(); return o.filter(k=>c[k]>0).map(k=>k+(c[k]>1?c[k]:'')).join(''); };
  /* ---------- reference content (vetted against the sources below; soft = sources disagree on the bounds) ---------- */
  const SRC={
    reich:['H. J. Reich, NMR collection (organicchemistrydata.org)','https://organicchemistrydata.org/hansreich/resources/nmr/'],
    wiscH:['UW-Madison CHEM 344 ¹H shift table','https://www2.chem.wisc.edu/deptfiles/OrgLab/handouts/CHEM%20344%201H-NMR%20chemical%20shift%20table.pdf'],
    wiscC:['UW-Madison ¹³C shift table','https://www2.chem.wisc.edu/deptfiles/OrgLab/handouts/13-C%20NMR%20Chemical%20Shift%20Table.pdf'],
    fulmer:['Fulmer et al., Organometallics 2010, 29, 2176 (solvent and impurity shifts)','https://doi.org/10.1021/om100106e'],
    bc:['Bright & Chen, J. Chem. Educ. 1983, 60, 557 (Rule of 13)','https://doi.org/10.1021/ed060p557'],
    dou:['LibreTexts: Calculating degree of unsaturation','https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Organic_Chemistry_(Morsch_et_al.)/07:_Alkenes-_Structure_and_Reactivity/7.03:_Calculating_Degree_of_Unsaturation'],
    reusch:['W. Reusch, Virtual Textbook of Organic Chemistry: NMR','https://organicchemistrydata.org/reusch/virtualtext/spectroscopy/nmr-spectroscopy/'],
    hmdb:['Experimental spectra in PubChem (HMDB data)','https://pubchem.ncbi.nlm.nih.gov/'],
  };
  // ¹H shift ranges, CDCl3. [label, lo, hi, typical, note, sources, soft]
  const H1=[
    ['Alkyl C–H (no nearby heteroatom or π)',0.8,1.7,'CH₃ ≈ 0.9, CH₂ 1.2–1.4, CH ≈ 1.5','n-Pentane 0.88/1.27; cyclohexane 1.43',['wiscH','reich','fulmer']],
    ['Allylic C=C–C–H',1.6,2.3,'≈ 1.7–2.0','',['wiscH','reusch']],
    ['α to C=O  (O=C–C–H)',2.0,2.7,'acetone 2.17','Aryl methyl ketones ≈ 2.5–2.6',['wiscH','fulmer']],
    ['Benzylic Ar–C–H',2.2,2.8,'toluene CH₃ 2.36','',['wiscH','fulmer']],
    ['α to N (amines; amide N–CH₃ ≈ 2.9)',2.0,3.0,'Et₃N 2.53','',['wiscH','fulmer']],
    ['Terminal alkyne C≡C–H',1.8,3.2,'≈ 2–3','Sources disagree on the bounds',['wiscH','reusch'],1],
    ['H–C–I / H–C–Br / H–C–Cl',2.1,3.8,'CH₃I 2.1, CH₃Br 2.7, CH₃Cl 3.0','Each extra halogen adds; CH₂Cl₂ 5.30',['wiscH','reusch','fulmer']],
    ['1,3-Dicarbonyl CH₂  (O=C–CH₂–C=O)',3.2,3.7,'','',['wiscH']],
    ['α to O: alcohols, ethers  (H–C–O)',3.3,4.0,'Et₂O 3.48, EtOH 3.72; Ar–OCH₃ ≈ 3.8–3.9','',['wiscH','fulmer']],
    ['α to O: esters, alkoxy side  (C(=O)O–C–H)',3.6,4.5,'EtOAc OCH₂ 4.12','',['wiscH','fulmer']],
    ['H–C–F',4.1,4.7,'CH₃F 4.1','',['wiscH','reusch']],
    ['H–C–NO₂',4.1,4.6,'MeNO₂ 4.33','',['fulmer','reusch']],
    ['Vinylic C=C–H (isolated)',4.5,6.5,'ethylene 5.40','',['wiscH','fulmer']],
    ['Vinylic, conjugated (enone β-H, styrenes)',5.5,7.8,'','Conjugation moves the β-H downfield',['wiscH','reich']],
    ['Aromatic Ar–H',6.5,8.5,'benzene 7.36','Above 8 with strong acceptors (C=O, NO₂)',['wiscH','fulmer']],
    ['Imine CH=N',7.6,8.8,'','',['wiscH']],
    ['Aldehyde CHO',9.0,10.5,'usually 9.5–10.1; PhCHO 10.03','',['wiscH','fulmer']],
    ['Carboxylic acid COOH',10,13,'broad, sometimes not seen','Exchangeable',['wiscH','reusch']],
  ];
  // exchangeable H: no fixed range; shown separately with their dependence on solvent and concentration
  const H1X=[
    ['Alcohol O–H','≈ 1–2 in dilute CDCl₃; up to ≈ 5 when concentrated or neat (EtOH 1.0 dilute vs 5.13 neat); further downfield in DMSO-d₆'],
    ['Phenol Ar–O–H','≈ 5–7 in CDCl₃; 9–11 in DMSO-d₆; intramolecularly H-bonded OH can be far downfield (≈ 12–15)'],
    ['Amine N–H','≈ 1–3 (RNH₂ typically 1–2), broad'],
    ['Aniline N–H','≈ 3.5–4.5 in CDCl₃; 1–2 ppm further downfield in DMSO-d₆'],
    ['Amide N–H','≈ 5–8, typically ≈ 7; broad (¹⁴N); usually still couples to N–CH'],
    ['Ammonium N–H⁺','≈ 4–7 in CDCl₃; 8–9 in DMSO-d₆'],
    ['Thiol S–H','≈ 1.2–2.0 (alkyl); 3.5–4.5 (aryl)'],
  ];
  // ¹³C ranges, CDCl3
  const C13=[
    ['Alkane C (no heteroatom)',5,60,'CH₃ usually 10–30; cyclopropane ≈ −3','n-Pentane 14.1/22.4/34.2',['wiscC','reich','fulmer']],
    ['C–I (heavy-atom effect: upfield)',-20,40,'CH₃I −20','',['reich'],1],
    ['C–Br',10,60,'CH₃Br ≈ 10','',['wiscC','reich'],1],
    ['C–Cl',25,70,'CH₂Cl₂ 53.5','',['wiscC','reich','fulmer'],1],
    ['C–N (amines; amide N–CH₃ 31–38)',30,70,'Et₃N 46.3','',['wiscC','fulmer']],
    ['C–O (alcohols, ethers, ester alkoxy)',50,90,'MeOH 50.4, EtOH 58.3, EtOAc OCH₂ 60.5; Ar–OCH₃ ≈ 55','',['wiscC','fulmer']],
    ['C–NO₂',60,80,'MeNO₂ 62.5','',['fulmer']],
    ['Alkyne C≡C',60,90,'','Sources differ (60–80 vs 70–90)',['wiscC','reich'],1],
    ['C–F (alkyl)',80,95,'','',['wiscC']],
    ['Alkene C=C',100,150,'ethylene 123.1','Alkene and aromatic C overlap: use ¹H to tell them apart',['reich','fulmer']],
    ['Aromatic C',110,165,'benzene 128.4; C–O ipso up to ≈ 164; CH ortho to OR/NR₂ ≈ 110–115','',['reich','fulmer','hmdb']],
    ['Nitrile C≡N',110,125,'MeCN 116.4','',['wiscC','fulmer']],
    ['Acid, ester, amide C=O',160,180,'AcOH 176.0, EtOAc 171.4, DMA 171.1','Formamides and carbonates lower (DMF 162.6, dimethyl carbonate 156.5)',['wiscC','fulmer']],
    ['Aldehyde C=O',190,205,'PhCHO 192.7, MeCHO ≈ 200','Conjugation lowers it',['fulmer','reich']],
    ['Ketone C=O',195,220,'acetone 207.1, cyclohexanone 212.6','Aryl/conjugated ketones ≈ 190–200 (4′-MeO-acetophenone 196.4)',['fulmer','hmdb']],
  ];
  // typical coupling constants (Hz, magnitudes)
  const J=[
    ['³J vicinal sp³, freely rotating  (H–C–C–H)','≈ 7','6–8; smaller next to electronegative groups'],
    ['³J in rigid rings (Karplus)','dihedral-dependent','chair cyclohexane: axial–axial 8–13 (typ. 9–12); axial–equatorial and equatorial–equatorial ≈ 2–5'],
    ['²J geminal sp³  (H–C–H)','≈ 12','10–13; 15–25 next to C=O/CN; seen only when the two H differ (diastereotopic, rings)'],
    ['³J trans alkene','≈ 17','≈ 13–19 for common substituents; trans > cis almost without exception'],
    ['³J cis alkene','≈ 10','≈ 5–12; smaller in small rings'],
    ['²J geminal alkene  (=CH₂)','≈ 2','0–3'],
    ['³J vinyl H to allylic CH','5–8',''],
    ['⁴J allylic  (H–C=C–C–H)','1–2','not reliable for E/Z assignment'],
    ['³J aldehyde H–C(O)–C–H','1–3','≈ 8 when conjugated (acrolein, cinnamaldehyde)'],
    ['Aromatic ortho','7–8','range 6–9.5; benzene 7.6'],
    ['Aromatic meta','1–3','benzene 1.4'],
    ['Aromatic para','0–1','usually not resolved'],
    ['⁴J W-coupling, benzylic','< 1','usually just broadens lines; W only in rigid geometries'],
    ['O–H / N–H to C–H','0 or 4–7','0 with fast exchange (typical CDCl₃); 4–7 when exchange is slow (DMSO-d₆); amide NH usually couples'],
  ];
  // aromatic substitution patterns
  const ARO=[
    ['Monosubstituted','Cc1ccccc1','5H','Alkyl groups: one overlapping multiplet ≈ 7.1–7.35. Strong donors or acceptors spread it into ortho (2H), meta (2H) and para (1H) multiplets. Never strictly first order.'],
    ['para (1,4-), different groups','COc1ccc(cc1)C(C)=O','2H + 2H','Two "doublet-like" 2H signals forming an AA′BB′ system, not true doublets: the apparent splitting (≈ 8–9 Hz) is J(ortho) + J(para), and small extra lines often show. Same two groups: one 4H singlet.'],
    ['ortho (1,2-)','COc1ccccc1C(C)=O','4 × 1H','H3 and H6: dd (one ortho, one meta J). H4 and H5: td or ddd (two ortho, one meta J). Overlap quickly makes it complex. Same two groups: an AA′BB′ that looks like two dd.'],
    ['meta (1,3-)','COc1cccc(c1)C(C)=O','4 × 1H','H2 (between the groups): narrow t or broad s (two meta J ≈ 2). H5: wide t or dd (two ortho J ≈ 8). H4 and H6: ddd or dt (one ortho, plus small meta/para J).'],
    ['1,2,4-Trisubstituted','COc1ccc(cc1Cl)C(C)=O','3 × 1H','H3: d, J ≈ 2 (meta only). H5: dd, J ≈ 8 and 2. H6: d, J ≈ 8 (its para coupling to H3 is unresolved).'],
    ['1,3,5-Trisubstituted','Cc1cc(C)cc(C)c1','3H','Three identical groups: one 3H singlet. Two identical: t (1H) and d (2H), J ≈ 2. All different: three narrow signals (meta J only).'],
    ['1,2,3-Trisubstituted, symmetric','Cc1cccc(C)c1Cl','2H + 1H','t (1H) and d (2H), J ≈ 8.'],
  ];
  // aromatic ¹H substituent increments (Reich, dilute CDCl3): δ ≈ 7.36 + Z(ortho) + Z(meta) + Z(para)
  const ZH={H:[0,0,0], NH2:[-0.71,-0.22,-0.62], OH:[-0.53,-0.14,-0.43], OCH3:[-0.45,-0.07,-0.41], CH3:[-0.18,-0.11,-0.21], Cl:[-0.02,-0.07,-0.13], 'C(O)CH3':[0.60,0.10,0.20], CHO:[0.53,0.18,0.28], COOCH3:[0.68,0.08,0.19], NO2:[0.87,0.20,0.35]};
  // ring positions 1..6; subs = {pos: key}; returns δ for each H position
  function aromaticH(subs){
    const out={};
    for (let p=1;p<=6;p++){ if (subs[p] && subs[p]!=='H') continue; let d=7.36;
      for (const [q,key] of Object.entries(subs)){ const z=ZH[key]; if (!z || key==='H') continue; const k=Math.min((p-q+6)%6,(q-p+6)%6); if (k===1) d+=z[0]; else if (k===2) d+=z[1]; else if (k===3) d+=z[2]; }
      out[p]=d; }
    return out;
  }
  const METHODS=[
    ['¹H','Shift, integration (relative H count) and splitting (J)','Integration is relative: you need the formula to get absolute H counts.'],
    ['¹³C{¹H}','One line per unique carbon','Peak heights are not proportional to the number of carbons; quaternary C are weak. CDCl₃ appears as a 1:1:1 triplet at 77.16.'],
    ['DEPT-90','CH only',''],
    ['DEPT-135','CH₃ and CH up, CH₂ down, quaternary C absent','Phase is a convention, so use a known peak as reference. Quaternary C = broadband signals missing from DEPT-135.'],
    ['APT','All carbons, two phases','C and CH₂ one phase; CH and CH₃ the opposite phase.'],
    ['COSY','¹H–¹H couplings (mostly 2- and 3-bond)','Traces H–C–C–H connectivity; weak or missing cross-peaks for small J.'],
    ['TOCSY','Every proton in one coupled spin system','Useful for isolated chains and sugar rings.'],
    ['HSQC / HMQC','Which H sits on which C (one bond)','Much more sensitive than ¹³C detection; edited HSQC also separates CH₂ from CH/CH₃.'],
    ['HMBC','¹H–¹³C over 2–3 bonds (occasionally 4)','Links fragments across quaternary C and heteroatoms (e.g. O–CH₂ protons to an ester C=O). 2- and 3-bond peaks look the same; a missing peak is weak evidence.'],
    ['NOESY / ROESY','Protons close in space','Stereochemistry and conformation. Use ROESY for molecules near MW ≈ 1000, where NOEs vanish.'],
    ['D₂O shake','OH, NH and COOH signals disappear','Works best in CDCl₃ or CD₂Cl₂; in miscible solvents the HOD peak stays at the water position.'],
    ['Variable temperature','Exchange and slow rotation','Broad signals sharpen or split (amide C–N rotation, ring flips); OH/NH shifts move with temperature.'],
  ];
  const WORKFLOW=[
    ['Formula','From HRMS or elemental analysis, or the Rule of 13 from M. Nitrogen rule: an odd M means an odd number of N.'],
    ['Degree of unsaturation','DBE = C − H/2 − X/2 + N/2 + 1. O and S drop out. DBE ≥ 4: think benzene ring.'],
    ['Count ¹³C signals','Fewer signals than C atoms means symmetry. Sort them by region: C=O > 160 (ketone/aldehyde ≳ 190, acid derivatives 155–180), aromatic/alkene 100–165, nitrile ≈ 115–125, alkyne 60–90, C–O 50–90, alkyl < 50.'],
    ['DEPT or HSQC','Label each carbon CH₃, CH₂, CH or C. Add up the H on carbon; any shortfall from the formula is OH, NH or COOH.'],
    ['¹H integration','Scale the integrals so they add up to the formula\'s H count.'],
    ['¹H shifts','Assign environments from the shift table. Flag exchangeable H (broad, variable, gone after D₂O).'],
    ['Splitting','Count neighbours with n + 1 or a splitting tree and read J. Multiplets that share the same J are coupled to each other (an ethyl q and t share J ≈ 7). Watch for second-order patterns (Δν/J < 5, roofing, AA′BB′).'],
    ['Fragments','Write down the pieces: CH₃CH₂–X, CH₃–C=O, a para-disubstituted ring…'],
    ['Assemble','Use every atom in the formula and every degree of unsaturation. List the isomers that fit.'],
    ['Check','Predict the spectrum of each candidate (draw it and use Predict NMR) and compare; use COSY for H–H links, HMBC across quaternary C and heteroatoms, NOESY for stereochemistry.'],
  ];
  // worked examples (real data; integrations are the structure-implied values)
  const EXAMPLES=[
    {name:'Ethyl acetate', formula:'C4H8O2', M:88, smiles:'CCOC(C)=O', src:'fulmer',
     h1:[['4.12','q','7','2H'],['2.05','s','','3H'],['1.26','t','7','3H']], c13:'171.4, 60.5, 21.0, 14.2',
     steps:['DBE = 4 − 8/2 + 1 = 1: one ring or π bond.','Four ¹³C signals for four C: no symmetry. 171.4 is in the acid/ester window (160–180), not a ketone (> 190). That uses the one degree of unsaturation.','No ¹H signal at 10–13, so not an acid: an ester (both O used).','60.5 is a C–O carbon: an O–CH₂.','Integrals 2 : 3 : 3 = 8 H, matching the formula.','4.12 (q, 2H) and 1.26 (t, 3H) share J = 7: an ethyl group, and 4.12 puts its CH₂ on oxygen.','2.05 (s, 3H) is an isolated CH₃ next to C=O.','Answer: CH₃C(=O)OCH₂CH₃. The isomer methyl propanoate would show the singlet near 3.7 (OCH₃) and the quartet near 2.3, the other way round.']},
    {name:'Ethylbenzene', formula:'C8H10', M:106, smiles:'CCc1ccccc1', src:'hmdb',
     h1:[['7.10–7.35','m','','5H'],['2.63','q','7.6','2H'],['1.22','t','7.6','3H']], c13:'144.2, 128.4, 127.9, 125.7, 29.0, 15.6',
     steps:['DBE = 8 − 5 + 1 = 4: probably a benzene ring.','5 aromatic H in one multiplet: a monosubstituted ring with an alkyl group.','Six ¹³C signals for eight C: symmetry. Four aromatic signals (ipso, ortho, meta, para) is what a monosubstituted ring gives.','The rest is C₂H₅: a q (2H) and t (3H) sharing J. The CH₂ at 2.63 is benzylic.','Substituent increments for Et on benzene (128.5) predict 144.2 / 127.9 / 128.4 / 125.7: observed 144.2 / 127.9 / 128.4 / 125.7.','The xylenes (also C₈H₁₀) show a 6H methyl singlet and 3–5 ¹³C signals, so they are ruled out.']},
    {name:'4′-Methoxyacetophenone', formula:'C9H10O2', M:150, smiles:'COc1ccc(cc1)C(C)=O', src:'hmdb',
     h1:[['7.93','"d" (AA′BB′)','≈ 9 apparent','2H'],['6.93','"d" (AA′BB′)','≈ 9 apparent','2H'],['3.86','s','','3H'],['2.55','s','','3H']], c13:'196.4, 163.5, 130.5, 130.4, 113.7, 55.3, 26.1',
     steps:['DBE = 9 − 5 + 1 = 5: a benzene ring plus one more π bond.','Seven ¹³C signals for nine C: two pairs of equivalent carbons, as in a para-disubstituted ring.','196.4 is a ketone C=O, below 200 because it is conjugated with the ring. One O used.','163.5 is an aromatic C bearing O and 55.3 is an O–CH₃: the second O.','Two 2H "doublets" with apparent J ≈ 9 Hz: an AA′BB′ para pattern (at 90 MHz the extra small lines are visible).','3.86 (s, 3H) is Ar–OCH₃; 2.55 (s, 3H) is CH₃C(=O)–Ar.','Answer: 4-CH₃O–C₆H₄–C(O)CH₃. Ring H ortho to the acetyl: 7.36 + 0.60 − 0.07 = 7.89 predicted vs 7.93 observed; ortho to OMe: 7.36 − 0.45 + 0.10 = 7.01 vs 6.93.','Methyl 4-methylbenzoate (same formula) would have an ester C=O near 165–170, not 196.']},
  ];
  const SOLVENTS=[['CDCl₃','7.26','1.56','77.16'],['DMSO-d₆','2.50','3.33','39.52'],['Acetone-d₆','2.05','2.84','29.84, 206.26'],['CD₃OD','3.31','4.87','49.00'],['D₂O','4.79','—','—'],['C₆D₆','7.16','0.40','128.06']];
  const PASCAL=[['s',0],['d',1],['t',2],['q',3],['quintet',4],['sextet',5],['septet',6]].map(([n,k])=>{ const r=[1]; for (let i=0;i<k;i++){ r.push(r[i]*(k-i)/(i+1)); } return [n,k,r]; });

  return {parseFormula, dbe, rule13, scaleIntegrals, hill, SWAP, aromaticH, ZH, SRC, H1, H1X, C13, J, ARO, METHODS, WORKFLOW, EXAMPLES, SOLVENTS, PASCAL};
})();
