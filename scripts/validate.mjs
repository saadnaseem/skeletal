// Held-out validation: compounds not used while tuning the estimation rules. Prints error statistics.
import { loadModules, molFromSmiles, OCL } from '../tests/unit/load.mjs';
const NMR = loadModules()('NMR');
// Held-out set: compounds NOT used while tuning the rules. Values from standard tables (Williams/Evans/Bordwell; SDBS-type NMR data in CDCl3).
const PK=[['CCC(=O)O','O','acid','w',4.87],['ClCCC(=O)O','O','acid','w',3.98],['CC(O)C(=O)O','acidO','acid','w',3.86],['OC(=O)Cc1ccccc1','O','acid','w',4.31],
['Oc1cccc(c1)[N+](=O)[O-]','O0','acid','w',8.36],['Oc1ccc(Cl)cc1','O0','acid','w',9.38],['COc1ccc(O)cc1','O6','acid','w',10.2],['NCc1ccccc1','N0','base','w',9.34],
['CCNCC','N2','base','w',10.98],['CN1CCOCC1','N1','base','w',7.4],['Cc1cccnc1','N','base','w',5.68],['Nc1ccc(Cl)cc1','N0','base','w',3.98],['Cc1ccc(N)cc1','N','base','w',5.08],
['COc1ccc(N)cc1','N','base','w',5.34],['CCOC(=O)CC(C)=O','C5','acid','d',14.2],['COC(=O)CC(=O)OC','C4','acid','d',15.9],['CCC(=O)CC','C1','acid','d',27.1],
['O=C(Cc1ccccc1)c1ccccc1','C2','acid','d',17.7],['N#CCc1ccccc1','C2','acid','d',21.9],['CS(C)(=O)=O','C0','acid','d',31.1],['CS(C)=O','C0','acid','d',35.1],['CC[N+](=O)[O-]','C1','acid','d',16.7]];
function idx(m, spec){ const el=spec[0]; const n=spec.slice(1); if (n && /^\d+$/.test(n)) return +n;
  for (let i=0;i<m.getAtoms();i++){ const z=m.getAtomicNo(i); if (spec==='acidO'){ if (z===8 && m.getAllHydrogens(i)>0 && m.getConnAtoms(i)===1 && [...Array(m.getConnAtoms(m.getConnAtom(i,0)))].some((_,k)=>m.getConnBondOrder(m.getConnAtom(i,0),k)===2)) return i; continue; }
    if (el==='O' && z===8 && m.getAllHydrogens(i)>0) return i; if (el==='N' && z===7) return i; } return -1; }
let e=[]; for (const [s,sp,k,sv,lit] of PK){ const m=molFromSmiles(s); const i=idx(m,sp); const r=NMR.acidity(m,i)[k]; const v=r?(sv==='w'?r.w:r.d):null; e.push(v==null?null:Math.abs(v-lit)); }
const ok=e.filter(x=>x!=null); console.log('pKa held-out n',ok.length,'missing',e.length-ok.length,'MAE',(ok.reduce((a,b)=>a+b)/ok.length).toFixed(2),'max',Math.max(...ok).toFixed(2),'within 1 unit',ok.filter(x=>x<=1).length);
const NM=[['COc1ccccc1',[7.29,6.94,6.90,3.80],[159.7,129.5,120.7,114.0,55.1]],['COC(=O)c1ccccc1',[8.03,7.54,7.42,3.91],[167.1,132.9,130.2,129.6,128.4,52.1]],
['CCC(C)=O',[2.44,2.14,1.06],[209.3,36.9,29.4,7.9]],['CCOCC',[3.48,1.21],[65.9,15.2]],['CC(C)=O',[2.17],[206.7,30.8]],['c1ccc(cc1)[N+](=O)[O-]',[8.22,7.70,7.55],[148.3,134.8,129.4,123.5]],
['O=C1CCCCC1',[2.33,1.85,1.72],[211.8,42.0,27.1,25.1]],['O=Cc1ccccc1',[10.0,7.88,7.63,7.53],[192.4,136.4,134.5,129.7,129.0]],['Clc1ccccc1',[7.33,7.28,7.23],[134.3,129.7,128.6,126.4]],['CC#N',[2.00],[116.4,1.9]]];
const err=(P,X)=>{ const p=[...P].sort((a,b)=>b-a), x=[...X].sort((a,b)=>b-a); if (p.length===x.length) return x.map((v,i)=>Math.abs(v-p[i])); return x.map(v=>Math.min(...p.map(q=>Math.abs(q-v)))); };
let eh=[],ec=[]; for (const [s,h,c] of NM){ const r=NMR.predict(molFromSmiles(s)); const H=r.H1.filter(g=>!g.exch).map(g=>g.shift), C=r.C13.map(g=>g.shift); const a=err(H,h), b=err(C,c); eh.push(...a); ec.push(...b); console.log(s.padEnd(26),'H',H.join(','),'| C',C.join(',')); }
const st=a=>`n ${a.length} MAE ${(a.reduce((x,y)=>x+y)/a.length).toFixed(2)} max ${Math.max(...a).toFixed(2)}`;
console.log('1H held-out',st(eh)); console.log('13C held-out',st(ec));
