// Writes every test drawing in every format to OUT, plus expected.json (SMILES computed by OCL from the drawing).
import { loadModules, docFromSmiles } from '../tests/unit/load.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT=process.argv[2]; mkdirSync(OUT,{recursive:true});
const get=loadModules();
const F=get('FORMATS'), L=get('L'), buildIndex=get('buildIndex'), toOCL=get('toOCL'), OCL=get('OCL');
const smi=d=>{ const e=F.expandDoc(d), ix=buildIndex(e); const m=toOCL(e,ix).mol; m.ensureHelperArrays(OCL.Molecule.cHelperParities); return m.toIsomericSmiles(); };
const shift=(d,dx,dy)=>{ d.atoms.forEach(a=>{a.x+=dx;a.y+=dy;}); return d; };
function merge(...ds){ const out=docFromSmiles(get,'C'); out.atoms=[]; out.bonds=[]; let id=1; for (const d of ds){ const m=new Map(); d.atoms.forEach(a=>{ const n={...a,id:id++}; m.set(a.id,n.id); out.atoms.push(n); }); d.bonds.forEach(b=>out.bonds.push({...b,id:id++,a:m.get(b.a),b:m.get(b.b)})); } out.nid=id+100; return out; }
const T={};
T.aspirin=docFromSmiles(get,'CC(=O)Oc1ccccc1C(=O)O');
T.alanine=docFromSmiles(get,'C[C@H](N)C(=O)O');
T.butene=docFromSmiles(get,'C/C=C/C');
T.ions=merge(docFromSmiles(get,'C[N+](C)(C)C'), shift(docFromSmiles(get,'CC(=O)[O-]'),80,0));
T.radical=docFromSmiles(get,'C[CH2]');
// nicknames: anisole drawn with an OMe label, benzoic acid drawn with a Ph label
{ const d=docFromSmiles(get,'c1ccccc1C'); const a=d.atoms.find(a=>a.el==='C' && d.bonds.filter(b=>b.a===a.id||b.b===a.id).length===1); a.el='OMe'; T.omeNick=d; }
{ const d=docFromSmiles(get,'CC(=O)O'); const a=d.atoms[0]; a.el='Ph'; T.phNick=d; }
{ const r=docFromSmiles(get,'CCO'), r2=shift(docFromSmiles(get,'CC(=O)O'),70,0), p=shift(docFromSmiles(get,'CCOC(C)=O'),220,0); const d=merge(r,r2,p);
  const xs=v=>d.atoms.filter(a=>v(a.x)).map(a=>a.x); const lmax=Math.max(...xs(x=>x<180)), pmin=Math.min(...xs(x=>x>=180)), cy=d.atoms.reduce((s,a)=>s+a.y,0)/d.atoms.length;
  d.arrows=[{id:900,type:'reaction',x1:lmax+15,y1:cy,x2:pmin-15,y2:cy}]; d.texts=[{id:901,x:(lmax+pmin)/2,y:cy-12,text:'H2SO4'}]; d.pluses=[{id:902,x:45,y:cy}]; T.reaction=d; }
{ const d=docFromSmiles(get,'C=CC(=O)C'); const A=d.atoms[0], B=d.atoms[1]; d.arrows=[{id:950,type:'curly',x1:A.x,y1:A.y-8,x2:B.x,y2:B.y-8,cx:(A.x+B.x)/2,cy:A.y-30}]; T.curly=d; }
const exp={};
for (const [k,d] of Object.entries(T)){ exp[k]=smi(d);
  for (const f of F.list){ let o; try{ o=F.write(f.id,d); }catch(e){ continue; } writeFileSync(`${OUT}/${k}.${f.id}.${f.ext}`, o); } }
writeFileSync(`${OUT}/expected.json`, JSON.stringify(exp,null,1));
// our own readers: write -> read -> SMILES
const rt={};
for (const [k,d] of Object.entries(T)) for (const f of F.list.filter(f=>f.read)){ const o=F.write(f.id,d), back=F.read(f.id,o); const nd={...docFromSmiles(get,'C'),...back}; rt[`${k}.${f.id}`]= smi(nd)===exp[k] ? 'ok' : `MISMATCH ${smi(nd)} vs ${exp[k]}`;
  if (k==='reaction') rt[`${k}.${f.id}.objects`]=`arrows ${back.arrows.length} texts ${back.texts.length} pluses ${back.pluses.length}`;
  if (k==='curly') rt[`${k}.${f.id}.arrow`]=back.arrows.map(r=>r.type+(r.cx!=null?` ctl ${Math.round(r.cx-d.arrows[0].cx)},${Math.round(r.cy-d.arrows[0].cy)}`:'')).join(); }
console.log(JSON.stringify(rt,null,1));
