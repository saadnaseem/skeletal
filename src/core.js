'use strict';
const SK_SRC = (()=>{ try{ return document.documentElement.outerHTML; }catch(e){ return null; } })();
/* ================= constants ================= */
// bond length in pt for the drawing being edited or rendered: set from its style by useStyle()/renderDoc()
let L = 14.4;
const FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
// journal styles. acs: ChemDraw "ACS Document 1996"; rsc: ChemDraw 22 "RSC (1 Column) Document";
// nature: Nature Reviews chemical structure style guide (0.381 cm bonds, 0.021 cm lines, 0.055 cm bold, 0.042 cm margin, 0.06 cm hash, 6 pt Arial)
const PRESETS = {
  acs:    { name:'ACS 1996', bondLength:14.4, lineWidth:0.6, boldWidth:2.0, spacing:0.18, hashSpacing:2.5, margin:1.6, fontSize:10, fontWeight:400, wedge:3.2, head:1.0 },
  rsc:    { name:'RSC', bondLength:12.2, lineWidth:0.45, boldWidth:1.6, spacing:0.20, hashSpacing:1.75, margin:1.25, fontSize:7, fontWeight:400, wedge:2.6, head:0.85 },
  nature: { name:'Nature Reviews', bondLength:10.8, lineWidth:0.6, boldWidth:1.56, spacing:0.18, hashSpacing:1.7, margin:1.19, fontSize:6, fontWeight:400, wedge:2.5, head:0.8 },
  slides: { name:'Slides', bondLength:14.4, lineWidth:1.1, boldWidth:3.0, spacing:0.21, hashSpacing:2.7, margin:1.9, fontSize:11, fontWeight:700, wedge:4.4, head:1.25 },
};
// per-document overrides of the preset (ChemDraw "Drawing Settings"): [min, max] in pt, spacing as a fraction of bond length
const STYLE_LIMITS = { bondLength:[5,40], lineWidth:[0.1,6], boldWidth:[0.3,12], spacing:[0.08,0.4], hashSpacing:[0.8,8], wedge:[1,14], margin:[0,6] };
const ELEMENTS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' ');
const ELSET = new Set(ELEMENTS);
// nicknames: s = SMILES with attachment atom first, l = form used when the bond comes from the right
const ABBR = {
  Me:{s:'C'}, Et:{s:'CC'}, Pr:{s:'CCC'}, nPr:{s:'CCC'}, iPr:{s:'C(C)C'}, Bu:{s:'CCCC'}, nBu:{s:'CCCC'}, tBu:{s:'C(C)(C)C'},
  Ph:{s:'c1ccccc1'}, Bn:{s:'Cc1ccccc1'}, Bz:{s:'C(=O)c1ccccc1'}, Ac:{s:'C(C)=O'}, Ts:{s:'S(=O)(=O)c1ccc(C)cc1'},
  Ms:{s:'S(=O)(=O)C'}, Tf:{s:'S(=O)(=O)C(F)(F)F'}, Boc:{s:'C(=O)OC(C)(C)C'}, Cbz:{s:'C(=O)OCc1ccccc1'},
  TMS:{s:'[Si](C)(C)C'}, TBS:{s:'[Si](C)(C)C(C)(C)C'}, TIPS:{s:'[Si](C(C)C)(C(C)C)C(C)C'},
  OMe:{s:'OC',l:'MeO'}, OEt:{s:'OCC',l:'EtO'}, OAc:{s:'OC(C)=O',l:'AcO'}, OBn:{s:'OCc1ccccc1',l:'BnO'}, OPh:{s:'Oc1ccccc1',l:'PhO'},
  OTs:{s:'OS(=O)(=O)c1ccc(C)cc1',l:'TsO'}, OMs:{s:'OS(=O)(=O)C',l:'MsO'}, OTf:{s:'OS(=O)(=O)C(F)(F)F',l:'TfO'},
  OTBS:{s:'O[Si](C)(C)C(C)(C)C',l:'TBSO'}, OBoc:{s:'OC(=O)OC(C)(C)C',l:'BocO'},
  NMe2:{s:'N(C)C',l:'Me2N'}, NHMe:{s:'NC',l:'MeHN'}, NHAc:{s:'NC(C)=O',l:'AcHN'}, NHBoc:{s:'NC(=O)OC(C)(C)C',l:'BocHN'}, NHCbz:{s:'NC(=O)OCc1ccccc1',l:'CbzHN'},
  CO2H:{s:'C(=O)O',l:'HO2C'}, COOH:{s:'C(=O)O',l:'HOOC'}, CO2Me:{s:'C(=O)OC',l:'MeO2C'}, CO2Et:{s:'C(=O)OCC',l:'EtO2C'}, CO2tBu:{s:'C(=O)OC(C)(C)C',l:'tBuO2C'},
  CHO:{s:'C=O',l:'OHC'}, CN:{s:'C#N',l:'NC'}, NO2:{s:'[N+](=O)[O-]',l:'O2N'}, CF3:{s:'C(F)(F)F',l:'F3C'}, CCl3:{s:'C(Cl)(Cl)Cl',l:'Cl3C'},
  SO3H:{s:'S(=O)(=O)O',l:'HO3S'}, SO2Me:{s:'S(=O)(=O)C',l:'MeO2S'}, PO3H2:{s:'P(=O)(O)O',l:'H2O3P'}, OPO3H2:{s:'OP(=O)(O)O',l:'H2O3PO'},
  CONH2:{s:'C(N)=O',l:'H2NOC'}, SMe:{s:'SC',l:'MeS'}, N3:{s:'N=[N+]=[N-]'},
};
const GENERIC = new Set(['R','R1','R2','R3','R4','R5','R6',"R'","R''",'X','Ar','Nu','E','LG','PG','Z','M','L','Ln']);
const CPK = {N:'#2f4fd6',O:'#d1231f',S:'#b38a00',P:'#d06a00',F:'#1f8f3a',Cl:'#1f8f3a',Br:'#8b2a14',I:'#6a1fa0',B:'#c26a6a',Si:'#8a7a5c',Se:'#b36b00'};
const VAL = {H:[1],B:[3],C:[4],Si:[4],N:[3],P:[3,5],As:[3,5],O:[2],S:[2,4,6],Se:[2,4,6],Te:[2,4,6],F:[1],Cl:[1,3,5,7],Br:[1,3,5,7],I:[1,3,5,7]};
const GROUP = {H:'h',B:'b',C:'c',Si:'c',N:'n',P:'n',As:'n',O:'o',S:'o',Se:'o',Te:'o',F:'x',Cl:'x',Br:'x',I:'x'};
// atom labels and style names come from users and files: keep 'constructor', '__proto__' etc. from finding Object.prototype
for (const t of [PRESETS, ABBR, CPK, VAL, GROUP]) Object.setPrototypeOf(t, null);

function kindOf(el){
  if (GENERIC.has(el)) return 'generic';
  if (ELSET.has(el)) return 'element';
  if (ABBR[el]) return 'abbr';
  return 'generic';
}
// "OH", "NH2", "CH3" typed as labels become the bare element (hydrogens are added automatically)
// substituent names typed as labels become their nicknames (phenyl -> Ph) or elements (hydroxy -> O, with its H added)
const LABEL_NAMES={methyl:'Me', ethyl:'Et', propyl:'Pr', isopropyl:'iPr', butyl:'Bu', 'tert-butyl':'tBu', 't-butyl':'tBu', phenyl:'Ph', benzyl:'Bn', benzoyl:'Bz',
  acetyl:'Ac', tosyl:'Ts', mesyl:'Ms', triflyl:'Tf', methoxy:'OMe', ethoxy:'OEt', acetoxy:'OAc', benzyloxy:'OBn', phenoxy:'OPh', nitro:'NO2', cyano:'CN', nitrile:'CN',
  carboxy:'CO2H', carboxyl:'CO2H', formyl:'CHO', trifluoromethyl:'CF3', hydroxy:'O', hydroxyl:'O', amino:'N', thiol:'S', mercapto:'S', methylthio:'SMe',
  fluoro:'F', chloro:'Cl', bromo:'Br', iodo:'I'};
Object.setPrototypeOf(LABEL_NAMES, null);
function normalizeLabel(t){
  t = (t||'').trim();
  if (!t) return null;
  if (LABEL_NAMES[t.toLowerCase()]) return LABEL_NAMES[t.toLowerCase()];
  const m = t.match(/^([A-Z][a-z]?)H\d*$/);
  if (m && ELSET.has(m[1]) && !ABBR[t]) return m[1];
  const cap = t.length<=2 ? t[0].toUpperCase()+t.slice(1).toLowerCase() : t;
  if (ELSET.has(cap)) return cap;
  return t;
}

/* ================= geometry ================= */
const V = (x,y)=>({x,y});
const add=(a,b)=>V(a.x+b.x,a.y+b.y), sub=(a,b)=>V(a.x-b.x,a.y-b.y), mul=(a,k)=>V(a.x*k,a.y*k);
const dot=(a,b)=>a.x*b.x+a.y*b.y, cross=(a,b)=>a.x*b.y-a.y*b.x, len=a=>Math.hypot(a.x,a.y);
const norm=a=>{const l=len(a)||1; return V(a.x/l,a.y/l)};
const perp=a=>V(-a.y,a.x);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fromAng=t=>V(Math.cos(t),Math.sin(t));
const angOf=a=>Math.atan2(a.y,a.x);
function rotAround(p,c,t){const s=Math.sin(t),k=Math.cos(t),dx=p.x-c.x,dy=p.y-c.y; return V(c.x+dx*k-dy*s, c.y+dx*s+dy*k);}
function segDist(p,a,b){const ab=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),ab)/(dot(ab,ab)||1)));return dist(p,add(a,mul(ab,t)));}
function quadPt(p0,c,p1,t){const u=1-t; return V(u*u*p0.x+2*u*t*c.x+t*t*p1.x, u*u*p0.y+2*u*t*c.y+t*t*p1.y);}
const f2=n=>(Math.round(n*100)/100).toString();
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ================= text measurement ================= */
const _mc = document.createElement('canvas').getContext('2d');
const _mcache = new Map();
const FAMILIES = { sans:FONT, serif:"'Times New Roman', Times, 'Liberation Serif', serif", mono:"'Courier New', Courier, 'Liberation Mono', monospace" };
function tw(t,size,weight,family,italic){
  family=family||FONT;
  const k=t+'|'+size+'|'+weight+'|'+family+'|'+(italic?1:0); let w=_mcache.get(k);
  if (w==null){ _mc.font=`${italic?'italic ':''}${weight||400} ${size*10}px ${family}`; w=_mc.measureText(t).width/10; _mcache.set(k,w); }
  return w;
}

/* ================= document ================= */
// Loaded files are untrusted: keep only known fields with safe types, because values end up in SVG markup.
const COLOR_RE=/^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
// bonds that are drawn but carry no valence: hydrogen bonds (dashed) and dative bonds (arrow from donor b.a to acceptor b.b)
const BOND_KINDS=['hbond','dative'];
function sanitizeDoc(d){
  if (!d || typeof d!=='object') return {};
  const num=(v,def=0)=>{ const n=+v; return Number.isFinite(n) ? n : def; };
  const int=(v,def=0)=>Math.round(num(v,def));
  const col=v=> (typeof v==='string' && COLOR_RE.test(v)) ? v : undefined;
  const str=(v,max)=> typeof v==='string' ? v.slice(0,max) : '';
  const grp=v=>{ const n=Math.round(+v); return Number.isFinite(n) && n>0 ? n : undefined; };
  const pick=(o,keys)=>{ const r={}; for (const k of keys) if (o[k]!==undefined) r[k]=o[k]; return r; };
  const out={ v:1, style: Object.hasOwn(PRESETS, d.style) ? d.style : 'acs', colorAtoms:!!d.colorAtoms, nid:int(d.nid,1) };
  if (d.labelSize!=null && Number.isFinite(+d.labelSize)) out.labelSize=Math.min(72,Math.max(4,+d.labelSize));
  if (d.showCH==='end' || d.showCH==='all') out.showCH=d.showCH;
  if (d.styleOv && typeof d.styleOv==='object'){ const o={};
    for (const [k,[lo,hi]] of Object.entries(STYLE_LIMITS)){ const v=+d.styleOv[k]; if (d.styleOv[k]!=null && Number.isFinite(v)) o[k]=Math.min(hi,Math.max(lo,v)); }
    if (Object.keys(o).length) out.styleOv=o; }
  const arr=v=>Array.isArray(v)?v:[];
  out.atoms=arr(d.atoms).map(a=>pick({id:int(a.id), x:num(a.x), y:num(a.y), el:str(a.el,24)||'C', charge:Math.max(-8,Math.min(8,int(a.charge))), lp:Math.max(0,Math.min(3,int(a.lp))), rad:a.rad?1:0, color:col(a.color), g:grp(a.g), stg: typeof a.stg==='string' && /^(abs|and\d{1,2}|or\d{1,2})$/.test(a.stg) ? a.stg : undefined, iso: Number.isInteger(+a.iso) && +a.iso>0 && +a.iso<300 ? +a.iso : undefined,
    hs: a.hs ? true : undefined, hl: typeof a.hl==='string' && /^[A-Z][a-z]?H\d?$/.test(a.hl) ? a.hl : undefined},['id','x','y','el','charge','lp','rad','color','g','stg','iso','hs','hl']));
  out.bonds=arr(d.bonds).map(b=>pick({id:int(b.id), a:int(b.a), b:int(b.b), order:Math.max(1,Math.min(3,int(b.order,1))), stereo:['none','wedge','hash','wavy','bold'].includes(b.stereo)?b.stereo:'none', dbPos:['auto','center','left','right'].includes(b.dbPos)?b.dbPos:undefined, color:col(b.color), kind:BOND_KINDS.includes(b.kind)?b.kind:undefined},['id','a','b','order','stereo','dbPos','color','kind']));
  const ARROWS=['reaction','equilibrium','retro','resonance','dashed','nogo','curly','fishhook'];
  out.arrows=arr(d.arrows).map(r=>{ const o={id:int(r.id), type:ARROWS.includes(r.type)?r.type:'reaction', x1:num(r.x1), y1:num(r.y1), x2:num(r.x2), y2:num(r.y2), color:col(r.color), g:grp(r.g)}; if (r.cx!=null && r.cy!=null){ o.cx=num(r.cx); o.cy=num(r.cy); } return pick(o,Object.keys(o)); });
  out.texts=arr(d.texts).map(t=>pick({id:int(t.id), x:num(t.x), y:num(t.y), text:str(t.text,5000), size: t.size!=null&&Number.isFinite(+t.size)?Math.min(200,Math.max(2,+t.size)):undefined,
    font:['serif','mono'].includes(t.font)?t.font:undefined, bold: typeof t.bold==='boolean'?t.bold:undefined, italic:t.italic?true:undefined, align:['left','right'].includes(t.align)?t.align:undefined, color:col(t.color), g:grp(t.g), on: t.on && typeof t.on==='object' ? {b:int(t.on.b), u:num(t.on.u), v:num(t.on.v), s:num(t.on.s)<0?-1:1} : undefined},['id','x','y','text','size','font','bold','italic','align','color','on','g']));
  out.pluses=arr(d.pluses).map(p=>pick({id:int(p.id), x:num(p.x), y:num(p.y), color:col(p.color), g:grp(p.g)},['id','x','y','color','g']));
  const clamp=(v,lo,hi,def)=>Math.min(hi,Math.max(lo,num(v,def)));
  out.plates=arr(d.plates).slice(0,50).map(q=>pick({id:int(q.id), x:num(q.x), y:num(q.y), w:clamp(q.w,10,2000,60), h:clamp(q.h,10,2000,72), g:grp(q.g),
    origin:clamp(q.origin,0,0.5,0.12), front:clamp(q.front,0.5,1,0.9), solvent:str(q.solvent,200), showRf:!!q.showRf, color:col(q.color),
    lanes:arr(q.lanes).slice(0,20).map(l=>({label:str(l.label,40), spots:arr(l.spots).slice(0,20).map(sp=>pick({rf:clamp(sp.rf,0,1,0.5), to:sp.to!=null?clamp(sp.to,0,1,0.5):undefined,
      style:['fill','outline','faint'].includes(sp.style)?sp.style:'fill', color:col(sp.color)},['rf','to','style','color']))}))},
    ['id','x','y','w','h','g','origin','front','solvent','showRf','color','lanes']));
  out.brackets=arr(d.brackets).slice(0,500).map(q=>pick({id:int(q.id), x:num(q.x), y:num(q.y), w:clamp(q.w,2,5000,40), h:clamp(q.h,4,5000,40), type:BRACKETS.includes(q.type)?q.type:'square',
    sup:str(q.sup,20)||undefined, sub:str(q.sub,20)||undefined, color:col(q.color), g:grp(q.g)},['id','x','y','w','h','type','sup','sub','color','g']));
  if (d.page && typeof d.page==='object'){ const p=d.page; const w=num(p.w), h=num(p.h);
    if (w>=36 && h>=36 && w<=20000 && h<=20000) out.page={preset:str(p.preset,20)||'custom', w, h, across:Math.max(1,Math.min(8,int(p.across,1))), down:Math.max(1,Math.min(8,int(p.down,1))), x:num(p.x), y:num(p.y)}; }
  return out;
}
// the project around the page docs (saved .html/.json, autosave): sanitizeDoc covers each doc, this covers the rest
const PROJECT_ID_RE=/^[a-z0-9]{1,16}$/, VERSION_MAX=20e6;
function sanitizeProject(p){
  if (!p || typeof p!=='object' || Array.isArray(p)) p={};
  const str=(v,max)=> typeof v==='string' ? v.slice(0,max) : '';
  const pages=[], seen=new Set();
  for (const pg of Array.isArray(p.pages)? p.pages : []){
    if (!pg || typeof pg!=='object') continue;
    let id=+pg.id; if (!Number.isInteger(id) || id<1 || id>1e6 || seen.has(id)) id=0; else seen.add(id);
    pages.push({id, name:str(pg.name,100), doc:pg.doc});
  }
  if (!pages.length) pages.push({id:1, name:'', doc:{}});
  let next=Math.max(0,...seen)+1; for (const pg of pages) if (!pg.id) pg.id=next++;
  pages.forEach((pg,i)=>{ if (!pg.name.trim()) pg.name='Page '+(i+1); });
  const versions=(Array.isArray(p.versions)? p.versions : []).filter(v=>v && typeof v==='object' && typeof v.id==='string' && PROJECT_ID_RE.test(v.id) && typeof v.pages==='string' && v.pages.length<=VERSION_MAX).slice(0,500)
    .map(v=>{ const t=Date.parse(v.time); return {id:v.id, name:str(v.name,200)||'Version', time:new Date(Number.isFinite(t)? t : 0).toISOString(), pages:v.pages}; });
  const cur=+p.cur, modified=+p.modified, nextPage=+p.nextPage;
  const out={ v:2, uid: typeof p.uid==='string' && PROJECT_ID_RE.test(p.uid) ? p.uid : Math.random().toString(36).slice(2,10), name:str(p.name,200).trim()||'Untitled project',
    pages, cur: Number.isInteger(cur) ? Math.min(Math.max(0,cur), pages.length-1) : 0, versions,
    nextPage: Math.max(Number.isInteger(nextPage) && nextPage<=1e6 ? nextPage : 1, ...pages.map(pg=>pg.id+1)), modified: Number.isFinite(modified) && modified>0 ? modified : 0 };
  if (typeof p.rev==='string' && PROJECT_ID_RE.test(p.rev)) out.rev=p.rev;
  return out;
}
function newDoc(){ return {v:1, atoms:[], bonds:[], arrows:[], texts:[], pluses:[], plates:[], brackets:[], nid:1, style:'acs', colorAtoms:false}; }
const _sCache=new Map();
function useStyle(d){ L = S(d).bondLength || 14.4; return L; }
// scale a drawing's geometry about its centre (used when the bond length changes; text sizes stay in pt)
function rescaleDoc(d, f){
  if (!(f>0) || Math.abs(f-1)<1e-9) return;
  const pts=[...d.atoms, ...d.texts, ...d.pluses, ...(d.plates||[]), ...(d.brackets||[])]; for (const r of d.arrows) pts.push({x:r.x1,y:r.y1},{x:r.x2,y:r.y2});
  if (!pts.length) return; let cx=0, cy=0; for (const p of pts){ cx+=p.x; cy+=p.y; } cx/=pts.length; cy/=pts.length;
  const sx=v=>cx+(v-cx)*f, sy=v=>cy+(v-cy)*f;
  for (const o of [...d.atoms, ...d.texts, ...d.pluses, ...(d.plates||[]), ...(d.brackets||[])]){ o.x=sx(o.x); o.y=sy(o.y); }
  for (const q of d.brackets||[]){ q.w*=f; q.h*=f; }
  for (const t of d.texts) if (t.on){ t.on.u*=f; t.on.v*=f; delete t.on.mx; delete t.on.tx; } // re-placed from the scaled offsets
  for (const r of d.arrows){ r.x1=sx(r.x1); r.y1=sy(r.y1); r.x2=sx(r.x2); r.y2=sy(r.y2); if (r.cx!=null){ r.cx=sx(r.cx); r.cy=sy(r.cy); } }
}
function S(d){ d=d||doc; const k=d.style+'|'+(d.labelSize||'')+'|'+(d.styleOv?JSON.stringify(d.styleOv):''); let s=_sCache.get(k);
  if(!s){ s={...(PRESETS[d.style]||PRESETS.acs), ...(d.styleOv||{})}; if (d.labelSize) s.fontSize=+d.labelSize; _sCache.set(k,s); } return s; }
function buildIndex(d){
  const ix={atom:new Map(),bond:new Map(),arrow:new Map(),text:new Map(),plus:new Map(),plate:new Map(),bracket:new Map(),adj:new Map()};
  if (!d.plates) d.plates=[]; if (!d.brackets) d.brackets=[];
  for (const a of d.atoms){ ix.atom.set(a.id,a); ix.adj.set(a.id,[]); }
  d.bonds = d.bonds.filter(b=>ix.atom.has(b.a)&&ix.atom.has(b.b)&&b.a!==b.b);
  for (const b of d.bonds){ ix.bond.set(b.id,b); ix.adj.get(b.a).push({b,o:b.b}); ix.adj.get(b.b).push({b,o:b.a}); }
  for (const r of d.arrows) ix.arrow.set(r.id,r);
  d.texts = d.texts.filter(t=>!t.on || ix.bond.has(t.on.b)); // a caption on a bond goes with the bond
  for (const t of d.texts) ix.text.set(t.id,t);
  for (const p of d.pluses) ix.plus.set(p.id,p);
  for (const q of d.plates) ix.plate.set(q.id,q);
  for (const q of d.brackets) ix.bracket.set(q.id,q);
  placeCaptions(d, ix);
  return ix;
}
// Captions on bonds. t.on = {b, u, v, s}: u is the offset along the bond from its middle; s (+1 or -1) is the side and
// v the gap from the bond to the near edge of the caption, so a longer caption grows away from the bond.
// If the caption itself moved, its new place sets the offsets; if the bond moved (or the caption changed size), the caption follows.
// mx, my, a, e and tx, ty remember the bond, the caption's half-depth and the caption as last placed.
function captionFrame(d, ix, t, text){
  const b=ix.bond.get(t.on.b), A=ix.atom.get(b.a), B=ix.atom.get(b.b), ang=Math.atan2(B.y-A.y,B.x-A.x), u=V(Math.cos(ang),Math.sin(ang)), n=V(-u.y,u.x);
  const tm=textMetrics(d,{...t,text:(text ?? t.text)||' '});
  return {m:V((A.x+B.x)/2,(A.y+B.y)/2), ang, u, n, ext:Math.abs(n.x)*tm.w/2+Math.abs(n.y)*tm.h/2};
}
// where a caption goes for its offsets (and, while it is being typed, for the text so far)
function captionPos(d, ix, t, text){ const f=captionFrame(d,ix,t,text), o=t.on, across=(o.s<0?-1:1)*(o.v+f.ext);
  return V(f.m.x+f.u.x*o.u+f.n.x*across, f.m.y+f.u.y*o.u+f.n.y*across); }
function placeCaptions(d, ix){
  for (const t of d.texts){ const o=t.on; if (!o) continue;
    const {m,ang,u,n,ext}=captionFrame(d,ix,t);
    const textMoved = o.tx!=null && (Math.abs(t.x-o.tx)>1e-6 || Math.abs(t.y-o.ty)>1e-6);
    const moved = o.mx==null || Math.abs(o.mx-m.x)>1e-6 || Math.abs(o.my-m.y)>1e-6 || Math.abs(o.a-ang)>1e-9 || Math.abs((o.e??ext)-ext)>1e-6;
    if (textMoved){ const r=V(t.x-m.x,t.y-m.y), across=dot(r,n); o.u=dot(r,u); o.s=across<0?-1:1; o.v=Math.abs(across)-ext; }
    else if (moved){ const p=captionPos(d,ix,t); t.x=p.x; t.y=p.y; }
    o.mx=m.x; o.my=m.y; o.a=ang; o.e=ext; o.tx=t.x; o.ty=t.y; }
}
function bondSum(ix,id){ let s=0; for(const {b} of ix.adj.get(id)||[]) if (!b.kind) s+=b.order; return s; }
// what an atom label shows: D and T for hydrogen isotopes, otherwise the element (the mass number is drawn separately)
function atomSymbol(a){ return a.el==='H' && (a.iso===2||a.iso===3) ? (a.iso===2?'D':'T') : a.el; }
function implicitH(atom, bsum){
  if (kindOf(atom.el)!=='element') return 0;
  const vals=VAL[atom.el]; if(!vals) return 0;
  const g=GROUP[atom.el], ch=atom.charge||0;
  for (const v0 of vals){
    let v=v0;
    if (g==='c') v=v0-Math.abs(ch); else if (g==='n'||g==='o'||g==='x') v=v0+ch; else if (g==='b') v=v0-ch; else if (g==='h') v=v0-Math.abs(ch);
    if (v>=bsum) return Math.max(0, v-bsum-(atom.rad?1:0));
    if (g==='x') return 0; // a halogen in a higher valence state never takes H to fill it (no "BrH" on CBr(C)(C)C)
  }
  return 0;
}
// Hydrogens shown on an atom. A label typed with a count the bonds don't allow (CH3 on a carbon with two bonds) is kept as typed:
// hl holds it, and only while its element is the atom's, so changing the atom drops it. hs shows a carbon's label with its hydrogens (CH2).
function typedH(a){ const m=a.hl && /^([A-Z][a-z]?)H(\d*)$/.exec(a.hl); return m && m[1]===a.el ? (m[2]===''? 1 : +m[2]) : null; }
function labelH(a, ix){ const t=typedH(a); return t!=null ? t : implicitH(a, bondSum(ix,a.id)); }
// once the bonds make a typed count right (a bond was added or removed), the label follows the bonds from then on
function settleTypedH(d, ix){ for (const a of d.atoms) if (a.hl && (typedH(a)==null || typedH(a)===implicitH(a, bondSum(ix,a.id)))){ if (typedH(a)!=null && a.el==='C') a.hs=true; delete a.hl; } }
// a carbon is drawn as a bare vertex unless it stands alone, has a mass number, is set to show its hydrogens, or the drawing shows them (doc.showCH: 'end' or 'all')
function carbonShown(d, a, deg){ return deg===0 || !!a.iso || !!a.hs || typedH(a)!=null || (d && d.showCH==='all') || (d && d.showCH==='end' && deg===1); }
// halogens go past one bond only towards electronegative partners: ClO4-, BrF5, ICl3, PhI(OAc)2, IBX, Togni reagents
const HYPER_LIG=new Set(['N','O','F','Cl']);
// atoms with more bonds than their valence allows (charge and radicals counted, as in implicitH); nicknames take one bond
const OCTET=new Set(['B','C','N','O','F']);
function valenceError(atom, ix){
  const n=(ix.adj.get(atom.id)||[]).filter(({b})=>!b.kind).length, k=kindOf(atom.el);
  if (k==='abbr') return n>1 ? {have:n, max:1, why:`${atom.el} has ${n} bonds (a group label takes one)`} : null;
  if (k!=='element') return null;
  const vals=VAL[atom.el]; if (!vals) return null; // metals: no fixed valence
  const g=GROUP[atom.el], ch=atom.charge||0;
  let max=-1; for (const v0 of vals){ let v=v0; if (g==='c') v=v0-Math.abs(ch); else if (g==='n'||g==='o'||g==='x') v=v0+ch; else if (g==='b') v=v0-ch; else if (g==='h') v=v0-Math.abs(ch); max=Math.max(max,v, v0>vals[0]? v0+Math.abs(ch) : -1); } // hypervalent states take a charge as an extra bond (PF6-, IF6-)
  const bs=bondSum(ix,atom.id), have=bs+(atom.rad?1:0), th=typedH(atom);
  if (th!=null && th!==implicitH(atom,bs)){ const can=implicitH(atom,bs);
    return {have:bs+th, max:bs+can, why:`${atom.hl} was typed, but with ${bs} bond${bs===1?'':'s'} this ${atom.el} takes ${can} H (${atom.el}${can?'H'+(can>1?can:''):''})`}; }
  if (g==='x' && have>vals[0]+ch && have<=max && !(ix.adj.get(atom.id)||[]).some(({o})=>{ const e=ix.atom.get(o)?.el; return e!==atom.el && HYPER_LIG.has(e); })){
    const label=atom.el+(ch? (Math.abs(ch)>1?Math.abs(ch):'')+(ch>0?'+':'\u2212') : '');
    return {have, max:vals[0]+ch, why:`${label} has ${have} bond${have>1?'s':''}${atom.rad?' (counting the radical)':''}; a halogen takes more than ${vals[0]+ch} only with O, N or F partners (e.g. ClO4\u2212, BrF5, PhI(OAc)2)`};
  }
  if (have<=max){
    // octet (duet for H): second-row atoms can't hold more than 8 electrons, so drawn lone pairs count too
    const cap = atom.el==='H' ? 2 : OCTET.has(atom.el) ? 8 : 0;
    if (!cap || !atom.lp) return null;
    const h=implicitH(atom,bs), e=2*(bs+h)+2*atom.lp+(atom.rad?1:0);
    if (e<=cap) return null;
    const lab=atom.el+(ch? (Math.abs(ch)>1?Math.abs(ch):'')+(ch>0?'+':'\u2212') : '');
    return {have:e, max:cap, why:`${lab} has ${e} electrons (${bs+h} bond${bs+h===1?'':'s'}${h?` incl. ${h} H`:''}, ${atom.lp} lone pair${atom.lp>1?'s':''}${atom.rad?', 1 radical':''}); at most ${cap} (${cap===8?'octet':'duet'} rule)`};
  }
  const label=atom.el+(ch? (Math.abs(ch)>1?Math.abs(ch):'')+(ch>0?'+':'\u2212') : '');
  return {have, max, why:`${label} has ${have} bond${have>1?'s':''}${atom.rad?' (counting the radical)':''}; at most ${max}`};
}
function components(d, ix, atomIds){
  const allowed = atomIds ? new Set(atomIds) : null;
  const seen=new Set(), comps=[];
  for (const a of d.atoms){
    if (seen.has(a.id) || (allowed && !allowed.has(a.id))) continue;
    const comp=[], st=[a.id]; seen.add(a.id);
    while (st.length){ const id=st.pop(); comp.push(id);
      for (const {o} of ix.adj.get(id)) if(!seen.has(o) && (!allowed||allowed.has(o))){ seen.add(o); st.push(o); } }
    comps.push(comp);
  }
  return comps;
}
// shortest ring through a bond (atom path from b.a to b.b not using the bond)
function ringPath(ix, bond, maxLen=8){
  const prev=new Map([[bond.a,null]]); let frontier=[bond.a];
  for (let depth=0; depth<maxLen-1 && frontier.length; depth++){
    const next=[];
    for (const id of frontier) for (const {b,o} of ix.adj.get(id)){
      if (b===bond || prev.has(o)) continue;
      prev.set(o,id);
      if (o===bond.b){ const path=[]; let c=o; while(c!=null){path.push(c); c=prev.get(c);} return path; }
      next.push(o);
    }
    frontier=next;
  }
  return null;
}

/* ================= labels ================= */
function chemRuns(str){ // digits after letters/brackets become subscripts
  const runs=[]; let cur='', sub=false;
  for (let i=0;i<str.length;i++){
    const ch=str[i], isD=/[0-9]/.test(ch);
    const s = isD && i>0 && (sub || /[A-Za-z)\]'’]/.test(str[i-1]));
    if (s!==sub && cur){ runs.push({t:cur,sub}); cur=''; }
    sub=s; cur+=ch;
  }
  if (cur) runs.push({t:cur,sub});
  return runs;
}
// a label with markup (R^{1}, X_{a}) is formatted like text; otherwise digits after letters are subscripts (CO2Me)
const labelRuns=str=>/[\\^_]/.test(str) ? textRuns(str).map(r=>({t:r.t, sub:r.m==='sub', sup:r.m==='sup'})) : chemRuns(str);
function chargeText(c){ if(!c) return ''; const a=Math.abs(c); return (a>1?a:'')+(c>0?'+':'\u2212'); }

function layoutLabel(d, ix, atom){
  const st=S(d), fs=st.fontSize, fw=st.fontWeight, m=st.margin;
  const nb=ix.adj.get(atom.id)||[];
  const dirs = nb.map(({o})=>{const q=ix.atom.get(o); return norm(sub(q,atom));});
  const kind=kindOf(atom.el);
  const visible = atom.el!=='C' || carbonShown(d, atom, nb.length);
  const info={visible, dirs, items:[], box:null, extra:[]};
  const score=dv=>dirs.reduce((s,v)=>s+Math.max(0,dot(v,dv)),0);
  const sr=score(V(1,0)), sl=score(V(-1,0)), sb=score(V(0,1)), sa=score(V(0,-1));
  let side = sr<=sl+0.01 ? 'right' : 'left';
  if (!visible){
    info.hDir=null;
    return info;
  }
  const h = kind==='element' ? labelH(atom, ix) : 0;
  if (kind==='element' && h>0 && Math.min(sr,sl)>0.45 && Math.min(sb,sa)<Math.min(sr,sl)) side = sb<=sa ? 'below':'above';
  let runs, anchorFirst=true;
  if (kind==='element'){
    const sym=atomSymbol(atom), iso = atom.iso && sym===atom.el ? [{t:String(atom.iso),sup:true}] : [];
    const hr = h>0 ? [{t:'H',sub:false}].concat(h>1?[{t:String(h),sub:true}]:[]) : [];
    if (side==='left' && hr.length){ runs=[...hr,...iso,{t:sym,sub:false,main:true}]; anchorFirst=false; }
    else runs=[...iso,{t:sym,sub:false,main:true}].concat(side==='right'?hr:[]);
    if ((side==='below'||side==='above') && hr.length) info.vert=hr;
    if (side==='left' && !hr.length) { runs=[...iso,{t:sym,sub:false,main:true}]; }
  } else {
    let str=atom.el;
    if (side==='left' && nb.length){ str = (ABBR[atom.el] && ABBR[atom.el].l) || atom.el; anchorFirst=false; }
    runs=labelRuns(str);
  }
  // measure runs
  let x=0; const placed=[];
  for (const r of runs){ const size=r.sub||r.sup?fs*0.72:fs; const w=tw(r.t,size,fw); placed.push({...r,size,x,w}); x+=w; }
  const total=x;
  let anchorC;
  if (anchorFirst){ const f=placed.find(r=>!r.sup); const ch = f.main ? f.t : f.t[0]; anchorC = f.x + tw(ch,f.size,fw)/2; }
  else { let k=placed.length-1; while(k>0 && (placed[k].sub||placed[k].sup)) k--; const r=placed[k]; const ch = r.main ? r.t : r.t[r.t.length-1]; const cw=tw(ch,r.size,fw); anchorC = r.x + r.w - cw/2; }
  const shift = atom.x - anchorC, base = atom.y + fs*0.36;
  for (const p of placed) info.items.push({t:p.t, x:p.x+shift, y: base + (p.sub? fs*0.24 : p.sup? -fs*0.42 : 0), size:p.size});
  const x0=shift, x1=shift+total;
  info.box={x0:x0-m, x1:x1+m, y0:atom.y-fs*0.44-m, y1:atom.y+fs*0.44+m};
  let rowEnd=x1;
  if (info.vert){
    const dy = side==='below' ? fs*1.02 : -fs*1.02;
    const hw=tw('H',fs,fw); let vx=atom.x-hw/2;
    for (const r of info.vert){ const size=r.sub?fs*0.72:fs; info.items.push({t:r.t,x:vx,y:base+dy+(r.sub?fs*0.24:0),size}); vx+=tw(r.t,size,fw); }
    info.hDir = V(0, side==='below'?1:-1);
  } else if (runs.length>1 || kind!=='element') {
    info.hDir = side==='left' ? V(-1,0) : V(1,0);
  }
  if (atom.charge){
    const ct=chargeText(atom.charge);
    const ex = side==='left' && kind==='element' ? (atom.x + tw(atomSymbol(atom),fs,fw)/2) : rowEnd;
    info.items.push({t:ct, x:ex+0.5, y:base-fs*0.42, size:fs*0.72});
  }
  return info;
}
function clipRay(o, dir, box){
  if (!box) return o;
  if (o.x<box.x0||o.x>box.x1||o.y<box.y0||o.y>box.y1) return o;
  let t=Infinity;
  if (dir.x>1e-9) t=Math.min(t,(box.x1-o.x)/dir.x); else if (dir.x<-1e-9) t=Math.min(t,(box.x0-o.x)/dir.x);
  if (dir.y>1e-9) t=Math.min(t,(box.y1-o.y)/dir.y); else if (dir.y<-1e-9) t=Math.min(t,(box.y0-o.y)/dir.y);
  return t===Infinity ? o : add(o,mul(dir,t));
}
// free directions around an atom (for lone pairs, radicals, carbon charges)
function freeDirs(info, count){
  const occ=[...info.dirs]; if (info.hDir) occ.push(info.hDir);
  const cands=[V(0,-1),V(1,0),V(0,1),V(-1,0),norm(V(1,-1)),norm(V(1,1)),norm(V(-1,1)),norm(V(-1,-1))];
  const chosen=[];
  for (let k=0;k<count;k++){
    let best=null,bs=-9;
    for (const c of cands){ if (chosen.includes(c)) continue;
      const all=occ.concat(chosen); const s = all.length ? Math.min(...all.map(o=>Math.acos(Math.max(-1,Math.min(1,dot(o,c)))))) : 9-cands.indexOf(c)*0.01;
      if (s>bs+1e-6){bs=s;best=c;} }
    if (best) chosen.push(best);
  }
  return chosen;
}

/* ================= rendering ================= */
function strokeLine(a,b,w,col,cap='round',extra=''){ return `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}"${extra}/>`; }

function renderBond(d, ix, b, labels, out){
  const st=S(d), lw=st.lineWidth, s=L*st.spacing;
  const A=ix.atom.get(b.a), B=ix.atom.get(b.b);
  const la=labels.get(A.id), lb=labels.get(B.id);
  const col=b.color||'#000';
  const u=norm(sub(B,A)), n=perp(u);
  const boxA=la.visible?la.box:null, boxB=lb.visible?lb.box:null;
  const seg=(off)=>{ const o1=add(A,mul(n,off)), o2=add(B,mul(n,off)); return [clipRay(o1,u,boxA), clipRay(o2,mul(u,-1),boxB)]; };
  const [p,q]=seg(0);
  if (dist(p,q)<0.5) return;
  if (b.kind==='hbond'){ out.push(strokeLine(p,q,lw,col,'butt',` stroke-dasharray="${f2(lw*2.5)} ${f2(lw*2.5)}"`)); return; }
  if (b.kind==='dative'){ const hl=Math.min(dist(p,q)*0.4, st.wedge*1.3), hw=st.wedge*0.5, base2=add(q,mul(u,-hl));
    out.push(strokeLine(p,base2,lw,col,'butt'));
    out.push(`<path d="M${f2(q.x)} ${f2(q.y)}L${f2(base2.x+n.x*hw)} ${f2(base2.y+n.y*hw)}L${f2(base2.x-n.x*hw)} ${f2(base2.y-n.y*hw)}Z" fill="${col}"/>`); return; }
  if (b.order===1){
    if (b.stereo==='wedge'){
      const w=st.wedge/2;
      out.push(`<path d="M${f2(p.x)} ${f2(p.y)}L${f2(q.x+n.x*w)} ${f2(q.y+n.y*w)}L${f2(q.x-n.x*w)} ${f2(q.y-n.y*w)}Z" fill="${col}" stroke="${col}" stroke-width="${lw*0.4}" stroke-linejoin="round"/>`);
      return;
    }
    if (b.stereo==='hash'){
      const L2=dist(p,q), cnt=Math.max(3,Math.round(L2/st.hashSpacing)), w=st.wedge/2;
      let dd='';
      for (let i=0;i<=cnt;i++){ const t=i/cnt; const c=add(p,mul(sub(q,p),t)); const hw=Math.max(lw*0.5, w*t);
        if (i===0) continue;
        dd+=`M${f2(c.x+n.x*hw)} ${f2(c.y+n.y*hw)}L${f2(c.x-n.x*hw)} ${f2(c.y-n.y*hw)}`; }
      out.push(`<path d="${dd}" stroke="${col}" stroke-width="${lw}" fill="none"/>`);
      return;
    }
    if (b.stereo==='wavy'){
      const L2=dist(p,q), cnt=Math.max(3,Math.round(L2/2.6)), amp=1.5; let dd=`M${f2(p.x)} ${f2(p.y)}`;
      for (let i=0;i<cnt;i++){ const t0=i/cnt, t1=(i+1)/cnt; const mid=add(p,mul(sub(q,p),(t0+t1)/2)); const e=add(p,mul(sub(q,p),t1)); const sgn=i%2?1:-1;
        const c=add(mid,mul(n,amp*2*sgn)); dd+=`Q${f2(c.x)} ${f2(c.y)} ${f2(e.x)} ${f2(e.y)}`; }
      out.push(`<path d="${dd}" stroke="${col}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`);
      return;
    }
    if (b.stereo==='bold'){ out.push(strokeLine(p,q,st.boldWidth,col,'butt')); return; }
    out.push(strokeLine(p,q,lw,col)); return;
  }
  if (b.order===3){
    out.push(strokeLine(p,q,lw,col));
    for (const k of [1,-1]){ const [a2,b2]=seg(s*k); out.push(strokeLine(a2,b2,lw,col)); }
    return;
  }
  // double
  let side = 0;
  if (b.dbPos==='center') side=0; else if (b.dbPos==='left') side=1; else if (b.dbPos==='right') side=-1;
  else {
    const ring=ringPath(ix,b);
    if (ring && ring.length>=3){
      let c=V(0,0); for(const id of ring){ const q2=ix.atom.get(id); c=add(c,q2);} c=mul(c,1/ring.length);
      side = cross(u, sub(c,A))>0 ? 1 : -1;
    } else {
      let sc=0, cnt=0;
      for (const [X,other] of [[A,B],[B,A]]) for (const {o} of ix.adj.get(X.id)){ if (o===other.id) continue; const q2=ix.atom.get(o); const c=cross(u, sub(q2,A)); sc+=Math.sign(c); cnt++; }
      const degA=ix.adj.get(A.id).length, degB=ix.adj.get(B.id).length;
      if (sc===0 || (la.visible&&degA===1) || (lb.visible&&degB===1)) side=0; else side = sc>0?1:-1;
      if ((la.visible&&degA===1)||(lb.visible&&degB===1)) side=0;
    }
  }
  if (side===0){
    for (const k of [0.5,-0.5]){ const [a2,b2]=seg(s*k); out.push(strokeLine(a2,b2,lw,col)); }
    return;
  }
  out.push(strokeLine(p,q,lw,col));
  let [a2,b2]=seg(s*side);
  const trim=s*0.62;
  if (!la.visible && ix.adj.get(A.id).length>1) a2=add(a2,mul(u,trim)); else if (!la.visible) a2=add(a2,mul(u,trim*0.4));
  if (!lb.visible && ix.adj.get(B.id).length>1) b2=add(b2,mul(u,-trim)); else if (!lb.visible) b2=add(b2,mul(u,-trim*0.4));
  if (dist(a2,b2)>0.5) out.push(strokeLine(a2,b2,lw,col));
}

function atomColor(d, a){ return a.color || (d.colorAtoms && CPK[a.el]) || '#000'; }
function renderAtomDecor(d, ix, a, info, out){
  const st=S(d), fs=st.fontSize, fw=st.fontWeight, col=atomColor(d,a);
  if (info.visible){
    for (const it of info.items) out.push(`<text x="${f2(it.x)}" y="${f2(it.y)}" font-size="${f2(it.size)}" font-weight="${fw}" fill="${col}">${esc(it.t)}</text>`);
  }
  if (a.stg){ // enhanced stereo label, ChemDraw style: abs, &1, or1
    const dv=freeDirs(info, 1+(a.rad?1:0)+(a.lp||0)+(!info.visible&&a.charge?1:0)).slice(-1)[0]||V(0,-1), r=info.visible? Math.max(fs*0.9,(info.box.x1-info.box.x0)/2+fs*0.45) : fs*0.85;
    const c=add(a,mul(dv,r)), m=/^(abs|and|or)(\d*)$/.exec(a.stg), t = m[1]==='abs'? 'abs' : (m[1]==='and'?'&':'or')+(m[2]||'1');
    out.push(`<text x="${f2(c.x)}" y="${f2(c.y+fs*0.25)}" font-size="${f2(fs*0.72)}" font-weight="${fw}" fill="${col}" text-anchor="middle">${t}</text>`); }
  const need = (!info.visible && a.charge ? 1:0) + (a.rad?1:0) + (a.lp||0);
  if (!need) return;
  const dirsFree=freeDirs(info, need); let k=0;
  const radiusFor=dv=>{ if(!info.visible) return fs*0.42; const bx=info.box; const hw=(bx.x1-bx.x0)/2-st.margin, hh=(bx.y1-bx.y0)/2-st.margin;
    return Math.abs(dv.x)>Math.abs(dv.y)? (dv.x>0? bx.x1-st.margin-a.x : a.x-(bx.x0+st.margin))+1.6 : hh+1.7; };
  if (!info.visible && a.charge){ const dv=dirsFree[k++]; const c=add(a,mul(dv,fs*0.55));
    out.push(`<text x="${f2(c.x)}" y="${f2(c.y+fs*0.27)}" font-size="${f2(fs*0.8)}" font-weight="${fw}" fill="${col}" text-anchor="middle">${chargeText(a.charge)}</text>`); }
  const dr=Math.max(0.55, st.lineWidth*1.05);
  if (a.rad){ const dv=dirsFree[k++]; if(dv){ const c=add(a,mul(dv,radiusFor(dv))); out.push(`<circle cx="${f2(c.x)}" cy="${f2(c.y)}" r="${dr}" fill="${col}"/>`);} }
  for (let i=0;i<(a.lp||0);i++){ const dv=dirsFree[k++]; if(!dv) break; const c=add(a,mul(dv,radiusFor(dv))); const pv=perp(dv);
    for (const sgn of [1,-1]){ const e=add(c,mul(pv,1.15*sgn)); out.push(`<circle cx="${f2(e.x)}" cy="${f2(e.y)}" r="${dr}" fill="${col}"/>`); } }
}

/* arrows */
function headFull(T,u,st,col){
  const hl=6.2*st.head, hw=2.3*st.head, notch=1.5*st.head, n=perp(u);
  const p1=add(sub(T,mul(u,hl)),mul(n,hw)), p2=sub(T,mul(u,hl-notch)), p3=sub(sub(T,mul(u,hl)),mul(n,hw));
  return `<path d="M${f2(T.x)} ${f2(T.y)}L${f2(p1.x)} ${f2(p1.y)}L${f2(p2.x)} ${f2(p2.y)}L${f2(p3.x)} ${f2(p3.y)}Z" fill="${col}" stroke="${col}" stroke-width="${st.lineWidth*0.5}" stroke-linejoin="miter"/>`;
}
function headHalf(T,u,st,col,sideSign){
  const hl=6.2*st.head, hw=2.4*st.head, notch=1.5*st.head, n=mul(perp(u),sideSign);
  const p1=add(sub(T,mul(u,hl)),mul(n,hw)), p2=sub(T,mul(u,hl-notch));
  return `<path d="M${f2(T.x)} ${f2(T.y)}L${f2(p1.x)} ${f2(p1.y)}L${f2(p2.x)} ${f2(p2.y)}Z" fill="${col}" stroke="${col}" stroke-width="${st.lineWidth*0.5}" stroke-linejoin="miter"/>`;
}
const CURVED = new Set(['curly','fishhook']);
function renderArrow(d, r, out, colOverride){
  const st=S(d), lw=st.lineWidth, col=colOverride||r.color||'#000';
  const P1=V(r.x1,r.y1), P2=V(r.x2,r.y2);
  if (dist(P1,P2)<1) return;
  if (CURVED.has(r.type)){
    const C = r.cx!=null ? V(r.cx,r.cy) : add(mul(add(P1,P2),0.5), mul(perp(norm(sub(P2,P1))), -dist(P1,P2)*0.35));
    const u=norm(sub(P2,C)), hl=6.2*st.head;
    const back=r.type==='curly'? hl-1.5*st.head : hl*0.75;
    const E=sub(P2,mul(u,back*0.85));
    // pull the control point so the tangent at the end stays aligned
    out.push(`<path d="M${f2(P1.x)} ${f2(P1.y)}Q${f2(C.x)} ${f2(C.y)} ${f2(E.x)} ${f2(E.y)}" fill="none" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/>`);
    // half head on the outside of the curve
    const sideSign = cross(sub(P2,P1), sub(C,P1))>0 ? -1 : 1;
    out.push(r.type==='curly' ? headFull(P2,u,st,col) : headHalf(P2,u,st,col,-sideSign));
    return;
  }
  const u=norm(sub(P2,P1)), n=perp(u), hl=6.2*st.head, notchBack=hl-1.5*st.head;
  switch (r.type){
    case 'equilibrium': {
      const o=1.7*st.head;
      const a1=add(P1,mul(n,-o)), a2=add(P2,mul(n,-o)); // upper (n negative is visually up for left-to-right)
      const b1=add(P1,mul(n,o)), b2=add(P2,mul(n,o));
      out.push(strokeLine(a1, sub(a2,mul(u,hl*0.6)), lw, col, 'butt'));
      out.push(headHalf(a2,u,st,col,-1));
      out.push(strokeLine(add(b1,mul(u,hl*0.6)), b2, lw, col, 'butt'));
      out.push(headHalf(b1,mul(u,-1),st,col,-1));
      return; }
    case 'retro': {
      const o=1.9*st.head, hh=4.6*st.head, back=5.4*st.head;
      const tb=o*back/hh;
      out.push(strokeLine(add(P1,mul(n,o)), sub(add(P2,mul(n,o)),mul(u,tb)), lw, col,'butt'));
      out.push(strokeLine(add(P1,mul(n,-o)), sub(add(P2,mul(n,-o)),mul(u,tb)), lw, col,'butt'));
      const q1=add(sub(P2,mul(u,back)),mul(n,hh)), q2=add(sub(P2,mul(u,back)),mul(n,-hh));
      out.push(`<path d="M${f2(q1.x)} ${f2(q1.y)}L${f2(P2.x)} ${f2(P2.y)}L${f2(q2.x)} ${f2(q2.y)}" fill="none" stroke="${col}" stroke-width="${lw}" stroke-linejoin="miter" stroke-linecap="butt"/>`);
      return; }
    case 'resonance': {
      out.push(strokeLine(add(P1,mul(u,notchBack*0.9)), sub(P2,mul(u,notchBack*0.9)), lw, col,'butt'));
      out.push(headFull(P2,u,st,col)); out.push(headFull(P1,mul(u,-1),st,col)); return; }
    case 'dashed': {
      out.push(strokeLine(P1, sub(P2,mul(u,notchBack*0.9)), lw, col,'butt', ` stroke-dasharray="${f2(2.6*st.head)} ${f2(1.8*st.head)}"`));
      out.push(headFull(P2,u,st,col)); return; }
    case 'nogo': {
      out.push(strokeLine(P1, sub(P2,mul(u,notchBack*0.9)), lw, col,'butt'));
      out.push(headFull(P2,u,st,col));
      const m=mul(add(P1,P2),0.5), s=3.4*st.head, d1=norm(add(u,n)), d2=norm(sub(u,n));
      out.push(strokeLine(sub(m,mul(d1,s)),add(m,mul(d1,s)),lw,col,'butt'));
      out.push(strokeLine(sub(m,mul(d2,s)),add(m,mul(d2,s)),lw,col,'butt'));
      return; }
    default: {
      out.push(strokeLine(P1, sub(P2,mul(u,notchBack*0.9)), lw, col,'butt'));
      out.push(headFull(P2,u,st,col));
    }
  }
}
function arrowControl(r){ const P1=V(r.x1,r.y1),P2=V(r.x2,r.y2); return r.cx!=null?V(r.cx,r.cy):add(mul(add(P1,P2),0.5), mul(perp(norm(sub(P2,P1))), -dist(P1,P2)*0.35)); }
function arrowSamples(r){
  const P1=V(r.x1,r.y1),P2=V(r.x2,r.y2);
  if (!CURVED.has(r.type)) return [P1,P2];
  const C=arrowControl(r), pts=[]; for(let i=0;i<=24;i++) pts.push(quadPt(P1,C,P2,i/24)); return pts;
}

/* text objects */
// Text markup, one formatted character per entry ({c, m:'n'|'sub'|'sup', auto?, keep?}):
//   _{…} subscript, ^{…} superscript (anything: pK_{a}, Fe^{III}, S_{N}2, ΔG^{‡}),
//   ^ followed by digits or charge signs is a superscript too (^13C, SO4^2-),
//   digits after a letter or a closing bracket are subscripts on their own (H2SO4, Pd(PPh3)4),
//   a backslash keeps the next digit, ^, _ or \ as it is (E\2 for the E2 mechanism).
const SUP_SHORT=/[0-9+\-−·•δ‡†]/, AUTO_AFTER=/[A-Za-z)\]]/;
const chargeLike=s=>/^[0-9]*[+\-−]+[0-9]*$/.test(s);
function textChars(str){
  const out=[]; let i=0;
  const push=(c,m,f)=>out.push({c,m,...f});
  while (i<str.length){
    const ch=str[i], nx=str[i+1];
    if (ch==='\\' && nx!=null && /[0-9^_\\]/.test(nx)){ push(nx,'n', /[0-9]/.test(nx) && autoAt(out)? {keep:true} : {}); i+=2; continue; }
    if ((ch==='^' || ch==='_') && nx==='{'){
      let j=i+2, body=''; while (j<str.length && str[j]!=='}'){ if (str[j]==='\\' && (str[j+1]==='}'||str[j+1]==='\\')) j++; body+=str[j]; j++; }
      if (j<str.length){ const m=ch==='^'?'sup':'sub'; if (m==='sup' && chargeLike(body)) body=body.replace(/-/g,'\u2212');
        for (const c of body) push(c,m); i=j+1; continue; }
    }
    if (ch==='^'){ let j=i+1; while (j<str.length && SUP_SHORT.test(str[j])) j++;
      if (j>i+1){ for (const c of str.slice(i+1,j).replace(/-/g,'\u2212')) push(c,'sup'); i=j; continue; } }
    if (/[0-9]/.test(ch) && autoAt(out)){ push(ch,'sub',{auto:true}); i++; continue; }
    push(ch,'n'); i++;
  }
  return out;
}
// would a digit typed after these characters become a subscript on its own?
function autoAt(cs){ const p=cs[cs.length-1]; return !!p && ((p.m==='n' && !p.keep && AUTO_AFTER.test(p.c)) || (p.m==='sub' && p.auto)); }
// re-derive the automatic subscripts after an edit: a digit after a letter is a subscript unless it is marked keep
function normalizeChars(cs){
  const out=[]; let set=false; // set: the last character is a subscript digit the user set (written plainly, so a normal digit after it must be kept)
  for (const x of cs){
    const m=x.c==='\n' || x.auto || !x.m ? 'n' : x.m; // an automatic subscript is normal text that the rule below subscripts again
    if (/[0-9]/.test(x.c) && m!=='sup' && autoAt(out)){
      if (m==='n' && (x.keep || set)) out.push({c:x.c,m,keep:true});
      else { out.push({c:x.c,m:'sub',auto:true}); set=m==='sub'; continue; } // a subscript digit the rule gives anyway is written plainly (H2O)
    }
    else out.push({c:x.c,m});
    set=false;
  }
  return out;
}
// formatted characters back to markup (the inverse of textChars, giving the same rendering)
function charsToMarkup(cs){
  cs=normalizeChars(cs); const out=[]; let i=0; // pieces; a lone backslash is escaped once we know what follows it
  while (i<cs.length){
    const x=cs[i];
    if (x.m==='n'){ const nx=cs[i+1]&&cs[i+1].m==='n'?cs[i+1].c:'';
      out.push(x.keep? '\\'+x.c : x.c==='\\'? {bs:true} : (x.c==='^' && (nx==='{' || SUP_SHORT.test(nx))) || (x.c==='_' && nx==='{')? '\\'+x.c : x.c);
      i++; continue; }
    if (x.auto){ out.push(x.c); i++; continue; }
    let j=i, body=''; while (j<cs.length && cs[j].m===x.m && !cs[j].auto && cs[j].c!=='\n'){ body+=cs[j].c; j++; }
    if (x.m==='sup' && chargeLike(body.replace(/\u2212/g,'-'))) body=body.replace(/\u2212/g,'-');
    out.push((x.m==='sup'?'^{':'_{')+body.replace(/\\/g,'\\\\').replace(/}/g,'\\}')+'}');
    i=j;
  }
  return out.map((p,k)=>p.bs? (/^[0-9^_\\]/.test(typeof out[k+1]==='string'? out[k+1] : out[k+1]? '\\' : '')? '\\\\' : '\\') : p).join('');
}
// a whole (multi-line) text as formatted characters; each line is read on its own, as it is drawn
const textCharsAll=str=>String(str||'').split('\n').flatMap((ln,i)=>(i?[{c:'\n',m:'n'}]:[]).concat(textChars(ln)));
const plainText=str=>textCharsAll(str).map(x=>x.c).join('');
function textRuns(str){
  const runs=[];
  for (const x of textChars(str)){ const r=runs[runs.length-1]; if (r && r.m===x.m) r.t+=x.c; else runs.push({t:x.c,m:x.m}); }
  return runs;
}
function textFont(d,t){
  const st=S(d); const fs=t.size||st.fontSize; const fw = t.bold==null ? st.fontWeight : (t.bold?700:400);
  return {fs, fw, family:FAMILIES[t.font]||FONT, italic:!!t.italic};
}
function textMetrics(d,t){
  const f=textFont(d,t);
  const lines=(t.text||'').split('\n');
  let w=0; const widths=[];
  for (const ln of lines){ let lw=0; for (const r of textRuns(ln)) lw+=tw(r.t, r.m==='n'?f.fs:f.fs*0.72, f.fw, f.family, f.italic); widths.push(lw); w=Math.max(w,lw); }
  const lh=f.fs*1.2, h=lines.length*lh;
  return {lines,w,h,lh,widths,...f};
}
function renderText(d,t,out){
  const m=textMetrics(d,t), col=t.color||'#000', align=t.align||'center';
  const top=t.y-m.h/2;
  const anchor = align==='left'?'start':align==='right'?'end':'middle';
  const x = align==='left'? t.x-m.w/2 : align==='right'? t.x+m.w/2 : t.x;
  m.lines.forEach((ln,i)=>{
    const base=top+i*m.lh+m.fs*0.92;
    let spans='', shift=0;
    for (const r of textRuns(ln)){
      const target = r.m==='sub'? m.fs*0.24 : r.m==='sup'? -m.fs*0.38 : 0;
      const dy=target-shift; shift=target;
      spans+=`<tspan${dy?` dy="${f2(dy)}"`:''}${r.m!=='n'?` font-size="${f2(m.fs*0.72)}"`:''}>${esc(r.t)}</tspan>`;
    }
    out.push(`<text x="${f2(x)}" y="${f2(base)}" font-family="${esc(m.family)}" font-size="${f2(m.fs)}" font-weight="${m.fw}"${m.italic?' font-style="italic"':''} fill="${col}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`);
  });
}
function renderPlus(d,p,out){ const st=S(d), s=3.8*st.head, col=p.color||'#000';
  out.push(strokeLine(V(p.x-s,p.y),V(p.x+s,p.y),st.lineWidth*1.1,col,'butt')); out.push(strokeLine(V(p.x,p.y-s),V(p.x,p.y+s),st.lineWidth*1.1,col,'butt')); }

/* ================= brackets ================= */
// a pair of brackets around a box (x, y centre; w, h), drawn at the bond line width; the labels follow IUPAC:
// sup at the top right (a charge, ‡), sub at the bottom right (n, a count)
const BRACKETS=['square','curly','round'];
const bracketText=s=>String(s||'').replace(/-/g,'−'); // a typed hyphen is a minus sign
function bracketGeom(d,q){
  const st=S(d), fs=st.fontSize*0.75, x0=q.x-q.w/2, x1=q.x+q.w/2, y0=q.y-q.h/2, y1=q.y+q.h/2;
  const lip=Math.min(st.bondLength*(q.type==='square'?0.22:0.3), q.h*(q.type==='curly'?0.38:0.3), q.w*0.45);
  return {x0, x1, y0, y1, lip, fs, lx:x1+fs*0.25, supY:y0+fs*0.55, subY:y1+fs*0.35};
}
function bracketBBox(d,q){ const g=bracketGeom(d,q), lw=S(d).lineWidth;
  const lab=Math.max(q.sup? tw(bracketText(q.sup),g.fs) : 0, q.sub? tw(bracketText(q.sub),g.fs) : 0);
  return {x0:g.x0-lw, y0:g.y0-lw-(q.sup?g.fs*0.3:0), x1: lab? g.lx+lab : g.x1+lw, y1:g.y1+lw+(q.sub?g.fs*0.45:0)}; }
// one bracket: xe is its outer edge, dir +1 for the left bracket (opening right), -1 for the right one
function bracketPath(type, xe, y0, y1, w, dir){
  const X=f=>f2(xe+dir*f*w), Y=f2, h=y1-y0, ym=(y0+y1)/2;
  if (type==='round') return `M${X(1)} ${Y(y0)}C${X(-0.05)} ${Y(y0+h*0.2)} ${X(-0.05)} ${Y(y1-h*0.2)} ${X(1)} ${Y(y1)}`;
  if (type==='curly'){ const k=w*0.62, xs=X(0.5);
    return `M${X(1)} ${Y(y0)}C${X(0.62)} ${Y(y0)} ${xs} ${Y(y0+k*0.25)} ${xs} ${Y(y0+k)}L${xs} ${Y(ym-k)}C${xs} ${Y(ym-k*0.25)} ${X(0.32)} ${Y(ym)} ${X(0)} ${Y(ym)}`+
      `C${X(0.32)} ${Y(ym)} ${xs} ${Y(ym+k*0.25)} ${xs} ${Y(ym+k)}L${xs} ${Y(y1-k)}C${xs} ${Y(y1-k*0.25)} ${X(0.62)} ${Y(y1)} ${X(1)} ${Y(y1)}`; }
  return `M${X(1)} ${Y(y0)}L${X(0)} ${Y(y0)}L${X(0)} ${Y(y1)}L${X(1)} ${Y(y1)}`;
}
function renderBracket(d,q,out,color){
  const st=S(d), g=bracketGeom(d,q), col=color||q.color||'#000', sq=q.type==='square';
  const path=bracketPath(q.type,g.x0,g.y0,g.y1,g.lip,1)+bracketPath(q.type,g.x1,g.y0,g.y1,g.lip,-1);
  out.push(`<path d="${path}" fill="none" stroke="${col}" stroke-width="${f2(st.lineWidth)}" stroke-linejoin="${sq?'miter':'round'}" stroke-linecap="${sq?'butt':'round'}"/>`);
  if (q.sup) out.push(`<text x="${f2(g.lx)}" y="${f2(g.supY)}" font-size="${f2(g.fs)}" fill="${col}">${esc(bracketText(q.sup))}</text>`);
  if (q.sub) out.push(`<text x="${f2(g.lx)}" y="${f2(g.subY)}" font-size="${f2(g.fs)}" fill="${col}">${esc(bracketText(q.sub))}</text>`);
}

/* ================= TLC plates ================= */
// geometry of a plate: lane x positions, origin and front y, spot y for an Rf
function plateGeom(d,q){
  const x0=q.x-q.w/2, y0=q.y-q.h/2, n=Math.max(1,q.lanes.length);
  const yO=y0+q.h*(1-q.origin), yF=y0+q.h*(1-q.front), lane=i=>x0+q.w*(i+1)/(n+1);
  const rx=Math.min(q.w/(n+1)*0.3, S(d).fontSize*0.55), ry=rx*0.62;
  return {x0, y0, x1:x0+q.w, y1:y0+q.h, yO, yF, lane, rx, ry, rfY:rf=>yO-rf*(yO-yF)};
}
function plateBBox(d,q){ const g=plateGeom(d,q), fs=S(d).fontSize; return {x0:g.x0-(q.showRf?0:0), y0:g.y0-(q.solvent?fs*1.5:0), x1:g.x1+(q.showRf?fs*2.2:0), y1:g.y1+(q.lanes.some(l=>l.label)?fs*1.5:0)}; }
const ellPath=(cx,cy,rx,ry)=>{ const k=0.5523; return `M${f2(cx+rx)} ${f2(cy)}C${f2(cx+rx)} ${f2(cy+k*ry)} ${f2(cx+k*rx)} ${f2(cy+ry)} ${f2(cx)} ${f2(cy+ry)}C${f2(cx-k*rx)} ${f2(cy+ry)} ${f2(cx-rx)} ${f2(cy+k*ry)} ${f2(cx-rx)} ${f2(cy)}C${f2(cx-rx)} ${f2(cy-k*ry)} ${f2(cx-k*rx)} ${f2(cy-ry)} ${f2(cx)} ${f2(cy-ry)}C${f2(cx+k*rx)} ${f2(cy-ry)} ${f2(cx+rx)} ${f2(cy-k*ry)} ${f2(cx+rx)} ${f2(cy)}Z`; };
function renderPlate(d,q,out){
  const st=S(d), fs=st.fontSize, lw=st.lineWidth, g=plateGeom(d,q), col=q.color||'#000';
  out.push(`<path d="M${f2(g.x0)} ${f2(g.y0)}L${f2(g.x1)} ${f2(g.y0)}L${f2(g.x1)} ${f2(g.y1)}L${f2(g.x0)} ${f2(g.y1)}Z" fill="none" stroke="${col}" stroke-width="${f2(lw)}" stroke-linejoin="round"/>`);
  out.push(`<line x1="${f2(g.x0)}" y1="${f2(g.yF)}" x2="${f2(g.x1)}" y2="${f2(g.yF)}" stroke="${col}" stroke-width="${f2(lw*0.8)}"/>`);
  out.push(`<line x1="${f2(g.x0)}" y1="${f2(g.yO)}" x2="${f2(g.x1)}" y2="${f2(g.yO)}" stroke="${col}" stroke-width="${f2(lw*0.8)}" stroke-dasharray="${f2(fs*0.3)} ${f2(fs*0.2)}"/>`);
  if (q.solvent) out.push(`<text x="${f2(q.x)}" y="${f2(g.y0-fs*0.45)}" font-size="${f2(fs)}" text-anchor="middle" fill="${col}">${esc(q.solvent)}</text>`);
  q.lanes.forEach((ln,i)=>{ const lx=g.lane(i);
    if (ln.label) out.push(`<text x="${f2(lx)}" y="${f2(g.y1+fs*1.05)}" font-size="${f2(fs)}" text-anchor="middle" fill="${col}">${esc(ln.label)}</text>`);
    for (const sp of ln.spots){ const c=sp.color||(sp.style==='faint'?'#9aa0a6':'#3a3f44'), y=g.rfY(sp.rf);
      const fill = sp.style==='outline' ? 'none' : c, stroke = sp.style==='outline' ? c : 'none';
      if (sp.to!=null && Math.abs(sp.to-sp.rf)>0.01){ const ya=g.rfY(Math.max(sp.rf,sp.to)), yb=g.rfY(Math.min(sp.rf,sp.to)), r=g.rx; // streak
        out.push(`<path d="M${f2(lx-r)} ${f2(ya)}C${f2(lx-r)} ${f2(ya-r*0.7)} ${f2(lx+r)} ${f2(ya-r*0.7)} ${f2(lx+r)} ${f2(ya)}L${f2(lx+r*0.8)} ${f2(yb)}C${f2(lx+r*0.8)} ${f2(yb+r*0.6)} ${f2(lx-r*0.8)} ${f2(yb+r*0.6)} ${f2(lx-r*0.8)} ${f2(yb)}Z" fill="${fill}" stroke="${stroke}" stroke-width="${f2(lw)}"/>`); }
      else out.push(`<path d="${ellPath(lx,y,g.rx,g.ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${f2(lw)}"/>`);
      if (q.showRf) out.push(`<text x="${f2(lx+g.rx+fs*0.2)}" y="${f2(y+fs*0.25)}" font-size="${f2(fs*0.7)}" fill="${col}">${sp.rf.toFixed(2)}</text>`); }
  });
}
function renderDoc(d, ix){
  useStyle(d);
  if (ix) placeCaptions(d, ix); else ix=buildIndex(d);
  const labels=new Map(); for (const a of d.atoms) labels.set(a.id, layoutLabel(d,ix,a));
  const out=[];
  out.push(`<g font-family="${esc(FONT)}">`);
  for (const b of d.bonds) renderBond(d,ix,b,labels,out);
  for (const a of d.atoms) renderAtomDecor(d,ix,a,labels.get(a.id),out);
  for (const r of d.arrows) renderArrow(d,r,out);
  for (const t of d.texts) renderText(d,t,out);
  for (const p of d.pluses) renderPlus(d,p,out);
  for (const q of d.plates||[]) renderPlate(d,q,out);
  for (const q of d.brackets||[]) renderBracket(d,q,out);
  out.push('</g>');
  return {svg:out.join(''), labels};
}

/* ================= OCL bridge ================= */
let _fragCache=new Map();
function abbrMol(el){ if(!_fragCache.has(el)) _fragCache.set(el, OCL.Molecule.fromSmiles(ABBR[el].s)); return _fragCache.get(el); }
function toOCL(d, ix, atomIds, opts={}){
  const M=OCL.Molecule, mol=new M(32,32), map=new Map(), owner=[]; let generic=false;
  const ids = atomIds || d.atoms.map(a=>a.id), set=new Set(ids);
  for (const id of ids){
    const a=ix.atom.get(id), k=kindOf(a.el);
    if (opts.skipH && a.el==='H' && !a.charge && (ix.adj.get(id)||[]).length===1) continue;
    if (k==='element' || opts.placeholders){
      const z = k==='element' ? M.getAtomicNoFromLabel(a.el) : 6;
      const i=mol.addAtom(z||6); mol.setAtomX(i,a.x/L); mol.setAtomY(i,a.y/L); // OCL's y axis points down, like ours
      if (a.charge && k==='element') mol.setAtomCharge(i,a.charge);
      if (a.rad && k==='element') mol.setAtomRadical(i, M.cAtomRadicalStateD);
      if (a.iso && k==='element') mol.setAtomMass(i, a.iso);
      map.set(id,i); owner[i]=id;
      if (k!=='element') generic = generic || k==='generic';
    } else if (k==='abbr'){
      const f=abbrMol(a.el); const base=mol.getAllAtoms();
      for (let j=0;j<f.getAllAtoms();j++){ const i=mol.addAtom(f.getAtomicNo(j)); owner[i]=id; mol.setAtomCharge(i,f.getAtomCharge(j)); mol.setAtomX(i,a.x/L+j*0.3); mol.setAtomY(i,a.y/L+0.2*(j%2)); }
      for (let j=0;j<f.getAllBonds();j++){ const bb=mol.addBond(base+f.getBondAtom(0,j), base+f.getBondAtom(1,j)); mol.setBondType(bb, f.isDelocalizedBond(j)? M.cBondTypeDelocalized : f.getBondOrder(j)===2? M.cBondTypeDouble : f.getBondOrder(j)===3? M.cBondTypeTriple : M.cBondTypeSingle); }
      map.set(id,base);
    } else { generic=true; }
  }
  for (const b of d.bonds){
    if (!set.has(b.a)||!set.has(b.b) || b.kind) continue;
    if (!map.has(b.a)||!map.has(b.b)) continue;
    let t = b.order===2? M.cBondTypeDouble : b.order===3? M.cBondTypeTriple : M.cBondTypeSingle;
    let i1=map.get(b.a), i2=map.get(b.b);
    if (b.order===1 && b.stereo==='wedge') t=M.cBondTypeUp;
    if (b.order===1 && b.stereo==='hash') t=M.cBondTypeDown;
    const bi=mol.addBond(i1,i2); mol.setBondType(bi,t);
  }
  // enhanced stereo (abs / and n / or n) on stereocentres, written by OCL as V3000 STEABS/STERAC/STEREL collections
  const grouped=ids.filter(id=>{ const a=ix.atom.get(id); return a && a.stg && map.has(id); });
  if (grouped.length){ mol.ensureHelperArrays(M.cHelperParities);
    for (const id of grouped){ const i=map.get(id), m=/^(abs|and|or)(\d*)$/.exec(ix.atom.get(id).stg); if (!mol.isAtomStereoCenter(i)) continue;
      mol.setAtomESR(i, m[1]==='abs'? M.cESRTypeAbs : m[1]==='and'? M.cESRTypeAnd : M.cESRTypeOr, Math.max(0,(+m[2]||1)-1)); } }
  return {mol, map, generic, owner};
}
// convert an OCL molecule (with coordinates) to doc atoms/bonds
function fromOCL(mol, offset){
  const atoms=[], bonds=[]; const n=mol.getAllAtoms();
  const ids=[];
  for (let i=0;i<n;i++){
    const el=mol.getAtomLabel(i);
    const a={id:0,x:mol.getAtomX(i)*L,y:mol.getAtomY(i)*L,el:el,charge:mol.getAtomCharge(i)||0,lp:0,rad:mol.getAtomRadical(i)?1:0};
    const ms=mol.getAtomMass(i); if (ms) a.iso=ms;
    atoms.push(a); ids.push(a);
  }
  // keep AND/OR stereo groups from V3000 molfiles (ABS is the default and stays unlabelled)
  try{ mol.ensureHelperArrays(OCL.Molecule.cHelperParities);
    for (let i=0;i<n;i++){ if (!mol.isAtomStereoCenter(i)) continue; const t=mol.getAtomESRType(i);
      if (t===OCL.Molecule.cESRTypeAnd) atoms[i].stg='and'+(mol.getAtomESRGroup(i)+1); else if (t===OCL.Molecule.cESRTypeOr) atoms[i].stg='or'+(mol.getAtomESRGroup(i)+1); } }catch(e){}
  for (let b=0;b<mol.getAllBonds();b++){
    const t=mol.getBondType(b), ord=mol.getBondOrder(b);
    let stereo='none';
    if (t===OCL.Molecule.cBondTypeUp) stereo='wedge'; else if (t===OCL.Molecule.cBondTypeDown) stereo='hash';
    bonds.push({a:mol.getBondAtom(0,b), b:mol.getBondAtom(1,b), order: Math.min(3,Math.max(1,ord||1)), stereo});
  }
  return {atoms,bonds};
}
// A cyclohexane chair as textbooks draw it: opposite bonds parallel, the left end (the foot) down and the right end (the head) up.
// flip mirrors it left to right, which is the chair after a ring flip. Bonds are one bond length; the ring is centred on the origin.
const CHAIR_STEPS=[55,-12,18,235,168,198]; // bond directions around the ring, in degrees with y up
function chairFragment(flip){
  const f=flip?-1:1, pts=[V(0,0)];
  for (const a of CHAIR_STEPS.slice(0,5)){ const p=pts[pts.length-1], r=a*Math.PI/180; pts.push(V(p.x+f*Math.cos(r)*L, p.y-Math.sin(r)*L)); }
  const cx=pts.reduce((t,p)=>t+p.x,0)/6, cy=pts.reduce((t,p)=>t+p.y,0)/6;
  return { atoms: pts.map(p=>({id:0, x:p.x-cx, y:p.y-cy, el:'C', charge:0, lp:0, rad:0})), bonds: pts.map((_,i)=>({a:i, b:(i+1)%6, order:1, stereo:'none'})) };
}
// Six-membered rings of single bonds drawn as chairs, matched to the textbook chair at any rotation, either way round and mirrored
// (so ChemDraw's and Ketcher's chairs count too, and a regular hexagon does not). Each ring atom gets its two substituent directions:
// axial, straight up or down in the chair's frame (up at the raised corners), and equatorial, parallel to the ring bonds one step away
// and pointing out of the ring. Returns a Map from atom id to {ring, ax, eq}; cached on the index.
function findChairs(d, ix){
  if (ix.chairs) return ix.chairs;
  const out=new Map(), seen=new Set(), T=CHAIR_STEPS.map(a=>-a*Math.PI/180); // screen angles (y down)
  const wrap=t=>{ while(t>Math.PI) t-=2*Math.PI; while(t<-Math.PI) t+=2*Math.PI; return t; };
  for (const b of d.bonds){
    if (b.order!==1) continue;
    const ring=ringPath(ix,b,6); if (!ring || ring.length!==6) continue;
    const key=[...ring].sort((x,y)=>x-y).join(); if (seen.has(key)) continue; seen.add(key);
    const P=ring.map(id=>ix.atom.get(id)), rs=new Set(ring);
    let single=true; for (let i=0;i<6;i++){ const e=ix.adj.get(ring[i]).find(q=>q.o===ring[(i+1)%6]); if (!e || e.b.order!==1) single=false; }
    if (!single) continue;
    const A=P.map((p,i)=>angOf(sub(P[(i+1)%6],p)));
    let best=null;
    for (const m of [1,-1]) for (const rev of [false,true]) for (let k=0;k<6;k++){
      // template direction for ring bond i: shifted by k, traversed backwards (reversed and turned 180°) or mirrored left to right
      const t=i=>{ let a= rev ? T[(k+5-i+6*2)%6]+Math.PI : T[(k+i)%6]; return m<0 ? Math.PI-a : a; };
      let sx=0, sy=0; for (let i=0;i<6;i++){ const dl=wrap(A[i]-t(i)); sx+=Math.cos(dl); sy+=Math.sin(dl); }
      const th=Math.atan2(sy,sx); let worst=0; for (let i=0;i<6;i++) worst=Math.max(worst, Math.abs(wrap(A[i]-t(i)-th)));
      if (!best || worst<best.worst) best={worst, th};
    }
    if (best.worst > 20*Math.PI/180) continue;
    const up=fromAng(-Math.PI/2+best.th), c=mul(P.reduce((s,p)=>add(s,p),V(0,0)),1/6);
    P.forEach((p,i)=>{
      const mid=mul(add(P[(i+5)%6],P[(i+1)%6]),0.5), ax= dot(sub(p,mid),up)>0 ? up : mul(up,-1);
      let eq=norm(sub(P[(i+2)%6],P[(i+1)%6])); if (dot(eq,sub(p,c))<0) eq=mul(eq,-1);
      out.set(ring[i], {ring:rs, ids:ring, ax, eq});
    });
  }
  ix.chairs=out; return out;
}
function scaleLayout(mol){
  // make the average bond length exactly 1 unit (OCL default is ~1 but varies)
  const n=mol.getAllBonds(); if(!n) return;
  let s=0; for(let b=0;b<n;b++){ const a1=mol.getBondAtom(0,b),a2=mol.getBondAtom(1,b); s+=Math.hypot(mol.getAtomX(a1)-mol.getAtomX(a2),mol.getAtomY(a1)-mol.getAtomY(a2)); }
  const avg=s/n; if (avg<1e-6) return;
  for (let i=0;i<mol.getAllAtoms();i++){ mol.setAtomX(i,mol.getAtomX(i)/avg); mol.setAtomY(i,mol.getAtomY(i)/avg); }
}
