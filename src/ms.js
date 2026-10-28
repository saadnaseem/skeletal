/* ================= mass spectrometry =================
   Exact masses, adduct m/z, isotope patterns and a rule-based MS/MS fragment estimate.
   Works on an OpenChemLib molecule. Masses: IUPAC/NIST isotope masses and abundances. */
const MS = (()=>{
  const E = 0.000548579909, PROTON = 1.007276466812, H1 = 1.00782503207;
  // [mass, abundance] per isotope; the first entry is the most abundant (monoisotopic for organics)
  const ISO = {
    H:[[1.00782503207,0.999885],[2.0141017778,0.000115]], Li:[[7.01600455,0.9241],[6.015122795,0.0759]], B:[[11.0093054,0.801],[10.0129370,0.199]],
    C:[[12,0.9893],[13.0033548378,0.0107]], N:[[14.0030740048,0.99636],[15.0001088982,0.00364]], O:[[15.99491461956,0.99757],[16.99913170,0.00038],[17.9991610,0.00205]],
    F:[[18.99840322,1]], Na:[[22.9897692809,1]], Mg:[[23.9850417,0.7899],[24.98583692,0.1],[25.982592929,0.1101]], Al:[[26.98153863,1]],
    Si:[[27.9769265325,0.92223],[28.9764947,0.04685],[29.97377017,0.03092]], P:[[30.97376163,1]],
    S:[[31.972071,0.9499],[32.97145876,0.0075],[33.9678669,0.0425],[35.96708076,0.0001]], Cl:[[34.96885268,0.7576],[36.96590259,0.2424]],
    K:[[38.96370668,0.932581],[39.96399848,0.000117],[40.96182576,0.067302]], Ca:[[39.96259098,0.96941],[43.9554818,0.02086],[41.95861801,0.00647]],
    Fe:[[55.9349375,0.91754],[53.9396105,0.05845],[56.935394,0.02119],[57.9332756,0.00282]], Co:[[58.933195,1]], Ni:[[57.9353429,0.680769],[59.9307864,0.262231],[61.9283451,0.036345],[60.931056,0.011399],[63.927966,0.009256]],
    Cu:[[62.9295975,0.6915],[64.9277895,0.3085]], Zn:[[63.9291422,0.4863],[65.9260334,0.279],[67.9248442,0.1875],[66.9271273,0.041],[69.9253193,0.0062]],
    As:[[74.9215965,1]], Se:[[79.9165213,0.4961],[77.9173091,0.2377],[75.9192136,0.0937],[81.9166994,0.0873],[76.919914,0.0763],[73.9224764,0.0089]],
    Br:[[78.9183371,0.5069],[80.9162906,0.4931]], Ru:[[101.9043493,0.3155],[103.905433,0.1862],[100.9055821,0.1706],[98.9059393,0.1276],[99.9042195,0.126],[95.907598,0.0554],[97.905287,0.0187]],
    Rh:[[102.905504,1]], Pd:[[105.903486,0.2733],[107.903892,0.2646],[104.905085,0.2233],[109.905153,0.1172],[103.904036,0.1114],[101.905609,0.0102]],
    Ag:[[106.905097,0.51839],[108.904752,0.48161]], Sn:[[119.9021947,0.3258],[117.901603,0.2422],[115.901741,0.1454],[118.903308,0.0859],[116.902952,0.0768],[123.9052739,0.0579],[121.903439,0.0463],[111.904818,0.0097],[113.902779,0.0066],[114.903342,0.0034]],
    I:[[126.904473,1]], Pt:[[194.9647911,0.338],[193.9626803,0.329],[195.9649515,0.252],[197.967893,0.07356],[191.9610380,0.00782],[189.959932,0.00014]],
    Au:[[196.9665687,1]], Hg:[[201.970643,0.2986],[199.968326,0.231],[198.968280,0.1687],[200.970302,0.1318],[197.966769,0.0997],[203.973494,0.0687],[195.965833,0.0015]],
  };
  const known = el => Object.hasOwn(ISO, el);
  const mono = el => ISO[el][0][0];

  // element counts and charge of an OCL molecule (implicit and explicit H included)
  function composition(mol){
    mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
    const c={}; let charge=0, radicals=0;
    for (let i=0;i<mol.getAllAtoms();i++){ const el=mol.getAtomLabel(i); c[el]=(c[el]||0)+1;
      if (el!=='H'){ const h=mol.getImplicitHydrogens(i); if (h) c.H=(c.H||0)+h; }
      charge+=mol.getAtomCharge(i); if (mol.getAtomRadical(i)) radicals++; }
    return {counts:c, charge, radicals};
  }
  function massOf(counts){ let m=0; for (const [el,n] of Object.entries(counts)){ if (!known(el)) return NaN; m+=n*mono(el); } return m; }
  function hill(counts){ const ks=Object.keys(counts).filter(k=>counts[k]>0); const order = counts.C ? ['C','H',...ks.filter(k=>k!=='C'&&k!=='H').sort()] : ks.sort();
    return order.filter(k=>counts[k]>0).map(k=>k+(counts[k]>1?counts[k]:'')).join(''); }
  function add(a,b,s=1){ const o={...a}; for (const [k,v] of Object.entries(b)) o[k]=(o[k]||0)+s*v; return o; }
  const parse = f => { const o={}; for (const [,el,n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) o[el]=(o[el]||0)+(n?+n:1); return o; };

  // adduct ions; M is the neutral monoisotopic mass
  const ADDUCTS = [
    {id:'M+H', label:'[M+H]⁺', z:1, d:PROTON, f:{H:1}}, {id:'M+Na', label:'[M+Na]⁺', z:1, d:mono('Na')-E, f:{Na:1}},
    {id:'M+K', label:'[M+K]⁺', z:1, d:mono('K')-E, f:{K:1}}, {id:'M+NH4', label:'[M+NH₄]⁺', z:1, d:mono('N')+4*H1-E, f:{N:1,H:4}},
    {id:'M+2H', label:'[M+2H]²⁺', z:2, d:2*PROTON, f:{H:2}}, {id:'M+', label:'M⁺• (EI)', z:1, d:-E, f:{}},
    {id:'M-H', label:'[M−H]⁻', z:-1, d:-PROTON, f:{H:-1}}, {id:'M+Cl', label:'[M+Cl]⁻', z:-1, d:mono('Cl')+E, f:{Cl:1}},
    {id:'M+HCOO', label:'[M+HCOO]⁻', z:-1, d:mono('C')+mono('H')+2*mono('O')+E, f:{C:1,H:1,O:2}},
  ];
  function adducts(mol){
    const {counts,charge}=composition(mol), M=massOf(counts);
    if (!Number.isFinite(M)) return {M:NaN, counts, charge, rows:[]};
    if (charge){ // already an ion: report it as drawn
      return {M, counts, charge, rows:[{id:'M', label:`[M]${Math.abs(charge)>1?Math.abs(charge):''}${charge>0?'⁺':'⁻'}`, z:charge, mz:(M-charge*E)/Math.abs(charge), formula:hill(counts)+(Math.abs(charge)>1?' '+Math.abs(charge):'')+(charge>0?'+':'-')}]};
    }
    return {M, counts, charge, rows:ADDUCTS.map(a=>({...a, mz:(M+a.d)/Math.abs(a.z), formula:hill(add(counts,a.f))+(Math.abs(a.z)>1?' '+Math.abs(a.z):'')+(a.z>0?'+':'-')}))};
  }

  // isotope pattern by repeated convolution, merging peaks closer than `res` Da and pruning below 1e-5 of the max
  function isotopes(counts, z=1, res=0.005){
    let dist=[[0,1]];
    const conv=(a,b)=>{ const out=[]; for (const [ma,pa] of a) for (const [mb,pb] of b) out.push([ma+mb,pa*pb]); return prune(out); };
    const prune=ps=>{ ps.sort((x,y)=>x[0]-y[0]); const m=[]; for (const p of ps){ const l=m[m.length-1]; if (l && p[0]-l[0]<res){ const w=l[1]+p[1]; l[0]=(l[0]*l[1]+p[0]*p[1])/w; l[1]=w; } else m.push([...p]); }
      const mx=Math.max(...m.map(p=>p[1])); return m.filter(p=>p[1]>mx*1e-5); };
    for (const [el,n] of Object.entries(counts)){ if (n<=0) continue; if (!known(el)) return [];
      let base=ISO[el].map(x=>[x[0],x[1]]), k=n, acc=null; // binary exponentiation
      while (k){ if (k&1) acc = acc? conv(acc,base) : base; k>>=1; if (k) base=conv(base,base); }
      dist=conv(dist,acc); }
    const az=Math.abs(z)||1, mx=Math.max(...dist.map(p=>p[1]));
    return dist.map(([m,p])=>({mz:(m - z*E)/az, rel:100*p/mx, abundance:p})).filter(p=>p.rel>=0.05);
  }
  // nominal summary: M, M+1, M+2 … by integer mass offset
  function nominal(peaks){ if (!peaks.length) return []; const m0=Math.min(...peaks.map(p=>p.mz)); const g=new Map();
    for (const p of peaks){ const k=Math.round(p.mz-m0); const e=g.get(k)||{k,mzw:0,ab:0}; e.mzw+=p.mz*p.abundance; e.ab+=p.abundance; g.set(k,e); }
    const arr=[...g.values()].sort((a,b)=>a.k-b.k), mx=Math.max(...arr.map(e=>e.ab));
    return arr.map(e=>({label: e.k? 'M+'+e.k : 'M', mz:e.mzw/e.ab, rel:100*e.ab/mx})).filter(e=>e.rel>=0.1); }

  /* ---------- MS/MS: rule-based CID fragments of [M+H]+ or [M-H]- ----------
     One-bond cleavages of acyclic single bonds and two-bond ring openings, each fragment as an even-electron ion
     with 0 or 1 hydrogen transfer, plus common neutral losses. Scores favour labile bonds (C–heteroatom, amide,
     ester, α to carbonyl, benzylic, allylic) and stable ions (acylium, iminium, oxonium, benzylic, tertiary). */
  function msms(mol, opts={}){
    const mode=opts.mode||'pos', energy=opts.energy||'medium';
    mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
    const n=mol.getAtoms(), nb=mol.getBonds();
    if (n<2) return {precursor:null, peaks:[]};
    const comp=composition(mol); if (comp.charge) return {precursor:null, peaks:[], note:'MS/MS needs a neutral structure'};
    const el=i=>mol.getAtomLabel(i), hz=i=>mol.getAllHydrogens(i);
    const M=massOf(comp.counts); if (!Number.isFinite(M)) return {precursor:null, peaks:[], note:'Unsupported element'};
    const sign = mode==='pos' ? 1 : -1;
    const precursor = {mz: M + sign*PROTON, formula: hill(add(comp.counts,{H:sign})) + (sign>0?'+':'-'), label: sign>0?'[M+H]⁺':'[M−H]⁻'};
    const isHet=i=>/^(N|O|S|P)$/.test(el(i));
    const isCarbonylC=i=>{ if (el(i)!=='C') return false; for (let k=0;k<mol.getConnAtoms(i);k++){ const b=mol.getConnBond(i,k); if (mol.getBondOrder(b)===2 && /^(O|S|N)$/.test(el(mol.getConnAtom(i,k)))) return true; } return false; };
    const degreeC=i=>{ let c=0; for (let k=0;k<mol.getConnAtoms(i);k++) if (el(mol.getConnAtom(i,k))==='C') c++; return c; };
    // stability of a cation (pos) or anion (neg) centred on atom i after cleavage
    function ionScore(i){
      if (sign>0){
        if (isCarbonylC(i)) return 2.2;                      // acylium
        if (el(i)==='C'){ for (let k=0;k<mol.getConnAtoms(i);k++){ const o=mol.getConnAtom(i,k); if (/^(N|O|S)$/.test(el(o)) && mol.getBondOrder(mol.getConnBond(i,k))===1) return 2.0; } } // iminium/oxonium
        if (mol.isAromaticAtom(i)) return 0.6;
        if (el(i)==='C' && (mol.isBenzylicAtom?.(i) || mol.isAllylicAtom(i))) return 1.8;
        if (el(i)==='C') return [0.4,0.7,1.2,1.6][Math.min(3,degreeC(i))];
        if (el(i)==='N') return 1.4;                         // amine keeps the proton
        return 0.5;
      }
      if (el(i)==='O' || el(i)==='S') return 2.0;           // alkoxide/carboxylate/phenoxide/thiolate
      if (el(i)==='N') return 1.3;
      if (el(i)==='C' && (isCarbonylC(i) || mol.isAllylicAtom(i) || mol.isAromaticAtom(i))) return 1.0;
      return 0.3;
    }
    function bondScore(b){
      const a1=mol.getBondAtom(0,b), a2=mol.getBondAtom(1,b), het=isHet(a1)||isHet(a2);
      let s = het ? 1.6 : 0.7;
      if (mol.isAmideTypeBond(b)) s+=1.0;
      if ((isCarbonylC(a1)&&isHet(a2)) || (isCarbonylC(a2)&&isHet(a1))) s+=0.9;  // ester/amide/acid C–X
      if (isCarbonylC(a1) || isCarbonylC(a2)) s+=0.5;                               // α-cleavage
      if ((mol.isAromaticAtom(a1)&&!mol.isAromaticAtom(a2)) || (mol.isAromaticAtom(a2)&&!mol.isAromaticAtom(a1))) s += het ? -0.2 : 0.3; // benzylic
      if (mol.isAllylicAtom(a1) || mol.isAllylicAtom(a2)) s+=0.3;
      if (/^(Cl|Br|I)$/.test(el(a1)) || /^(Cl|Br|I)$/.test(el(a2))) s+=0.8;
      else if (het && (mol.isAromaticAtom(a1) || mol.isAromaticAtom(a2))) s-=1.4;  // aryl–O/N bonds rarely break
      return s;
    }
    // split atoms into components after removing `cut` bonds
    function split(cut){
      const seen=new Int32Array(n).fill(-1); const parts=[];
      for (let s=0;s<n;s++){ if (seen[s]>=0) continue; const st=[s]; seen[s]=parts.length; const part=[s];
        while (st.length){ const i=st.pop(); for (let k=0;k<mol.getConnAtoms(i);k++){ const b=mol.getConnBond(i,k), o=mol.getConnAtom(i,k); if (o>=n || cut.has(b) || seen[o]>=0) continue; seen[o]=parts.length; part.push(o); st.push(o); } }
        parts.push(part); }
      return parts;
    }
    const countsOf=atoms=>{ const c={}; for (const i of atoms){ c[el(i)]=(c[el(i)]||0)+1; c.H=(c.H||0)+hz(i); } return c; };
    const raw=[];
    // a piece X (atoms with their H, as a radical) gives even-electron ions: X⁺ when the other piece takes the proton,
    // [X+2H]⁺ when X keeps the proton and takes one H; in negative mode X⁻ or [X−2H]⁻
    const pushIon=(counts, transfer, score, how, atoms, bonds)=>{
      const cc=add(counts,{H: transfer ? 2*sign : 0});
      if ((cc.H||0)<0) return; const m=massOf(cc); if (!Number.isFinite(m)) return;
      if (Object.entries(cc).reduce((t,[k,v])=>k==='H'?t:t+v,0)<2) return; // CH3+, OH+, NH4+ and the like are not seen in CID spectra
      raw.push({mz: m - sign*E, formula: hill(cc)+(sign>0?'+':'-'), score, how, atoms, bonds});
    };
    const energyShift = energy==='low' ? -0.6 : energy==='high' ? 0.5 : 0;
    // one-bond cleavages
    for (let b=0;b<nb;b++){
      if (mol.isRingBond(b) || mol.getBondOrder(b)!==1) continue;
      const parts=split(new Set([b])); if (parts.length!==2) continue;
      const a1=mol.getBondAtom(0,b), a2=mol.getBondAtom(1,b), bs=bondScore(b);
      for (const [part,site] of [[parts[0], parts[0].includes(a1)?a1:a2],[parts[1], parts[1].includes(a1)?a1:a2]]){
        const other=site===a1?a2:a1, c=countsOf(part);
        const lbl=`${el(site)}–${el(other)} cleavage`;
        // even-electron ion with one H moved: to the ion when the charge sits on a basic site, away from it otherwise
        pushIon(c, true, bs+ionScore(site)*0.6 - 0.4 + (sign>0 && el(site)==='N'?0.8:0), lbl+(sign>0?', H transfer':', H loss'), part, [b]);
        pushIon(c, false, bs+ionScore(site), lbl, part, [b]);
      }
    }
    // ring openings: two bonds of the same ring (≤ 7 atoms), giving two pieces (retro-Diels–Alder and similar)
    const rs=mol.getRingSet();
    for (let r=0;r<rs.getSize();r++){
      const rb=rs.getRingBonds(r); if (rb.length>7 || rs.isAromatic(r)) continue;
      for (let x=0;x<rb.length;x++) for (let y=x+2;y<rb.length;y++){ if (x===0 && y===rb.length-1) continue;
        const cut=new Set([rb[x],rb[y]]); if ([...cut].some(b=>mol.getBondOrder(b)!==1)) continue;
        const parts=split(cut); if (parts.length!==2) continue;
        const s=(bondScore(rb[x])+bondScore(rb[y]))/2 - 0.8;
        for (const part of parts){ pushIon(countsOf(part), true, s, 'ring opening', part, [...cut]); pushIon(countsOf(part), false, s-0.3, 'ring opening', part, [...cut]); } }
    }
    // neutral losses from the precursor
    const groups={OH:0,NH2:0,COOH:0,CO:0,OMe:0,Hal:{}};
    for (let i=0;i<n;i++){
      if (el(i)==='O' && hz(i)>0) groups.OH++;
      if (el(i)==='N' && hz(i)>=2) groups.NH2++;
      if (isCarbonylC(i)){ groups.CO++; let oh=false, ome=false; for (let k=0;k<mol.getConnAtoms(i);k++){ const o=mol.getConnAtom(i,k); if (el(o)==='O' && mol.getBondOrder(mol.getConnBond(i,k))===1){ if (hz(o)) oh=true; else for (let q=0;q<mol.getConnAtoms(o);q++){ const c2=mol.getConnAtom(o,q); if (c2!==i && el(c2)==='C' && hz(c2)===3) ome=true; } } } if (oh) groups.COOH++; if (ome) groups.OMe++; }
      if (/^(Cl|Br|I|F)$/.test(el(i))) groups.Hal[el(i)]=1;
    }
    const losses=[];
    if (groups.OH) losses.push(['H2O','loss of H₂O',1.6]);
    if (groups.NH2) losses.push(['NH3','loss of NH₃',1.5]);
    if (groups.COOH) losses.push(['CO2','loss of CO₂',sign<0?2.2:0.9], ['CH2O2','loss of HCOOH',1.0]);
    if (groups.CO) losses.push(['CO','loss of CO',0.8]);
    if (groups.OMe) losses.push(['CH4O','loss of CH₃OH',1.4]);
    for (const h of Object.keys(groups.Hal)) if (h!=='F') losses.push([`H${h}`,`loss of H${h}`,1.3]);
    const pc=add(comp.counts,{H:sign});
    for (const [f,how,s] of losses){ const c=add(pc,parse(f),-1); if (Object.values(c).some(v=>v<0)) continue; const m=massOf(c); raw.push({mz:m - sign*E, formula:hill(c)+(sign>0?'+':'-'), score:s, how, atoms:null, bonds:[]}); }
    // acylium ions also lose CO
    for (const p of [...raw]) if (sign>0 && p.how.includes('cleavage') && p.atoms && p.atoms.some(isCarbonylC) && p.score>2.5){ const c=add(parse(p.formula.replace(/[+-]$/,'')),{C:1,O:1},-1); if (Object.values(c).every(v=>v>=0) && (c.C||0)>1){ raw.push({mz:massOf(c)-E, formula:hill(c)+'+', score:p.score-1.2, how:p.how+', then −CO', atoms:p.atoms, bonds:p.bonds}); } }
    // merge peaks at the same m/z (keep the best explanation), convert scores to intensities
    raw.sort((a,b)=>a.mz-b.mz);
    const merged=[];
    for (const p of raw){ if (p.mz > precursor.mz-1) continue; const l=merged[merged.length-1];
      if (l && Math.abs(l.mz-p.mz)<0.003){ l.w+=Math.exp(p.score+energyShift*(p.mz/precursor.mz>0.5? -1:1)); if (p.score>l.score) Object.assign(l,{score:p.score,how:p.how,atoms:p.atoms,bonds:p.bonds,formula:p.formula}); }
      else merged.push({...p, w:Math.exp(p.score+energyShift*(p.mz/precursor.mz>0.5? -1:1))}); }
    const precW = Math.exp(energy==='low'?3.2:energy==='high'?0.8:2.0);
    const mx=Math.max(precW, ...merged.map(p=>p.w));
    const peaks=merged.map(p=>({mz:p.mz, formula:p.formula, rel:100*p.w/mx, how:p.how, atoms:p.atoms, bonds:p.bonds}))
      .filter(p=>p.rel>=2).sort((a,b)=>b.rel-a.rel).slice(0,25).sort((a,b)=>a.mz-b.mz);
    precursor.rel=100*precW/mx;
    return {precursor, peaks};
  }

  // journal HRMS line, e.g. "HRMS (ESI) m/z: [M + H]+ calcd for C9H9O4+ 181.0495; found …"
  function hrmsLine(row){ const lab=row.label.replace('⁺','+').replace('⁻','−').replace('²⁺','2+').replace('₄','4').replace(/\[M([+−])/,'[M $1 ').replace(/\]/,']');
    return `HRMS (ESI) m/z: ${lab} calcd for ${row.formula} ${row.mz.toFixed(4)}; found ${'—'}.`; }

  return {composition, massOf, hill, adducts, isotopes, nominal, msms, hrmsLine, ELECTRON:E, PROTON};
})();
