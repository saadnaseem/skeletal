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
  return {parseFormula, dbe, rule13, scaleIntegrals, hill, SWAP};
})();
