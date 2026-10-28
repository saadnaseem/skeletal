/* ================= NMR prediction (additive increments) =================
   1H: Shoolery/Pretsch-type constants for sp3 C-H, Pretsch Z values for
   aromatic H, Pascual-Meier-Simon increments for alkene H.
   13C: Grant-Paul + substituent increments for sp3 C, benzene ipso/ortho/
   meta/para increments, alkene increments, carbonyl class tables. */
const NMR = (()=>{
  const SIG = {alkyl:0.55, Ar:1.85, 'C=C':1.32, 'C#C':1.44, CN:1.6, COR:1.70, CHO:1.70, COOH:1.6, 'COO-':1.4, COOR:1.55, CONR:1.59, COCl:1.9, 'C=N':1.5, CF3:1.14,
    OH:2.9, 'O-':2.6, OR:2.65, OAr:3.25, OCOR:3.4, OSO2:3.6, NH2:2.0, NHR:2.0, NR2:1.95, NAr:2.4, NHCOR:2.6, 'N+':2.4, NO2:3.8, 'N=C':2.7, F:3.8, Cl:2.85, Br:2.7, I:2.5,
    SH:1.75, SR:1.75, SOR:2.0, SO2R:2.3, P:1.3, Si:0.0, B:0.4, X:1.0};
  const CH3X = {alkyl:0.9, Ar:2.33, 'C=C':1.71, 'C#C':1.8, CN:2.0, COR:2.12, CHO:2.2, COOH:2.08, 'COO-':1.9, COOR:2.02, CONR:2.0, COCl:2.66, 'C=N':1.95, CF3:1.2,
    OH:3.39, 'O-':3.3, OR:3.30, OAr:3.80, OCOR:3.67, OSO2:3.9, NH2:2.36, NHR:2.40, NR2:2.25, NAr:2.85, NHCOR:2.80, 'N+':3.20, NO2:4.30, 'N=C':3.3, F:4.26, Cl:3.05, Br:2.68, I:2.16,
    SH:2.0, SR:2.1, SOR:2.6, SO2R:2.95, P:1.5, Si:0.05, B:0.8, X:1.5};
  const B1H = {Ar:0.30,'C=C':0.1,'C#C':0.15,COR:0.3,CHO:0.2,COOH:0.2,'COO-':0.1,COOR:0.2,CONR:0.2,CN:0.4,OH:0.3,'O-':0.2,OR:0.3,OAr:0.45,OCOR:0.35,OSO2:0.4,NH2:0.2,NHR:0.2,NR2:0.15,NAr:0.25,NHCOR:0.25,'N+':0.45,NO2:0.7,F:0.45,Cl:0.6,Br:0.8,I:1.0,SH:0.4,SR:0.35,SOR:0.4,SO2R:0.45,CF3:0.3,X:0.2};
  const ZAR = { alkyl:[-0.14,-0.06,-0.17], CH3:[-0.18,-0.11,-0.21], CF3:[0.32,0.14,0.20], Ar:[0.37,0.20,0.10], 'C=C':[0.06,-0.03,-0.10], 'C#C':[0.15,-0.02,-0.01],
    CHO:[0.56,0.22,0.29], COR:[0.62,0.14,0.21], COOH:[0.85,0.18,0.27], 'COO-':[0.5,0.0,0.1], COOR:[0.71,0.11,0.21], CONR:[0.61,0.10,0.17], COCl:[0.84,0.22,0.36], CN:[0.36,0.18,0.28], 'C=N':[0.5,0.1,0.2],
    OH:[-0.56,-0.12,-0.45], 'O-':[-0.8,-0.2,-0.6], OR:[-0.48,-0.09,-0.44], OAr:[-0.29,-0.05,-0.23], OCOR:[-0.25,0.03,-0.13], OSO2:[-0.1,0.05,-0.1],
    NH2:[-0.75,-0.25,-0.65], NHR:[-0.80,-0.22,-0.68], NR2:[-0.66,-0.18,-0.67], NAr:[-0.66,-0.18,-0.67], NHCOR:[0.12,-0.07,-0.28], 'N+':[0.69,0.36,0.31], NO2:[0.95,0.26,0.38], 'N=C':[-0.3,0,-0.3],
    F:[-0.26,0,-0.20], Cl:[0.03,-0.02,-0.09], Br:[0.18,-0.08,-0.04], I:[0.39,-0.21,0.00], SH:[-0.08,-0.16,-0.22], SR:[-0.08,-0.10,-0.24], SOR:[0.4,0.15,0.2], SO2R:[0.60,0.25,0.33], X:[0,0,0] };
  const AR13 = { alkyl:[15.6,-0.5,0.0,-2.6], CH3:[9.3,0.7,-0.1,-2.9], CHR2:[20.1,-2.0,0,-2.5], CR3:[22.1,-3.4,-0.4,-3.1], CF3:[2.6,-3.1,0.4,3.4], Ar:[13.0,-1.1,0.5,-1.0],
    'C=C':[9.5,-2.0,0.2,-0.5], 'C#C':[-6.1,3.8,0.4,-0.2], CHO:[8.2,1.2,0.5,5.8], COR:[8.9,0.1,-0.1,4.4], COOH:[2.1,1.6,-0.1,5.2], 'COO-':[8,1,0,3], COOR:[2.0,1.2,-0.1,4.3], CONR:[5.0,-1.2,0.1,3.4], COCl:[4.7,2.7,0.3,6.6], CN:[-16.0,3.5,0.7,4.3], 'C=N':[7,-1,0,1],
    OH:[26.9,-12.8,1.4,-7.4], 'O-':[39,-8,1.6,-13], OR:[31.4,-14.4,1.0,-7.7], OAr:[27.6,-11.2,-0.3,-6.9], OCOR:[22.4,-7.1,0.4,-3.2], OSO2:[21,-6.5,1.2,-1],
    NH2:[18.2,-13.4,0.8,-10.0], NHR:[21.7,-16.2,0.7,-12.4], NR2:[22.4,-15.7,0.8,-11.8], NAr:[22.4,-15.7,0.8,-11.8], NHCOR:[9.7,-8.1,0.2,-4.4], 'N+':[19.5,-7.3,2.4,2.4], NO2:[19.9,-4.9,0.9,6.1], 'N=C':[23,-7,1,-3],
    F:[34.8,-13.0,1.6,-4.4], Cl:[6.4,0.2,1.0,-2.0], Br:[-5.4,3.4,2.2,-1.0], I:[-32.2,9.9,2.6,-0.4], SH:[2.1,0.7,0.3,-3.2], SR:[10.0,-1.9,0.2,-3.6], SOR:[17,-5,1.3,2], SO2R:[12.3,-1.4,0.8,5.1],
    P:[9,4,0,2], Si:[11,5,-0.7,0.6], B:[6,7,-0.5,3], X:[5,0,0,0] };
  const INC13 = { Ar:[22.5,8,-2], 'C=C':[21.5,6.5,-2], 'C#C':[4.5,5.5,-3.5], CN:[3,2.5,-3], COR:[30,1,-2.5], CHO:[31,0,-2.5], COOH:[21,2,-2.5], 'COO-':[24,3,-2.5], COOR:[23,2.5,-2.5], CONR:[22,2.5,-0.5], COCl:[33,2,-2], 'C=N':[20,3,-2], CF3:[8,2,-2],
    OH:[49,10,-5], 'O-':[49,10,-5], OR:[58.5,7,-4], OAr:[57,7,-4], OCOR:[54,7.5,-4], OSO2:[60,6,-4], NH2:[30.5,11,-5], NHR:[39,8,-4], NR2:[48,6,-3], NAr:[36,7,-4], NHCOR:[28,7,-4], 'N+':[52,5,-4], NO2:[64,3,-4.5], 'N=C':[30,7,-4],
    F:[72,8,-6.8], Cl:[30,11,-4], Br:[20,11,-3], I:[-6,11,-1], SH:[11,12,-4], SR:[20,7,-3], SOR:[43,1,-3], SO2R:[44,1,-3], P:[8,3,-2], Si:[2.3,2.7,-1], B:[5,3,-1], X:[10,5,-2] };
  const ALK13 = { Ar:[12.5,-11], 'C=C':[13.6,-7], COR:[13.8,4.7], CHO:[13.1,12.7], COOH:[5,9.8], 'COO-':[7,6], COOR:[6.3,7], CONR:[8,4], CN:[-15.1,14.2], 'C#C':[-6,5], 'C=N':[10,3],
    OR:[29,-39], OH:[25,-35], 'O-':[25,-35], OAr:[28,-35], OCOR:[18.4,-26.7], NR2:[28,-32], NH2:[24,-30], NHR:[26,-31], NAr:[22,-28], NHCOR:[10,-25], 'N+':[20,-10], NO2:[22,-1],
    F:[24.9,-34.3], Cl:[2.8,-6.1], Br:[-8.6,-0.9], I:[-38,7], SR:[18,-16], SH:[10,-10], SO2R:[14,7], SOR:[14,5], CF3:[3,2], X:[5,0], Si:[16,6], P:[10,0], B:[10,0] };
  const ZALK = { alkyl:[0.45,-0.22,-0.28], CH2X:[0.64,-0.01,-0.02], Ar:[1.38,0.36,-0.07], 'C=C':[1.0,-0.09,-0.23], 'C#C':[0.47,0.38,0.12], COR:[1.10,1.12,0.87], CHO:[1.02,0.95,1.17],
    COOH:[0.97,1.41,0.71], 'COO-':[0.8,0.98,0.32], COOR:[0.80,1.18,0.55], CONR:[1.37,0.98,0.46], COCl:[1.11,1.46,1.01], CN:[0.27,0.75,0.55], 'C=N':[0.7,0.5,0.4],
    OR:[1.22,-1.07,-1.21], OH:[1.22,-1.07,-1.21], 'O-':[1.0,-1.2,-1.3], OAr:[1.21,-0.60,-1.00], OCOR:[2.11,-0.35,-0.64], NR2:[0.80,-1.26,-1.21], NH2:[0.80,-1.26,-1.21], NHR:[0.80,-1.26,-1.21], NAr:[0.8,-1.0,-1.0],
    NHCOR:[2.08,-0.57,-0.72], 'N+':[1.5,0.4,0.3], NO2:[1.87,1.32,0.62], F:[1.54,-0.40,-1.02], Cl:[1.08,0.18,0.13], Br:[1.07,0.45,0.55], I:[1.14,0.81,0.88],
    SR:[1.11,-0.29,-0.13], SH:[1.0,-0.2,-0.1], SO2R:[1.55,1.16,0.93], SOR:[1.27,0.67,0.41], CF3:[0.66,0.61,0.32], Si:[0.9,0.9,0.6], X:[0.5,0,0] };

  let m, H, isSp3C, nb;
  const Z=i=>m.getAtomicNo(i);
  function setup(mol){
    m=mol; m.ensureHelperArrays(OCL.Molecule.cHelperSymmetrySimple);
    const n=m.getAtoms(); H=[]; nb=[]; isSp3C=[];
    for (let i=0;i<n;i++){
      H[i]=m.getAllHydrogens(i);
      const list=[]; for (let k=0;k<m.getConnAtoms(i);k++) list.push({a:m.getConnAtom(i,k), o:m.getConnBondOrder(i,k), b:m.getConnBond(i,k)});
      nb[i]=list;
    }
    for (let i=0;i<n;i++) isSp3C[i] = Z(i)===6 && !m.isAromaticAtom(i) && nb[i].every(x=>x.o===1 && !m.isAromaticBond(x.b));
  }
  const dbl=(i,z)=>nb[i].some(x=>x.o===2 && !m.isAromaticBond(x.b) && Z(x.a)===z);
  const nOf=(i,z,ex)=>nb[i].filter(x=>Z(x.a)===z && x.a!==ex);
  // classify neighbor X as a substituent seen from atom T
  function gType(X, T){
    const z=Z(X), others=nb[X].filter(y=>y.a!==T);
    if (z===6){
      if (m.isAromaticAtom(X)) return 'Ar';
      if (dbl(X,8)){
        const rest=others.filter(y=>!(Z(y.a)===8 && y.o===2));
        if (rest.some(y=>Z(y.a)===17)) return 'COCl';
        const o=rest.find(y=>Z(y.a)===8);
        if (o){ if (m.getAtomCharge(o.a)<0) return 'COO-'; return H[o.a]>0 ? 'COOH':'COOR'; }
        if (rest.some(y=>Z(y.a)===7)) return 'CONR';
        if (H[X]>0) return 'CHO';
        return 'COR';
      }
      if (nb[X].some(y=>Z(y.a)===7 && y.o===3)) return 'CN';
      if (nb[X].some(y=>Z(y.a)===7 && y.o===2)) return 'C=N';
      if (nb[X].some(y=>Z(y.a)===6 && y.o===2 && y.a!==T)) return 'C=C';
      if (nb[X].some(y=>Z(y.a)===6 && y.o===3)) return 'C#C';
      if (nOf(X,9,T).length>=2) return 'CF3';
      return 'alkyl';
    }
    if (z===8){
      if (m.getAtomCharge(X)<0) return 'O-';
      if (H[X]>0) return 'OH';
      const o=others[0];
      if (o){ if (Z(o.a)===6 && dbl(o.a,8)) return 'OCOR'; if (Z(o.a)===16 && nOf(o.a,8).length>=2) return 'OSO2'; if (m.isAromaticAtom(o.a)) return 'OAr'; }
      return 'OR';
    }
    if (z===7){
      if (m.getAtomCharge(X)>0){ if (nOf(X,8).length>=2) return 'NO2'; return 'N+'; }
      if (m.isAromaticAtom(X)) return 'NAr';
      if (nb[X].some(y=>y.o===2 && y.a!==T)) return 'N=C';
      if (others.some(y=>(Z(y.a)===6 && dbl(y.a,8)) || (Z(y.a)===16 && nOf(y.a,8).length>=1))) return 'NHCOR';
      if (others.some(y=>m.isAromaticAtom(y.a))) return 'NAr';
      return others.length===0 ? 'NH2' : others.length===1 ? 'NHR' : 'NR2';
    }
    if (z===16){ const ox=nb[X].filter(y=>Z(y.a)===8 && y.o===2).length; if (ox>=2) return 'SO2R'; if (ox===1) return 'SOR'; return H[X]>0?'SH':'SR'; }
    return {9:'F',17:'Cl',35:'Br',53:'I',15:'P',14:'Si',5:'B'}[z] || 'X';
  }
  function alkylSubType(X){ // for aromatic ipso increments
    const c=nb[X].filter(y=>Z(y.a)===6).length;
    return c<=1 ? 'CH3' : c===2 ? 'alkyl' : c===3 ? 'CHR2' : 'CR3';
  }
  /* ---------- 13C ---------- */
  function c13sp3(T){
    let d=-2.3; const GP=[0,9.1,9.4,-2.5,0.3];
    const dist=new Map([[T,0]]); let fr=[T];
    for (let k=1;k<=4 && fr.length;k++){
      const nx=[];
      for (const a of fr) for (const y of nb[a]){
        if (dist.has(y.a)) continue; dist.set(y.a,k);
        if (isSp3C[y.a]){ d+=GP[k]; nx.push(y.a); }
        else if (k<=3){ const t=gType(y.a,a); const inc=INC13[t]||INC13.X; d+=inc[k-1]; }
      }
      fr=nx;
    }
    const degT=nb[T].length;
    const CORR={'1,3':-1.1,'1,4':-3.4,'2,3':-2.5,'2,4':-7.2,'3,2':-3.7,'3,3':-9.5,'3,4':-15,'4,1':-1.5,'4,2':-8.4,'4,3':-15,'4,4':-25};
    for (const y of nb[T]) if (isSp3C[y.a]) d+=CORR[degT+','+nb[y.a].length]||0;
    if (m.isRingAtom(T)){ const rs=m.getAtomRingSize(T); d+=({3:-19,4:-3,5:-9,6:-5,7:-1.5})[rs]||0; }
    return d;
  }
  function aromRing(T){
    const rs=m.getRingSet(); let best=null;
    for (let r=0;r<rs.getSize();r++){ if (!rs.isAromatic(r)) continue; const at=rs.getRingAtoms(r); if (!at.includes(T)) continue;
      if (!best || (at.length===6 && best.length!==6) || (at.length===best.length && false)) best=at; }
    return best;
  }
  function ringDist(ring,a,b){ const i=ring.indexOf(a), j=ring.indexOf(b), n=ring.length; const d=Math.abs(i-j); return Math.min(d,n-d); }
  function ringContext(T){
    const ring=aromRing(T); if (!ring) return null;
    const subs=[]; // {pos, type}
    const fusion=[];
    for (const R of ring){
      const p=ringDist(ring,T,R);
      for (const y of nb[R]){
        if (ring.includes(y.a)) continue;
        if (m.isRingAtom(y.a) && m.isAromaticAtom(y.a) && m.isAromaticAtom(R) && m.isRingAtom(R) && m.getBondRingSize(y.b)>0 && m.isAromaticBond(y.b)){ fusion.push(p); continue; }
        let t=gType(y.a,R); if (t==='alkyl') t=alkylSubType(y.a);
        subs.push({p,t});
      }
    }
    const het=ring.filter(a=>Z(a)!==6).map(a=>({p:ringDist(ring,T,a), z:Z(a), h:H[a]>0||nb[a].length>2, a}));
    return {ring,subs,fusion,het};
  }
  function c13arom(T){
    const c=ringContext(T); if (!c) return 128;
    let d;
    if (c.ring.length===6){
      d=128.5;
      const NO=c.het.filter(h=>h.z===7);
      const ortho=NO.filter(h=>h.p===1).length;
      for (const h of NO) d+=[0,21.5,-4.7,7.4][h.p];
      if (ortho>=2) d-=12;
      if (c.fusion.includes(0)) d=133.5 - (NO.length? 4:0)+ (ortho? 14:0);
      for (const p of c.fusion) if (p>0) d+=[0,0.6,-1.1,-1.5][p];
      for (const s of c.subs){ const inc=AR13[s.t]||AR13.X; d+=inc[s.p]; }
    } else {
      const adj=c.het.filter(h=>h.p===1);
      const pyrrol=adj.some(h=>h.z===7 && h.h), pyrid=adj.some(h=>h.z===7 && !h.h), O=adj.some(h=>h.z===8), Sx=adj.some(h=>h.z===16);
      if (O && pyrid) d=151; else if (Sx && pyrid) d=153; else if (pyrrol && pyrid) d=136; else if (O) d=142.8; else if (Sx) d=125.6; else if (pyrid) d=135; else if (pyrrol) d=119;
      else { const any=c.het[0]; d = !any ? 120 : any.z===8 ? 110 : any.z===16 ? 127 : c.het.some(h=>h.z===7&&!h.h) ? 122 : 108; }
      if (c.fusion.includes(0)) d=c.het.some(h=>h.p===1) ? 136 : 128;
      for (const s of c.subs){ const inc=AR13[s.t]||AR13.X; d+=inc[Math.min(s.p,3)]*(s.p===0?0.8:0.6); }
    }
    return d;
  }
  function c13alkene(T){
    const P=nb[T].find(y=>Z(y.a)===6 && y.o===2).a;
    let d=123.3;
    for (const y of nb[T]){ if (y.a===P) continue;
      if (isSp3C[y.a]){ d+=10.6; for (const w of nb[y.a]) if (w.a!==T){ if (isSp3C[w.a]) { d+=7.2; for (const v of nb[w.a]) if (v.a!==y.a && isSp3C[v.a]) d-=1.5; } } }
      else { const t=gType(y.a,T); d+=(ALK13[t]||ALK13.X)[0]; } }
    for (const y of nb[P]){ if (y.a===T) continue;
      if (isSp3C[y.a]){ d-=7.9; for (const w of nb[y.a]) if (w.a!==P && isSp3C[w.a]) d-=1.8; }
      else { const t=gType(y.a,P); d+=(ALK13[t]||ALK13.X)[1]; } }
    return d;
  }
  function c13carbonyl(T){
    const rest=nb[T].filter(y=>!(Z(y.a)===8 && y.o===2));
    const conj=rest.some(y=>Z(y.a)===6 && (m.isAromaticAtom(y.a) || nb[y.a].some(w=>w.o===2&&w.a!==T)));
    const types=rest.map(y=>Z(y.a));
    const hasO=rest.filter(y=>Z(y.a)===8), hasN=rest.filter(y=>Z(y.a)===7), hasC=rest.filter(y=>Z(y.a)===6);
    if (hasO.length===2) return 155;
    if (hasN.length && hasO.length) return 156.5;
    if (hasN.length===2) return 158.5;
    if (types.includes(17)) return 170;
    if (types.includes(16)) return 196;
    if (hasO.length===1){
      const o=hasO[0].a; if (H[T]>0) return H[o]>0?166:161;
      if (m.getAtomCharge(o)<0) return conj?175:181;
      if (nb[o].some(w=>w.a!==T && Z(w.a)===6 && dbl(w.a,8))) return 167;
      return H[o]>0 ? (conj?172:178) : (conj?166.5:171);
    }
    if (hasN.length===1){ if (H[T]>0) return 163; return conj?168:172.5; }
    if (H[T]>0) return hasC.length? (conj?192:200.5) : 197;
    let d=207; for (const y of hasC) if (m.isAromaticAtom(y.a) || nb[y.a].some(w=>w.o===2)) d-=6;
    if (m.isRingAtom(T)){ const rs=m.getAtomRingSize(T); d+=({4:1,5:12,6:4,7:8})[rs]||0; }
    return d;
  }
  function c13(T){
    if (Z(T)!==6) return null;
    if (m.isAromaticAtom(T)) return c13arom(T);
    if (dbl(T,8)) return c13carbonyl(T);
    if (nb[T].some(y=>Z(y.a)===7 && y.o===3)) return nb[T].some(y=>m.isAromaticAtom(y.a))?119:118.5;
    if (dbl(T,7)){ const n=nb[T].find(y=>Z(y.a)===7&&y.o===2).a; return nb[n].some(w=>Z(w.a)===8)?155:162; }
    if (dbl(T,16)) return 200;
    const tri=nb[T].find(y=>Z(y.a)===6 && y.o===3);
    if (tri){ const other=nb[T].find(y=>y.a!==tri.a); const pH=H[tri.a]>0;
      if (!other) return nb[tri.a].some(w=>w.a!==T && m.isAromaticAtom(w.a)) ? 77.2 : 68.8;
      if (m.isAromaticAtom(other.a)) return pH?83.5:89; return pH?84:80; }
    if (nb[T].some(y=>Z(y.a)===6 && y.o===2)) return c13alkene(T);
    if (nb[T].some(y=>y.o===2)) return 140;
    return c13sp3(T);
  }
  /* ---------- 1H ---------- */
  function betaSum(C, T){ let s=0; for (const y of nb[C]){ if (y.a===T || isSp3C[y.a]) continue; const t=gType(y.a,C); s+=B1H[t]||0.2; } return s; }
  function h1sp3(T){
    const h=H[T], subs=nb[T];
    let d;
    if (h>=4) return 0.23;
    if (subs.length===1){
      const y=subs[0];
      if (isSp3C[y.a]) d=0.9+betaSum(y.a,T); else { const t=gType(y.a,T); d=CH3X[t]||1.5; if ((t==='COR'||t==='CHO') && nb[y.a].some(w=>w.a!==T && Z(w.a)===6 && (m.isAromaticAtom(w.a)||nb[w.a].some(v=>v.o===2&&Z(v.a)===6&&v.a!==y.a)))) d+=0.4; /* aryl/vinyl ketone */ }
      return d;
    }
    let s=0.23, het=0;
    for (const y of subs){ if (isSp3C[y.a]){ s+=0.55+betaSum(y.a,T)*0.8; } else { const t=gType(y.a,T); s+=SIG[t]??1.0; if (!['alkyl','Ar','C=C','C#C'].includes(t)) het++; } }
    if (h===1) s-=0.2*het;
    if (s>4) s=4+(s-4)*0.65;
    if (m.isRingAtom(T) && m.getAtomRingSize(T)===3) s-=1.0;
    return s;
  }
  function h1arom(T){
    const c=ringContext(T); if (!c) return 7.3;
    let d;
    if (c.ring.length===6){
      d=7.27;
      for (const hN of c.het.filter(x=>x.z===7)) d+=[0,1.33,-0.02,0.37][hN.p];
      for (const p of c.fusion) d+=[0,0.4,0.15,0.05][p]||0;
      for (const s of c.subs){ if (s.p===0) continue; const z=ZAR[s.t]||ZAR.X; d+=z[s.p-1]; }
    } else {
      const adj=c.het.filter(x=>x.p===1);
      const pyrrol=adj.some(x=>x.z===7&&x.h), pyrid=adj.some(x=>x.z===7&&!x.h), O=adj.some(x=>x.z===8), Sx=adj.some(x=>x.z===16);
      if (pyrrol&&pyrid) d=7.7; else if ((O||Sx)&&pyrid) d=8.0; else if (O) d=7.42; else if (Sx) d=7.33; else if (pyrid) d=7.55; else if (pyrrol) d=6.7;
      else { const any=c.het[0]; d= !any?7.0 : any.z===8?6.38 : any.z===16?7.12 : c.het.some(x=>x.z===7&&!x.h)?7.1 : 6.22; }
      if (c.fusion.length) d+=0.2;
      for (const s of c.subs){ if (s.p===0) continue; const z=ZAR[s.t]||ZAR.X; d+=z[Math.min(s.p,3)-1]*0.7; }
    }
    return d;
  }
  function sideOf(T,P,X){ const ux=m.getAtomX(P)-m.getAtomX(T), uy=m.getAtomY(P)-m.getAtomY(T); const vx=m.getAtomX(X)-m.getAtomX(T), vy=m.getAtomY(X)-m.getAtomY(T); return Math.sign(ux*vy-uy*vx)||1; }
  function alkTypeOn(y, from){ if (isSp3C[y]){ return nb[y].some(w=>w.a!==from && [7,8,9,17,35,53,16].includes(Z(w.a))) ? 'CH2X':'alkyl'; } return gType(y,from); }
  function h1alkene(T){ // returns array of {side, shift}
    const P=nb[T].find(y=>Z(y.a)===6 && y.o===2).a;
    const subT=nb[T].filter(y=>y.a!==P), subP=nb[P].filter(y=>y.a!==T);
    let gem=0; for (const y of subT) gem+=(ZALK[alkTypeOn(y.a,T)]||ZALK.X)[0];
    const occupied=subT.map(y=>sideOf(T,P,y.a));
    const sides = H[T]>=2 ? [1,-1] : [occupied.length? -occupied[0] : 1];
    return sides.map(sd=>{ let d=5.25+gem; for (const y of subP){ const z=ZALK[alkTypeOn(y.a,P)]||ZALK.X; d+= sideOf(T,P,y.a)===sd ? z[1] : z[2]; } return {side:sd, shift:d, P, subP}; });
  }
  function exchange(X){
    const z=Z(X);
    if (z===8){ const o=nb[X][0]; if (!o) return {s:4.8,t:'H2O'};
      if (Z(o.a)===6 && dbl(o.a,8)) return {s:11.5,t:'COOH'};
      if (m.isAromaticAtom(o.a)) return {s:5.5,t:'ArOH'};
      if (Z(o.a)===7) return {s:9.5,t:'NOH'};
      return {s:2.0,t:'OH'}; }
    if (z===7){
      if (m.getAtomCharge(X)>0) return {s:7.8,t:'NH+'};
      if (m.isAromaticAtom(X)) return {s: nb[X].some(y=>m.isRingAtom(y.a)&&m.getAtomRingSize(X)===5 && nb[X].length===2 && c5imid(X)) ? 11.5 : 8.1, t:'NH'};
      if (nb[X].some(y=>Z(y.a)===6 && dbl(y.a,8))){ const ar=nb[X].some(y=>m.isAromaticAtom(y.a)); return {s: H[X]>=2?6.2 : ar?7.6:6.0, t:'NHC(O)'}; }
      if (nb[X].some(y=>Z(y.a)===16)) return {s:4.8,t:'NHSO2'};
      if (nb[X].some(y=>m.isAromaticAtom(y.a))) return {s:3.6,t:'ArNH'};
      return {s:1.3,t:'NH'}; }
    if (z===16) return {s: nb[X].some(y=>m.isAromaticAtom(y.a))?3.4:1.4, t:'SH'};
    return {s:1.0,t:'XH'};
  }
  function c5imid(X){ const ring=aromRing(X); return ring && ring.filter(a=>Z(a)===7).length>=2; }
  /* ---------- couplings ---------- */
  function couplings(T, side){
    const out=[]; const rT=m.getSymmetryRank(T);
    const z=Z(T);
    if (z!==6) return out;
    if (m.isAromaticAtom(T)){
      const ring=aromRing(T)||[]; const n5=ring.length===5;
      for (const y of nb[T]) if (ring.includes(y.a) && Z(y.a)===6 && H[y.a]>0 && m.getSymmetryRank(y.a)!==rT){
        const nearN = nb[T].some(w=>Z(w.a)===7&&ring.includes(w.a)) || nb[y.a].some(w=>Z(w.a)===7&&ring.includes(w.a));
        out.push(n5?3.5: nearN?4.9:7.8); }
      return out;
    }
    const alkP=nb[T].find(y=>Z(y.a)===6 && y.o===2 && !m.isAromaticBond(y.b));
    if (alkP){
      const P=alkP.a;
      if (H[P]>0){
        // hydrogens on partner: work out on which side they sit
        const subP=nb[P].filter(y=>y.a!==T); const occ=subP.map(y=>sideOf(T,P,y.a));
        const pSides = H[P]>=2 ? [1,-1] : [occ.length? -occ[0] : 1];
        for (const ps of pSides) out.push(ps===side ? 10.5 : 17.0);
      }
      if (H[T]>=2) out.push(1.5);
      for (const y of nb[T]) if (y.a!==P && isSp3C[y.a] && H[y.a]>0) for (let k=0;k<H[y.a];k++) out.push(6.8);
      return out;
    }
    if (dbl(T,8)){ for (const y of nb[T]) if (Z(y.a)===6 && H[y.a]>0){ const sp3=isSp3C[y.a]; for (let k=0;k<H[y.a];k++) out.push(sp3?1.8:7.8); } return out; }
    if (isSp3C[T]){
      for (const y of nb[T]){
        if (Z(y.a)!==6 || H[y.a]===0 || m.getSymmetryRank(y.a)===rT) continue;
        if (m.isAromaticAtom(y.a)) continue;
        if (dbl(y.a,8)){ out.push(1.8); continue; }
        const sp2 = nb[y.a].some(w=>w.o===2);
        for (let k=0;k<H[y.a];k++) out.push(sp2?6.8:7.0);
      }
    }
    return out;
  }
  const LET={1:'d',2:'t',3:'q',4:'p',5:'sext',6:'sept'};
  function multiplet(js){
    if (!js.length) return {m:'s', J:[], groups:[]};
    const sorted=[...js].sort((a,b)=>b-a); const groups=[];
    for (const j of sorted){ const g=groups.find(g=>Math.abs(g.J-j)<0.7); if (g) g.n++; else groups.push({J:j,n:1}); }
    if (groups.length>3 || groups.some(g=>g.n>6)) return {m:'m', J:[], groups};
    return {m:groups.map(g=>LET[g.n]).join(''), J:groups.map(g=>g.J), groups};
  }
  /* ---------- driver ---------- */
  function predict(mol){
    setup(mol);
    const n=m.getAtoms();
    const carbons=new Map(), protons=new Map();
    for (let i=0;i<n;i++){
      const z=Z(i), rank=m.getSymmetryRank(i);
      if (z===6){
        let s=null; try{ s=c13(i); }catch(e){}
        if (s!=null){ const k='c'+rank; const g=carbons.get(k)||{shift:s, atoms:[], H:H[i]}; g.atoms.push(i); carbons.set(k,g); }
      }
      if (H[i]>0){
        if (z===6){
          let entries;
          if (m.isAromaticAtom(i)) entries=[{side:0, shift:h1arom(i), n:H[i]}];
          else if (nb[i].some(y=>Z(y.a)===6 && y.o===2 && !m.isAromaticBond(y.b))) entries=h1alkene(i).map(e=>({...e,n: H[i]>=2?1:H[i]}));
          else if (dbl(i,8)){ const others=nb[i].filter(y=>!(Z(y.a)===8&&y.o===2)); const o=others[0];
            const s = !o ? 9.6 : Z(o.a)===8 ? 8.05 : Z(o.a)===7 ? 8.1 : m.isAromaticAtom(o.a) ? 9.95 : nb[o.a].some(w=>w.o===2) ? 9.5 : 9.75; entries=[{side:0,shift:s,n:H[i]}]; }
          else if (dbl(i,7)) entries=[{side:0,shift:8.2,n:H[i]}];
          else if (nb[i].some(y=>y.o===3)){ const t=nb[i].find(y=>y.o===3).a; const o=nb[t].find(w=>w.a!==i); entries=[{side:0, shift: o && (m.isAromaticAtom(o.a)||dbl(o.a,8)) ? 3.05 : 1.95, n:H[i]}]; }
          else entries=[{side:0, shift:h1sp3(i), n:H[i]}];
          for (const e of entries){
            const js=couplings(i,e.side); const mu=multiplet(js);
            const k='h'+rank+'_'+e.side;
            const g=protons.get(k)||{shift:e.shift, n:0, atoms:[], mult:mu.m, J:mu.J, groups:mu.groups, exch:false, kind: H[i]===3?'CH3':H[i]===2?'CH2':'CH'};
            g.n+=e.n; g.atoms.push(i); protons.set(k,g);
          }
        } else {
          const ex=exchange(i); const k='x'+rank;
          const g=protons.get(k)||{shift:ex.s, n:0, atoms:[], mult:'br s', J:[], groups:[], exch:true, kind:ex.t};
          g.n+=H[i]; g.atoms.push(i); protons.set(k,g);
        }
      }
    }
    const H1=[...protons.values()].map(g=>({...g, shift:Math.round(g.shift*100)/100})).sort((a,b)=>b.shift-a.shift);
    const C13=[...carbons.values()].map(g=>({...g, shift:Math.round(g.shift*10)/10})).sort((a,b)=>b.shift-a.shift);
    return {H1, C13};
  }
  function lines(group, mhz=400){ // first-order multiplet line positions (ppm) and intensities
    let L=[{d:0,i:1}];
    for (const g of group.groups||[]) for (let k=0;k<g.n;k++){ const nx=[]; for (const l of L){ nx.push({d:l.d-g.J/2,i:l.i/2}); nx.push({d:l.d+g.J/2,i:l.i/2}); } L=nx; }
    return L.map(l=>({ppm:group.shift+l.d/mhz, i:l.i*group.n}));
  }
  function journalText(res){
    const h=res.H1.map(g=>{ const j=g.J.length? `, J = ${g.J.map(x=>x.toFixed(1)).join(', ')} Hz` : ''; return `${g.shift.toFixed(2)} (${g.mult}${j}, ${g.n}H)`; }).join(', ');
    const c=res.C13.map(g=>g.shift.toFixed(1)).join(', ');
    return `\u00B9H NMR (400 MHz, predicted): \u03B4 ${h}.\n\u00B9\u00B3C NMR (101 MHz, predicted): \u03B4 ${c}.`;
  }
  /* ================= pKa and BDE estimates =================
     pKa: class base values (Evans/Ripin table; Bordwell & Reich DMSO compilation; Williams water table),
     Hammett σ corrections for aromatic acids/bases, Perrin-style inductive attenuation for aliphatic sites.
     BDE: Blanksby & Ellison, Acc. Chem. Res. 2003, 36, 255 (R–H and key R–X), Sanderson/Reusch matrix for other R–X. */
  const HS = { // [σm, σp, σp− (for phenol/aniline-type), σp+ (radical/cation)]
    CH3:[-0.07,-0.17,-0.17,-0.31], alkyl:[-0.07,-0.15,-0.15,-0.30], CHR2:[-0.07,-0.15,-0.15,-0.28], CR3:[-0.10,-0.20,-0.20,-0.26], Ar:[0.06,-0.01,0.02,-0.18],
    CF3:[0.43,0.54,0.65,0.61], 'C=C':[0.06,-0.04,0.0,-0.16], 'C#C':[0.21,0.23,0.53,0.18], CHO:[0.35,0.42,1.03,0.73], COR:[0.38,0.50,0.84,0.50], COOH:[0.37,0.45,0.77,0.42],
    'COO-':[-0.1,0.0,0.31,-0.02], COOR:[0.37,0.45,0.64,0.49], CONR:[0.28,0.36,0.62,0.30], COCl:[0.51,0.61,1.24,0.6], CN:[0.56,0.66,1.00,0.66], 'C=N':[0.2,0.3,0.6,0.2],
    OH:[0.12,-0.37,-0.37,-0.92], 'O-':[-0.47,-0.81,-0.81,-2.3], OR:[0.12,-0.27,-0.26,-0.78], OAr:[0.25,-0.03,-0.03,-0.5], OCOR:[0.39,0.31,0.31,0.0], OSO2:[0.39,0.36,0.36,0.3],
    NH2:[-0.16,-0.66,-0.15,-1.3], NHR:[-0.21,-0.70,-0.2,-1.5], NR2:[-0.15,-0.83,-0.12,-1.7], NAr:[-0.15,-0.6,-0.1,-1.4], NHCOR:[0.21,0.0,-0.46,-0.6], 'N+':[0.88,0.82,0.77,0.41],
    NO2:[0.71,0.78,1.27,0.79], 'N=C':[0.1,-0.1,-0.1,-0.3], F:[0.34,0.06,-0.03,-0.07], Cl:[0.37,0.23,0.19,0.11], Br:[0.39,0.23,0.25,0.15], I:[0.35,0.18,0.27,0.14],
    SH:[0.25,0.15,0.15,-0.03], SR:[0.15,0.0,0.06,-0.60], SOR:[0.52,0.49,0.73,0.5], SO2R:[0.60,0.72,1.13,0.7], P:[0.1,0.1,0.2,0.1], Si:[-0.04,-0.07,-0.07,0.0], B:[0,0.1,0.3,0], X:[0,0,0,0] };
  function ringSubs(R0){ // substituents on the aromatic ring bearing R0, with positions
    const ring=aromRing(R0); if(!ring) return {ring:null, subs:[], het:[]};
    const subs=[]; const het=[];
    for (const R of ring){ const p=ringDist(ring,R0,R);
      if (R!==R0 && Z(R)!==6) het.push({p,z:Z(R),h:H[R]>0||nb[R].length>2});
      if (p===0) continue;
      for (const y of nb[R]){ if (ring.includes(y.a)) continue;
        if (m.isAromaticAtom(y.a) && m.isAromaticBond(y.b)) { subs.push({p,t:'fused'}); continue; }
        let t=gType(y.a,R); if (t==='alkyl') t=alkylSubType(y.a); subs.push({p,t}); } }
    return {ring,subs,het};
  }
  function sigmaSum(R0, mode){ // mode 2 = σ−, 3 = σ+
    const {subs}=ringSubs(R0); let s=0;
    for (const x of subs){ if (x.t==='fused'){ s+=0.05; continue; } const v=HS[x.t]||HS.X; s+= x.p===2 ? v[0] : x.p===1 ? 0.8*v[mode||1] : x.p===3 ? v[mode||1] : 0; }
    return s;
  }
  // Perrin-style inductive term: sum of group strengths attenuated 0.4 per bond beyond 3 bonds from the acidic atom
  function inductive(A, exclude, ionize){
    const dist=new Map([[A,0]]), paths=new Map([[A,1]]), parent=new Map(); let fr=[A];
    for (let k=1;k<=7 && fr.length;k++){ const nx=[];
      for (const a of fr) for (const y of nb[a]){
        if (!dist.has(y.a)){ dist.set(y.a,k); paths.set(y.a,paths.get(a)); parent.set(y.a,a); nx.push(y.a); }
        else if (dist.get(y.a)===k) paths.set(y.a,paths.get(y.a)+paths.get(a)); }
      fr=nx; }
    const contrib=[];
    for (const [Y,n] of dist){
      if (n<2 || exclude.has(Y)) continue;
      const z=Z(Y), par=parent.get(Y); let k=0;
      if (z===9) k=2.2; else if (z===17) k=1.9; else if (z===35) k=1.9; else if (z===53) k=1.6;
      else if (z===8){ if (dbl(par,8) && Z(par)!==6) k=0; else if (nb[Y].some(w=>w.o===2)) k=0; else if (m.getAtomCharge(Y)<0) k=-0.6; else k = H[Y]>0 ? 0.9 : 1.2; if (Z(par)===6 && dbl(par,8)) k=0; }
      else if (z===7){ if (m.getAtomCharge(Y)>0) k = nOf(Y,8).length>=2 ? 3.1 : 2.4;
        else if (m.isAromaticAtom(Y)) k=0.8;
        else if (nb[Y].some(w=>Z(w.a)===6 && dbl(w.a,8))) k=0.8;
        else if (nb[Y].some(w=>w.o===3)) k=0;
        else k = ionize==='acid' ? 2.4 : 0.6; }
      else if (z===6){
        if (dbl(Y,8)){ const o=nb[Y].find(w=>Z(w.a)===8 && w.o===1); const nN=nb[Y].some(w=>Z(w.a)===7);
          if (o){ const anion = m.getAtomCharge(o.a)<0 || (ionize==='base' && H[o.a]>0); k = anion ? 0.4 : 1.9; } else k = nN ? 1.0 : 1.2; }
        else if (nb[Y].some(w=>Z(w.a)===7 && w.o===3)) k=2.3;
        else if (m.isAromaticAtom(Y) && !m.isAromaticAtom(par)) k=0.45;
        else if (!m.isAromaticAtom(Y) && nb[Y].some(w=>w.o===2 && Z(w.a)===6) && !nb[par].some(w=>w.a===Y && w.o===2)) k = isSp3C[par]||par===A ? 0.5 : 0;
        else if (nb[Y].some(w=>w.o===3 && Z(w.a)===6) && isSp3C[par]) k=0.9;
      }
      else if (z===16){ const ox=nb[Y].filter(w=>Z(w.a)===8 && w.o===2).length; k = m.getAtomCharge(Y)>0 ? 2.6 : ox>=2 ? 2.4 : ox===1 ? 1.8 : 1.1; }
      else if (z===15 && m.getAtomCharge(Y)>0) k=2.0;
      if (!k) continue;
      const w = n===2 ? 2.5 : Math.pow(0.4,n-3);
      const pm = Math.min(2, paths.get(Y));
      contrib.push(k*w*pm);
    }
    contrib.sort((a,b)=>Math.abs(b)-Math.abs(a));
    const W=[1,0.85,0.5,0.35,0.25,0.2,0.15]; let s=0; contrib.forEach((c,i)=>s+=c*(W[i]??0.1));
    return s;
  }
  const r1=v=>v==null?null:Math.round(v*10)/10;
  function heteroRing5(A){ const ring=aromRing(A); if (!ring || ring.length!==5) return null;
    const ns=ring.filter(a=>Z(a)===7).length, os=ring.some(a=>Z(a)===8), ss=ring.some(a=>Z(a)===16);
    const fused=ring.some(a=>nb[a].some(y=>!ring.includes(y.a) && m.isAromaticAtom(y.a) && m.isAromaticBond(y.b)));
    const adjN=nb[A].filter(y=>ring.includes(y.a) && Z(y.a)===7).length;
    return {ring, ns, os, ss, fused, adjN}; }
  function acidSite(A){
    const z=Z(A), others=nb[A];
    if (z===8){
      const x=others[0];
      if (!x) return {cls:'Water', w:15.7, d:31.4, ref:'Evans'};
      const zx=Z(x.a);
      if (zx===6 && dbl(x.a,8)){
        const rest=nb[x.a].filter(y=>y.a!==A && !(Z(y.a)===8 && y.o===2));
        if (!rest.length) return {cls:'Formic acid', w:3.75, d:null, ref:'Williams'};
        const R=rest[0].a;
        if (Z(R)===6 && m.isAromaticAtom(R)){ const s=sigmaSum(R,1); return {cls:'Benzoic acid', w:4.20-1.00*s, d:11.1-2.4*s, ref:'Hammett, ρ = 1.00', corr:s}; }
        if (Z(R)===7) return {cls:'Carbamic acid', w:5.0, d:null, ref:'estimate'};
        if (Z(R)===8) return {cls:'Carbonic acid monoester', w:4.5, d:null, ref:'estimate'};
        const ex=new Set([A,x.a,...nb[x.a].map(y=>y.a).filter(a=>Z(a)===8)]);
        const conj = Z(R)===6 && nb[R].some(w=>w.o===2 && Z(w.a)===6);
        const ind=inductive(A, ex, 'acid');
        const base = conj ? 4.25 : 4.76;
        return {cls: conj?'α,β-Unsaturated carboxylic acid':'Carboxylic acid', w:base-ind, d:12.3-ind*1.6, ref:'Evans/Williams with inductive correction', corr:ind};
      }
      if (zx===6 && m.isAromaticAtom(x.a)){ const s=sigmaSum(x.a,2); return {cls:'Phenol', w:9.99-2.23*s, d:18.0-5.7*s, ref:'Hammett, ρ = 2.23 (σ⁻ for para acceptors)', corr:s}; }
      if (zx===6 && nb[x.a].some(w=>w.o===2 && Z(w.a)===6)) return {cls:'Enol', w:10.5, d:null, ref:'estimate'};
      if (zx===16) return {cls:'Sulfonic/sulfinic acid', w: nOf(x.a,8).length>=3 ? -1.9 : 2.0, d: nOf(x.a,8).length>=3 ? 1.6 : null, ref:'Evans'};
      if (zx===15) return {cls:'Phosphoric/phosphonic acid (first)', w:2.1, d:null, ref:'Williams'};
      if (zx===5) return {cls:'Boronic acid (Lewis acid)', w:8.8, d:null, ref:'Williams'};
      if (zx===8) return {cls:'Hydroperoxide', w:11.5, d:null, ref:'Evans'};
      if (zx===7){ const N=x.a; if (nb[N].some(w=>Z(w.a)===6 && dbl(w.a,8))) return {cls:'Hydroxamic acid / N-hydroxy imide', w: nb[N].filter(w=>Z(w.a)===6&&dbl(w.a,8)).length>=2 ? 6.0 : 8.8, d:18.5, ref:'Evans'};
        if (nb[N].some(w=>w.o===2)) return {cls:'Oxime', w:11.3, d:20.1, ref:'Evans/Bordwell'}; return {cls:'Hydroxylamine O–H', w:13.7, d:null, ref:'estimate'}; }
      if (zx===14) return {cls:'Silanol', w:11.0, d:null, ref:'estimate'};
      if (zx===6){ const deg=nb[x.a].length;
        const base=[null,{w:15.5,d:29.0},{w:16.0,d:29.8},{w:16.5,d:29.3},{w:17.0,d:32.2}][Math.min(4,deg)]||{w:16,d:29.8};
        const ind=inductive(A,new Set([A]),'acid');
        return {cls: deg===1?'Methanol-type alcohol':deg===2?'Primary alcohol':deg===3?'Secondary alcohol':'Tertiary alcohol', w:base.w-0.75*ind, d:base.d-1.3*ind, ref:'Evans with inductive correction', corr:ind}; }
      return {cls:'O–H', w:15, d:null, ref:'estimate'};
    }
    if (z===16){
      const x=others[0]; if (!x) return {cls:'H₂S', w:7.0, d:null, ref:'Williams'};
      if (dbl(x.a,8)) return {cls:'Thioacid', w:3.5, d:null, ref:'estimate'};
      if (m.isAromaticAtom(x.a)){ const s=sigmaSum(x.a,2); return {cls:'Thiophenol', w:6.6-2.2*s, d:10.3-3.5*s, ref:'Evans with Hammett correction', corr:s}; }
      const ind=inductive(A,new Set([A]),'acid'); return {cls:'Thiol', w:10.5-0.8*ind, d:17.0-1.2*ind, ref:'Evans/Bordwell', corr:ind};
    }
    if (z===7){
      if (m.getAtomCharge(A)>0) return null; // handled as conjugate acid
      const acyl=others.filter(y=>Z(y.a)===6 && dbl(y.a,8)), sulf=others.filter(y=>Z(y.a)===16 && nOf(y.a,8).length>=2);
      if (m.isAromaticAtom(A)){ const r=heteroRing5(A); if (r){
          if (r.ns>=4) return {cls:'Tetrazole N–H', w:4.9, d:null, ref:'Williams'};
          if (r.ns===3) return {cls:'Triazole N–H', w:9.3, d:13.9, ref:'Evans/Bordwell'};
          if (r.ns===2) return r.adjN ? {cls:'Pyrazole N–H', w:14.2, d:19.8, ref:'Bordwell'} : (r.fused ? {cls:'Benzimidazole N–H', w:12.8, d:16.4, ref:'Bordwell'} : {cls:'Imidazole N–H', w:14.4, d:18.6, ref:'Evans/Bordwell'});
          const benzo=r.ring.filter(a=>nb[a].some(y=>!r.ring.includes(y.a)&&m.isAromaticAtom(y.a)&&m.isAromaticBond(y.b))).length;
          if (benzo>=4) return {cls:'Carbazole N–H', w:null, d:19.9, ref:'Bordwell'};
          return r.fused ? {cls:'Indole N–H', w:16.2, d:21.0, ref:'Evans/Bordwell'} : {cls:'Pyrrole N–H', w:17.5, d:23.0, ref:'Evans/Bordwell'}; }
        return {cls:'Aromatic N–H', w:null, d:null}; }
      if (sulf.length) return acyl.length ? {cls:'N-Acyl sulfonamide', w:4.5, d:null, ref:'estimate'} : {cls:'Sulfonamide N–H', w:10.1, d:16.1, ref:'Evans/Bordwell'};
      if (acyl.length>=2) return nb[A].some(y=>m.isRingAtom(y.a)) && acyl.every(y=>m.isRingAtom(y.a)) ? {cls:'Cyclic imide', w:9.6, d:14.7, ref:'Evans/Bordwell (succinimide)'} : {cls:'Imide', w:11.0, d:17.9, ref:'Evans (diacetamide)'};
      if (acyl.length===1){ const C=acyl[0].a; const ox=nb[C].some(w=>Z(w.a)===8 && w.o===1), nn=nb[C].filter(w=>Z(w.a)===7).length>=2;
        if (nn) return {cls:'Urea N–H', w:null, d:26.9, ref:'Bordwell'};
        if (ox) return {cls:'Carbamate N–H', w:null, d:24.8, ref:'Bordwell'};
        if (others.some(y=>m.isAromaticAtom(y.a))) return {cls:'Anilide N–H', w:null, d:21.5, ref:'Bordwell'};
        const ar=nb[C].some(w=>m.isAromaticAtom(w.a));
        return {cls: H[A]>=2 ? (ar?'Benzamide N–H':'Primary amide N–H') : 'Secondary amide N–H', w: H[A]>=2?15.1:null, d: ar?23.3:(H[A]>=2?25.5:26.0), ref:'Evans/Bordwell'}; }
      if (others.some(y=>m.isAromaticAtom(y.a))){ const ar=others.find(y=>m.isAromaticAtom(y.a)).a; const s=sigmaSum(ar,2);
        const two=others.filter(y=>m.isAromaticAtom(y.a)).length>=2;
        return {cls: two?'Diarylamine N–H':'Aniline N–H', w:null, d:(two?25.0:30.6)-7.6*s, ref:'Bordwell with Hammett correction', corr:s}; }
      if (!others.length) return {cls:'Ammonia', w:38, d:41, ref:'Evans'};
      return {cls:'Amine N–H', w:null, d:null, thf:36, ref:'Evans (iPr₂NH ≈ 36 in THF)'};
    }
    if (z===6){
      if (others.some(y=>y.o===3)) { const o=others.find(y=>y.o===3).a; const ar=nb[o].some(w=>w.a!==A && m.isAromaticAtom(w.a)); return {cls:'Terminal alkyne C–H', w:25, d:ar?28.8:29.5, ref:'Evans/Bordwell'}; }
      if (m.isAromaticAtom(A)) return {cls:'Aromatic C–H', w:43, d:44, ref:'Evans (extrapolated)', weak:true};
      if (dbl(A,8)) return {cls:'Aldehyde C–H (not acidic)', w:null, d:null, weak:true};
      if (others.some(y=>y.o===2)) return {cls:'Vinylic C–H', w:44, d:null, ref:'Evans (extrapolated)', weak:true};
      // sp3 carbon acid
      if (m.isRingAtom(A) && m.getAtomRingSize(A)===5){ const rn=others.filter(y=>m.isRingAtom(y.a) && (m.isAromaticAtom(y.a) || nb[y.a].some(w=>w.o===2 && Z(w.a)===6 && w.a!==A)));
        if (rn.length===2){ const arom=rn.filter(y=>m.isAromaticAtom(y.a)).length; return {cls: arom===2?'Fluorene-type C–H':arom===1?'Indene-type C–H':'Cyclopentadiene C–H', w: arom?null:16, d:18.0+2.3*arom, ref:'Bordwell'}; } }
      const POW={COR:29.5, ArCOR:31.3, CHO:30, COOR:25.7, COOH:21, 'COO-':15, CONR:21, COCl:31, CN:24.7, NO2:38.8, SO2R:24.9, SOR:20.9, Ar:13, 'C=C':12, 'C#C':14, 'C=N':24, SR:14, OR:7, OAr:7, OH:5, OCOR:6, F:3, Cl:6, Br:6, I:6, 'N+':14, Si:4};
      const SEC={COR:.45, ArCOR:.45, CHO:.45, COOR:.54, CONR:.5, CN:.82, NO2:.5, SO2R:.6, SOR:.6, Ar:.75, 'C=C':.7, SR:.6};
      const BASEW={COR:19.3, ArCOR:18.3, CHO:16.7, COOR:25.6, CN:25, NO2:10.2, SO2R:28, SOR:35, Ar:41, 'C=C':43};
      const groups=[]; let alk=0;
      for (const y of others){ if (isSp3C[y.a]){ alk++; continue; }
        let t=gType(y.a,A); if (t==='COR' && nb[y.a].some(w=>w.a!==A && m.isAromaticAtom(w.a))) t='ArCOR';
        if (Z(y.a)===15 && m.getAtomCharge(y.a)>0) { groups.push({t:'P+',p:33.6}); continue; }
        if (Z(y.a)===16 && m.getAtomCharge(y.a)>0) { groups.push({t:'S+',p:37.8}); continue; }
        if (POW[t]!=null) groups.push({t,p:POW[t]}); }
      groups.sort((a,b)=>b.p-a.p);
      let d=56 - alk*(groups.length?-1.0:2.5);
      if (!groups.length){ const w=[48,50,51,53][Math.min(3,alk)]; return {cls:['Methane','Primary alkane','Secondary alkane','Tertiary alkane'][Math.min(3,alk)]+' C–H', w, d: alk===0?56:null, ref:'Evans (extrapolated)', weak:true}; }
      d=56 + alk*1.0;
      groups.forEach((g,i)=>{ d -= g.p * (i===0?1 : i===1 ? (SEC[g.t]??0.5) : 0.15); });
      const names={COR:'ketone',ArCOR:'aryl ketone',CHO:'aldehyde',COOR:'ester',COOH:'carboxylic acid',CONR:'amide',CN:'nitrile',NO2:'nitro',SO2R:'sulfone',SOR:'sulfoxide',Ar:'aryl',  'C=C':'alkene','C#C':'alkyne','C=N':'imine',SR:'sulfide',OR:'ether',OAr:'aryl ether',OH:'hydroxyl',OCOR:'acyloxy',F:'F',Cl:'Cl',Br:'Br',I:'I','N+':'ammonium','P+':'phosphonium','S+':'sulfonium','COO-':'carboxylate',COCl:'acyl chloride',Si:'silyl'};
      const desc='C–H α to '+groups.map(g=>names[g.t]||g.t).join(' and ');
      let w=null;
      if (groups.length===1 && BASEW[groups[0].t]!=null) w=BASEW[groups[0].t]+alk*0.8;
      else if (groups.length>=2 && groups.some(g=>['COR','ArCOR','CHO','COOR','CONR','NO2'].includes(g.t))) w=d-0.27*d;
      return {cls:desc, w, d, ref: groups.length>1 ? 'Bordwell DMSO data with additive stabilization (estimate)' : 'Evans/Bordwell', est:groups.length>1};
    }
    return {cls:'X–H', w:null, d:null};
  }
  function baseSite(A){ // pKa of the conjugate acid (pKaH), water
    const z=Z(A), others=nb[A];
    if (z===7){
      if (others.some(y=>y.o===3)) return {cls:'Nitrile N', w:-10, ref:'Evans'};
      if (others.some(y=>Z(y.a)===16 && nOf(y.a,8).length>=2)) return {cls:'Sulfonamide N (not basic)', w:null};
      if (others.some(y=>Z(y.a)===6 && dbl(y.a,8))) return {cls:'Amide (protonates on O)', w:-0.5, ref:'Evans'};
      if (m.getAtomCharge(A)>0 && nOf(A,8).length>=2) return {cls:'Nitro N (not basic)', w:null};
      if (m.isAromaticAtom(A)){
        if (others.length>=3 || H[A]>0) return {cls:'Pyrrole-type N (lone pair in the aromatic π system)', w:-3.8, ref:'Williams (pyrrole, C-protonation)'};
        const ring=aromRing(A);
        if (ring && ring.length===5){ const r=heteroRing5(A); const nAdj=nb[A].filter(y=>ring.includes(y.a) && Z(y.a)===7);
          const pyrrolN=ring.find(a=>Z(a)===7 && (H[a]>0||nb[a].length>2));
          if (r.os) return {cls:'Oxazole-type N', w: nb[A].some(y=>Z(y.a)===8)?-3.0:0.8, ref:'Williams'};
          if (r.ss) return {cls:'Thiazole N', w:2.5, ref:'Williams'};
          if (r.ns>=3) return {cls:'Triazole N', w:2.2, ref:'Williams'};
          if (nAdj.length) return {cls:'Pyrazole N2', w:2.5, ref:'Williams'};
          if (pyrrolN) return r.fused ? {cls:'Benzimidazole N3', w:5.5, ref:'Williams'} : {cls:'Imidazole N3', w:7.0, ref:'Williams'};
          return {cls:'Azole N', w:3, ref:'estimate'}; }
        if (ring && ring.length===6){
          const ns=ring.filter(a=>Z(a)===7 && a!==A).map(a=>ringDist(ring,A,a));
          if (ns.length){ const p=ns[0]; return {cls:['','Pyridazine','Pyrimidine','Pyrazine'][p]||'Diazine', w:[0,2.3,1.3,0.6][p], ref:'Williams'}; }
          const {subs}=ringSubs(A); let s=0, extra=0;
          const O2={CH3:0.7, alkyl:0.6, CHR2:0.5, CR3:0.3, Cl:-4.5, Br:-4.4, F:-5.8, OR:-2.0, NH2:1.6, NR2:1.7, NHR:1.6, Ar:-0.8};
          for (const x of subs){ if (x.t==='fused'){ extra-=0.15; continue; } const v=HS[x.t]||HS.X; if (x.p===1) extra+= O2[x.t]!=null ? O2[x.t] : -5.9*v[1]; else if (x.p===2) s+=v[0]; else if (x.p===3) s+=v[1]; }
          return {cls:'Pyridine-type N', w:5.25-5.9*s+extra, ref:'Hammett for pyridinium, ρ = 5.9; 2-substituents from tabulated values', corr:s}; }
        return {cls:'Aromatic N', w:null};
      }
      // sp2 N in C=N
      const dblC=others.find(y=>y.o===2 && Z(y.a)===6);
      if (dblC){ const nN=nb[dblC.a].filter(w=>Z(w.a)===7).length; if (nN>=3) return {cls:'Guanidine', w:13.6, ref:'Evans'}; if (nN===2) return {cls:'Amidine', w:12.4, ref:'Evans (DBU ≈ 13.5)'};
        if (nb[A].some(y=>Z(y.a)===8)) return {cls:'Oxime N', w:1.0, ref:'estimate'}; return {cls:'Imine N', w:7.0, ref:'estimate'}; }
      if (others.some(y=>Z(y.a)===7 && nb[y.a].some(w=>w.o===2))) return {cls:'Hydrazone N', w:3, ref:'estimate'};
      const arN=others.filter(y=>m.isAromaticAtom(y.a) || (Z(y.a)===6 && nb[y.a].some(w=>w.o===2 && Z(w.a)===6)));
      if (arN.length){ if (arN.length>=2) return {cls:'Diarylamine', w:0.8, ref:'Evans'}; const s=sigmaSum(arN[0].a,2); const alkN=others.length-1;
        return {cls:'Aniline N', w:4.6-2.89*s+0.25*alkN, ref:'Hammett for anilinium, ρ = 2.89', corr:s}; }
      if (others.some(y=>Z(y.a)===8)) return {cls:'Hydroxylamine N', w:6.0, ref:'Evans'};
      if (others.some(y=>Z(y.a)===7)) return {cls:'Hydrazine N', w:8.1, ref:'Evans'};
      const deg=others.length;
      let base=[9.24,10.6,11.0,10.5][Math.min(3,deg)];
      if (m.isRingAtom(A) && m.getAtomRingSize(A)===3) base=8.0;
      const ind=inductive(A,new Set([A]),'base');
      return {cls:['Ammonia','Primary amine','Secondary amine','Tertiary amine'][Math.min(3,deg)], w:base-ind, ref:'Evans/Williams with inductive correction', corr:ind};
    }
    if (z===8){
      const x=others[0]; if (!x) return {cls:'Water (H₃O⁺)', w:-1.7, ref:'Evans'};
      if (others.length===1 && others[0].o===2){ const C=x.a; const rest=nb[C].filter(w=>w.a!==A);
        if (rest.some(w=>Z(w.a)===7)) return {cls:'Amide C=O', w:-0.5, ref:'Evans'};
        if (rest.some(w=>Z(w.a)===8)) return {cls: rest.some(w=>Z(w.a)===8 && H[w.a]>0)?'Carboxylic acid C=O':'Ester C=O', w: rest.some(w=>Z(w.a)===8 && H[w.a]>0)?-6:-6.5, ref:'Evans'};
        if (H[C]>0) return {cls:'Aldehyde C=O', w:-8, ref:'Evans'};
        if (Z(C)===16) return {cls:'Sulfoxide/sulfone O', w:-2.8, ref:'estimate'};
        return {cls:'Ketone C=O', w:-7, ref:'Evans'}; }
      if (m.getAtomCharge(A)<0) return null;
      if (others.some(y=>m.isAromaticAtom(y.a))) return {cls:'Phenol/aryl ether O', w:-6.7, ref:'Evans'};
      if (others.some(y=>Z(y.a)===6 && dbl(y.a,8))) return {cls:'Ester/acid O–C(=O)', w:-6.5, ref:'estimate'};
      return H[A]>0 ? {cls:'Alcohol O', w:-2, ref:'Evans'} : {cls:'Ether O', w:-3.5, ref:'Evans'};
    }
    if (z===15 && others.length===3){ const ar=others.filter(y=>m.isAromaticAtom(y.a)).length; return {cls: ar>=3?'Triarylphosphine':'Trialkylphosphine', w: ar>=3?2.7:8.7-2*ar, ref:'Williams'}; }
    if (z===16 && others.length===2 && !nb[A].some(w=>w.o===2)) return {cls:'Sulfide S', w:-7, ref:'estimate'};
    return null;
  }
  function acidity(mol, A){
    setup(mol);
    const res={acid:null, base:null};
    const z=Z(A);
    if (m.getAtomCharge(A)>0 && H[A]>0 && z===7){ // ammonium: report as acid with pKa = pKaH of the neutral amine
      const tmp=mol.getCompactCopy(); tmp.setAtomCharge(A,0); setup(tmp); const b=baseSite(A); setup(mol);
      if (b && b.w!=null) res.acid={cls:b.cls.replace(/N$/,'')+' conjugate acid (N⁺–H)', w:b.w, d:null, ref:b.ref, corr:b.corr};
      return res; }
    if (H[A]>0) res.acid=acidSite(A);
    const b=baseSite(A); if (b && b.w!=null && (!res.acid || z===7 || b.w>=2)) res.base=b; // O–H/S–H acids: their weak O/S basicity is not useful
    for (const k of ['acid','base']) if (res[k]){ res[k].w=r1(res[k].w); res[k].d=r1(res[k].d); }
    return res;
  }
  /* ---------- BDE ---------- */
  const RX = { // Sanderson / Reusch matrix, kcal/mol: rows X; columns R radical types
    cols:['methyl','primary','secondary','tertiary','phenyl','benzyl','allyl','acyl','vinyl'],
    F:[110,110,109,null,124,94,null,119,null], Cl:[83.7,82,81,80,97.1,68,70,82,90], Br:[72.1,70,69,66,79,55,56,68,80], I:[57.6,54,54,51,64,40,42,51,null],
    OH:[92.1,94,92,91,112.4,79,82,107,null], NH2:[85.2,87,86,85,104,72,75,95,null], CN:[122,114,112,null,128,100,null,null,128],
    CH3:[90.1,89.0,88.6,86.9,103.5,77.6,76.5,84.8,101.4], primary:[89.0,87.9,85.2,82.6,101.8,74.8,74.5,82.4,99.0], secondary:[88.6,85.2,84.5,80.5,99.6,73.8,73.6,81.0,98.0], tertiary:[86.9,82.6,80.5,78.9,97.2,70.6,71.4,79,95.6],
    phenyl:[103.5,101.8,99.6,97.2,118,90,91,97,112], benzyl:[77.6,74.8,73.8,70.6,90,63,63,68,85] };
  const AVG = {'C–N':73,'C–O':85.5,'C–S':65,'C–Si':76,'C–P':70,'C–B':90,'N–N':65,'N–O':55,'O–O':38,'S–S':65,'S–O':87,'Si–O':110,'Si–Si':52,'P–O':90,'B–O':125,'B–F':150,'Si–F':135,'Si–Cl':90,'P–Cl':79,'P–Br':65,'C–C':83,
    'C=C':146,'C=N':147,'C=O':178,'C=S':138,'N=N':109,'N=O':143,'O=O':119,'S=O':93,'P=O':110,'C≡C':200,'C≡N':213,'N≡N':226,'C≡O':258};
  const SYMB=z=>({1:'H',5:'B',6:'C',7:'N',8:'O',9:'F',14:'Si',15:'P',16:'S',17:'Cl',35:'Br',53:'I'})[z]||'X';
  function radType(C, other){ // classify carbon radical formed by breaking C–other
    if (Z(C)!==6) return null;
    if (m.isAromaticAtom(C)) return 'phenyl';
    if (dbl(C,8)) return 'acyl';
    if (nb[C].some(y=>y.a!==other && y.o===2)) return 'vinyl';
    if (nb[C].some(y=>y.a!==other && y.o===3)) return null;
    const rest=nb[C].filter(y=>y.a!==other);
    if (rest.some(y=>m.isAromaticAtom(y.a))) return 'benzyl';
    if (rest.some(y=>Z(y.a)===6 && nb[y.a].some(w=>w.o===2 && Z(w.a)===6 && w.a!==C))) return 'allyl';
    return ['methyl','primary','secondary','tertiary'][Math.min(3,rest.length)];
  }
  const DEC = {alkyl:3.9, Ar:15.2, 'C=C':16.2, 'C#C':14.7, COR:9.0, CHO:11.0, COOH:9.0, COOR:9.0, 'COO-':6, CONR:9.0, COCl:8, CN:11.6, 'C=N':12, NO2:5.7, SO2R:6.0, SOR:11, SR:11, SH:11,
    NH2:12.8, NHR:12.8, NR2:12.8, NAr:12.0, NHCOR:9.0, 'N+':2, 'N=C':10, OH:8.9, OR:8.9, OAr:8.9, OCOR:8.3, OSO2:8, 'O-':15, F:3.7, Cl:5.5, Br:3.4, I:2.5, CF3:0, Si:3, P:4, B:6, X:3};
  function bdeXH(A){
    const z=Z(A), others=nb[A];
    if (z===6){
      if (others.some(y=>y.o===3)) return {v:133.3, cls:'Alkynyl C–H', ref:'Blanksby & Ellison'};
      if (m.isAromaticAtom(A)) return {v:112.9, cls:'Aryl C–H', ref:'Blanksby & Ellison (benzene)'};
      if (dbl(A,8)){ const r=others.find(y=>!(Z(y.a)===8&&y.o===2)); if(!r) return {v:88.1, cls:'Formaldehyde C–H', ref:'Blanksby & Ellison'};
        if (Z(r.a)===8||Z(r.a)===7) return {v:96, cls:'Formyl C–H of formate/formamide', ref:'≥96, Blanksby & Ellison (HCOOH)'};
        return {v: m.isAromaticAtom(r.a)?88.9:89.4, cls:'Aldehyde C(O)–H', ref:'Blanksby & Ellison'}; }
      if (others.some(y=>y.o===2)) return {v:110.7, cls:'Vinylic C–H', ref:'Blanksby & Ellison (ethylene)'};
      const decs=[]; let allAlkyl=true;
      for (const y of others){ if (isSp3C[y.a]) { decs.push(DEC.alkyl); continue; } allAlkyl=false; const t=gType(y.a,A); decs.push(DEC[t]??3); }
      decs.sort((a,b)=>b-a); let v=105.0; const W=[1,0.6,0.4]; decs.forEach((d,i)=>v-=d*(W[i]??0.2));
      if (allAlkyl && m.isRingAtom(A)){ v+=({3:6.9,4:-3.2,5:-5.8,6:-3.2,7:-5.4})[m.getAtomRingSize(A)]||0; }
      const deg=others.length;
      return {v, cls:(deg===0?'Methane':deg===1?'Primary':deg===2?'Secondary':'Tertiary')+' C–H'+(allAlkyl?'':' (radical-stabilized)'), ref:'Blanksby & Ellison values with additive radical stabilization', est:!allAlkyl||deg>1};
    }
    if (z===8){ const x=others[0]; if (!x) return {v:118.8, cls:'H–OH', ref:'Blanksby & Ellison'};
      if (Z(x.a)===6 && dbl(x.a,8)) return {v:112, cls:'Carboxylic acid O–H', ref:'Blanksby & Ellison'};
      if (m.isAromaticAtom(x.a)){ const s=sigmaSum(x.a,3); return {v:87.0+6.3*s, cls:'Phenol O–H', ref:'86.7–90 for phenol; Hammett σ⁺, ρ ≈ 6.3 kcal/mol', corr:s}; }
      if (Z(x.a)===8) return {v:86, cls:'Hydroperoxide O–H', ref:'Blanksby & Ellison (84–88)'};
      if (Z(x.a)===7) return {v:83, cls:'Oxime / N–O–H', ref:'estimate', est:true};
      if (Z(x.a)===6){ const deg=nb[x.a].length; return {v:[104.6,104.6,104.7,105.7,106.3][Math.min(4,deg)], cls:'Alcohol O–H', ref:'Blanksby & Ellison'}; }
      return {v:105, cls:'O–H', ref:'estimate', est:true}; }
    if (z===7){ if (!others.length) return {v:107.6, cls:'H–NH₂', ref:'Blanksby & Ellison'};
      if (others.some(y=>Z(y.a)===6 && dbl(y.a,8))) return {v:107, cls:'Amide N–H', ref:'estimate (≈ 107–110)', est:true};
      if (m.isAromaticAtom(A)) return {v:93.9, cls:'Pyrrole-type N–H', ref:'literature ≈ 94 (pyrrole)', est:true};
      if (others.some(y=>m.isAromaticAtom(y.a))) return {v: others.filter(y=>m.isAromaticAtom(y.a)).length>1?87.5:88.0, cls:'Aniline N–H', ref:'literature ≈ 88', est:true};
      return {v: others.length===1?100:96, cls:'Amine N–H', ref:'estimate (MeNH–H ≈ 100)', est:true}; }
    if (z===16){ if (!others.length) return {v:91.2, cls:'H–SH', ref:'Blanksby & Ellison'}; if (m.isAromaticAtom(others[0].a)) return {v:79.1, cls:'Thiophenol S–H', ref:'Bordwell ≈ 79', est:true}; return {v:87.4, cls:'Thiol S–H', ref:'Blanksby & Ellison (CH₃S–H)'}; }
    if (z===14) return {v: others.length===0?91.7:95, cls:'Si–H', ref: others.length===0?'Blanksby & Ellison (SiH₄)':'trialkylsilane ≈ 95', est:others.length>0};
    if (z===9) return {v:136.3, cls:'H–F', ref:'Blanksby & Ellison'}; if (z===17) return {v:103.2, cls:'H–Cl', ref:'Blanksby & Ellison'};
    if (z===35) return {v:87.5, cls:'H–Br', ref:'Blanksby & Ellison'}; if (z===53) return {v:71.3, cls:'H–I', ref:'Blanksby & Ellison'};
    return null;
  }
  function bdeAtom(mol, A){ setup(mol); if (!H[A]) return null; const r=bdeXH(A); if (r) r.v=r1(r.v); return r; }
  function bdeBond(mol, a, b){
    setup(mol);
    const bond=nb[a].find(y=>y.a===b); if (!bond) return null;
    const o=bond.o, za=Z(a), zb=Z(b);
    const pair=[SYMB(za),SYMB(zb)].sort((x,y)=>x==='C'?-1:y==='C'?1:x.localeCompare(y));
    if (o>=2 && !m.isAromaticBond(bond.b)){ const sym=o===2?'=':'≡'; const key=pair.join(sym); const k2=[pair[1],pair[0]].join(sym);
      const v=AVG[key]??AVG[k2]; let note='Average bond enthalpy; the full σ + π dissociation of a specific molecule can differ a lot.';
      if (key==='C=C') note+=' For ethylene the C=C BDE is 174 kcal/mol (Blanksby & Ellison).';
      return v? {v, cls:`${pair.join(sym)} double/triple bond`, ref:'Average bond enthalpies (LibreTexts T3)', avg:true, note} : null; }
    if (m.isAromaticBond(bond.b)) return {v:null, cls:'Aromatic ring bond', note:'Ring bonds don’t dissociate into two fragments, so a BDE isn’t defined.'};
    if (m.isRingAtom(a) && m.isRingAtom(b) && m.getBondRingSize(bond.b)>0) {
      const ringNote='Ring bond: breaking it gives a diradical, so the value is only a guide.';
      const r=heavyBDE(a,b); if (r){ r.note=(r.note?r.note+' ':'')+ringNote; r.est=true; } return r; }
    return heavyBDE(a,b);
  }
  function groupX(X, from){ // X as substituent row in RX
    const z=Z(X);
    if (z===9) return 'F'; if (z===17) return 'Cl'; if (z===35) return 'Br'; if (z===53) return 'I';
    if (z===8 && !nb[X].some(w=>w.o===2)) return 'OH';
    if (z===7 && !nb[X].some(w=>w.o>=2) && m.getAtomCharge(X)===0) return 'NH2';
    if (z===6){ if (nb[X].some(w=>Z(w.a)===7 && w.o===3)) return 'CN'; const t=radType(X,from);
      if (t==='methyl') return 'CH3'; if (['primary','secondary','tertiary','phenyl','benzyl'].includes(t)) return t; }
    return null;
  }
  function heavyBDE(a,b){
    const ra=radType(a,b), rb=radType(b,a);
    const tryRow=(rowAtom, colRad, colAtom)=>{ const row=groupX(rowAtom,colAtom); if (!row || !colRad) return null; const ci=RX.cols.indexOf(colRad); const v=(RX[row]||[])[ci]; return v==null?null:{v,row,col:colRad}; };
    let hit = (rb && tryRow(a,rb,b)) || (ra && tryRow(b,ra,a));
    if (hit){ const fr=t=>({methyl:'methyl',primary:'primary alkyl',secondary:'secondary alkyl',tertiary:'tertiary alkyl',phenyl:'aryl',benzyl:'benzyl',allyl:'allyl',acyl:'acyl',vinyl:'vinyl',CH3:'methyl',OH:'O',NH2:'N',CN:'CN'})[t]||t;
      const blank = ['Cl','Br','I','OH','NH2','CH3'].includes(hit.row) && hit.col==='methyl' || (hit.col==='phenyl' && ['Cl','OH','CH3'].includes(hit.row));
      return {v:hit.v, cls:`${fr(hit.col)}–${fr(hit.row)} bond`, ref: blank? 'Blanksby & Ellison' : 'Sanderson/Reusch R–X compilation (±3 kcal/mol)', est:!blank,
        note: (hit.row==='OH'||hit.row==='NH2') ? 'Values are for R–OH / R–NH₂; ethers, esters and substituted amines differ by a few kcal/mol.' : ''}; }
    const za=Z(a), zb=Z(b);
    if (za===8 && zb===8) return {v: (H[a]&&H[b])?51:(H[a]||H[b])?45:38, cls:'Peroxide O–O', ref:'HO–OH 51; ROO–R ≈ 38 (Blanksby & Ellison)', est:true};
    if (za===16 && zb===16) return {v:65, cls:'Disulfide S–S', ref:'CH₃S–SCH₃ ≈ 65', est:true};
    if (za===7 && zb===7) return {v:66, cls:'Hydrazine N–N', ref:'H₂N–NH₂ ≈ 66', est:true};
    const key=[SYMB(za),SYMB(zb)]; const k1=key.join('–'), k2=[key[1],key[0]].join('–'); const v=AVG[k1]??AVG[k2];
    if (v) return {v, cls:`${k1} bond`, ref:'Average bond enthalpy (LibreTexts T3)', avg:true, note:'Average value; the specific bond may differ by 10 kcal/mol or more.'};
    return {v:null, cls:`${k1} bond`, note:'No reference value for this bond type yet.'};
  }
  return {predict, lines, journalText, acidity, bdeAtom, bdeBond};

})();
