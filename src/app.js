/* ================= state ================= */
function newProject(){ return {v:2, uid:Math.random().toString(36).slice(2,10), name:'Untitled project', pages:[{id:1,name:'Page 1',doc:newDoc()}], cur:0, versions:[], nextPage:2, modified:Date.now()}; }
let project = newProject();
let doc = project.pages[0].doc, ix = buildIndex(doc);
function setDoc(d){ doc=d; project.pages[project.cur].doc=d; useStyle(d); }
const pageState = new Map();
let sel = new Set();          // keys: a<id>, r<id> (arrow), t<id>, p<id>
let hover = null, drag = null, preview = null;
let view = {z:3, ox:0, oy:0};
let tool = {lasso:false, id:'bond', bond:{order:1,stereo:'none'}, ring:6, arom:true, el:'N', arrow:'reaction', charge:1, textStyle:{}};
let undoStack=[], redoStack=[], clip=null, spaceDown=false, editingText=null;
const cv=document.getElementById('cv'), stage=document.getElementById('stage');
const $=s=>document.querySelector(s);

function nid(){ return doc.nid++; }
function pushUndo(){ undoStack.push(JSON.stringify(doc)); if(undoStack.length>200) undoStack.shift(); redoStack=[]; updateUndoButtons(); }
function undo(){ if(!undoStack.length) return; redoStack.push(JSON.stringify(doc)); setDoc(JSON.parse(undoStack.pop())); sel.clear(); changed(); }
function redo(){ if(!redoStack.length) return; undoStack.push(JSON.stringify(doc)); setDoc(JSON.parse(redoStack.pop())); sel.clear(); changed(); }
function updateUndoButtons(){ $('#bUndo').disabled=!undoStack.length; $('#bRedo').disabled=!redoStack.length; }
function changed(){ ix=buildIndex(doc); pruneSel(); render(); scheduleAnalysis(); autosave(); updateUndoButtons(); syncStyleUI(); syncTextUI(); syncPageUI(); }
function syncPageUI(){ const e=$('#expArea'); if(!e) return; const has=!!doc.page; e.disabled=!has; if(!has) e.value='crop'; const p=doc.page; $('#pageInfo').textContent = p ? `${(PAGE_PRESETS[p.preset]||{n:'Custom'}).n.split(' (')[0]}, ${p.across} × ${p.down} ${p.across*p.down>1?'sheets':'sheet'} (${inch(p.w*p.across)} × ${inch(p.h*p.down)} in)` : 'Free canvas'; }
function pruneSel(){ for (const k of [...sel]){ const t=k[0], id=+k.slice(1); const m={a:ix.atom,r:ix.arrow,t:ix.text,p:ix.plus}[t]; if(!m||!m.has(id)) sel.delete(k);} }
let _saveT=null;
let _saveWarned=false;
function autosave(){ project.modified=Date.now(); clearTimeout(_saveT); _saveT=setTimeout(()=>{ try{ localStorage.setItem('skeletal.p.'+project.uid, JSON.stringify(project)); localStorage.setItem('skeletal.last', project.uid); }catch(e){ if (!_saveWarned){ _saveWarned=true; toast('Browser storage is full or blocked. Use Save project to keep your work.'); } } },300); }

/* ================= model edits ================= */
function addAtom(x,y,el='C'){ const a={id:nid(),x,y,el,charge:0,lp:0,rad:0}; doc.atoms.push(a); ix.atom.set(a.id,a); ix.adj.set(a.id,[]); return a; }
function bondBetween(a,b){ for (const {b:bd,o} of ix.adj.get(a)||[]) if (o===b) return bd; return null; }
function addBond(a,b,order=1,stereo='none'){
  if (a===b) return null; const ex=bondBetween(a,b); if (ex) return ex;
  const bd={id:nid(),a,b,order,stereo}; doc.bonds.push(bd); ix.bond.set(bd.id,bd); ix.adj.get(a).push({b:bd,o:b}); ix.adj.get(b).push({b:bd,o:a}); return bd;
}
function atomNear(p, r=L*0.28, exclude){ let best=null,bd=r; for (const a of doc.atoms){ if (exclude && exclude.has(a.id)) continue; const dd=dist(a,p); if (dd<bd){bd=dd;best=a;} } return best; }
function removeAtom(id){ doc.atoms=doc.atoms.filter(a=>a.id!==id); doc.bonds=doc.bonds.filter(b=>b.a!==id&&b.b!==id); ix=buildIndex(doc); }
function removeBond(bd){ doc.bonds=doc.bonds.filter(b=>b!==bd); ix=buildIndex(doc);
  for (const id of [bd.a,bd.b]){ const a=ix.atom.get(id); if (a && ix.adj.get(id).length===0 && a.el==='C' && !a.charge && !a.rad && !a.lp) removeAtom(id); } }
function mergeAtom(fromId, intoId){
  if (fromId===intoId) return;
  for (const b of doc.bonds){ if (b.a===fromId) b.a=intoId; if (b.b===fromId) b.b=intoId; }
  doc.atoms=doc.atoms.filter(a=>a.id!==fromId);
  const seen=new Set(); doc.bonds=doc.bonds.filter(b=>{ if(b.a===b.b) return false; const k=Math.min(b.a,b.b)+'-'+Math.max(b.a,b.b); if(seen.has(k)) return false; seen.add(k); return true; });
  ix=buildIndex(doc);
}
function nbrs(id){ return (ix.adj.get(id)||[]).map(({o})=>ix.atom.get(o)); }
function snapAngle(v, step=Math.PI/12){ const t=Math.round(angOf(v)/step)*step; return fromAng(t); }

// best direction for a new bond from an atom
function nextDir(atom){
  const ns=nbrs(atom.id);
  if (!ns.length) return fromAng(-Math.PI/6);
  if (ns.length===1){
    const n0=ns[0], th=angOf(sub(n0,atom));
    const c1=fromAng(th+2*Math.PI/3), c2=fromAng(th-2*Math.PI/3);
    const w=nbrs(n0.id).filter(q=>q.id!==atom.id)[0];
    if (w){ const ref=norm(sub(n0,w)); return dot(c1,ref)>=dot(c2,ref)?c1:c2; }
    return (c1.x - c1.y*0.5) >= (c2.x - c2.y*0.5) ? c1 : c2;
  }
  const angs=ns.map(q=>angOf(sub(q,atom))).sort((a,b)=>a-b);
  let best=0,gap=-1;
  for (let i=0;i<angs.length;i++){ const a1=angs[i], a2= i+1<angs.length? angs[i+1] : angs[0]+2*Math.PI; if (a2-a1>gap){gap=a2-a1;best=a1+gap/2;} }
  return fromAng(best);
}
function placeBondFrom(atom, dirOrPoint, order, stereo, el='C'){
  const p = dirOrPoint.x!==undefined && dirOrPoint.isPoint ? dirOrPoint : add(atom, mul(dirOrPoint, L));
  let target = atomNear(p, L*0.3, new Set([atom.id]));
  if (!target) target=addAtom(p.x,p.y,el);
  const ex=bondBetween(atom.id,target.id);
  if (ex) return ex;
  return addBond(atom.id,target.id,order,stereo);
}

function makeRing(verts, arom){
  // verts: array of points; reuse nearby atoms
  const ids=verts.map(v=>{ const ex=atomNear(v,L*0.3); return ex? ex.id : addAtom(v.x,v.y).id; });
  const n=ids.length; const bondsRing=[];
  for (let k=0;k<n;k++){ const a=ids[k], b=ids[(k+1)%n]; const ex=bondBetween(a,b); bondsRing.push({a,b,ex}); }
  if (!arom){ for (const r of bondsRing) if(!r.ex) addBond(r.a,r.b,1); return ids; }
  const hasDouble=(id, except)=>{ for (const {b,o} of ix.adj.get(id)) if (b.order>=2 && o!==except) return true; return false; };
  let bestPhase=0,bestScore=1e9;
  for (const ph of [0,1]){
    let sc=0;
    bondsRing.forEach((r,k)=>{ const want=(k+ph)%2===0;
      if (r.ex){ if ((r.ex.order===2)!==want) sc+= r.ex.order===2 ? 3 : 1; }
      else if (want && (hasDouble(r.a,r.b)||hasDouble(r.b,r.a))) sc+=2; });
    if (sc<bestScore){bestScore=sc;bestPhase=ph;}
  }
  bondsRing.forEach((r,k)=>{ const want=(k+bestPhase)%2===0;
    if (r.ex) return;
    const ok = want && !hasDouble(r.a,r.b) && !hasDouble(r.b,r.a);
    addBond(r.a,r.b, ok?2:1); });
  return ids;
}
function ringOnPoint(c,n){ const R=L/(2*Math.sin(Math.PI/n)); const verts=[]; for(let k=0;k<n;k++){ verts.push(add(c,mul(fromAng(-Math.PI/2+2*Math.PI*k/n + (n%2?0:0)),R))); } return verts; }
function ringOnAtom(a,n){
  const R=L/(2*Math.sin(Math.PI/n)); const ns=nbrs(a.id);
  let away;
  if (!ns.length) away=V(0,1);
  else if (ns.length===1) away=norm(sub(a,ns[0]));
  else away=nextDir(a);
  const c=add(a,mul(away,R)); const a0=angOf(sub(a,c));
  const verts=[]; for(let k=0;k<n;k++) verts.push(add(c,mul(fromAng(a0+2*Math.PI*k/n),R)));
  return verts;
}
function ringOnBond(bd,n,hint){
  const A=ix.atom.get(bd.a), B=ix.atom.get(bd.b); const u=norm(sub(B,A)), nn=perp(u), m=mul(add(A,B),0.5);
  let sc=0; for (const [X,O] of [[A,B],[B,A]]) for (const q of nbrs(X.id)) if (q.id!==O.id) sc+=Math.sign(cross(u,sub(q,A)));
  const ring=ringPath(ix,bd); if (ring){ let c=V(0,0); for(const id of ring) c=add(c,ix.atom.get(id)); c=mul(c,1/ring.length); sc+=3*Math.sign(cross(u,sub(c,A))); }
  let side = sc>0 ? -1 : sc<0 ? 1 : (hint && cross(u,sub(hint,A))<0 ? -1 : 1);
  const ap=L/(2*Math.tan(Math.PI/n)), R=L/(2*Math.sin(Math.PI/n));
  const c=add(m,mul(nn,ap*side));
  const aA=angOf(sub(A,c)), aB=angOf(sub(B,c));
  let dlt=aB-aA; while(dlt>Math.PI) dlt-=2*Math.PI; while(dlt<-Math.PI) dlt+=2*Math.PI;
  const sg=Math.sign(dlt)||1; const verts=[];
  for (let k=0;k<n;k++) verts.push(add(c,mul(fromAng(aA+sg*2*Math.PI*k/n),R)));
  return verts;
}
function chainPoints(start, cursor, alt){
  let v=sub(cursor,start); if (len(v)<L*0.3) v=V(L,0);
  const u = alt? norm(v) : snapAngle(v, Math.PI/6), nn=perp(u);
  const step=L*Math.cos(Math.PI/6), cnt=Math.max(1,Math.round(len(v)/step));
  const sgn = cross(u, sub(cursor,start))>=0 ? 1 : -1;
  const pts=[start]; for (let i=1;i<=cnt;i++) pts.push(add(add(start,mul(u,step*i)), mul(nn,(i%2? -0.5*L : 0)*sgn*-1)));
  return pts;
}

/* ================= hit testing ================= */
function hitTest(p, ptype){
  const z=view.z, rA=Math.max(L*0.32,(ptype==='touch'?16:8)/z), rB=Math.max(L*0.22,(ptype==='touch'?12:6)/z);
  if (tool.id==='select'){ const h=handleHit(p, (ptype==='touch'?16:9)/z); if (h) return h; }
  let best=null, bd=rA;
  for (const a of doc.atoms){ const d=dist(a,p); if (d<bd){bd=d; best={type:'atom',id:a.id};} }
  if (best) return best;
  for (const t of doc.texts){ const m=textMetrics(doc,t); if (Math.abs(p.x-t.x)<=m.w/2+2 && Math.abs(p.y-t.y)<=m.h/2+2) return {type:'text',id:t.id}; }
  for (const q of doc.pluses){ if (dist(q,p)<Math.max(5,rB)) return {type:'plus',id:q.id}; }
  bd=rB;
  for (const b of doc.bonds){ const d=segDist(p,ix.atom.get(b.a),ix.atom.get(b.b)); if (d<bd){bd=d;best={type:'bond',id:b.id};} }
  if (best) return best;
  for (const r of doc.arrows){ const pts=arrowSamples(r); for (let i=0;i<pts.length-1;i++) if (segDist(p,pts[i],pts[i+1])<Math.max(rB,4)) return {type:'arrow',id:r.id}; }
  return null;
}
function selectedArrowSingle(){ const ks=[...sel]; if (ks.length===1 && ks[0][0]==='r') return ix.arrow.get(+ks[0].slice(1)); return null; }
function handleHit(p, r){
  const ar=selectedArrowSingle();
  if (ar){
    if (dist(p,V(ar.x2,ar.y2))<r) return {type:'handle',h:'end',id:ar.id};
    if (dist(p,V(ar.x1,ar.y1))<r) return {type:'handle',h:'start',id:ar.id};
    if (CURVED.has(ar.type)){ const m=quadPt(V(ar.x1,ar.y1),arrowControl(ar),V(ar.x2,ar.y2),0.5); if (dist(p,m)<r) return {type:'handle',h:'bend',id:ar.id}; }
  }
  const bb=selBBox(); if (bb && sel.size>0 && !ar){ const hp=V((bb.x0+bb.x1)/2, bb.y0-22/view.z); if (dist(p,hp)<r) return {type:'handle',h:'rotate'}; }
  return null;
}
function keyOf(h){ if(!h) return null; if (h.type==='atom') return 'a'+h.id; if (h.type==='arrow') return 'r'+h.id; if (h.type==='text') return 't'+h.id; if (h.type==='plus') return 'p'+h.id; return null; }
function fragmentKeys(atomId){ const c=components(doc,ix).find(c=>c.includes(atomId)); return (c||[atomId]).map(id=>'a'+id); }
function selAtoms(){ return [...sel].filter(k=>k[0]==='a').map(k=>+k.slice(1)); }
function selPoints(){
  const pts=[];
  for (const k of sel){ const t=k[0], id=+k.slice(1);
    if (t==='a'){ const a=ix.atom.get(id); if(a) pts.push(a); }
    else if (t==='r'){ const r=ix.arrow.get(id); if(r){ pts.push(...arrowSamples(r)); } }
    else if (t==='t'){ const x=ix.text.get(id); if(x){ const m=textMetrics(doc,x); pts.push(V(x.x-m.w/2,x.y-m.h/2),V(x.x+m.w/2,x.y+m.h/2)); } }
    else if (t==='p'){ const q=ix.plus.get(id); if(q) pts.push(V(q.x-4,q.y-4),V(q.x+4,q.y+4)); } }
  return pts;
}
function selBBox(){ const pts=selPoints(); if(!pts.length) return null; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);} const pad=6; return {x0:x0-pad,y0:y0-pad,x1:x1+pad,y1:y1+pad}; }
function moveSel(dx,dy){
  for (const k of sel){ const t=k[0], id=+k.slice(1);
    if (t==='a'){ const a=ix.atom.get(id); a.x+=dx; a.y+=dy; }
    else if (t==='r'){ const r=ix.arrow.get(id); r.x1+=dx;r.y1+=dy;r.x2+=dx;r.y2+=dy; if(r.cx!=null){r.cx+=dx;r.cy+=dy;} }
    else if (t==='t'){ const x=ix.text.get(id); x.x+=dx; x.y+=dy; }
    else if (t==='p'){ const q=ix.plus.get(id); q.x+=dx; q.y+=dy; } }
}
function transformSel(fn){ // fn maps point->point
  for (const k of sel){ const t=k[0], id=+k.slice(1);
    if (t==='a'){ const a=ix.atom.get(id); const q=fn(a); a.x=q.x; a.y=q.y; }
    else if (t==='r'){ const r=ix.arrow.get(id); const c=CURVED.has(r.type)?arrowControl(r):null; const p1=fn(V(r.x1,r.y1)), p2=fn(V(r.x2,r.y2)); r.x1=p1.x;r.y1=p1.y;r.x2=p2.x;r.y2=p2.y; if(c){const q=fn(c); r.cx=q.x; r.cy=q.y;} }
    else if (t==='t'){ const x=ix.text.get(id); const q=fn(x); x.x=q.x; x.y=q.y; }
    else if (t==='p'){ const p=ix.plus.get(id); const q=fn(p); p.x=q.x; p.y=q.y; } }
}

/* ================= rendering ================= */
const SELC='#2459a8';
function render(){
  ix=buildIndex(doc);
  const {svg, labels}=renderDoc(doc,ix);
  const z=view.z, ov=[];
  // selection and hover
  const aSel=new Set(selAtoms());
  for (const b of doc.bonds) if (aSel.has(b.a)&&aSel.has(b.b)){ const A=ix.atom.get(b.a),B=ix.atom.get(b.b); ov.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${SELC}" stroke-opacity=".22" stroke-width="${f2(L*0.32)}" stroke-linecap="round"/>`); }
  for (const id of aSel){ const a=ix.atom.get(id); ov.push(`<circle cx="${a.x}" cy="${a.y}" r="${f2(L*0.24)}" fill="${SELC}" fill-opacity=".28"/>`); }
  for (const k of sel){ const t=k[0], id=+k.slice(1);
    if (t==='r'){ const pts=arrowSamples(ix.arrow.get(id)); ov.push(`<polyline points="${pts.map(p=>f2(p.x)+','+f2(p.y)).join(' ')}" fill="none" stroke="${SELC}" stroke-opacity=".22" stroke-width="${f2(L*0.34)}" stroke-linecap="round"/>`); }
    if (t==='t'){ const x=ix.text.get(id); const m=textMetrics(doc,x); ov.push(`<rect x="${f2(x.x-m.w/2-2)}" y="${f2(x.y-m.h/2-2)}" width="${f2(m.w+4)}" height="${f2(m.h+4)}" fill="${SELC}" fill-opacity=".14" stroke="${SELC}" stroke-width="1" vector-effect="non-scaling-stroke"/>`); }
    if (t==='p'){ const q=ix.plus.get(id); ov.push(`<circle cx="${q.x}" cy="${q.y}" r="6" fill="${SELC}" fill-opacity=".2"/>`); } }
  if (hover && !drag){
    if (hover.type==='atom'){ const a=ix.atom.get(hover.id); if(a) ov.push(`<circle cx="${a.x}" cy="${a.y}" r="${f2(L*0.26)}" fill="none" stroke="${SELC}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`); }
    if (hover.type==='bond'){ const b=ix.bond.get(hover.id); if(b){ const A=ix.atom.get(b.a),B=ix.atom.get(b.b); ov.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${SELC}" stroke-opacity=".3" stroke-width="${f2(L*0.3)}" stroke-linecap="round"/>`);} }
    if (hover.type==='arrow'||hover.type==='text'||hover.type==='plus'){ /* subtle */ }
  }
  if (infoSite){ if (infoSite.atom!=null){ const a=ix.atom.get(infoSite.atom); if(a) ov.push(`<circle cx="${a.x}" cy="${a.y}" r="${f2(L*0.34)}" fill="#f2b705" fill-opacity=".35" stroke="#c48f00" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`); }
    if (infoSite.bond!=null){ const b=ix.bond.get(infoSite.bond); if(b){ const A=ix.atom.get(b.a),B=ix.atom.get(b.b); ov.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#f2b705" stroke-opacity=".5" stroke-width="${f2(L*0.4)}" stroke-linecap="round"/>`);} } }
  // selection frame & handles
  if (tool.id==='select' && sel.size){
    const ar=selectedArrowSingle();
    if (ar){
      const hs=[V(ar.x1,ar.y1),V(ar.x2,ar.y2)]; if (CURVED.has(ar.type)) hs.push(quadPt(V(ar.x1,ar.y1),arrowControl(ar),V(ar.x2,ar.y2),0.5));
      hs.forEach((h,i)=>ov.push(`<circle cx="${f2(h.x)}" cy="${f2(h.y)}" r="${f2(5/z)}" fill="#fff" stroke="${SELC}" stroke-width="1.5" vector-effect="non-scaling-stroke"${i===2?' stroke-dasharray="2 1.5"':''}/>`));
    } else {
      const bb=selBBox();
      if (bb){ const hx=(bb.x0+bb.x1)/2, hy=bb.y0-22/z;
        ov.push(`<rect x="${f2(bb.x0)}" y="${f2(bb.y0)}" width="${f2(bb.x1-bb.x0)}" height="${f2(bb.y1-bb.y0)}" fill="none" stroke="${SELC}" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`);
        ov.push(`<line x1="${f2(hx)}" y1="${f2(bb.y0)}" x2="${f2(hx)}" y2="${f2(hy)}" stroke="${SELC}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
        ov.push(`<circle cx="${f2(hx)}" cy="${f2(hy)}" r="${f2(5.5/z)}" fill="#fff" stroke="${SELC}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`); }
    }
  }
  // previews
  if (preview){
    if (preview.lines) for (const [a,b] of preview.lines) ov.push(`<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="${SELC}" stroke-width="${S().lineWidth*1.4}" stroke-linecap="round"/>`);
    if (preview.rect){ const r=preview.rect; ov.push(`<rect x="${f2(Math.min(r.x0,r.x1))}" y="${f2(Math.min(r.y0,r.y1))}" width="${f2(Math.abs(r.x1-r.x0))}" height="${f2(Math.abs(r.y1-r.y0))}" fill="${SELC}" fill-opacity=".07" stroke="${SELC}" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`); }
    if (preview.arrow){ const o=[]; renderArrow(doc,preview.arrow,o,SELC); ov.push(o.join('')); }
    if (preview.poly){ ov.push(`<path d="M${preview.poly.map(q=>f2(q.x)+' '+f2(q.y)).join('L')}Z" fill="${SELC}" fill-opacity=".07" stroke="${SELC}" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`); }
    if (preview.guides) for (const [a,b] of preview.guides) ov.push(`<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="#d6336c" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`);
    if (preview.label) ov.push(`<text x="${f2(preview.label.x)}" y="${f2(preview.label.y)}" font-size="${f2(11/z)}" fill="${SELC}" font-family="${esc(FONT)}">${esc(preview.label.t)}</text>`);
  }
  cv.innerHTML=`<g transform="translate(${f2(view.ox)},${f2(view.oy)}) scale(${view.z})">${renderPageBackdrop()}${ov.join('')}${svg}</g>`;
  $('#empty').style.display = (doc.atoms.length||doc.arrows.length||doc.texts.length||doc.pluses.length)?'none':'';
  $('#zoomval').textContent=Math.round(view.z/3*100)+'%';
}

/* ================= pointer handling ================= */
const pointers=new Map(); let pinch=null, longPressT=null;
function toDoc(e){ const r=cv.getBoundingClientRect(); return V((e.clientX-r.left-view.ox)/view.z, (e.clientY-r.top-view.oy)/view.z); }
cv.addEventListener('pointerdown', e=>{
  if (editingText) commitText();
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pointers.size===2){ // pinch: cancel any gesture
    if (drag && drag.undoPushed){ setDoc(JSON.parse(undoStack.pop())); ix=buildIndex(doc); }
    drag=null; preview=null;
    const [p1,p2]=[...pointers.values()]; pinch={d:Math.hypot(p1.x-p2.x,p1.y-p2.y), m:V((p1.x+p2.x)/2,(p1.y+p2.y)/2), z:view.z, ox:view.ox, oy:view.oy};
    render(); return;
  }
  if (pointers.size>2) return;
  if (e.button===1 || spaceDown || tool.id==='hand'){ drag={mode:'pan', sx:e.clientX, sy:e.clientY, ox:view.ox, oy:view.oy}; cv.classList.add('pan'); return; }
  if (e.button!==0 && e.pointerType==='mouse') return;
  const p=toDoc(e), h=hitTest(p,e.pointerType);
  drag={mode:'tool', start:p, last:p, sx:e.clientX, sy:e.clientY, hit:h, moved:false, shift:e.shiftKey, alt:e.altKey, ptype:e.pointerType};
  if (e.pointerType==='touch' && h && (h.type==='atom'||h.type==='text')){
    const d0=drag; clearTimeout(longPressT);
    longPressT=setTimeout(()=>{ if (drag!==d0 || d0.moved) return; if (d0.undoPushed){ setDoc(JSON.parse(undoStack.pop())); } drag=null; preview=null; changed();
      if (h.type==='text') startTextEdit(ix.text.get(h.id)); else openLabelDialog(h.id); }, 550);
  }
  beginTool(drag);
});
window.addEventListener('pointermove', e=>{
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pinch && pointers.size===2){
    const [p1,p2]=[...pointers.values()]; const d=Math.hypot(p1.x-p2.x,p1.y-p2.y), m=V((p1.x+p2.x)/2,(p1.y+p2.y)/2);
    const r=cv.getBoundingClientRect(); const nz=Math.min(20,Math.max(0.15,pinch.z*d/pinch.d));
    const wx=(pinch.m.x-r.left-pinch.ox)/pinch.z, wy=(pinch.m.y-r.top-pinch.oy)/pinch.z;
    view.z=nz; view.ox=m.x-r.left-wx*nz; view.oy=m.y-r.top-wy*nz; render(); return;
  }
  if (!drag){ if (e.target!==cv && !cv.contains(e.target)) return; const p=toDoc(e); const h=hitTest(p,e.pointerType); const k=JSON.stringify(h); if (k!==JSON.stringify(hover)){ hover=h; render(); } window._lastPt=p; return; }
  if (drag.mode==='pan'){ view.ox=drag.ox+(e.clientX-drag.sx); view.oy=drag.oy+(e.clientY-drag.sy); render(); return; }
  const p=toDoc(e);
  if (!drag.moved && Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>(drag.ptype==='touch'?8:4)) drag.moved=true;
  drag.alt=e.altKey; drag.cur=p;
  if (drag.moved) moveTool(drag,p);
  drag.last=p;
});
function endPointer(e){
  pointers.delete(e.pointerId);
  if (pinch){ if (pointers.size<2) pinch=null; return; }
  if (!drag) return;
  if (drag.mode==='pan'){ drag=null; cv.classList.remove('pan'); return; }
  const p=drag.cur||drag.start;
  try { endTool(drag,p); } catch(err){ console.error(err); }
  drag=null; preview=null; changed();
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', e=>{ pointers.delete(e.pointerId); if(pinch&&pointers.size<2) pinch=null; if (drag){ if (drag.undoPushed){ setDoc(JSON.parse(undoStack.pop())); } drag=null; preview=null; changed(); } });
cv.addEventListener('pointerleave', ()=>{ if(!drag && hover){ hover=null; render(); } });
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect();
  if (e.ctrlKey||e.metaKey){ const f=Math.exp(-e.deltaY*0.01); zoomAt(e.clientX-r.left,e.clientY-r.top,f); }
  else { view.ox-=e.deltaX; view.oy-=e.deltaY; render(); }
},{passive:false});
function zoomAt(sx,sy,f){ const nz=Math.min(20,Math.max(0.15,view.z*f)); const wx=(sx-view.ox)/view.z, wy=(sy-view.oy)/view.z; view.z=nz; view.ox=sx-wx*nz; view.oy=sy-wy*nz; render(); }
cv.addEventListener('dblclick', e=>{
  const p=toDoc(e), h=hitTest(p,'mouse');
  if (h && h.type==='text') startTextEdit(ix.text.get(h.id));
  else if (h && h.type==='atom' && (tool.id==='select')) openLabelDialog(h.id);
});

function ensureUndo(d){ if (!d.undoPushed){ pushUndo(); d.undoPushed=true; } }

function beginTool(d){
  const h=d.hit;
  if (tool.id==='select'){
    if (h && h.type==='handle'){ d.sub='handle'; return; }
    const k = h ? (h.type==='bond' ? null : keyOf(h)) : null;
    if (h && h.type==='bond'){ const b=ix.bond.get(h.id); d.bondKeys=['a'+b.a,'a'+b.b]; d.sub = sel.has('a'+b.a)&&sel.has('a'+b.b) ? 'move' : 'pending'; return; }
    if (k){ d.key=k; d.sub = sel.has(k) ? 'move' : 'pending'; return; }
    d.sub = tool.lasso ? 'lasso' : 'rect'; if (d.sub==='lasso') d.path=[d.start]; if (!d.shift){ sel.clear(); render(); }
    return;
  }
  if (tool.id==='erase'){ if (h && h.type!=='handle'){ ensureUndo(d); eraseAt(h); render(); } return; }
}
function eraseAt(h){
  if (!h) return;
  if (h.type==='atom') removeAtom(h.id);
  else if (h.type==='bond') removeBond(ix.bond.get(h.id));
  else if (h.type==='arrow') doc.arrows=doc.arrows.filter(r=>r.id!==h.id);
  else if (h.type==='text') doc.texts=doc.texts.filter(r=>r.id!==h.id);
  else if (h.type==='plus') doc.pluses=doc.pluses.filter(r=>r.id!==h.id);
  ix=buildIndex(doc);
}
function bondTarget(d,p){
  // for drags starting at an atom (or point): snapped endpoint or existing atom
  const startAtom = d.hit && d.hit.type==='atom' ? ix.atom.get(d.hit.id) : null;
  const s = startAtom || d.start;
  const near=atomNear(p,L*0.3, startAtom? new Set([startAtom.id]) : null);
  if (near) return {s, e:V(near.x,near.y), atom:near, startAtom};
  let v=sub(p,s); if (len(v)<1) v=V(1,0);
  const u = d.alt? norm(v) : snapAngle(v);
  return {s, e:add(s,mul(u,L)), atom:null, startAtom};
}
function moveTool(d,p){
  const id=tool.id;
  if (id==='select'){
    if (d.sub==='pending'){
      // decide: dragging an unselected atom moves just the atom; others select fragment then move
      if (d.key && d.key[0]==='a'){ d.sub='atom'; d.atomId=+d.key.slice(1); }
      else { if (!d.shift) sel.clear(); withGroups(d.bondKeys ? fragmentKeys(+d.bondKeys[0].slice(1)) : [d.key]).forEach(k=>sel.add(k)); d.sub='move'; }
    }
    if (d.sub==='move'){ ensureUndo(d);
      if (!d.applied){ d.applied=V(0,0); d.guide=guideSetup(); }
      let off=sub(p,d.start), lines=[];
      if (!d.alt && d.guide) ({off,lines}=snapToGuides(d.guide,off));
      moveSel(off.x-d.applied.x, off.y-d.applied.y); d.applied=off;
      preview = lines.length ? {guides:lines} : null; render(); return; }
    if (d.sub==='atom'){ ensureUndo(d); const a=ix.atom.get(d.atomId); a.x+=p.x-d.last.x; a.y+=p.y-d.last.y; render(); return; }
    if (d.sub==='rect'){ preview={rect:{x0:d.start.x,y0:d.start.y,x1:p.x,y1:p.y}}; render(); return; }
    if (d.sub==='lasso'){ if (dist(p,d.path[d.path.length-1])>2/view.z) d.path.push(p); preview={poly:d.path}; render(); return; }
    if (d.sub==='handle'){
      ensureUndo(d); const h=d.hit;
      if (h.h==='rotate'){
        if (!d.rc){ const bb=selBBox(); d.rc=V((bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2); d.a0=angOf(sub(d.start,d.rc)); d.prevAng=0; }
        let t=angOf(sub(p,d.rc))-d.a0; if (!d.alt) t=Math.round(t/(Math.PI/12))*(Math.PI/12);
        const dt=t-d.prevAng; d.prevAng=t; transformSel(q=>rotAround(q,d.rc,dt));
        render(); return;
      }
      const r=ix.arrow.get(h.id);
      if (h.h==='bend'){ const m=mul(add(V(r.x1,r.y1),V(r.x2,r.y2)),0.5); const c=sub(mul(p,2),m); r.cx=c.x; r.cy=c.y; }
      else {
        let q=p;
        if (!CURVED.has(r.type) && !d.alt){ const o = h.h==='end'? V(r.x1,r.y1):V(r.x2,r.y2); const v=sub(p,o); q=add(o,mul(snapAngle(v),len(v))); }
        const c = CURVED.has(r.type) ? arrowControl(r) : null;
        if (h.h==='end'){ r.x2=q.x; r.y2=q.y; } else { r.x1=q.x; r.y1=q.y; }
        if (c){ r.cx=c.x; r.cy=c.y; }
      }
      render(); return;
    }
    return;
  }
  if (id==='erase'){ const hh=hitTest(p,d.ptype); if (hh && hh.type!=='handle'){ ensureUndo(d); eraseAt(hh); render(); } return; }
  if (id==='bond' || id==='atom'){
    if (d.hit && d.hit.type==='bond' && id==='bond'){ return; }
    if (id==='atom' && !(d.hit && d.hit.type==='atom')) return;
    const t=bondTarget(d,p); preview={lines:[[t.s,t.e]]}; render(); return;
  }
  if (id==='chain'){
    const s = d.hit&&d.hit.type==='atom' ? ix.atom.get(d.hit.id) : d.start;
    const pts=chainPoints(V(s.x,s.y),p,d.alt); const lines=[]; for (let i=0;i<pts.length-1;i++) lines.push([pts[i],pts[i+1]]);
    preview={lines, label:{x:p.x+6/view.z, y:p.y-6/view.z, t:String(pts.length-1)}}; render(); return;
  }
  if (id==='arrow'){
    let e=p; const curved=CURVED.has(tool.arrow);
    if (!curved && !d.alt){ const v=sub(p,d.start); e=add(d.start,mul(snapAngle(v),len(v))); }
    preview={arrow:{type:tool.arrow,x1:d.start.x,y1:d.start.y,x2:e.x,y2:e.y}}; render(); return;
  }
  if (id==='ring' || id==='text' || id==='plus' || id==='charge'){ if (id==='plus'||id==='text'){ /* nothing */ } return; }
}
function endTool(d,p){
  const id=tool.id, h=d.hit;
  if (id==='select'){
    if (d.sub==='rect' && d.moved){
      const r=preview&&preview.rect; if (r){ const x0=Math.min(r.x0,r.x1),x1=Math.max(r.x0,r.x1),y0=Math.min(r.y0,r.y1),y1=Math.max(r.y0,r.y1); const inR=q=>q.x>=x0&&q.x<=x1&&q.y>=y0&&q.y<=y1;
        for (const a of doc.atoms) if (inR(a)) sel.add('a'+a.id);
        for (const ar of doc.arrows) if (inR(V(ar.x1,ar.y1))&&inR(V(ar.x2,ar.y2))) sel.add('r'+ar.id);
        for (const t of doc.texts) if (inR(t)) sel.add('t'+t.id);
        for (const q of doc.pluses) if (inR(q)) sel.add('p'+q.id); }
      return;
    }
    if (d.sub==='lasso' && d.moved && d.path.length>2){
      const P=d.path, inP=q=>{ let c=false; for (let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j]; if ((a.y>q.y)!==(b.y>q.y) && q.x < (b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x) c=!c; } return c; };
      for (const a of doc.atoms) if (inP(a)) sel.add('a'+a.id);
      for (const ar of doc.arrows) if (inP(V(ar.x1,ar.y1))&&inP(V(ar.x2,ar.y2))) sel.add('r'+ar.id);
      for (const t of doc.texts) if (inP(t)) sel.add('t'+t.id);
      for (const q of doc.pluses) if (inP(q)) sel.add('p'+q.id);
      return;
    }
    if (!d.moved){
      if (d.sub==='rect' || d.sub==='lasso'){ if(!d.shift) sel.clear(); return; }
      if (d.sub==='handle') return;
      let keys = d.bondKeys ? fragmentKeys(+d.bondKeys[0].slice(1)) : d.key && d.key[0]==='a' ? fragmentKeys(+d.key.slice(1)) : [d.key];
      keys=withGroups(keys);
      if (d.shift){ const all=keys.every(k=>sel.has(k)); keys.forEach(k=> all? sel.delete(k) : sel.add(k)); }
      else { sel.clear(); keys.forEach(k=>sel.add(k)); }
      return;
    }
    if (d.sub==='atom'){ const a=ix.atom.get(d.atomId); const near=atomNear(a,L*0.25,new Set([a.id])); if (near) mergeAtom(a.id,near.id); return; }
    if (d.sub==='move' && selAtoms().length===1){ const a=ix.atom.get(selAtoms()[0]); const near=atomNear(a,L*0.25,new Set([a.id])); if (near) mergeAtom(a.id,near.id); }
    return;
  }
  if (id==='erase') return;
  if (id==='bond'){
    const bt=tool.bond;
    if (!d.moved && h && h.type==='bond'){
      pushUndo(); const b=ix.bond.get(h.id);
      if (bt.stereo==='none'){
        if (bt.order===1){ if (b.stereo!=='none'){ b.stereo='none'; } else b.order = b.order===1?2 : b.order===2?3 : 1; }
        else if (bt.order===2){ if (b.order!==2){ b.order=2; b.stereo='none'; } else b.dbPos = cycleDb(b); }
        else { b.order=3; b.stereo='none'; }
      } else {
        if (b.order===1 && b.stereo===bt.stereo){ const t=b.a; b.a=b.b; b.b=t; }
        else { b.order=1; b.stereo=bt.stereo; }
      }
      return;
    }
    if (!d.moved && h && h.type==='atom'){ pushUndo(); const a=ix.atom.get(h.id); placeBondFrom(a,nextDir(a),bt.order,bt.stereo); return; }
    if (!d.moved){ pushUndo(); const s=atomNear(d.start)||addAtom(d.start.x,d.start.y); placeBondFrom(s,nextDir(s),bt.order,bt.stereo); return; }
    const t=bondTarget(d,p); pushUndo();
    const sA = t.startAtom || atomNear(t.s) || addAtom(t.s.x,t.s.y);
    const eA = t.atom || atomNear(t.e, L*0.3, new Set([sA.id])) || addAtom(t.e.x,t.e.y);
    const ex=bondBetween(sA.id,eA.id);
    if (ex){ ex.order=bt.order; ex.stereo=bt.stereo; if (bt.stereo!=='none' && ex.a!==sA.id){ ex.b=ex.a; ex.a=sA.id; } }
    else addBond(sA.id,eA.id,bt.order,bt.stereo);
    return;
  }
  if (id==='chain'){
    pushUndo();
    const startAtom = h&&h.type==='atom' ? ix.atom.get(h.id) : null;
    const s = startAtom || V(d.start.x,d.start.y);
    const pts = d.moved ? chainPoints(V(s.x,s.y),p,d.alt) : chainPoints(V(s.x,s.y), add(V(s.x,s.y),V(L*3.4,0)), false);
    let prev = startAtom || atomNear(pts[0]) || addAtom(pts[0].x,pts[0].y);
    for (let i=1;i<pts.length;i++){ const ex=atomNear(pts[i],L*0.3,new Set([prev.id])); const nx= ex||addAtom(pts[i].x,pts[i].y); addBond(prev.id,nx.id,1); prev=nx; }
    return;
  }
  if (id==='ring'){
    if (d.moved && !(h && (h.type==='atom'||h.type==='bond'))){ pushUndo(); makeRing(ringOnPoint(p,tool.ring),tool.arom); return; }
    pushUndo();
    if (h && h.type==='bond') makeRing(ringOnBond(ix.bond.get(h.id),tool.ring,d.start),tool.arom);
    else if (h && h.type==='atom') makeRing(ringOnAtom(ix.atom.get(h.id),tool.ring),tool.arom);
    else makeRing(ringOnPoint(d.start,tool.ring),tool.arom);
    return;
  }
  if (id==='atom'){
    if (d.moved && h && h.type==='atom'){ const t=bondTarget(d,p); pushUndo(); const sA=ix.atom.get(h.id); const eA=t.atom||addAtom(t.e.x,t.e.y,tool.el); addBond(sA.id,eA.id,1); return; }
    pushUndo();
    if (h && h.type==='atom'){ const a=ix.atom.get(h.id); a.el=tool.el; return; }
    addAtom(d.start.x,d.start.y,tool.el); return;
  }
  if (id==='charge'){
    if (!(h && h.type==='atom')){ toast('Click an atom'); return; }
    pushUndo(); const a=ix.atom.get(h.id);
    if (tool.charge===1) a.charge=(a.charge||0)+1; else if (tool.charge===-1) a.charge=(a.charge||0)-1;
    else if (tool.charge==='lp') a.lp=((a.lp||0)+1)%4; else if (tool.charge==='rad') a.rad=a.rad?0:1;
    return;
  }
  if (id==='arrow'){
    const curved=CURVED.has(tool.arrow);
    if (!d.moved){ if (curved){ toast('Drag to draw a curved arrow'); return; }
      pushUndo(); doc.arrows.push({id:nid(),type:tool.arrow,x1:d.start.x,y1:d.start.y,x2:d.start.x+L*3,y2:d.start.y}); return; }
    let e=p; if (!curved && !d.alt){ const v=sub(p,d.start); e=add(d.start,mul(snapAngle(v),len(v))); }
    if (dist(e,d.start)<4) return;
    pushUndo(); const r={id:nid(),type:tool.arrow,x1:d.start.x,y1:d.start.y,x2:e.x,y2:e.y};
    if (curved){ const c=arrowControl(r); r.cx=c.x; r.cy=c.y; }
    doc.arrows.push(r);
    return;
  }
  if (id==='text'){
    if (h && h.type==='text'){ startTextEdit(ix.text.get(h.id)); return; }
    pushUndo(); const t={id:nid(),x:d.start.x,y:d.start.y,text:'',...tool.textStyle}; doc.texts.push(t); ix=buildIndex(doc); startTextEdit(t,true); return;
  }
  if (id==='plus'){ pushUndo(); doc.pluses.push({id:nid(),x:d.start.x,y:d.start.y}); return; }
  if (id==='pka' || id==='bde'){
    const r=cv.getBoundingClientRect(); const scr={x:d.sx-r.left, y:d.sy-r.top};
    if (!h){ closeInfo(); return; }
    if (id==='pka'){ if (h.type==='atom') pkaAt(h.id, scr); else if (h.type==='bond') toast('Click an atom to estimate its pKa'); return; }
    if (h.type==='atom') bdeAt('atom',h.id,scr); else if (h.type==='bond') bdeAt('bond',h.id,scr); return;
  }
}
function cycleDb(b){ const order=['auto','center','left','right']; const i=order.indexOf(b.dbPos||'auto'); return order[(i+1)%order.length]; }

/* ================= text editing ================= */
const ted=$('#texted');
function startTextEdit(t, fresh){
  editingText={t,fresh};
  const m=textMetrics(doc,t), fs=m.fs*view.z;
  ted.hidden=false; ted.value=t.text; ted.style.fontSize=fs+'px';
  ted.style.fontFamily=m.family; ted.style.fontWeight=m.fw; ted.style.fontStyle=m.italic?'italic':'normal'; ted.style.color=t.color||'#000'; ted.style.textAlign=t.align||'center';
  syncTextUI();
  positionTed();
  setTimeout(()=>{ ted.focus(); ted.select(); },0);
  render();
}
function positionTed(){
  if (!editingText) return; const t=editingText.t; const m=textMetrics(doc,{...t,text:ted.value||' '});
  const w=Math.max(60,(m.w+12)*view.z), hh=Math.max(m.fs*1.4*view.z, (m.h+4)*view.z);
  ted.style.width=w+'px'; ted.style.height=hh+'px';
  ted.style.left=(t.x*view.z+view.ox-w/2)+'px'; ted.style.top=(t.y*view.z+view.oy-hh/2)+'px';
}
ted.addEventListener('input', positionTed);
ted.addEventListener('keydown', e=>{
  if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); commitText(); }
  if (e.key==='Escape'){ e.preventDefault(); if (editingText.fresh){ doc.texts=doc.texts.filter(x=>x!==editingText.t); undoStack.pop(); } editingText=null; ted.hidden=true; changed(); }
  e.stopPropagation();
});
ted.addEventListener('blur', ()=>{ if (editingText) commitText(); });
function commitText(){
  if (!editingText) return; const {t,fresh}=editingText; editingText=null; ted.hidden=true;
  const v=ted.value.replace(/\s+$/,'');
  if (!fresh && v!==t.text) pushUndo();
  if (!v){ doc.texts=doc.texts.filter(x=>x!==t); if (fresh) undoStack.pop(); } else { t.text=v; if (fresh){ sel.clear(); } }
  changed();
}

/* ================= keyboard ================= */
let _nudge={depth:-1,t:0}; // consecutive arrow-key nudges share one undo step
const HOTKEY_EL={c:'C',n:'N',o:'O',s:'S',p:'P',f:'F',l:'Cl',b:'Br',i:'I',h:'H'};
window.addEventListener('keydown', e=>{
  if (e.target.closest && e.target.closest('input,textarea,select,.dialog')) return;
  const mod=e.ctrlKey||e.metaKey;
  if (e.key===' ' ){ spaceDown=true; cv.classList.add('pan'); e.preventDefault(); return; }
  if (mod && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if (mod && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase()==='a'){ e.preventDefault(); selectAll(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase()==='c'){ e.preventDefault(); copySmiles(); return; }
  if (mod && e.key.toLowerCase()==='c'){ e.preventDefault(); clip=subDoc(sel.size?sel:null); copyImage(); return; }
  if (mod && e.key.toLowerCase()==='x'){ e.preventDefault(); if(!sel.size) return; clip=subDoc(sel); copyImage(); deleteSel(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase()==='s'){ e.preventDefault(); openSaveAs(); return; }
  if (mod && e.key.toLowerCase()==='g'){ e.preventDefault(); e.shiftKey? ungroupSel() : groupSel(); return; }
  if (mod && e.key.toLowerCase()==='d'){ e.preventDefault(); if(sel.size){ clip=subDoc(sel); pasteDoc(clip, L); } return; }
  if (mod) return;
  if (e.key==='Escape'){ sel.clear(); preview=null; closeInfo(); render(); return; }
  if (e.key==='Delete'||e.key==='Backspace'){
    e.preventDefault();
    if (sel.size){ deleteSel(); return; }
    if (hover) toast('Select something first, or use the eraser');
    return;
  }
  if (e.key==='['||e.key===']'){ if(!sel.size) return; const bb=selBBox(); const c=V((bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2); pushUndo(); transformSel(q=>rotAround(q,c,(e.key===']'?1:-1)*Math.PI/12)); changed(); return; }
  if (e.key.startsWith('Arrow') && sel.size){ e.preventDefault(); const s=e.shiftKey?5:1;
    if (!(_nudge.depth===undoStack.length && !redoStack.length && Date.now()-_nudge.t<1500)) pushUndo();
    _nudge={depth:undoStack.length, t:Date.now()}; moveSel(e.key==='ArrowLeft'?-s:e.key==='ArrowRight'?s:0, e.key==='ArrowUp'?-s:e.key==='ArrowDown'?s:0); changed(); return; }
  const k=e.key;
  if (hover && hover.type==='atom'){
    const a=ix.atom.get(hover.id); if(!a) return;
    const kl=k.toLowerCase();
    if (HOTKEY_EL[kl] && k.length===1){ pushUndo(); a.el = (kl==='c'&&e.shiftKey)? 'C' : HOTKEY_EL[kl]; changed(); return; }
    if (k==='+'||k==='='){ pushUndo(); a.charge=(a.charge||0)+1; changed(); return; }
    if (k==='-'){ pushUndo(); a.charge=(a.charge||0)-1; changed(); return; }
    if (k==='.'){ pushUndo(); a.rad=a.rad?0:1; changed(); return; }
  }
  if (hover && hover.type==='bond'){
    const b=ix.bond.get(hover.id); if(!b) return;
    if ('123'.includes(k)){ pushUndo(); b.order=+k; b.stereo='none'; changed(); return; }
    if (k==='w'){ pushUndo(); b.order=1; b.stereo= b.stereo==='wedge'? (()=>{const t=b.a;b.a=b.b;b.b=t;return 'wedge';})() : 'wedge'; changed(); return; }
    if (k==='x'){ pushUndo(); b.order=1; b.stereo='hash'; changed(); return; }
  }
  const map={v:'select',e:'erase',t:'text'};
  if (k==='v') setTool('select',{lasso:false});
  else if (k==='l') setTool('select',{lasso:true});
  else if (map[k]) setTool(map[k]);
  else if (k==='1') setTool('bond',{order:1,stereo:'none'});
  else if (k==='2') setTool('bond',{order:2,stereo:'none'});
  else if (k==='3') setTool('bond',{order:3,stereo:'none'});
  else if (k==='a') setTool('arrow',{arrow:'reaction'});
});
window.addEventListener('keyup', e=>{ if (e.key===' '){ spaceDown=false; cv.classList.remove('pan'); } });
function selectAll(){ sel.clear(); doc.atoms.forEach(a=>sel.add('a'+a.id)); doc.arrows.forEach(r=>sel.add('r'+r.id)); doc.texts.forEach(t=>sel.add('t'+t.id)); doc.pluses.forEach(p=>sel.add('p'+p.id)); if(tool.id!=='select') setTool('select'); render(); scheduleAnalysis(); }
function deleteSel(){
  if (!sel.size) return; pushUndo();
  const ka=new Set(selAtoms());
  doc.atoms=doc.atoms.filter(a=>!ka.has(a.id));
  doc.arrows=doc.arrows.filter(r=>!sel.has('r'+r.id)); doc.texts=doc.texts.filter(t=>!sel.has('t'+t.id)); doc.pluses=doc.pluses.filter(p=>!sel.has('p'+p.id));
  sel.clear(); changed();
}

/* ================= sub-documents, clipboard ================= */
function subDoc(keys){
  const d={...newDoc(), style:doc.style, colorAtoms:doc.colorAtoms, ...(doc.labelSize?{labelSize:doc.labelSize}:{}), ...(doc.styleOv?{styleOv:{...doc.styleOv}}:{})};
  const all = !keys || !keys.size;
  const aSet=new Set(all? doc.atoms.map(a=>a.id) : [...keys].filter(k=>k[0]==='a').map(k=>+k.slice(1)));
  d.atoms=doc.atoms.filter(a=>aSet.has(a.id)).map(a=>({...a}));
  d.bonds=doc.bonds.filter(b=>aSet.has(b.a)&&aSet.has(b.b)).map(b=>({...b}));
  d.arrows=doc.arrows.filter(r=>all||keys.has('r'+r.id)).map(r=>({...r}));
  d.texts=doc.texts.filter(t=>all||keys.has('t'+t.id)).map(t=>({...t}));
  d.pluses=doc.pluses.filter(p=>all||keys.has('p'+p.id)).map(p=>({...p}));
  return d;
}
function contentBBox(d){
  const pts=[]; d.atoms.forEach(a=>pts.push(a)); d.arrows.forEach(r=>pts.push(...arrowSamples(r))); d.texts.forEach(t=>{const m=textMetrics(d,t); pts.push(V(t.x-m.w/2,t.y-m.h/2),V(t.x+m.w/2,t.y+m.h/2));}); d.pluses.forEach(p=>pts.push(p));
  if (!pts.length) return null; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);} return {x0,y0,x1,y1};
}
function pasteDoc(src, offset, at){
  if (!src) return; pushUndo();
  const idMap=new Map(); const bb=contentBBox(src);
  let dx=offset||0, dy=offset||0;
  if (at && bb){ dx=at.x-(bb.x0+bb.x1)/2; dy=at.y-(bb.y0+bb.y1)/2; }
  sel.clear();
  const gMap=new Map(); let gNext=maxGroup()+1; const G=o=>{ if (o.g==null) return o; if (!gMap.has(o.g)) gMap.set(o.g,gNext++); o.g=gMap.get(o.g); return o; };
  for (const a of src.atoms){ const n=G({...a,id:nid(),x:a.x+dx,y:a.y+dy}); idMap.set(a.id,n.id); doc.atoms.push(n); sel.add('a'+n.id); }
  for (const b of src.bonds){ doc.bonds.push({...b,id:nid(),a:idMap.get(b.a),b:idMap.get(b.b)}); }
  for (const r of src.arrows){ const n=G({...r,id:nid(),x1:r.x1+dx,y1:r.y1+dy,x2:r.x2+dx,y2:r.y2+dy}); if(r.cx!=null){n.cx=r.cx+dx;n.cy=r.cy+dy;} doc.arrows.push(n); sel.add('r'+n.id); }
  for (const t of src.texts){ const n=G({...t,id:nid(),x:t.x+dx,y:t.y+dy}); doc.texts.push(n); sel.add('t'+n.id); }
  for (const p of src.pluses){ const n=G({...p,id:nid(),x:p.x+dx,y:p.y+dy}); doc.pluses.push(n); sel.add('p'+n.id); }
  if (tool.id!=='select') setTool('select');
  changed();
}
document.addEventListener('paste', e=>{
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const txt=(e.clipboardData && e.clipboardData.getData('text/plain'))||'';
  e.preventDefault();
  if (txt.trim()){
    if (tryLoadText(txt.trim(), true)) return;
  }
  if (clip) pasteDoc(clip, L*1.2);
  else if (txt.trim()) toast('Clipboard text is not a SMILES string or molfile');
});

/* ================= import: SMILES, molfile, reactions ================= */
function molToFragment(mol){
  scaleLayout(mol);
  const {atoms,bonds}=fromOCL(mol);
  return {atoms,bonds};
}
function layoutSmiles(smi){
  const mol=OCL.Molecule.fromSmiles(smi); mol.inventCoordinates(); return molToFragment(mol);
}
function fragBBox(f){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const a of f.atoms){x0=Math.min(x0,a.x);y0=Math.min(y0,a.y);x1=Math.max(x1,a.x);y1=Math.max(y1,a.y);} if(!f.atoms.length) return {x0:0,y0:0,x1:0,y1:0}; return {x0,y0,x1,y1}; }
function insertFragments(parts){ // parts: [{kind:'frag',f}|{kind:'plus'}|{kind:'arrow'}]
  pushUndo();
  const db=contentBBox(doc);
  let x = db ? db.x1 + L*2.5 : ( -view.ox/view.z + 40 );
  const cy = db ? (db.y0+db.y1)/2 : (cv.clientHeight/2 - view.oy)/view.z;
  sel.clear();
  for (const p of parts){
    if (p.kind==='frag'){
      const bb=fragBBox(p.f); const dx=x-bb.x0, dy=cy-(bb.y0+bb.y1)/2; const ids=[];
      for (const a of p.f.atoms){ const n={...a,id:nid(),x:a.x+dx,y:a.y+dy}; ids.push(n.id); doc.atoms.push(n); sel.add('a'+n.id); }
      for (const b of p.f.bonds) doc.bonds.push({id:nid(),a:ids[b.a],b:ids[b.b],order:b.order,stereo:b.stereo});
      x += (bb.x1-bb.x0) + L*1.4;
    } else if (p.kind==='plus'){ const q={id:nid(),x:x+L*0.3,y:cy}; doc.pluses.push(q); sel.add('p'+q.id); x+=L*2; }
    else if (p.kind==='arrow'){ const r={id:nid(),type:'reaction',x1:x,y1:cy,x2:x+L*3.2,y2:cy}; doc.arrows.push(r); sel.add('r'+r.id); x+=L*4.6; }
  }
  if (tool.id!=='select') setTool('select');
  changed(); fitIfNeeded();
}
// a drawing read from another program's file: paste it in (or make it the page when the page is empty)
function insertForeign(r, name){
  const d=normalizeDoc({...newDoc(), ...r, style:doc.style});
  if (!hasContent(d)){ toast('No structures found in '+(name||'the file')); return; }
  if (hasContent(doc)) pasteDoc(d,0,viewCenter()); else { pushUndo(); d.nid=Math.max(d.nid,doc.nid); setDoc({...d, page:doc.page, styleOv:doc.styleOv, labelSize:doc.labelSize}); sel.clear(); changed(); fit(); }
  toast('Opened '+(name||'drawing'));
}
function tryLoadText(txt, quiet){
  try{
    if (/<CDXML[\s>]/.test(txt)){ insertForeign(FORMATS.read('cdxml',txt),'ChemDraw drawing'); return true; }
    if (/<(cml|MDocument)[\s>]/.test(txt) || /<molecule[\s>]/.test(txt)){ insertForeign(FORMATS.read(/MDocument/.test(txt)?'mrv':'cml',txt),'structure'); return true; }
    if (/M\s+END/.test(txt) || /V2000|V3000/.test(txt)){
      const mol=OCL.Molecule.fromMolfile(txt); if (!mol.getAllAtoms()) throw 0;
      // keep the file's own coordinates if present
      let hasXY=false; for(let i=0;i<mol.getAllAtoms();i++) if (mol.getAtomX(i)||mol.getAtomY(i)) hasXY=true;
      if (!hasXY) mol.inventCoordinates();
      insertFragments([{kind:'frag',f:molToFragment(mol)}]); return true;
    }
    if (/^InChI=/.test(txt)){ OCL.InChI.molfileFromInchi(txt.split(/\s+/)[0]).then(r=>{ if (!r.molfile) throw new Error(r.message);
        const mol=OCL.Molecule.fromMolfile(r.molfile); mol.inventCoordinates(); insertFragments([{kind:'frag',f:molToFragment(mol)}]); closeDialog(); })
        .catch(()=>toast('That InChI could not be read')); return true; }
    if (txt.startsWith('{')){ const d=JSON.parse(txt); if (d && d.atoms){ pasteDoc(normalizeDoc(d),0,viewCenter()); return true; } }
    const line=txt.split(/\s+/)[0];
    if (line.includes('>')){
      const [r,a,p]= line.split('>'); if (p===undefined) throw 0;
      const parts=[]; const rs=r.split('.').filter(Boolean), ps=p.split('.').filter(Boolean);
      rs.forEach((s,i)=>{ if(i) parts.push({kind:'plus'}); parts.push({kind:'frag',f:layoutSmiles(s)}); });
      parts.push({kind:'arrow'});
      ps.forEach((s,i)=>{ if(i) parts.push({kind:'plus'}); parts.push({kind:'frag',f:layoutSmiles(s)}); });
      insertFragments(parts);
      if (a){ const ar=doc.arrows[doc.arrows.length-1]; pushUndo(); doc.texts.push({id:nid(),x:(ar.x1+ar.x2)/2,y:ar.y1-L*0.9,text:a.replace(/\./g,', ')}); changed(); }
      return true;
    }
    const mol=OCL.Molecule.fromSmiles(line); if (!mol.getAllAtoms()) throw 0;
    mol.inventCoordinates();
    insertFragments([{kind:'frag',f:molToFragment(mol)}]); return true;
  }catch(err){ if(!quiet) console.warn(err); return false; }
}
function viewCenter(){ return V((cv.clientWidth/2-view.ox)/view.z,(cv.clientHeight/2-view.oy)/view.z); }
function normalizeDoc(d){ d=sanitizeDoc(d); const n={...newDoc(),...d}; n.atoms=(d.atoms||[]).map(a=>({charge:0,lp:0,rad:0,...a})); n.bonds=(d.bonds||[]).map(b=>({order:1,stereo:'none',...b})); n.arrows=d.arrows||[]; n.texts=d.texts||[]; n.pluses=d.pluses||[]; let mx=0; for (const k of ['atoms','bonds','arrows','texts','pluses']) for(const o of n[k]) mx=Math.max(mx,o.id||0); n.nid=Math.max(n.nid||1,mx+1); return n; }

/* ================= clean, flip ================= */
function cleanUp(){
  const ids = selAtoms().length ? selAtoms() : doc.atoms.map(a=>a.id);
  if (!ids.length){ toast('Nothing to clean up'); return; }
  pushUndo();
  for (const comp of components(doc,ix,ids)){
    if (comp.length<2) continue;
    const {mol,map}=toOCL(doc,ix,comp,{placeholders:true});
    let cx=0,cy=0; for (const id of comp){ const a=ix.atom.get(id); cx+=a.x; cy+=a.y; } cx/=comp.length; cy/=comp.length;
    mol.ensureHelperArrays(OCL.Molecule.cHelperParities);
    mol.inventCoordinates(); scaleLayout(mol);
    let nx=0,ny=0; for (const id of comp){ const i=map.get(id); nx+=mol.getAtomX(i)*L; ny+=mol.getAtomY(i)*L; } nx/=comp.length; ny/=comp.length;
    for (const id of comp){ const a=ix.atom.get(id), i=map.get(id); a.x=mol.getAtomX(i)*L-nx+cx; a.y=mol.getAtomY(i)*L-ny+cy; }
    // stereo bonds as re-derived by OCL
    const inv=new Map([...map].map(([k,v])=>[v,k]));
    const stereoOf=new Map();
    for (let b=0;b<mol.getAllBonds();b++){ const t=mol.getBondType(b); const a1=inv.get(mol.getBondAtom(0,b)), a2=inv.get(mol.getBondAtom(1,b)); if (a1==null||a2==null) continue;
      if (t===OCL.Molecule.cBondTypeUp||t===OCL.Molecule.cBondTypeDown) stereoOf.set(a1+'-'+a2, t===OCL.Molecule.cBondTypeUp?'wedge':'hash'); }
    const cs=new Set(comp);
    for (const b of doc.bonds){ if (!cs.has(b.a)) continue;
      if (b.stereo==='wedge'||b.stereo==='hash'){ b.stereo='none'; }
      const f=stereoOf.get(b.a+'-'+b.b), r=stereoOf.get(b.b+'-'+b.a);
      if (f){ b.stereo=f; } else if (r){ const t=b.a; b.a=b.b; b.b=t; b.stereo=r; } }
  }
  changed(); toast('Structure cleaned up');
}
function flip(axis){
  const keys = sel.size ? sel : null;
  if (!keys) selectAllSilent();
  const bb=selBBox(); if(!bb){ return; } pushUndo();
  const c=V((bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2);
  transformSel(q=> axis==='h'? V(2*c.x-q.x,q.y) : V(q.x,2*c.y-q.y));
  // flipping inverts the meaning of wedges; swap wedge and hash to keep stereo
  const aS=new Set(selAtoms());
  for (const b of doc.bonds) if (aS.has(b.a)&&aS.has(b.b)){ if (b.stereo==='wedge') b.stereo='hash'; else if (b.stereo==='hash') b.stereo='wedge'; if (b.dbPos==='left') b.dbPos='right'; else if (b.dbPos==='right') b.dbPos='left'; }
  if (!keys) sel.clear();
  changed();
}
/* ================= align, distribute ================= */
// The pieces that move as one: each connected structure, straight arrow, plus sign and free text.
// Compound labels and curly arrows ride along with the structure (or arrow) they sit on, and don't count toward its box.
function bboxOf(pts){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);} return {x0,y0,x1,y1}; }
function fragPoints(ids){
  const pts=[];
  for (const id of ids){ const a=ix.atom.get(id), lb=layoutLabel(doc,ix,a);
    if (lb.visible && lb.box) pts.push(V(lb.box.x0,lb.box.y0),V(lb.box.x1,lb.box.y1)); else pts.push(a); }
  return pts;
}
function layoutUnits(keys){
  const units=[], riders=[];
  for (const comp of components(doc,ix,[...keys].filter(k=>k[0]==='a').map(k=>+k.slice(1))))
    units.push({keys:comp.map(id=>'a'+id), bb:bboxOf(fragPoints(comp)), kind:'frag'});
  for (const k of keys){ const t=k[0], id=+k.slice(1);
    if (t==='r'){ const r=ix.arrow.get(id); if (CURVED.has(r.type)) riders.push({key:k, at:quadPt(V(r.x1,r.y1),arrowControl(r),V(r.x2,r.y2),0.5)}); else units.push({keys:[k], bb:bboxOf(arrowSamples(r)), kind:'arrow'}); }
    else if (t==='p'){ const q=ix.plus.get(id); units.push({keys:[k], bb:{x0:q.x-4,y0:q.y-4,x1:q.x+4,y1:q.y+4}, kind:'plus'}); }
    else if (t==='t'){ const x=ix.text.get(id), m=textMetrics(doc,x); riders.push({key:k, at:V(x.x,x.y), bb:{x0:x.x-m.w/2,y0:x.y-m.h/2,x1:x.x+m.w/2,y1:x.y+m.h/2}}); }
  }
  // pieces in one group become one unit
  const gOf=keys=>{ for (const k of keys){ const o=objOf(k); if (o && o.g) return o.g; } return 0; };
  const byG=new Map();
  for (let i=units.length-1;i>=0;i--){ const u=units[i], g=gOf(u.keys); if (!g) continue;
    const m=byG.get(g); if (!m){ byG.set(g,u); continue; }
    m.keys.push(...u.keys); m.bb={x0:Math.min(m.bb.x0,u.bb.x0),y0:Math.min(m.bb.y0,u.bb.y0),x1:Math.max(m.bb.x1,u.bb.x1),y1:Math.max(m.bb.y1,u.bb.y1)}; if (u.kind==='frag') m.kind='frag'; units.splice(i,1); }
  for (let i=riders.length-1;i>=0;i--){ const rd=riders[i], o=objOf(rd.key); if (!o.g) continue;
    const u=byG.get(o.g);
    if (u){ u.keys.push(rd.key); if (u.kind==='text' && rd.bb) u.bb={x0:Math.min(u.bb.x0,rd.bb.x0),y0:Math.min(u.bb.y0,rd.bb.y0),x1:Math.max(u.bb.x1,rd.bb.x1),y1:Math.max(u.bb.y1,rd.bb.y1)}; }
    else { const bb=rd.bb||{x0:rd.at.x,y0:rd.at.y,x1:rd.at.x,y1:rd.at.y}; const nu={keys:[rd.key], bb:{...bb}, kind:'text'}; byG.set(o.g,nu); units.push(nu); }
    riders.splice(i,1); }
  for (const rd of riders){
    let best=null, bd=L*1.6;
    for (const u of units){ if (u.kind==='plus') continue;
      const dx=Math.max(u.bb.x0-rd.at.x,0,rd.at.x-u.bb.x1), dy=Math.max(u.bb.y0-rd.at.y,0,rd.at.y-u.bb.y1), dd=Math.hypot(dx,dy);
      if (dd<bd){ bd=dd; best=u; } }
    if (best) best.keys.push(rd.key);
    else units.push({keys:[rd.key], bb: rd.bb || {x0:rd.at.x,y0:rd.at.y,x1:rd.at.x,y1:rd.at.y}, kind:'text'});
  }
  return units;
}
/* smart guides: while dragging, snap the selection's edges and centers to other pieces (Alt turns it off) */
function guideSetup(){
  const mine=layoutUnits(sel); if (!mine.length) return null;
  const rest=new Set([...doc.atoms.map(a=>'a'+a.id),...doc.arrows.map(r=>'r'+r.id),...doc.texts.map(t=>'t'+t.id),...doc.pluses.map(p=>'p'+p.id)].filter(k=>!sel.has(k)));
  const others=rest.size ? layoutUnits(rest).map(u=>u.bb).slice(0,400) : [];
  return others.length ? {mov:bboxOf(mine.flatMap(u=>[V(u.bb.x0,u.bb.y0),V(u.bb.x1,u.bb.y1)])), others} : null;
}
function snapToGuides(g, off){
  const thr=6/view.z, m={x0:g.mov.x0+off.x, x1:g.mov.x1+off.x, y0:g.mov.y0+off.y, y1:g.mov.y1+off.y};
  const lines=[]; const out=V(off.x,off.y);
  for (const ax of ['x','y']){
    const lo=ax+'0', hi=ax+'1', mine=[m[lo],(m[lo]+m[hi])/2,m[hi]];
    let best=null;
    for (const o of g.others){ const theirs=[o[lo],(o[lo]+o[hi])/2,o[hi]];
      for (let i=0;i<3;i++) for (let j=0;j<3;j++){ const dd=theirs[j]-mine[i], sc=Math.abs(dd)+(i===1&&j===1?0:thr); // a center match always beats an edge match
        if (Math.abs(dd)<thr && (!best || sc<best.sc-1e-6)) best={dd,sc,at:theirs[j],o}; } }
    if (!best) continue;
    out[ax]+=best.dd;
    const c=ax==='x'?'y':'x', lo2=c+'0', hi2=c+'1', mlo=(c==='x'?m.x0:m.y0)+(c==='x'?out.x-off.x:out.y-off.y), mhi=(c==='x'?m.x1:m.y1)+(c==='x'?out.x-off.x:out.y-off.y);
    const a=Math.min(best.o[lo2],mlo)-6, b=Math.max(best.o[hi2],mhi)+6;
    lines.push(ax==='x' ? [V(best.at,a),V(best.at,b)] : [V(a,best.at),V(b,best.at)]);
  }
  return {off:out, lines};
}

/* groups: objects sharing a g id select, move and align together */
function objOf(k){ const m={a:ix.atom,r:ix.arrow,t:ix.text,p:ix.plus}[k[0]]; return m && m.get(+k.slice(1)); }
function allObjects(){ return [...doc.atoms,...doc.arrows,...doc.texts,...doc.pluses]; }
function maxGroup(){ let m=0; for (const o of allObjects()) if (o.g>m) m=o.g; return m; }
function withGroups(keys){
  const gs=new Set(); for (const k of keys){ const o=objOf(k); if (o && o.g) gs.add(o.g); }
  if (!gs.size) return keys;
  const out=new Set(keys);
  for (const [t,arr] of [['a',doc.atoms],['r',doc.arrows],['t',doc.texts],['p',doc.pluses]]) for (const o of arr) if (gs.has(o.g)) out.add(t+o.id);
  return [...out];
}
function groupSel(){
  if (!sel.size){ toast('Select a structure and its label to group them'); return; }
  const keys=new Set(sel); for (const id of selAtoms()) fragmentKeys(id).forEach(k=>keys.add(k));
  pushUndo(); const g=maxGroup()+1; for (const k of keys){ const o=objOf(k); if (o) o.g=g; }
  sel=new Set(keys); changed(); toast('Grouped. Click any part to select the group; Ctrl+Shift+G ungroups.');
}
function ungroupSel(){
  const os=[...sel].map(objOf).filter(o=>o && o.g); if (!os.length){ toast('Nothing grouped in the selection'); return; }
  pushUndo(); for (const o of os) delete o.g; changed(); toast('Ungrouped');
}
function moveKeys(keys,dx,dy){ const s=sel; sel=new Set(keys); moveSel(dx,dy); sel=s; }
let alignGap=0; try{ alignGap=+localStorage.getItem('skeletal.alignGap')||0; }catch(e){} // fixed gap in bond lengths; 0 keeps the outer pieces in place
// mode: left | center | right | top | middle | bottom | hspace | vspace | row (middle, then hspace)
function arrange(mode){
  const all=!sel.size; const keys = all ? new Set([...doc.atoms.map(a=>'a'+a.id),...doc.arrows.map(r=>'r'+r.id),...doc.texts.map(t=>'t'+t.id),...doc.pluses.map(p=>'p'+p.id)]) : sel;
  const units=layoutUnits(keys);
  if (units.length<2){ toast(all ? 'Draw at least two structures to align' : 'Select two or more structures to align'); return; }
  pushUndo();
  if (mode==='row'){ arrangeUnits(units,'middle'); arrangeUnits(layoutUnits(keys),'hspace'); }
  else arrangeUnits(units,mode);
  changed();
}
function arrangeUnits(units,mode){
  const B=bboxOf(units.flatMap(u=>[V(u.bb.x0,u.bb.y0),V(u.bb.x1,u.bb.y1)]));
  const cx=(B.x0+B.x1)/2, cy=(B.y0+B.y1)/2;
  if (mode==='hspace' || mode==='vspace'){
    const h=mode==='hspace', lo=h?'x0':'y0', hi=h?'x1':'y1';
    units.sort((a,b)=>(a.bb[lo]+a.bb[hi])-(b.bb[lo]+b.bb[hi]));
    const used=units.reduce((s,u)=>s+u.bb[hi]-u.bb[lo],0);
    let gap = alignGap>0 ? alignGap*L : (B[hi]-B[lo]-used)/(units.length-1);
    if (gap<L*0.8 && !(alignGap>0)) gap=L*0.8; // overlapping pieces: spread them out instead
    let at=B[lo];
    for (const u of units){ const d=at-u.bb[lo]; moveKeys(u.keys, h?d:0, h?0:d); at+=u.bb[hi]-u.bb[lo]+gap; }
  } else {
    for (const u of units){ const b=u.bb;
      const dx = mode==='left'? B.x0-b.x0 : mode==='right'? B.x1-b.x1 : mode==='center'? cx-(b.x0+b.x1)/2 : 0;
      const dy = mode==='top'? B.y0-b.y0 : mode==='bottom'? B.y1-b.y1 : mode==='middle'? cy-(b.y0+b.y1)/2 : 0;
      moveKeys(u.keys,dx,dy); }
  }
}

function selectAllSilent(){ doc.atoms.forEach(a=>sel.add('a'+a.id)); doc.arrows.forEach(r=>sel.add('r'+r.id)); doc.texts.forEach(t=>sel.add('t'+t.id)); doc.pluses.forEach(p=>sel.add('p'+p.id)); }

/* ================= SMILES copy, online lookup (PubChem) ================= */
// The only network use in the app. It runs only when the user asks, and sends just the SMILES or the typed name.
const PUBCHEM='https://pubchem.ncbi.nlm.nih.gov/rest/pug';
function lookupIds(){
  const ids=selAtoms().length? selAtoms() : doc.atoms.map(a=>a.id);
  return {ids, comps:components(doc,ix,ids)};
}
function copySmiles(){
  const {ids}=lookupIds(); if (!ids.length){ toast('Nothing to copy'); return; }
  let r=null; try{ r=analysisFor(ids); }catch(e){}
  if (!r){ toast('Could not interpret this structure'); return; }
  copyText(r.smiles, (selAtoms().length? 'SMILES of the selection' : 'SMILES')+' copied: '+(r.smiles.length>60? r.smiles.slice(0,57)+'\u2026' : r.smiles));
}
async function pcFetch(path, body){
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),12000);
  try{
    const res=await fetch(PUBCHEM+path, body ? {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body, signal:ctl.signal} : {signal:ctl.signal});
    if (res.status===404) return null;
    if (!res.ok) throw new Error('PubChem returned '+res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}
async function pubchemNameToSmiles(name){
  const j=await pcFetch('/compound/name/'+encodeURIComponent(name)+'/property/SMILES/JSON');
  const p=j && j.PropertyTable && j.PropertyTable.Properties[0]; return p ? (p.SMILES || p.IsomericSMILES || p.CanonicalSMILES) : null;
}
function casValid(c){ const m=/^(\d{2,7})-(\d{2})-(\d)$/.exec(c); if (!m) return false; const d=(m[1]+m[2]).split('').reverse(); return d.reduce((s,x,i)=>s+(+x)*(i+1),0)%10===+m[3]; }
async function pubchemLookup(smiles){
  const j=await pcFetch('/compound/smiles/cids/JSON', 'smiles='+encodeURIComponent(smiles));
  const cid=j && j.IdentifierList && j.IdentifierList.CID && j.IdentifierList.CID[0];
  if (!cid) return null;
  const [pj,sj]=await Promise.all([pcFetch(`/compound/cid/${cid}/property/Title,IUPACName,InChIKey,MolecularFormula/JSON`), pcFetch(`/compound/cid/${cid}/synonyms/JSON`)]);
  const p=(pj && pj.PropertyTable.Properties[0])||{};
  const syn=(sj && sj.InformationList && sj.InformationList.Information[0].Synonym)||[];
  return {cid, title:p.Title||'', iupac:p.IUPACName||'', inchikey:p.InChIKey||'', cas:[...new Set(syn.filter(casValid))], synonyms:syn.filter(x=>!casValid(x)).slice(0,8)};
}
const webSearchUrl=q=>'https://www.google.com/search?q='+encodeURIComponent(q);
function openExternal(url){ const w=window.open(url,'_blank','noopener,noreferrer'); if (!w) toast('Your browser blocked the new tab; allow pop-ups for this page'); }
async function lookupOnline(){
  const {ids,comps}=lookupIds();
  if (!ids.length){ toast('Draw or select a structure first'); return; }
  if (comps.length>1){ toast('Select one structure to look up (click it with the Select tool)'); return; }
  let r=null; try{ r=analysisFor(ids); }catch(e){}
  if (!r){ toast('Could not interpret this structure'); return; }
  if (r.generic){ toast('Structures with R, X or custom labels can\u2019t be looked up'); return; }
  const smi=r.smiles;
  openDialog(`<h3>Name and CAS number</h3><p class="code" style="word-break:break-all">${esc(smi)}</p><div id="lkOut"><p>Looking this structure up on PubChem\u2026</p></div>
    <p class="note">Sends only the SMILES above to PubChem (US National Library of Medicine). CAS numbers come from PubChem\u2019s synonym list; check important ones on CAS Common Chemistry.</p>
    <div class="actions"><button class="tb" id="lkWeb">Search the web</button><button class="tb" data-close>Close</button></div>`);
  let q=`"${smi}" CAS number`;
  $('#lkWeb').onclick=()=>openExternal(webSearchUrl(q));
  let res;
  try{ res=await pubchemLookup(smi); }
  catch(err){ if ($('#lkOut')) $('#lkOut').innerHTML='<p class="err">PubChem could not be reached. Check your internet connection, or use Search the web.</p>'; return; }
  const out=$('#lkOut'); if (!out) return; // dialog closed meanwhile
  if (!res){ out.innerHTML='<p>PubChem has no record of this exact structure (stereochemistry counts). Try Search the web, or remove stereo bonds and look up again.</p>'; return; }
  q = res.title ? `${res.title} CAS number` : `${res.inchikey} CAS number`;
  const casRow=c=>`<li><b class="code">${esc(c)}</b> <button class="mini" data-cp="${esc(c)}">Copy</button> <button class="mini" data-add="CAS ${esc(c)}">Add to drawing</button> <button class="mini" data-url="https://commonchemistry.cas.org/detail?cas_rn=${encodeURIComponent(c)}">Verify</button></li>`;
  out.innerHTML=`<dl class="lk">
      <dt>Name</dt><dd>${esc(res.title)||'\u2014'} ${res.title?`<button class="mini" data-cp="${esc(res.title)}">Copy</button> <button class="mini" data-add="${esc(res.title)}">Add to drawing</button>`:''}</dd>
      ${res.iupac?`<dt>IUPAC</dt><dd>${esc(res.iupac)} <button class="mini" data-cp="${esc(res.iupac)}">Copy</button></dd>`:''}
      <dt>CAS RN</dt><dd>${res.cas.length? `<ul class="caslist">${casRow(res.cas[0])}</ul>${res.cas.length>1?`<details><summary>${res.cas.length-1} more listed (often deprecated or for mixtures)</summary><ul class="caslist">${res.cas.slice(1,8).map(casRow).join('')}</ul></details>`:''}` : 'None listed on PubChem'}</dd>
      <dt>InChIKey</dt><dd class="code">${esc(res.inchikey)} <button class="mini" data-cp="${esc(res.inchikey)}">Copy</button></dd>
      <dt>PubChem</dt><dd><button class="mini" data-url="https://pubchem.ncbi.nlm.nih.gov/compound/${res.cid}">Open CID ${res.cid}</button></dd>
    </dl>`;
  out.onclick=e=>{ const b=e.target.closest('button'); if (!b) return;
    if (b.dataset.cp) copyText(b.dataset.cp,'Copied');
    else if (b.dataset.url) openExternal(b.dataset.url);
    else if (b.dataset.add) addTextUnder(ids, b.dataset.add); };
}
function addTextUnder(ids, text){
  const bb=bboxOf(fragPoints(ids)); pushUndo();
  const below=doc.texts.filter(t=>t.x>=bb.x0 && t.x<=bb.x1 && t.y>bb.y1 && t.y<bb.y1+L*4).reduce((m,t)=>Math.max(m,t.y),bb.y1);
  const t={id:nid(), x:(bb.x0+bb.x1)/2, y:0, text, ...(text.includes('\n')?{align:'left'}:{})};
  t.y = below + L*0.6 + textMetrics(doc,t).h/2; // top of the block sits just under the structure, however many lines it has
  doc.texts.push(t); changed(); toast('Added below the structure');
}

/* ================= enhanced stereochemistry ================= */
// stereocentres (doc atom ids) among the given atoms, found by OpenChemLib on each whole structure
function stereoCentres(ids){
  const want=new Set(ids), out=[];
  for (const comp of components(doc,ix).filter(c=>c.some(id=>want.has(id)))){
    const {mol,map}=toOCL(doc,ix,comp,{skipH:true}); mol.ensureHelperArrays(OCL.Molecule.cHelperParities);
    for (const id of comp) if (want.has(id) && map.has(id) && mol.isAtomStereoCenter(map.get(id))) out.push(id); }
  return out;
}
function openStereoGroups(){
  const pool = ctxAtom!=null ? [ctxAtom] : selAtoms().length ? selAtoms() : doc.atoms.map(a=>a.id);
  let ids=stereoCentres(pool); if (!ids.length && ctxAtom!=null) ids=stereoCentres(selAtoms().length? selAtoms() : doc.atoms.map(a=>a.id));
  if (!ids.length){ toast('No stereocentres here. Draw a wedge or hash bond first.'); return; }
  const used=new Set(doc.atoms.map(a=>a.stg).filter(Boolean));
  const next=t=>{ for (let n=1;n<33;n++) if (!used.has(t+n)) return n; return 1; };
  const btn=(v,label,hint)=>`<button class="tb" data-stg="${v}" title="${esc(hint)}">${esc(label)}</button>`;
  const groups=t=>[...used].filter(x=>x.startsWith(t)).sort();
  openDialog(`<div class="dialog-inner"><h3>Stereo group</h3><p>${ids.length} stereocentre${ids.length>1?'s':''} ${ctxAtom!=null&&ids.length===1?'(the atom you clicked)':selAtoms().length?'in the selection':'in the drawing'}. Labels follow the ChemDraw and MDL V3000 conventions.</p>
    <div class="row" style="flex-wrap:wrap">${btn('abs','abs','Absolute: the configuration is known as drawn')}
      ${btn('and'+next('and'),'New & group (&'+next('and')+')','AND: a racemic mixture of the drawn configuration and its mirror image')}
      ${btn('or'+next('or'),'New or group (or'+next('or')+')','OR: one of the two, but which is not known (relative configuration)')}
      ${[...groups('and'),...groups('or')].map(g=>btn(g,'Add to '+g.replace('and','&'),'Join an existing group')).join('')}
      ${btn('','Clear','Remove the label')}</div>
    <p class="note">abs: absolute, as drawn. &amp;n: racemic (both enantiomers, e.g. "rac"). or n: relative; one enantiomer, unknown which (e.g. "rel"). Centres in the same group keep their relative configuration. Saved in V3000 molfiles and ChemDraw files.</p>
    <div class="actions"><button class="tb" data-close>Close</button></div></div>`);
  dialog.querySelectorAll('[data-stg]').forEach(b=>b.onclick=()=>{ pushUndo(); for (const id of ids){ const a=ix.atom.get(id); if (b.dataset.stg) a.stg=b.dataset.stg; else delete a.stg; } closeDialog(); changed(); toast(b.dataset.stg? 'Stereo group set' : 'Stereo label removed'); });
}

/* ================= find in databases ================= */
// Opens the drawn structure in public databases. Only the SMILES or InChIKey leaves the computer, and only on click.
function rcsbUrl(smi, match){ return 'https://www.rcsb.org/search?request='+encodeURIComponent(JSON.stringify({query:{type:'terminal',service:'chemical',parameters:{value:smi,type:'descriptor',descriptor_type:'SMILES',match_type:match}},return_type:'mol_definition'})); }
async function openFindDb(){
  const {ids,comps}=lookupIds();
  if (!ids.length){ toast('Draw or select a structure first'); return; }
  if (comps.length>1){ toast('Select one structure to search for (click it with the Select tool)'); return; }
  let r=null; try{ r=analysisFor(ids); }catch(e){}
  if (!r || r.generic){ toast(r? 'Structures with R, X or custom labels can\u2019t be searched' : 'Could not interpret this structure'); return; }
  const smi=r.smiles, key=(await inchiOf(r.molfile)).key;
  const pc=t=>'https://pubchem.ncbi.nlm.nih.gov/#query='+encodeURIComponent(smi)+'&tab='+t;
  const DBS=[
    ['PubChem', [['Exact', pc('identity')], ['Similar (Tanimoto)', pc('similarity')], ['Substructure', pc('substructure')], ['Superstructure', pc('superstructure')]]],
    ['RCSB PDB ligands', [['Exact', rcsbUrl(smi,'graph-exact')], ['Similar', rcsbUrl(smi,'graph-relaxed')], ['Substructure', rcsbUrl(smi,'sub-struct-graph-relaxed')]]],
    ['ChEMBL', [['Compound page', 'chembl']]],
    ['Web', [['Google (InChIKey)', key? 'https://www.google.com/search?q='+encodeURIComponent('"'+key+'"') : null], ['Google Scholar', key? 'https://scholar.google.com/scholar?q='+encodeURIComponent('"'+key+'"') : null]]],
  ];
  openDialog(`<div class="dialog-inner"><h3>Find in databases</h3><p class="code" style="word-break:break-all">${esc(smi)}${key?'<br>'+esc(key):''}</p>
    <table class="peaks fmt"><tbody>${DBS.map(([db,acts])=>`<tr><td><b>${db}</b></td><td style="text-align:right">${acts.map(([n,u])=>`<button class="mini" ${u?`data-u="${esc(u)}"`:'disabled'}>${esc(n)}</button>`).join(' ')}</td></tr>`).join('')}</tbody></table>
    <p class="note">Each button opens a new tab and sends only the SMILES or InChIKey shown above. For the name and CAS number, use Look up name and CAS number.</p>
    <div class="actions"><button class="tb" id="fdCas">Look up name and CAS number</button><button class="tb primary" data-close>Done</button></div></div>`);
  $('#fdCas').onclick=()=>lookupOnline();
  dialog.querySelectorAll('[data-u]').forEach(b=>b.onclick=async()=>{
    if (b.dataset.u!=='chembl'){ openExternal(b.dataset.u); return; }
    const w=window.open('about:blank','_blank'); if (w) w.opener=null;
    try{ const j=await fetch('https://www.ebi.ac.uk/chembl/api/data/molecule.json?only=molecule_chembl_id&molecule_structures__standard_inchi_key='+encodeURIComponent(key)).then(x=>x.json());
      const id=j.molecules && j.molecules[0] && j.molecules[0].molecule_chembl_id;
      if (id){ if (w) w.location='https://www.ebi.ac.uk/chembl/explore/compound/'+id; else openExternal('https://www.ebi.ac.uk/chembl/explore/compound/'+id); }
      else { if (w) w.close(); toast('ChEMBL has no compound with this exact structure'); } }
    catch(err){ if (w) w.close(); toast('ChEMBL could not be reached'); } });
}

/* ================= context menu ================= */
const ctxMenu=$('#ctxMenu');
function closeCtx(){ ctxMenu.hidden=true; }
let ctxAtom=null;
cv.addEventListener('contextmenu', e=>{
  e.preventDefault(); if (editingText) commitText();
  const p=toDoc(e), h=hitTest(p,'mouse'); ctxAtom = h && h.type==='atom' ? h.id : null;
  if (h && (h.type==='atom'||h.type==='bond')){ const id = h.type==='atom'? h.id : ix.bond.get(h.id).a; if (!sel.has('a'+id)){ sel=new Set(withGroups(fragmentKeys(id))); render(); scheduleAnalysis(); } }
  else if (h && keyOf(h)){ if (!sel.has(keyOf(h))){ sel=new Set(withGroups([keyOf(h)])); render(); } }
  const hasAtoms = selAtoms().length>0 || (!sel.size && doc.atoms.length>0);
  ctxMenu.querySelectorAll('[data-need=atoms]').forEach(b=>b.disabled=!hasAtoms);
  ctxMenu.querySelectorAll('[data-need=sel]').forEach(b=>b.disabled=!sel.size);
  ctxMenu.hidden=false;
  const w=ctxMenu.offsetWidth, hh=ctxMenu.offsetHeight;
  ctxMenu.style.left=Math.max(4,Math.min(e.clientX, innerWidth-w-4))+'px'; ctxMenu.style.top=Math.max(4,Math.min(e.clientY, innerHeight-hh-4))+'px';
});
ctxMenu.onclick=e=>{ const b=e.target.closest('[data-cmd]'); if (!b || b.disabled) return; closeCtx();
  const c=b.dataset.cmd;
  if (c==='smiles') copySmiles();
  else if (c==='molfile'){ const {ids}=lookupIds(); try{ copyText(analysisFor(ids).molfile,'Molfile copied'); }catch(err){ toast('Could not interpret this structure'); } }
  else if (c==='lookup') lookupOnline();
  else if (c==='analysis') openAnalysisDialog();
  else if (c==='stereo') openStereoGroups();
  else if (c==='nmr') openNmr(); else if (c==='ms') openMs(); else if (c==='finddb') openFindDb(); else if (c==='3d') open3d();
  else if (c==='image'){ clip=subDoc(sel.size?sel:null); copyImage(); }
  else if (c==='group') groupSel(); else if (c==='ungroup') ungroupSel();
  else if (c==='delete') deleteSel();
};
document.addEventListener('pointerdown', e=>{ if (!ctxMenu.contains(e.target)) closeCtx(); });
window.addEventListener('keydown', e=>{ if (e.key==='Escape') closeCtx(); }, true);

/* ================= analysis ================= */
let _anT=null;
function scheduleAnalysis(){ clearTimeout(_anT); _anT=setTimeout(analyzeNow,120); }
const fmtFormula=f=>esc(f).replace(/(\d+)/g,'<sub>$1</sub>').replace(/([+-])$/,'<sup>$1</sup>');
function analysisFor(ids){
  const {mol,generic}=toOCL(doc,ix,ids);
  if (!mol.getAllAtoms()) return null;
  const smiles=mol.toIsomericSmiles();
  const f=mol.getMolecularFormula();
  let props=null; try{ props=new OCL.MoleculeProperties(mol); }catch(e){}
  let molfile=''; try{ const m2=mol.getCompactCopy? mol.getCompactCopy(): mol; molfile=m2.toMolfile(); }catch(e){}
  return {smiles, formula:f.formula, mw:f.relativeWeight, exact:f.absoluteWeight, props, generic, molfile};
}
let lastAnalysis=null;
function analyzeNow(){
  const props=$('#props'), scope=$('#scope');
  const selIds=selAtoms();
  const ids = selIds.length? selIds : doc.atoms.map(a=>a.id);
  if (!ids.length){ props.innerHTML=''; scope.textContent='Nothing drawn yet'; lastAnalysis=null; return; }
  let r=null; try{ r=analysisFor(ids); }catch(e){ console.warn(e); }
  lastAnalysis=r;
  const nfrag=components(doc,ix,ids).length;
  scope.textContent = (selIds.length? 'Selection' : 'Whole drawing') + (nfrag>1? `, ${nfrag} structures`:'');
  if (!r){ props.innerHTML='<dd style="grid-column:1/-1">Could not interpret this structure.</dd>'; return; }
  const row=(k,v,copy,cls='')=>`<dt>${k}</dt><dd class="${cls}">${v}</dd>${copy!=null?`<button class="mini" data-copy="${esc(copy)}">Copy</button>`:'<span></span>'}`;
  let html='';
  if (r.generic) html+=`<dd style="grid-column:1/-1;color:var(--ink-2);font-size:12.5px;margin-bottom:6px">Generic groups (R, X, custom labels) are left out of these values.</dd>`;
  html+=row('SMILES', esc(r.smiles), r.smiles,'code');
  html+=row('Formula', fmtFormula(r.formula), r.formula);
  html+=row('MW', r.mw.toFixed(2)+' g/mol', r.mw.toFixed(2));
  html+=row('Exact mass', r.exact.toFixed(4), r.exact.toFixed(4));
  if (!r.generic){ try{ const {mol}=toOCL(doc,ix,ids,{skipH:true}); const a=MS.adducts(mol); const m=a.rows[0]; if (m && Number.isFinite(m.mz)) html+=row(`m/z ${esc(m.label)}`, m.mz.toFixed(4), m.mz.toFixed(4)); }catch(e){} }
  if (r.props){ const p=r.props;
    html+=row('cLogP', p.logP.toFixed(2), null);
    html+=row('LogS', p.logS.toFixed(2), null);
    html+=row('tPSA', p.polarSurfaceArea.toFixed(1)+' Å²', null);
    html+=row('H-bond donors / acceptors', p.donorCount+' / '+p.acceptorCount, null);
    html+=row('Rotatable bonds', p.rotatableBondCount, null);
    html+=row('Stereocenters', p.stereoCenterCount, null);
  }
  if (!r.generic) html+=`<dt>InChI</dt><dd class="code" id="anInchi">\u2026</dd><span></span><dt>InChIKey</dt><dd class="code" id="anKey">\u2026</dd><span></span>`;
  if (r.molfile) html+=row('Molfile', '<span style="color:var(--ink-2)">V2000</span>', r.molfile);
  const rx=reactionSmiles(); if (rx) html+=row('Reaction SMILES', esc(rx), rx, 'code');
  props.innerHTML=html;
  if (!r.generic && r.molfile){ const tok=++_inchiTok;
    inchiOf(r.molfile).then(v=>{ if (tok!==_inchiTok) return; const set=(id,t)=>{ const e=$('#'+id); if (!e) return; e.textContent=t||'\u2014'; if (t){ const b=document.createElement('button'); b.className='mini'; b.dataset.copy=t; b.textContent='Copy'; e.nextElementSibling.replaceWith(b); } };
      set('anInchi',v.inchi); set('anKey',v.key); }); }
}
// InChI and InChIKey from the bundled IUPAC InChI library (WebAssembly, offline)
let _inchiTok=0; const _inchiCache=new Map();
async function inchiOf(molfile){
  if (_inchiCache.has(molfile)) return _inchiCache.get(molfile);
  let v={inchi:'',key:''};
  try{ const r=await OCL.InChI.inchiFromMolfile(molfile); if (r.inchi){ v.inchi=r.inchi; v.key=(await OCL.InChI.inchikeyFromInchi(r.inchi)).inchikey; } }catch(e){ console.warn(e); }
  if (_inchiCache.size>50) _inchiCache.clear(); _inchiCache.set(molfile,v); return v;
}
function reactionSmiles(){
  const ar=doc.arrows.find(r=>!CURVED.has(r.type) && r.type!=='resonance' && r.type!=='retro'); if (!ar) return null;
  const P1=V(ar.x1,ar.y1),P2=V(ar.x2,ar.y2), u=norm(sub(P2,P1)), Lr=dist(P1,P2);
  const R=[],A=[],P=[];
  for (const comp of components(doc,ix)){
    let c=V(0,0); for (const id of comp) c=add(c,ix.atom.get(id)); c=mul(c,1/comp.length);
    const t=dot(sub(c,P1),u); let smi; try{ smi=toOCL(doc,ix,comp).mol.toIsomericSmiles(); }catch(e){ continue; } if(!smi) continue;
    (t<0?R: t>Lr?P:A).push(smi);
  }
  if (!R.length||!P.length) return null;
  return R.join('.')+'>'+A.join('.')+'>'+P.join('.');
}
$('#bLookup').onclick=()=>lookupOnline();
$('#bMs').onclick=()=>openMs();
$('#b3d').onclick=()=>open3d();
$('#bFindDb').onclick=()=>openFindDb();
$('#props').addEventListener('click', e=>{ const b=e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy, 'Copied'); });
/* ChemDraw-style analysis block: pick the lines, preview, copy or add under the structure */
const ANALYSIS_ITEMS=[['formula','Chemical Formula',1],['exact','Exact Mass',1],['mw','Molecular Weight',1],['mz','m/z (isotope peaks)',1],['ea','Elemental Analysis',1],['logp','cLogP',0],['logs','LogS',0],['tpsa','tPSA',0]];
let anaPick; try{ anaPick=JSON.parse(localStorage.getItem('skeletal.analysis')||'null'); }catch(e){}
anaPick = anaPick || Object.fromEntries(ANALYSIS_ITEMS.map(([k,,on])=>[k,!!on]));
function analysisText(ids, pick){
  const r=analysisFor(ids); if (!r) return null;
  const {mol}=toOCL(doc,ix,ids,{skipH:true}); const comp=MS.composition(mol), counts=comp.counts, f=MS.hill(counts);
  const L2=[];
  if (pick.formula) L2.push(`Chemical Formula: ${f}`);
  if (pick.exact) L2.push(`Exact Mass: ${MS.massOf(counts).toFixed(2)}`);
  if (pick.mw) L2.push(`Molecular Weight: ${r.mw.toFixed(2)}`);
  if (pick.mz){ const pk=MS.nominal(MS.isotopes(counts, comp.charge||0)).filter(p=>p.rel>=1).slice(0,4); if (pk.length) L2.push('m/z: '+pk.map(p=>`${p.mz.toFixed(2)} (${p.rel.toFixed(1)}%)`).join(', ')); }
  const ea=MS.elemental(counts);
  if (pick.ea && ea) L2.push('Elemental Analysis: '+ea.rows.map(x=>`${x.el}, ${x.pct.toFixed(2)}`).join('; '));
  if (r.props){ if (pick.logp) L2.push(`cLogP: ${r.props.logP.toFixed(2)}`); if (pick.logs) L2.push(`LogS: ${r.props.logS.toFixed(2)}`); if (pick.tpsa) L2.push(`tPSA: ${r.props.polarSurfaceArea.toFixed(2)}`); }
  // journal sentence for combustion analysis (C, H, N, S only, as reported)
  const chn = ea ? ea.rows.filter(x=>/^(C|H|N|S)$/.test(x.el)) : [];
  const journal = chn.length ? `Anal. Calcd for ${f}: ${chn.map(x=>`${x.el}, ${x.pct.toFixed(2)}`).join('; ')}. Found: ${chn.map(x=>`${x.el}, \u2014`).join('; ')}.` : '';
  return {text:L2.join('\n'), journal, generic:r.generic};
}
function openAnalysisDialog(){
  const ids = selAtoms().length? selAtoms() : doc.atoms.map(a=>a.id);
  if (!ids.length){ toast('Draw a structure first'); return; }
  const draw=()=>{ const a=analysisText(ids, anaPick); if (!a){ toast('Could not interpret this structure'); return; }
    openDialog(`<div class="dialog-inner"><h3>Analysis</h3><p>${selAtoms().length?'For the selection.':'For the whole drawing.'} Values as in ChemDraw\u2019s Analysis window.</p>
      <div class="row" style="flex-wrap:wrap;gap:4px 14px">${ANALYSIS_ITEMS.map(([k,n])=>`<label class="chk"><input type="checkbox" data-ana="${k}"${anaPick[k]?' checked':''}> ${n}</label>`).join('')}</div>
      <pre class="code" id="anaPrev" style="white-space:pre-wrap;margin:10px 0;padding:8px;border:1px solid var(--line);border-radius:6px">${esc(a.text)||'Pick at least one line.'}</pre>
      ${a.journal?`<p class="note" style="margin:0 0 4px">Journal line for combustion analysis:</p><pre class="code" style="white-space:pre-wrap;margin:0 0 10px">${esc(a.journal)}</pre>`:''}
      ${a.generic?'<p class="note">Generic groups (R, X, custom labels) are left out.</p>':''}
      <p class="note">Elemental analysis uses IUPAC standard atomic weights; m/z lists the most abundant isotope peaks of the neutral molecule; LogS and cLogP are OpenChemLib estimates.</p>
      <div class="actions" style="flex-wrap:wrap"><button class="tb" id="anaCopy">Copy</button>${a.journal?'<button class="tb" id="anaJ">Copy journal line</button>':''}<button class="tb primary" id="anaAdd">Add to drawing</button><button class="tb" data-close>Close</button></div></div>`);
    dialog.querySelectorAll('[data-ana]').forEach(c=>c.onchange=()=>{ anaPick[c.dataset.ana]=c.checked; try{ localStorage.setItem('skeletal.analysis',JSON.stringify(anaPick)); }catch(e){} draw(); });
    $('#anaCopy').onclick=()=>copyText(a.text,'Analysis copied');
    const j=$('#anaJ'); if (j) j.onclick=()=>copyText(a.journal,'Journal line copied');
    $('#anaAdd').onclick=()=>{ if (!a.text) return; closeDialog(); addTextUnder(ids, a.text); };
  };
  draw();
}
$('#bAddInfo').addEventListener('click', openAnalysisDialog);

/* ================= export ================= */
let _meas=null;
function measureBBox(inner){
  if (!_meas){ _meas=document.createElementNS('http://www.w3.org/2000/svg','svg'); _meas.setAttribute('style','position:absolute;left:-10000px;top:0;width:10px;height:10px;visibility:hidden'); document.body.appendChild(_meas); }
  _meas.innerHTML=`<g>${inner}</g>`; const b=_meas.firstChild.getBBox(); return b;
}
function exportSVG(d, {pxPerPt=null, transparent=true, region=null}={}){
  const {svg}=renderDoc(d);
  let x,y,w,h;
  if (region){ x=region.x0; y=region.y0; w=region.x1-region.x0; h=region.y1-region.y0; }
  else { const b=measureBBox(svg); const pad=4+S(d).lineWidth; x=b.x-pad; y=b.y-pad; w=b.width+2*pad; h=b.height+2*pad; }
  const W = pxPerPt? `${Math.round(w*pxPerPt)}` : `${f2(w)}pt`, H = pxPerPt? `${Math.round(h*pxPerPt)}` : `${f2(h)}pt`;
  const bg = transparent? '' : `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#fff"/>`;
  const meta = `<desc id="skeletal-data">${encodeURIComponent(JSON.stringify(d))}</desc>`;
  const out=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)}">${meta}${bg}${svg}</svg>`;
  return {svg:out, w, h};
}
// raster formats other than PNG: JPEG and WebP from the canvas, GIF with the encoder below; all on white unless GIF is transparent
async function rasterBlob(d, type, region){
  const ppp=300/72, transparent = type==='gif' && $('#transp').checked;
  const e=exportSVG(d,{pxPerPt:ppp, transparent:false, region}); const w=Math.round(e.w*ppp), h=Math.round(e.h*ppp);
  const c=await svgToCanvas(e.svg, w, h, transparent);
  if (type==='gif'){ const g=c.getContext('2d'); return new Blob([gifEncode(g.getImageData(0,0,w,h).data, w, h, transparent)],{type:'image/gif'}); }
  return await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Encoding failed')), 'image/'+type, 0.95));
}
function svgToCanvas(svgStr, wpx, hpx, transparent){
  return new Promise((res,rej)=>{ const img=new Image();
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=wpx; c.height=hpx; const g=c.getContext('2d'); if(!transparent){ g.fillStyle='#fff'; g.fillRect(0,0,wpx,hpx);} g.drawImage(img,0,0,wpx,hpx); res(c); };
    img.onerror=()=>rej(new Error('Could not render image')); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr); });
}
// GIF89a with a fixed palette: index 0 transparent/white, 32 greys for antialiased line art, then a 6×6×6 colour cube
function gifEncode(px, w, h, transparent){
  const pal=[[255,255,255]]; for (let i=0;i<32;i++){ const v=Math.round(i*255/31); pal.push([v,v,v]); }
  for (let r=0;r<6;r++) for (let g=0;g<6;g++) for (let b=0;b<6;b++) pal.push([r*51,g*51,b*51]);
  while (pal.length<256) pal.push([0,0,0]);
  const idx=new Uint8Array(w*h);
  for (let i=0,p=0;i<idx.length;i++,p+=4){ const r=px[p],g=px[p+1],b=px[p+2],a=px[p+3];
    if (transparent && a<128){ idx[i]=0; continue; }
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    idx[i] = mx-mn<14 ? 1+Math.round((r+g+b)/3/255*31) : 33+Math.round(r/51)*36+Math.round(g/51)*6+Math.round(b/51); }
  // LZW, minimum code size 8
  const out=[]; let cur=0, nb=0; const emit=(code,size)=>{ cur|=code<<nb; nb+=size; while (nb>=8){ out.push(cur&255); cur>>=8; nb-=8; } };
  const CLEAR=256, EOI=257; let dict=new Map(), next=258, size=9;
  emit(CLEAR,size); let prefix=idx[0];
  for (let i=1;i<idx.length;i++){ const k=idx[i], key=prefix*256+k, hit=dict.get(key);
    if (hit!==undefined){ prefix=hit; continue; }
    emit(prefix,size);
    if (next<4096){ dict.set(key,next++); if (next>(1<<size) && size<12) size++; }
    else { emit(CLEAR,size); dict=new Map(); next=258; size=9; }
    prefix=k; }
  emit(prefix,size); emit(EOI,size); if (nb>0) out.push(cur&255);
  const bytes=[...'GIF89a'].map(ch=>ch.charCodeAt(0)), le=v=>[v&255,v>>8&255];
  bytes.push(...le(w),...le(h),0xF7,0,0); for (const c of pal) bytes.push(...c);
  if (transparent) bytes.push(0x21,0xF9,4,1,0,0,0,0);
  bytes.push(0x2C,0,0,0,0,...le(w),...le(h),0,8);
  const res=new Uint8Array(bytes.length + out.length + Math.ceil(out.length/255) + 2); res.set(bytes); let o=bytes.length;
  for (let i=0;i<out.length;i+=255){ const n=Math.min(255,out.length-i); res[o++]=n; for (let j=0;j<n;j++) res[o++]=out[i+j]; }
  res[o++]=0; res[o++]=0x3B; return res.subarray(0,o);
}
function svgToPngBlob(svgStr, wpx, hpx, transparent){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=wpx; c.height=hpx; const g=c.getContext('2d'); if(!transparent){ g.fillStyle='#fff'; g.fillRect(0,0,wpx,hpx);} g.drawImage(img,0,0,wpx,hpx); c.toBlob(b=>b?res(b):rej(new Error('PNG encoding failed')),'image/png'); };
    img.onerror=()=>rej(new Error('Could not render image'));
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  });
}
function exportRegion(){ return (doc.page && $('#expArea').value==='doc') ? pageBounds(doc) : null; }
function exportTarget(){ const d=subDoc(exportRegion()? null : (sel.size?sel:null)); if(!d.atoms.length&&!d.arrows.length&&!d.texts.length&&!d.pluses.length) return null; return d; }
async function makePng(d, pxPerPt, transparent, region){
  if (region){ const w=region.x1-region.x0, h=region.y1-region.y0; const maxPpp=Math.min(14000/Math.max(w,h), Math.sqrt(1.2e8/(w*h))); if (pxPerPt>maxPpp){ pxPerPt=maxPpp; makePng.reduced=Math.round(pxPerPt*72); } else makePng.reduced=0; } else makePng.reduced=0;
  const e=exportSVG(d,{pxPerPt,transparent,region});
  const blob=await svgToPngBlob(e.svg, Math.round(e.w*pxPerPt), Math.round(e.h*pxPerPt), transparent);
  return {blob, e};
}
async function copyImage(){
  const d=exportTarget(); if(!d){ toast('Nothing to copy yet'); return; }
  const scale=+$('#copyScale').value, ppp=96/72*scale, transparent=$('#transp').checked;
  const pngP=makePng(d,ppp,transparent,exportRegion()).then(r=>r.blob);
  try{
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard');
    await navigator.clipboard.write([new ClipboardItem({'image/png':pngP})]);
    toast(sel.size? 'Selection copied. Paste into PowerPoint or Word' : 'Drawing copied. Paste into PowerPoint or Word');
  }catch(err){
    const blob=await pngP; const url=URL.createObjectURL(blob);
    openDialog(`<h3>Copy the image</h3><p>This window can't write to your clipboard directly. Right-click the image (or press and hold on a touch screen) and choose Copy image, then paste into PowerPoint or Word.</p><img class="copyimg" src="${url}" alt="Your drawing"><div class="actions"><button class="tb" data-close>Done</button><button class="tb primary" id="dlFromCopy">Download PNG instead</button></div>`);
    $('#dlFromCopy').onclick=()=>{ closeDialog(); downloadPng(); };
  }
}
async function copyText(t, msg){
  try{ await navigator.clipboard.writeText(t); toast(msg||'Copied'); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand('copy'); }catch(_){} ta.remove(); if (ok) toast(msg||'Copied'); else openDialog(`<h3>Copy text</h3><p>Select the text and copy it.</p><textarea readonly>${esc(t)}</textarea><div class="actions"><button class="tb primary" data-close>Done</button></div>`); }
}
// PNG chunk helpers (dpi + embedded drawing for reopening)
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function crc32(bytes){ let c=0xFFFFFFFF; for (let i=0;i<bytes.length;i++) c=CRC[(c^bytes[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function chunk(type, data){ const out=new Uint8Array(12+data.length); const dv=new DataView(out.buffer); dv.setUint32(0,data.length); for(let i=0;i<4;i++) out[4+i]=type.charCodeAt(i); out.set(data,8); dv.setUint32(8+data.length, crc32(out.subarray(4,8+data.length))); return out; }
async function pngWithMeta(blob, dpi, docJson){
  const buf=new Uint8Array(await blob.arrayBuffer());
  const ppm=Math.round(dpi/0.0254); const phys=new Uint8Array(9); const dv=new DataView(phys.buffer); dv.setUint32(0,ppm); dv.setUint32(4,ppm); phys[8]=1;
  const enc=new TextEncoder(); const txt=enc.encode('skeletal\0'+encodeURIComponent(docJson));
  const ihdrEnd=8+12+13; // signature + IHDR chunk
  const parts=[buf.subarray(0,ihdrEnd), chunk('pHYs',phys), chunk('tEXt',txt), buf.subarray(ihdrEnd)];
  return new Blob(parts,{type:'image/png'});
}
function readPngMeta(bytes){
  let p=8; const dec=new TextDecoder();
  while (p+8<bytes.length){ const dv=new DataView(bytes.buffer,bytes.byteOffset+p); const n=dv.getUint32(0); const type=dec.decode(bytes.subarray(p+4,p+8));
    if (type==='tEXt'){ const s=dec.decode(bytes.subarray(p+8,p+8+n)); if (s.startsWith('skeletal\0')) return decodeURIComponent(s.slice(9)); }
    if (type==='IEND') break; p+=12+n; }
  return null;
}
let dlCap; const dlReady=(async()=>{ try{ if (window.claude && claude.use){ dlCap=await claude.use('downloads'); } }catch(e){ dlCap=null; } })();
async function saveFile(filename, data){
  await dlReady;
  if (dlCap){ try{ await dlCap.save({filename, data}); toast('Saved '+filename); }catch(e){ if (e && e.code==='declined') return; toast('Could not save the file here'); } return; }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
async function downloadPng(){
  const d=exportTarget(); if(!d){ toast('Nothing to export yet'); return; }
  const dpi=600, ppp=dpi/72; const {blob}=await makePng(d,ppp,$('#transp').checked,exportRegion());
  const used=makePng.reduced||dpi; if (makePng.reduced) toast(`Large document: saved at ${used} dpi`);
  saveFile(fileBase()+'.png', await pngWithMeta(blob,used,JSON.stringify(d)));
}
function downloadSvg(){ const d=exportTarget(); if(!d){ toast('Nothing to export yet'); return; } const {svg}=exportSVG(d,{transparent:$('#transp').checked, region:exportRegion()}); saveFile(fileBase()+'.svg', '<?xml version="1.0" encoding="UTF-8"?>\n'+svg); }
/* ================= Save as: every export format in one place ================= */
const EXPORTS = [
  {g:'Images', items:[
    {id:'png', n:'PNG', ext:'png', note:'600 dpi, transparent if set; reopens here for editing'},
    {id:'jpeg', n:'JPEG', ext:'jpg', note:'300 dpi on white'},
    {id:'webp', n:'WebP', ext:'webp', note:'300 dpi on white'},
    {id:'gif', n:'GIF', ext:'gif', note:'300 dpi, 256 colours'},
    {id:'svg', n:'SVG', ext:'svg', note:'Vector; PowerPoint can convert it to shapes'},
    {id:'pdf', n:'PDF', ext:'pdf', note:'Vector, standard fonts; pages and sheets'},
    {id:'eps', n:'EPS', ext:'eps', note:'Vector PostScript for LaTeX and older publishing tools'} ]},
  {g:'Structure files', items:[
    {id:'cdxml', n:'ChemDraw XML', ext:'cdxml', f:1, note:'Opens in ChemDraw with styles, labels and arrows'},
    {id:'cdx', n:'ChemDraw binary', ext:'cdx', f:1, bin:1, note:'Classic ChemDraw document'},
    {id:'mol', n:'MDL Molfile V2000', ext:'mol', f:1},
    {id:'molV3', n:'MDL Molfile V3000', ext:'mol', f:1},
    {id:'sdf', n:'SD file', ext:'sdf', f:1, note:'One record per structure'},
    {id:'rxn', n:'MDL RXN V2000', ext:'rxn', f:1, note:'Reactants and products from the drawn arrow'},
    {id:'rxnV3', n:'MDL RXN V3000', ext:'rxn', f:1},
    {id:'smiles', n:'SMILES', ext:'smi', text:1},
    {id:'smarts', n:'SMARTS', ext:'sma', f:1, text:1},
    {id:'inchi', n:'InChI', ext:'inchi', text:1, note:'Official IUPAC InChI, computed offline'},
    {id:'inchikey', n:'InChIKey', ext:'txt', text:1},
    {id:'cml', n:'Chemical Markup Language', ext:'cml', f:1},
    {id:'mrv', n:'Marvin', ext:'mrv', f:1},
    {id:'jme', n:'JME / JSME', ext:'jme', f:1, text:1},
    {id:'chemfig', n:'chemfig (LaTeX)', ext:'tex', f:1, text:1} ]},
  {g:'3D coordinates (generated conformer of the largest structure)', items:[
    {id:'xyz', n:'XYZ', ext:'xyz', note:'For quantum chemistry and molecular viewers'},
    {id:'pdb', n:'PDB', ext:'pdb', note:'With CONECT records, for docking and PyMOL'},
    {id:'sdf3d', n:'SD file (3D)', ext:'sdf'} ]},
  {g:'Project', items:[
    {id:'html', n:'Skeletal project', ext:'html', note:'The editor with all pages and versions inside'},
    {id:'json', n:'Skeletal JSON', ext:'json'} ]},
];
function exportDoc(){ return subDoc(sel.size?sel:null); }
async function exportData(id){ // -> {data: string|Blob|Uint8Array, mime}
  const d=exportDoc(); if (!hasContent(d)) throw new Error('Nothing to export yet');
  const ids=d.atoms.map(a=>a.id), dix=buildIndex(d);
  const mol=()=>{ if (!ids.length) throw new Error('There are no structures to export'); const {mol,generic}=toOCL(d,dix,ids); if (generic) toast('Generic labels (R, X) are written as unknown atoms'); return mol; };
  switch (id){
    case 'jpeg': case 'webp': case 'gif': return {data:await rasterBlob(exportTarget(), id, exportRegion())};
    case 'eps': { const {svg}=exportSVG(exportTarget(),{transparent:true, region:exportRegion()}); return {data:PDF.eps(svg), mime:'application/postscript'}; }
    case 'smiles': return {data:mol().toIsomericSmiles()+'\n'};
    case 'inchi': case 'inchikey': { const v=await inchiOf(mol().toMolfile()); /* drawn coordinates carry the wedges: no re-layout */ if (!v.inchi) throw new Error('InChI could not be computed for this structure'); return {data:(id==='inchi'?v.inchi:v.key)+'\n'}; }
    case 'json': return {data:JSON.stringify(project)};
    case 'xyz': case 'pdb': case 'sdf3d': { const comps=components(d,dix).sort((a,b)=>b.length-a.length); const r=toOCL(d,dix,comps[0],{skipH:true}); if (r.generic) throw new Error('Generic labels have no 3D geometry');
      const m3=await VIEW3D.conformer(r.mol); return {data: id==='xyz'? VIEW3D.xyz(m3) : id==='pdb'? VIEW3D.pdb(m3) : m3.mol.toMolfile()+'$$$$\n'}; }
  }
  const it=EXPORTS.flatMap(g=>g.items).find(x=>x.id===id);
  if (it && it.f){ if (typeof FORMATS==='undefined' || !FORMATS.write) throw new Error('This format is not available in this build');
    const out=FORMATS.write(id, d); return {data:out, mime: it.bin? 'application/octet-stream' : 'text/plain'}; }
  throw new Error('Unknown format');
}
async function exportAs(id, copy){
  if (id==='png') return downloadPng(); if (id==='svg') return downloadSvg(); if (id==='pdf'){ closeDialog(); return exportPdfDialog(); } if (id==='html') return saveHtml();
  const it=EXPORTS.flatMap(g=>g.items).find(x=>x.id===id);
  try{
    const {data}=await exportData(id);
    if (copy){ copyText(typeof data==='string'? data.trim() : '', it.n+' copied'); return; }
    saveFile(fileBase()+(sel.size?' selection':'')+'.'+it.ext, data instanceof Uint8Array ? new Blob([data]) : data);
  }catch(err){ toast(err.message||'Export failed'); }
}
function openSaveAs(){
  const has = typeof FORMATS!=='undefined' && FORMATS.write;
  const row=it=>`<tr><td><b>${esc(it.n)}</b> <span class="code" style="color:var(--ink-2)">.${it.ext}</span>${it.note?`<div class="note" style="margin:2px 0 0">${esc(it.note)}</div>`:''}</td>
    <td style="white-space:nowrap;text-align:right">${it.text?`<button class="mini" data-x="${it.id}" data-copy-x="1">Copy</button> `:''}<button class="mini"${it.f&&!has?' disabled':''} data-x="${it.id}">${it.id==='pdf'?'Options…':'Download'}</button></td></tr>`;
  openDialog(`<div class="dialog-inner"><h3>Save as</h3><p>${sel.size? 'Exports the selection.' : 'Exports the whole page.'} Images follow the Export settings (area, transparency).</p>
    ${EXPORTS.map(g=>`<h4 style="margin:14px 0 4px;font-size:13px">${g.g}</h4><table class="peaks fmt"><tbody>${g.items.map(row).join('')}</tbody></table>`).join('')}
    <p class="note">Not offered: ISIS Sketch and TGF, SMD, PICT, MIF, SWF, WMF and Sybyl SLN. These are retired or closed formats that current software no longer reads; SVG, PDF and EPS cover their uses.</p>
    <div class="actions"><button class="tb primary" data-close>Done</button></div></div>`);
  dialog.classList.add('wide');
  dialog.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>exportAs(b.dataset.x, !!b.dataset.copyX));
}
function saveDrawing(){ saveFile(fileBase()+'.json', JSON.stringify(project)); }
$('#fileIn').addEventListener('change', async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    if (/\.png$/i.test(f.name)){ const s=readPngMeta(new Uint8Array(await f.arrayBuffer())); if(!s){ toast('This PNG was not made here, so it has no editable drawing inside'); return; } pasteDoc(normalizeDoc(JSON.parse(s)),0,viewCenter()); return; }
    const fm=/\.(cdxml|cdx|cml|mrv)$/i.exec(f.name);
    if (fm){ const k=fm[1].toLowerCase(); const data = k==='cdx' ? new Uint8Array(await f.arrayBuffer()) : await f.text(); insertForeign(FORMATS.read(k,data), f.name); return; }
    const t=await f.text();
    if (/\.svg$/i.test(f.name)){ const m=t.match(/<desc id="skeletal-data">([^<]*)<\/desc>/); if(!m){ toast('This SVG was not made here, so it has no editable drawing inside'); return; } pasteDoc(normalizeDoc(JSON.parse(decodeURIComponent(m[1]))),0,viewCenter()); return; }
    if (/\.html?$/i.test(f.name)){ const pj=extractProject(t); if(!pj){ toast('This HTML file has no Skeletal project inside'); return; } confirmOpenProject(pj); return; }
    if (/\.json$/i.test(f.name)){ const j=JSON.parse(t); if (j && j.pages){ confirmOpenProject(j); return; } const d=normalizeDoc(j); if (doc.atoms.length||doc.arrows.length){ pasteDoc(d,0,viewCenter()); } else { pushUndo(); setDoc(d); changed(); fit(); } return; }
    if (/\.sdf$/i.test(f.name)){ const first=t.split('$$$$')[0]; if (!tryLoadText(first)) toast('Could not read this file'); return; }
    if (!tryLoadText(t.trim())) toast('Could not read this file');
  }catch(err){ console.warn(err); toast('Could not read this file'); }
});
// drag and drop files
stage.addEventListener('dragover', e=>{ e.preventDefault(); });
stage.addEventListener('drop', e=>{ e.preventDefault(); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f){ const dt=new DataTransfer(); dt.items.add(f); $('#fileIn').files=dt.files; $('#fileIn').dispatchEvent(new Event('change')); } });

/* ================= view helpers ================= */
function fit(){
  let bb=contentBBox(doc); const pb=pageBounds(doc); if (pb){ bb = bb ? {x0:Math.min(bb.x0,pb.x0),y0:Math.min(bb.y0,pb.y0),x1:Math.max(bb.x1,pb.x1),y1:Math.max(bb.y1,pb.y1)} : pb; } const W=cv.clientWidth, H=cv.clientHeight;
  if (!bb){ view.z=3; view.ox=W/2; view.oy=H/2; render(); return; }
  bb.x0-=L*0.8; bb.x1+=L*0.8; bb.y0-=L*0.8; bb.y1+=L*0.8;
  const w=Math.max(bb.x1-bb.x0, L*4), h=Math.max(bb.y1-bb.y0, L*3);
  view.z=Math.min(6, Math.max(0.15, Math.min((W-100)/w,(H-140)/h)));
  view.ox=W/2-(bb.x0+bb.x1)/2*view.z; view.oy=H/2-(bb.y0+bb.y1)/2*view.z; render();
}
function fitIfNeeded(){ const bb=contentBBox(doc); if(!bb) return; const W=cv.clientWidth,H=cv.clientHeight; const sx0=bb.x0*view.z+view.ox, sx1=bb.x1*view.z+view.ox, sy0=bb.y0*view.z+view.oy, sy1=bb.y1*view.z+view.oy; if (sx0<10||sy0<10||sx1>W-10||sy1>H-10) fit(); }

/* ================= UI: tools ================= */
const ic = (p, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
function polyIcon(n, inner){ const pts=[]; for(let k=0;k<n;k++){ const t=-Math.PI/2+2*Math.PI*k/n; pts.push([12+8*Math.cos(t),12.5+8*Math.sin(t)]); }
  let s=`<path d="M${pts.map(p=>p.map(v=>v.toFixed(1)).join(' ')).join('L')}Z"/>`;
  if (inner){ for (let k=0;k<n;k+=2){ const a=pts[k],b=pts[(k+1)%n]; const c=[12,12.5]; const sh=(p)=>[p[0]+(c[0]-p[0])*0.27,p[1]+(c[1]-p[1])*0.27]; const a2=sh(a),b2=sh(b); s+=`<path d="M${a2[0].toFixed(1)} ${a2[1].toFixed(1)}L${b2[0].toFixed(1)} ${b2[1].toFixed(1)}" stroke-width="1.3"/>`; } }
  return ic(s); }
const TOOLS = [
  {g:'basic', items:[
    {id:'select', o:{lasso:false}, t:'Select and move (V): drag a box', i:ic('<path d="M6 3l12 9-5.5 1.2L15 20l-2.6 1.1-2.6-6.6L6 18z" fill="currentColor" stroke-width="1.2"/>')},
    {id:'select', o:{lasso:true}, t:'Lasso select (L): drag a freehand loop', i:ic('<path d="M12 4c5 0 8 2.2 8 5s-3.6 5-8 5c-1.7 0-3.3-.3-4.5-.9" stroke-dasharray="2.4 2"/><path d="M7.5 13.1C5.4 12.2 4 10.7 4 9c0-2.8 3.6-5 8-5"/><path d="M7.5 13.1c-.6 1.6.2 3.4 1.6 4.4 1 .7 1.1 2 .3 2.9"/>')},
    {id:'erase', t:'Eraser (E)', i:ic('<path d="M4 16l9-9 6 6-7 7H7z"/><path d="M9 11l6 6M12 20h8"/>')},
    {id:'text', t:'Text (T)', i:ic('<path d="M6 5h12M12 5v14M9 19h6"/>')},
  ]},
  {g:'bonds', items:[
    {id:'bond', o:{bond:{order:1,stereo:'none'}}, t:'Single bond (1). Click a bond to cycle its order', i:ic('<path d="M5 19L19 5"/>')},
    {id:'bond', o:{bond:{order:2,stereo:'none'}}, t:'Double bond (2). Click a double bond to move its second line', i:ic('<path d="M4 17L17 4M7 20L20 7"/>')},
    {id:'bond', o:{bond:{order:3,stereo:'none'}}, t:'Triple bond (3)', i:ic('<path d="M3 16L16 3M5.5 18.5L18.5 5.5M8 21L21 8"/>')},
    {id:'bond', o:{bond:{order:1,stereo:'wedge'}}, t:'Wedge bond. Click again to reverse', i:ic('<path d="M5 19L17 4l3 3z" fill="currentColor"/>')},
    {id:'bond', o:{bond:{order:1,stereo:'hash'}}, t:'Hashed wedge bond', i:ic('<path d="M7 17l.8.8M9 14.5l1.8 1.8M11 12l2.8 2.8M13 9.5l3.8 3.8M15 7l4.8 4.8" stroke-width="1.5"/>')},
    {id:'bond', o:{bond:{order:1,stereo:'wavy'}}, t:'Wavy bond (undefined stereo)', i:ic('<path d="M4 18q2-4 4-2t4-2 4-2 4-6"/>')},
    {id:'bond', o:{bond:{order:1,stereo:'bold'}}, t:'Bold bond', i:ic('<path d="M5 19L19 5" stroke-width="4" stroke-linecap="butt"/>')},
    {id:'chain', t:'Chain. Drag to set the length', i:ic('<path d="M3 15l4.5-6 4.5 6 4.5-6 4.5 6"/>')},
  ]},
  {g:'rings', items:[
    {id:'ring', o:{ring:6,arom:true}, t:'Benzene', i:polyIcon(6,true)},
    {id:'ring', o:{ring:6,arom:false}, t:'Cyclohexane', i:polyIcon(6)},
    {id:'ring', o:{ring:5,arom:false}, t:'Cyclopentane', i:polyIcon(5)},
    {id:'ring', o:{ring:4,arom:false}, t:'Cyclobutane', i:polyIcon(4)},
    {id:'ring', o:{ring:3,arom:false}, t:'Cyclopropane', i:polyIcon(3)},
    {id:'ring', o:{ring:7,arom:false}, t:'Cycloheptane', i:polyIcon(7)},
  ]},
  {g:'atoms', items: ['C','N','O','S','P','F','Cl','Br','I','H'].map(el=>({id:'atom', o:{el}, t:`${el} atom. Click an atom to change it, drag from an atom to add a bonded ${el}`, txt:el})).concat([{id:'atom', other:true, t:'Other element or group (Ph, OMe, Boc, R…)', txt:'…'}])},
  {g:'charges', items:[
    {id:'charge', o:{charge:1}, t:'Positive charge', i:ic('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>')},
    {id:'charge', o:{charge:-1}, t:'Negative charge', i:ic('<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>')},
    {id:'charge', o:{charge:'lp'}, t:'Lone pair. Click again to add more', i:ic('<circle cx="9" cy="12" r="1.8" fill="currentColor"/><circle cx="15" cy="12" r="1.8" fill="currentColor"/>')},
    {id:'charge', o:{charge:'rad'}, t:'Radical', i:ic('<circle cx="12" cy="12" r="2.2" fill="currentColor"/>')},
    {id:'plus', t:'Plus sign', i:ic('<path d="M12 6v12M6 12h12" stroke-width="2"/>')},
  ]},
  {g:'props', items:[
    {id:'pka', t:'pKa: click an atom to estimate its acidity (or basicity)', txt:'pKa'},
    {id:'bde', t:'BDE: click a bond, or an atom for its X–H bond', txt:'BDE'},
  ]},
  {g:'arrows', items:[
    {id:'arrow', o:{arrow:'reaction'}, t:'Reaction arrow (A)', i:ic('<path d="M3 12h14"/><path d="M21 12l-6-3.5v7z" fill="currentColor"/>')},
    {id:'arrow', o:{arrow:'equilibrium'}, t:'Equilibrium arrow', i:ic('<path d="M3 9.5h17l-5-3.5M21 14.5H4l5 3.5"/>')},
    {id:'arrow', o:{arrow:'retro'}, t:'Retrosynthetic arrow', i:ic('<path d="M3 9.5h14M3 14.5h14M15 5l6 7-6 7"/>')},
    {id:'arrow', o:{arrow:'resonance'}, t:'Resonance arrow', i:ic('<path d="M7 12h10"/><path d="M2.5 12L8 8.8v6.4zM21.5 12L16 8.8v6.4z" fill="currentColor"/>')},
    {id:'arrow', o:{arrow:'dashed'}, t:'Dashed arrow', i:ic('<path d="M3 12h2.5M8 12h2.5M13 12h2.5"/><path d="M21 12l-6-3.5v7z" fill="currentColor"/>')},
    {id:'arrow', o:{arrow:'nogo'}, t:'Failed reaction arrow', i:ic('<path d="M3 12h14M8 8.5l4 7M12 8.5l-4 7"/><path d="M21 12l-6-3.5v7z" fill="currentColor"/>')},
    {id:'arrow', o:{arrow:'curly'}, t:'Curved arrow (electron pair). Drag from start to end', i:ic('<path d="M4 17C5 7 14 5 18 11"/><path d="M20 15.5l-5.5-2.6 5-3.6z" fill="currentColor"/>')},
    {id:'arrow', o:{arrow:'fishhook'}, t:'Fishhook arrow (single electron)', i:ic('<path d="M4 17C5 7 14 5 18 11"/><path d="M20 15l-6-1.6 4.2-2.4z" fill="currentColor"/>')},
  ]},
];
function renderTools(){
  const nav=$('#tools'); nav.innerHTML='';
  TOOLS.forEach(g=>{ const div=document.createElement('div'); div.className='tgroup';
    g.items.forEach(it=>{ const b=document.createElement('button'); b.className='tool'+(it.txt?' el':'')+(it.txt&&it.txt.length>2?' small':''); b.title=it.t; b.setAttribute('aria-label',it.t); b.innerHTML=it.i||esc(it.txt);
      b.onclick=()=>{ if (it.other){ openElementDialog(); return; } setTool(it.id, it.o||{}); };
      b._it=it; div.appendChild(b); });
    nav.appendChild(div); });
  syncTools();
}
function setTool(id, o={}){
  if (editingText) commitText();
  if (id!=='pka' && id!=='bde' && document.getElementById('infocard')) closeInfo();
  tool.id=id; Object.assign(tool,o);
  if (id!=='select'){ /* keep selection visible but frame only shows for select */ }
  cv.setAttribute('class', id==='select'?'select': id==='erase'?'erase':'');
  syncTools(); render();
}
function syncTools(){
  document.querySelectorAll('#tools .tool').forEach(b=>{ const it=b._it; let on = it.id===tool.id;
    if (on && it.o){ for (const k in it.o){ if (JSON.stringify(it.o[k])!==JSON.stringify(tool[k])) on=false; } }
    if (it.other) on = tool.id==='atom' && !['C','N','O','S','P','F','Cl','Br','I','H'].includes(tool.el);
    if (it.id==='atom' && !it.other && it.o && tool.id==='atom') on = tool.el===it.o.el;
    b.setAttribute('aria-pressed', on?'true':'false'); });
}

/* ================= dialogs & toast ================= */
const modal=$('#modal'), dialog=$('#dialog');
function openDialog(html){ dialog.classList.remove('wide'); dialog.innerHTML=html; modal.classList.add('open'); dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog); const f=dialog.querySelector('textarea,input'); if (f) setTimeout(()=>f.focus(),30); }
function closeDialog(){ modal.classList.remove('open'); dialog.innerHTML=''; dialog.classList.remove('wide'); }
modal.addEventListener('pointerdown', e=>{ if (e.target===modal) closeDialog(); });
dialog.addEventListener('keydown', e=>{ if (e.key==='Escape') closeDialog(); });
let _toastT=null;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(_toastT); _toastT=setTimeout(()=>t.classList.remove('show'),2200); }

function openSmilesDialog(){
  const ex=[['Aspirin','CC(=O)Oc1ccccc1C(=O)O'],['L-Alanine','C[C@@H](C(=O)O)N'],['Caffeine','Cn1cnc2c1c(=O)n(C)c(=O)n2C'],['Esterification','CC(=O)O.OCC>>CC(=O)OCC']];
  openDialog(`<h3>Insert structure</h3><p>Paste a SMILES string, a reaction SMILES (A.B>>C), an InChI or a molfile. You can also type a compound name or CAS number (for example caffeine or 58-08-2); it is looked up on PubChem, which needs an internet connection.</p><textarea id="smIn" placeholder="e.g. c1ccccc1O"></textarea><div class="examples">${ex.map(([n,s])=>`<button class="mini" data-s="${esc(s)}">${n}</button>`).join('')}</div><div class="err" id="smErr"></div><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="smGo">Insert</button></div>`);
  dialog.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ $('#smIn').value=b.dataset.s; $('#smIn').focus(); });
  const go=async ()=>{ const v=$('#smIn').value.trim(); if(!v){ $('#smErr').textContent='Enter a SMILES string, name or CAS number first.'; return; }
    if (tryLoadText(v,true)){ closeDialog(); return; }
    if (v.includes('\n') || v.length>200){ $('#smErr').textContent='That isn\u2019t a valid SMILES string or molfile. Check brackets and ring numbers.'; return; }
    $('#smErr').textContent=`Not a valid SMILES. Looking up \u201c${v}\u201d as a name or CAS number on PubChem\u2026`;
    try{ const smi=await pubchemNameToSmiles(v); if (smi && tryLoadText(smi)){ closeDialog(); toast(`Inserted ${v} from PubChem`); return; } $('#smErr').textContent=`Not a valid SMILES, and PubChem has no compound named \u201c${v}\u201d.`; }
    catch(err){ $('#smErr').textContent='That isn\u2019t a valid SMILES string, and PubChem could not be reached to look it up as a name. Check your connection.'; } };
  $('#smGo').onclick=go; $('#smIn').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); go(); } });
}
function openElementDialog(){
  const sug=['Me','Et','iPr','tBu','Ph','Bn','OMe','OAc','CO2H','CO2Me','NHBoc','Boc','Ts','OTf','TMS','CF3','NO2','CN','R','R1','X','Nd','Fe','Cu','Si','Se','Na','Li'];
  openDialog(`<h3>Element or group</h3><p>Type any element symbol, a nickname like OMe or Boc, or a generic label like R1. Nicknames count toward formula and mass.</p><input type="text" id="elIn" value="${esc(['C','N','O','S','P','F','Cl','Br','I','H'].includes(tool.el)?'':tool.el)}" placeholder="e.g. OMe"><div class="examples">${sug.map(s=>`<button class="mini" data-e="${esc(s)}">${esc(s)}</button>`).join('')}</div><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="elGo">Use this label</button></div>`);
  dialog.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{ $('#elIn').value=b.dataset.e; go(); });
  const go=()=>{ const v=normalizeLabel($('#elIn').value); if(!v) return; closeDialog(); setTool('atom',{el:v}); toast(`Click atoms to label them ${v}`); };
  $('#elGo').onclick=go; $('#elIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
}
function openLabelDialog(atomId){
  const a=ix.atom.get(atomId); if(!a) return;
  openDialog(`<h3>Atom label</h3><p>Element, nickname (OMe, Ph, Boc…) or generic label (R1, X).</p><input type="text" id="lbIn" value="${esc(a.el)}"><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="lbGo">Apply</button></div>`);
  const go=()=>{ const v=normalizeLabel($('#lbIn').value); if(!v) return; closeDialog(); pushUndo(); a.el=v; changed(); };
  $('#lbGo').onclick=go; $('#lbIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
}

/* ================= style & colors ================= */
const SWATCHES=['#000000','#2f4fd6','#d1231f','#1f8f3a','#7a2fb5','#d06a00','#808a94'];
function renderSwatches(){ const w=$('#swatches'); w.innerHTML=SWATCHES.map(c=>`<button class="sw" style="background:${c}" data-c="${c}" title="${c==='#000000'?'Black (default)':c}" aria-label="Color ${c}"></button>`).join('');
  w.onclick=e=>{ const b=e.target.closest('[data-c]'); if(!b) return; if(!sel.size){ toast('Select something to color first'); return; } pushUndo(); const c=b.dataset.c==='#000000'?null:b.dataset.c; const aS=new Set(selAtoms());
    for (const a of doc.atoms) if (aS.has(a.id)) a.color=c; for (const bd of doc.bonds) if (aS.has(bd.a)&&aS.has(bd.b)) bd.color=c;
    for (const r of doc.arrows) if (sel.has('r'+r.id)) r.color=c; for (const t of doc.texts) if (sel.has('t'+t.id)) t.color=c; for (const p of doc.pluses) if (sel.has('p'+p.id)) p.color=c; changed(); }; }
function syncStyleUI(){ syncDrawSet(); $('#presetNote').textContent=PRESET_NOTES[doc.style]||''; document.querySelectorAll('#presetSeg button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.p===doc.style?'true':'false')); $('#colorAtoms').checked=!!doc.colorAtoms; $('#labelSize').value=doc.labelSize?String(doc.labelSize):''; }
// changing the style or bond length rescales the drawing so bonds keep the style's length
function restyle(d, fn){ const before=S(d).bondLength; fn(); rescaleDoc(d, S(d).bondLength/before); if (d===doc) useStyle(d); }
$('#presetSeg').addEventListener('click', e=>{ const b=e.target.closest('[data-p]'); if(!b||b.dataset.p===doc.style) return; pushUndo(); restyle(doc,()=>{ doc.style=b.dataset.p; delete doc.styleOv; delete doc.labelSize; }); changed(); }); // a journal style replaces custom settings, as in ChemDraw
const PRESET_NOTES = {
  acs:'ACS Document 1996 (ChemDraw): bond length 14.4 pt, line width 0.6 pt, bold width 2.0 pt, bond spacing 18%, hash spacing 2.5 pt, margin 1.6 pt, Arial 10 pt labels. Used by ACS journals and Organic Syntheses.',
  rsc:'RSC 1-column (ChemDraw 22 style sheet): bond length 12.2 pt, line width 0.45 pt, bold width 1.6 pt, bond spacing 20%, hash spacing 1.75 pt, margin 1.25 pt, Helvetica/Arial 7 pt labels.',
  nature:'Nature Reviews structure guide: fixed length 0.381 cm (10.8 pt), line width 0.021 cm, bold width 0.055 cm, bond spacing 18%, hash spacing 0.06 cm, margin 0.042 cm, Arial 6 pt labels.',
  slides:'Slides: ACS geometry with heavier lines and bold 11 pt labels for presentations.',
};
function syncDrawSet(){
  const base=PRESETS[doc.style]||PRESETS.acs, ov=doc.styleOv||{};
  document.querySelectorAll('#drawSet [data-ov]').forEach(inp=>{ const k=inp.dataset.ov, pct=inp.hasAttribute('data-pct'), f=v=>pct? String(Math.round(v*100)) : String(+v.toFixed(2));
    inp.placeholder=f(base[k]); if (document.activeElement!==inp) inp.value = ov[k]!=null ? f(ov[k]) : ''; });
}
$('#drawSet').addEventListener('change', e=>{
  const inp=e.target.closest('[data-ov]'); if (!inp) return;
  const k=inp.dataset.ov, [lo,hi]=STYLE_LIMITS[k], raw=inp.value.trim();
  const ov={...(doc.styleOv||{})};
  if (raw==='' || !Number.isFinite(+raw)) delete ov[k];
  else ov[k]=Math.min(hi,Math.max(lo, inp.hasAttribute('data-pct') ? +raw/100 : +raw));
  if (JSON.stringify(ov)===JSON.stringify(doc.styleOv||{})) return; // nothing changed (e.g. a second change event on blur)
  pushUndo();
  restyle(doc,()=>{ if (Object.keys(ov).length) doc.styleOv=ov; else delete doc.styleOv; });
  changed();
});
$('#drawSet').addEventListener('focusout', ()=>setTimeout(syncDrawSet,0));
$('#bOvReset').onclick=()=>{ if (!doc.styleOv) return; pushUndo(); restyle(doc,()=>{ delete doc.styleOv; }); changed(); toast('Drawing settings reset to the style defaults'); };
$('#bOvAll').onclick=()=>{ for (const pg of project.pages) restyle(pg.doc,()=>{ pg.doc.style=doc.style; if (doc.styleOv) pg.doc.styleOv={...doc.styleOv}; else delete pg.doc.styleOv; }); useStyle(doc); changed(); toast('Drawing settings applied to every page'); };
$('#colorAtoms').addEventListener('change', e=>{ pushUndo(); doc.colorAtoms=e.target.checked; changed(); });

/* ================= templates ================= */
const TEMPLATES=[
  ['Benzene','c1ccccc1'],['Pyridine','c1ccncc1'],['Indole','c1ccc2[nH]ccc2c1'],['Imidazole','c1cnc[nH]1'],
  ['Purine','c1ncc2nc[nH]c2n1'],['Pyrimidine','c1cncnc1'],['Naphthalene','c1ccc2ccccc2c1'],['Cyclohexanone','O=C1CCCCC1'],
  ['L-Amino acid','N[C@@H](C)C(=O)O'],['Dipeptide (Ala-Gly)','C[C@H](N)C(=O)NCC(=O)O'],['β-D-Glucose','OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'],['Adenine','Nc1ncnc2[nH]cnc12'],
  ['Citric acid','OC(=O)CC(O)(CC(=O)O)C(=O)O'],['EDTA','OC(=O)CN(CC(=O)O)CCN(CC(=O)O)CC(=O)O'],['Steroid core','C1CCC2C(C1)CCC1C2CCC2CCCC12'],['Acetyl-CoA fragment','CC(=O)SCCNC(=O)CCNC(=O)C'],
];
function renderTemplates(){ $('#tpl').innerHTML=TEMPLATES.map(([n,s])=>`<button data-s="${esc(s)}">${esc(n)}</button>`).join(''); $('#tpl').onclick=e=>{ const b=e.target.closest('[data-s]'); if(b){ tryLoadText(b.dataset.s); closePanelMobile(); } }; }

/* ================= wiring ================= */
// side panel sections fold up; which ones are folded is remembered per browser
(()=>{
  let folded=[]; try{ folded=JSON.parse(localStorage.getItem('skeletal.folded')||'[]'); }catch(e){}
  const save=()=>{ try{ localStorage.setItem('skeletal.folded', JSON.stringify([...document.querySelectorAll('.panel section.collapsed h2')].map(h=>h.textContent))); }catch(e){} };
  document.querySelectorAll('.panel section > h2').forEach(h=>{
    const name=h.textContent, sec=h.parentElement, b=document.createElement('button');
    b.className='sechead'; b.textContent=name; h.textContent=''; h.appendChild(b);
    const set=c=>{ sec.classList.toggle('collapsed',c); b.setAttribute('aria-expanded', String(!c)); };
    set(folded.includes(name));
    b.onclick=()=>{ set(!sec.classList.contains('collapsed')); save(); };
  });
})();
$('#bUndo').onclick=undo; $('#bRedo').onclick=redo;
$('#bClean').onclick=cleanUp; $('#bFlipH').onclick=()=>flip('h'); $('#bFlipV').onclick=()=>flip('v');
const alignMenu=$('#alignMenu');
function closeAlignMenu(){ if (alignMenu.hidden) return; alignMenu.hidden=true; $('#bAlign').setAttribute('aria-expanded','false'); }
$('#bAlign').onclick=e=>{
  e.stopPropagation();
  if (!alignMenu.hidden){ closeAlignMenu(); return; }
  alignMenu.hidden=false; $('#bAlign').setAttribute('aria-expanded','true');
  const r=$('#bAlign').getBoundingClientRect(), w=alignMenu.offsetWidth;
  alignMenu.style.left=Math.max(8,Math.min(r.left, innerWidth-w-8))+'px'; alignMenu.style.top=(r.bottom+4)+'px';
  alignMenu.querySelector('button').focus();
};
alignMenu.onclick=e=>{ const b=e.target.closest('[data-align]'); if (!b) return; const m=b.dataset.align; if (m==='group') groupSel(); else if (m==='ungroup') ungroupSel(); else arrange(m); };
$('#alignGap').value = alignGap>0 ? String(alignGap) : '';
$('#alignGap').addEventListener('change', e=>{ const v=+e.target.value; alignGap = Number.isFinite(v) && v>0 ? Math.min(20,v) : 0; e.target.value = alignGap? String(alignGap) : ''; try{ localStorage.setItem('skeletal.alignGap', String(alignGap)); }catch(err){} });
alignMenu.addEventListener('keydown',e=>{ if (e.key==='Escape'){ e.stopPropagation(); closeAlignMenu(); $('#bAlign').focus(); } });
document.addEventListener('pointerdown',e=>{ if (!alignMenu.contains(e.target) && e.target.closest('#bAlign')===null) closeAlignMenu(); });
$('#bSmiles').onclick=openSmilesDialog;
$('#bCopy').onclick=()=>{ clip=subDoc(sel.size?sel:null); copyImage(); };
$('#bSaveAs').onclick=openSaveAs;
$('#bPng').onclick=downloadPng; $('#bSvg').onclick=downloadSvg; $('#bSave').onclick=saveDrawing; $('#bPdf').onclick=exportPdfDialog; $('#bSaveHtml').onclick=saveHtml; $('#bVersion').onclick=saveVersionDialog; $('#bNmr').onclick=openNmr; $('#bOpen').onclick=()=>$('#fileIn').click();
$('#bZoomIn').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,1.25); $('#bZoomOut').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,0.8); $('#zoomval').onclick=fit;
$('#bNew').onclick=()=>{
  const go=()=>{ closeDialog(); loadProject(newProject()); toast('New project started'); };
  if (projectIsEmpty()) { go(); return; }
  openDialog(`<h3>Start a new project?</h3><p>You won’t be able to reopen “${esc(project.name)}” from here afterwards. Save it as an HTML file first if you want to keep it.</p><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb" id="npSave">Save current first</button><button class="tb primary" id="npGo">New project</button></div>`);
  $('#npGo').onclick=go; $('#npSave').onclick=()=>saveHtml();
};
$('#bPage').onclick=openPageSetup; $('#bSolv').onclick=openSolvents; $('#bSolv2').onclick=openSolvents;
$('#expArea').onchange=()=>{};
$('#bAcsAll').onclick=()=>{ const st=doc.style; for (const pg of project.pages) restyle(pg.doc,()=>{ pg.doc.style=st; delete pg.doc.labelSize; delete pg.doc.styleOv; }); useStyle(doc); changed(); toast(`${PRESETS[st].name} applied to every page`); };
$('#bPanel').onclick=()=>{ const p=$('#panel'); const o=p.classList.toggle('open'); $('#bPanel').setAttribute('aria-expanded',o); };
function closePanelMobile(){ $('#panel').classList.remove('open'); $('#bPanel').setAttribute('aria-expanded','false'); }
window.addEventListener('resize', ()=>{ render(); positionTed(); });

/* ================= projects, pages, versions ================= */
function normalizeProject(p){
  const n={...newProject(), ...p};
  n.pages=(p.pages&&p.pages.length? p.pages : [{id:1,name:'Page 1',doc:newDoc()}]).map((pg,i)=>({id:pg.id||i+1, name:pg.name||('Page '+(i+1)), doc:normalizeDoc(pg.doc||{})}));
  n.cur=Math.min(Math.max(0,p.cur|0), n.pages.length-1);
  n.versions=Array.isArray(p.versions)? p.versions : [];
  n.nextPage=Math.max(n.nextPage||1, ...n.pages.map(pg=>pg.id+1));
  return n;
}
function loadProject(p, quiet){
  project=normalizeProject(p); pageState.clear();
  doc=project.pages[project.cur].doc; undoStack=[]; redoStack=[]; sel.clear();
  $('#projName').value=project.name;
  if (!quiet){ changed(); fit(); renderPages(); renderVersions(); }
}
function fileBase(){ return (project.name||'Untitled project').replace(/[\\/:*?"<>|]+/g,'').trim().slice(0,80) || 'skeletal'; }
$('#projName').addEventListener('change', e=>{ project.name=e.target.value.trim()||'Untitled project'; e.target.value=project.name; autosave(); });
function switchPage(i){
  if (i===project.cur || !project.pages[i]) return;
  if (editingText) commitText();
  pageState.set(project.pages[project.cur].id,{u:undoStack,r:redoStack,view:{...view}});
  project.cur=i; doc=project.pages[i].doc; sel.clear(); hover=null;
  const st=pageState.get(project.pages[i].id);
  undoStack=st?st.u:[]; redoStack=st?st.r:[];
  changed(); if (st) { view={...st.view}; render(); } else fit();
  renderPages();
}
function addPage(copyOf){
  const id=project.nextPage++; const d = copyOf ? normalizeDoc(JSON.parse(JSON.stringify(copyOf.doc))) : {...newDoc(), style:doc.style, labelSize:doc.labelSize, colorAtoms:doc.colorAtoms, ...(doc.styleOv?{styleOv:{...doc.styleOv}}:{}), ...(doc.page?{page:{...doc.page, x:0, y:0}}:{})};
  project.pages.splice(project.cur+1,0,{id, name: copyOf ? copyOf.name+' copy' : 'Page '+(project.pages.length+1), doc:d});
  switchPage(project.cur+1); autosave();
}
function renderPages(){
  const el=$('#pages');
  el.innerHTML = project.pages.map((p,i)=>`<button class="ptab" data-i="${i}" aria-current="${i===project.cur}" title="${esc(p.name)}"><span>${esc(p.name)}</span>${i===project.cur?'<span class="more" data-menu="1" aria-label="Page options" role="button">⋯</span>':''}</button>`).join('')
    + `<button class="ptab add" id="bAddPage" title="Add page" aria-label="Add page">+</button>`;
  el.querySelectorAll('.ptab[data-i]').forEach(b=>{
    b.onclick=e=>{ const i=+b.dataset.i; if (e.target.closest('[data-menu]')) { pageMenu(i); return; } switchPage(i); };
    b.ondblclick=()=>renamePage(+b.dataset.i);
  });
  $('#bAddPage').onclick=()=>addPage();
}
function renamePage(i){
  const p=project.pages[i];
  openDialog(`<h3>Rename page</h3><input type="text" id="pgName" value="${esc(p.name)}"><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="pgGo">Rename</button></div>`);
  const go=()=>{ const v=$('#pgName').value.trim(); if(!v) return; p.name=v; closeDialog(); renderPages(); autosave(); };
  $('#pgGo').onclick=go; $('#pgName').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
}
function pageMenu(i){
  const p=project.pages[i];
  openDialog(`<h3>${esc(p.name)}</h3><p>Page ${i+1} of ${project.pages.length}</p><div class="row"><button class="tb" id="pmRen">Rename</button><button class="tb" id="pmDup">Duplicate</button><button class="tb" id="pmL" ${i===0?'disabled':''}>Move left</button><button class="tb" id="pmR" ${i===project.pages.length-1?'disabled':''}>Move right</button></div><div class="row" style="margin-top:14px"><button class="tb" id="pmDel" style="color:var(--danger)" ${project.pages.length<2?'disabled':''}>Delete page</button></div><div class="actions"><button class="tb primary" data-close>Done</button></div>`);
  $('#pmRen').onclick=()=>renamePage(i);
  $('#pmDup').onclick=()=>{ closeDialog(); addPage(p); };
  const mv=dlt=>{ const j=i+dlt; [project.pages[i],project.pages[j]]=[project.pages[j],project.pages[i]]; project.cur=j; closeDialog(); renderPages(); autosave(); };
  $('#pmL').onclick=()=>mv(-1); $('#pmR').onclick=()=>mv(1);
  $('#pmDel').onclick=()=>{
    const empty=!p.doc.atoms.length&&!p.doc.arrows.length&&!p.doc.texts.length&&!p.doc.pluses.length;
    const del=()=>{ project.pages.splice(i,1); pageState.delete(p.id); project.cur=Math.max(0,Math.min(i,project.pages.length-1)); doc=project.pages[project.cur].doc; undoStack=[]; redoStack=[]; sel.clear(); closeDialog(); changed(); fit(); renderPages(); toast('Page deleted'); };
    if (empty) del(); else openDialog(`<h3>Delete ${esc(p.name)}?</h3><p>Everything on this page will be removed. Saved versions keep their own copy.</p><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="pmDel2">Delete page</button></div>`), $('#pmDel2').onclick=del;
  };
}
function snapshotPages(){ return JSON.stringify(project.pages.map(p=>({id:p.id,name:p.name,doc:p.doc}))); }
function saveVersion(name){
  const now=new Date();
  project.versions.unshift({id:Math.random().toString(36).slice(2,9), name:name||('Version '+(project.versions.length+1)), time:now.toISOString(), pages:snapshotPages()});
  renderVersions(); autosave();
}
function saveVersionDialog(){
  openDialog(`<h3>Save a version</h3><p>A snapshot of every page, stored inside this project. You can restore it at any time.</p><input type="text" id="vName" placeholder="e.g. Figure 2 before revisions" value=""><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="vGo">Save version</button></div>`);
  const go=()=>{ saveVersion($('#vName').value.trim()); closeDialog(); toast('Version saved'); };
  $('#vGo').onclick=go; $('#vName').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
}
function renderVersions(){
  const ul=$('#vlist');
  if (!project.versions.length){ ul.innerHTML=`<li style="justify-content:center;color:var(--ink-2);font-size:12.5px;background:transparent;border-style:dashed">No versions yet</li>`; return; }
  ul.innerHTML=project.versions.map(v=>{ const d=new Date(v.time); let n=0; try{ n=JSON.parse(v.pages).length; }catch(e){}
    return `<li><div class="vn"><b title="${esc(v.name)}">${esc(v.name)}</b><small>${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}, ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})} · ${n} page${n===1?'':'s'}</small></div><button class="mini" data-vr="${v.id}">Restore</button><button class="mini" data-vd="${v.id}" aria-label="Delete version">✕</button></li>`; }).join('');
  ul.onclick=e=>{
    const r=e.target.closest('[data-vr]'), d=e.target.closest('[data-vd]');
    if (r){ const v=project.versions.find(x=>x.id===r.dataset.vr); if(!v) return;
      openDialog(`<h3>Restore “${esc(v.name)}”?</h3><p>Your current pages are saved as a new version first, so nothing is lost.</p><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="vrGo">Restore</button></div>`);
      $('#vrGo').onclick=()=>{ saveVersion('Before restoring '+v.name); const pages=JSON.parse(v.pages); project.pages=pages.map(p=>({...p, doc:normalizeDoc(p.doc)})); project.cur=0; pageState.clear(); doc=project.pages[0].doc; undoStack=[]; redoStack=[]; sel.clear(); closeDialog(); changed(); fit(); renderPages(); renderVersions(); toast('Version restored'); }; }
    if (d){ const v=project.versions.find(x=>x.id===d.dataset.vd); if(!v) return;
      openDialog(`<h3>Delete “${esc(v.name)}”?</h3><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="vdGo">Delete version</button></div>`);
      $('#vdGo').onclick=()=>{ project.versions=project.versions.filter(x=>x!==v); closeDialog(); renderVersions(); autosave(); }; }
  };
}
/* ================= save as HTML ================= */
function buildProjectHtml(){
  if (!SK_SRC) throw new Error('source unavailable');
  const dp=new DOMParser().parseFromString(SK_SRC,'text/html');
  dp.querySelectorAll('script:not([data-sk])').forEach(s=>s.remove());
  [...dp.head.children].forEach(c=>{ if (!c.hasAttribute('data-sk')) c.remove(); });
  [...dp.body.attributes].forEach(a=>dp.body.removeAttribute(a.name));
  [...dp.body.children].forEach(c=>{ if (!(['app','modal','toast'].includes(c.id) || c.hasAttribute('data-sk'))) c.remove(); });
  const slot=dp.getElementById('sk-project');
  const data={...project, modified:Date.now()};
  slot.textContent=JSON.stringify(data).replace(/</g,'\\u003c');
  const t=dp.querySelector('title'); if (t) t.textContent=project.name+' – Skeletal';
  project.modified=data.modified;
  return '<!doctype html>\n'+dp.documentElement.outerHTML;
}
function saveHtml(){
  if (editingText) commitText();
  let html; try{ html=buildProjectHtml(); }catch(e){ console.warn(e); toast('Could not build the HTML file here; saving JSON instead'); saveDrawing(); return; }
  saveFile(fileBase()+'.html', html);
}
function extractProject(html){
  const m=html.match(/<script[^>]*id="sk-project"[^>]*>([\s\S]*?)<\/script>/i); if(!m || !m[1].trim()) return null;
  try{ return JSON.parse(m[1]); }catch(e){ return null; }
}
function projectIsEmpty(){ return project.pages.every(p=>!p.doc.atoms.length&&!p.doc.arrows.length&&!p.doc.texts.length&&!p.doc.pluses.length) && !project.versions.length; }
function confirmOpenProject(p){
  const go=()=>{ closeDialog(); loadProject(p); toast(`Opened ${project.name}`); };
  if (projectIsEmpty()) { go(); return; }
  openDialog(`<h3>Open “${esc(p.name||'project')}”?</h3><p>This replaces the project you have open now. Save it first if you want to keep a copy.</p><div class="actions"><button class="tb" data-close>Cancel</button><button class="tb" id="opSave">Save current first</button><button class="tb primary" id="opGo">Open</button></div>`);
  $('#opGo').onclick=go; $('#opSave').onclick=async()=>{ await saveHtml(); };
}
/* ================= text formatting ================= */
const TSIZES=[6,7,8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72];
function textTargets(){ const t=[...sel].filter(k=>k[0]==='t').map(k=>ix.text.get(+k.slice(1))).filter(Boolean); if (editingText && !t.includes(editingText.t)) t.push(editingText.t); return t; }
function initTextUI(){
  $('#tSize').innerHTML=`<option value="">Auto</option>`+TSIZES.map(s=>`<option value="${s}">${s} pt</option>`).join('');
  $('#tSwatches').innerHTML=SWATCHES.map(c=>`<button class="sw" style="background:${c}" data-c="${c}" aria-label="Text color ${c}"></button>`).join('');
  const apply=(k,v)=>{
    const ts=textTargets();
    if (ts.length){ if (!editingText || ts.length>1 || !editingText.fresh) pushUndo(); for (const t of ts){ if (v==null || v==='') delete t[k]; else t[k]=v; } if (editingText){ const et=editingText.t, m=textMetrics(doc,{...et,text:ted.value||' '}); ted.style.fontSize=m.fs*view.z+'px'; ted.style.fontFamily=m.family; ted.style.fontWeight=m.fw; ted.style.fontStyle=m.italic?'italic':'normal'; ted.style.color=et.color||'#000'; ted.style.textAlign=et.align||'center'; positionTed(); } changed(); }
    else { if (v==null || v==='') delete tool.textStyle[k]; else tool.textStyle[k]=v; syncTextUI(); }
  };
  const keepFocus=e=>{ if (editingText) e.preventDefault(); };
  for (const id of ['#tBold','#tItal','#tSwatches']) $(id).addEventListener('mousedown',keepFocus);
  document.querySelectorAll('[data-al]').forEach(b=>{ b.addEventListener('mousedown',keepFocus); b.onclick=()=>apply('align',b.dataset.al==='center'?null:b.dataset.al); });
  $('#tFont').onchange=e=>apply('font', e.target.value==='sans'?null:e.target.value);
  $('#tSize').onchange=e=>apply('size', e.target.value? +e.target.value : null);
  $('#tBold').onclick=()=>{ const cur=currentTextStyle(); apply('bold', !cur.bold || null); };
  $('#tItal').onclick=()=>{ const cur=currentTextStyle(); apply('italic', !cur.italic || null); };
  $('#tSwatches').onclick=e=>{ const b=e.target.closest('[data-c]'); if(b) apply('color', b.dataset.c==='#000000'?null:b.dataset.c); };
}
function currentTextStyle(){ const ts=textTargets(); const t=ts[0]||tool.textStyle; const st=S(); return {font:t.font||'sans', size:t.size||'', bold: t.bold!=null ? !!t.bold : st.fontWeight>=600, italic:!!t.italic, align:t.align||'center', color:t.color||null}; }
function syncTextUI(){
  if (!$('#tSize')) return;
  const ts=textTargets(), c=currentTextStyle();
  $('#textScope').textContent = ts.length ? (ts.length===1?'Applies to the selected text':`Applies to ${ts.length} selected text objects`) : 'Settings for new text';
  $('#tFont').value=c.font; $('#tSize').value=c.size?String(c.size):''; $('#tSize').options[0].textContent=`Auto (${S().fontSize} pt)`;
  $('#tBold').setAttribute('aria-pressed',c.bold); $('#tItal').setAttribute('aria-pressed',c.italic);
  document.querySelectorAll('[data-al]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.al===c.align));
  document.querySelectorAll('#tSwatches .sw').forEach(b=>b.style.boxShadow = ((c.color||'#000000')===b.dataset.c) ? '0 0 0 2px var(--accent)' : '');
}
function initLabelSize(){
  $('#labelSize').innerHTML=`<option value="">Style default</option>`+[7,8,9,10,11,12,14,16,18,20,24].map(s=>`<option value="${s}">${s} pt</option>`).join('');
  $('#labelSize').onchange=e=>{ pushUndo(); if (e.target.value) doc.labelSize=+e.target.value; else delete doc.labelSize; changed(); };
}
/* ================= PDF ================= */
function pageExportSVG(d, mode){
  const t=$('#transp').checked;
  if (mode==='doc' && d.page) return [exportSVG(d,{transparent:t, region:pageBounds(d)}).svg];
  if (mode==='tiles' && d.page){ const p=d.page, out=[]; for (let j=0;j<p.down;j++) for (let i=0;i<p.across;i++){ out.push(exportSVG(d,{transparent:t, region:{x0:p.x+i*p.w,y0:p.y+j*p.h,x1:p.x+(i+1)*p.w,y1:p.y+(j+1)*p.h}}).svg); } return out; }
  return [exportSVG(d,{transparent:t}).svg];
}
function hasContent(d){ return d.atoms.length||d.arrows.length||d.texts.length||d.pluses.length; }
function exportPdf(which, mode='crop'){
  let svgs=[];
  if (which==='all'){ for (const p of project.pages) if (hasContent(p.doc)) svgs.push(...pageExportSVG(p.doc, mode)); useStyle(doc); }
  else if (mode!=='crop' && doc.page){ svgs.push(...pageExportSVG(doc, mode)); }
  else { const d=subDoc(sel.size?sel:null); if (hasContent(d)) svgs.push(...pageExportSVG(d,'crop')); }
  if (!svgs.length){ toast('Nothing to export yet'); return; }
  try{ const bytes=PDF.build(svgs); saveFile(fileBase()+(which==='all'?'':' - '+project.pages[project.cur].name)+'.pdf', new Blob([bytes],{type:'application/pdf'})); }
  catch(e){ console.warn(e); toast('Could not create the PDF'); }
}
function exportPdfDialog(){
  const n=project.pages.filter(p=>hasContent(p.doc)).length;
  const p=doc.page;
  if (n<=1 && !p){ exportPdf('current'); return; }
  const tiles = p ? p.across*p.down : 1;
  openDialog(`<h3>Export PDF</h3><p>Vector PDF. Choose what each PDF page should contain.</p>
    <div class="row"><b style="font-size:13px">Layout</b></div>
    <div class="seg" id="pdfMode" style="margin-top:6px"><button data-m="crop" aria-pressed="${!p}">Cropped to drawing</button>${p?`<button data-m="doc" aria-pressed="true">Whole document</button>${tiles>1?`<button data-m="tiles" aria-pressed="false">${tiles} printable sheets</button>`:''}`:''}</div>
    <p class="note" id="pdfModeNote"></p>
    ${n>1?`<label class="chk" style="margin-top:10px"><input type="checkbox" id="pdfAllC"> Include all ${n} pages of the project</label>`:''}
    <div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="pdfGo">Export PDF</button></div>`);
  let mode = p ? 'doc' : 'crop';
  const notes={crop:'Each PDF page is trimmed to the structures, ready to place in a manuscript.', doc: p?`One ${inch(p.w*p.across)} × ${inch(p.h*p.down)} in page, the full document as laid out.`:'', tiles: p?`${tiles} sheets of ${inch(p.w)} × ${inch(p.h)} in to print and tape together, like ChemDraw’s poster pages.`:''};
  const sync=()=>{ dialog.querySelectorAll('#pdfMode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===mode)); $('#pdfModeNote').textContent=notes[mode]; };
  dialog.querySelectorAll('#pdfMode button').forEach(b=>b.onclick=()=>{ mode=b.dataset.m; sync(); }); sync();
  $('#pdfGo').onclick=()=>{ const all=$('#pdfAllC')&&$('#pdfAllC').checked; closeDialog(); exportPdf(all?'all':'current', mode); };
}
/* ================= NMR ================= */
let nmrState=null;
function openNmr(){
  const selIds=selAtoms();
  let comps=components(doc,ix, selIds.length? selIds : null).filter(c=>c.some(id=>{ const a=ix.atom.get(id); return a.el==='C' || kindOf(a.el)==='abbr'; }));
  if (!comps.length){ toast('Draw or select a structure with carbon atoms first'); return; }
  comps.sort((a,b)=>b.length-a.length);
  const comp=comps[0];
  const {mol, owner, generic}=toOCL(doc,ix,comp,{skipH:true});
  let res; try{ res=NMR.predict(mol); }catch(e){ console.warn(e); toast('Could not predict a spectrum for this structure'); return; }
  nmrState={res, comp, owner, mol, tab:'H', generic, multi:comps.length>1, solvent:(nmrState&&nmrState.solvent)||''};
  renderNmr();
}
/* ================= 3D view dialog ================= */
let v3={seed:17, style:'ball', showH:true, labels:false, spin:true};
async function open3d(){
  const selIds=selAtoms();
  const comps=components(doc,ix, selIds.length? selIds : null).sort((a,b)=>b.length-a.length);
  if (!comps.length){ toast('Draw or select a structure first'); return; }
  const {mol,generic}=toOCL(doc,ix,comps[0],{skipH:true});
  if (generic){ toast('Structures with R, X or custom labels have no 3D geometry'); return; }
  openDialog(`<div class="dialog-inner"><h3>3D view</h3><p id="v3msg">Generating a conformer\u2026</p></div>`); dialog.classList.add('wide');
  let model; try{ model=await VIEW3D.conformer(mol, v3.seed); }catch(e){ console.warn(e); const m=$('#v3msg'); if (m) m.textContent='A 3D structure could not be generated for this drawing. '+(e.message||''); return; }
  if (!$('#v3msg')) return; // closed meanwhile
  v3.model=model; v3.rot=v3.rot||VIEW3D.mul(VIEW3D.rotX(-0.35),VIEW3D.rotY(0.5)); v3.zoom=v3.zoom||1;
  const seg=(k,opts)=>`<div class="seg" style="width:auto">${opts.map(([v,n])=>`<button data-${k}="${v}" aria-pressed="${v3[k]===v}">${n}</button>`).join('')}</div>`;
  openDialog(`<div class="dialog-inner"><h3>3D view</h3>
    <div class="row" style="margin-bottom:8px">${seg('style',[['ball','Ball and stick'],['space','Space-filling'],['stick','Sticks']])}
      <label class="chk"><input type="checkbox" id="v3H"${v3.showH?' checked':''}> Hydrogens</label><label class="chk"><input type="checkbox" id="v3L"${v3.labels?' checked':''}> Labels</label><label class="chk"><input type="checkbox" id="v3S"${v3.spin?' checked':''}> Spin</label></div>
    <canvas id="v3cv" style="width:100%;height:min(60vh,460px);background:#fff;border:1px solid var(--line);border-radius:8px;touch-action:none;cursor:grab"></canvas>
    <p class="note">One low-energy conformer: OpenChemLib torsion library, then MMFF94s minimisation, computed offline. Drag to rotate, scroll to zoom. ${comps.length>1?'Showing the largest structure; select another to view it.':''}</p>
    <div class="actions" style="flex-wrap:wrap"><button class="tb" id="v3New">Another conformer</button><button class="tb" id="v3Xyz">XYZ</button><button class="tb" id="v3Pdb">PDB</button><button class="tb" id="v3Sdf">SDF (3D)</button><button class="tb" id="v3Png">PNG</button><button class="tb primary" data-close>Done</button></div></div>`);
  dialog.classList.add('wide');
  const cv3=$('#v3cv'); const fitC=()=>{ const r=cv3.getBoundingClientRect(), d=devicePixelRatio||1; cv3.width=Math.round(r.width*d); cv3.height=Math.round(r.height*d); };
  const paint=()=>VIEW3D.draw(cv3, v3.model, {rot:v3.rot, zoom:v3.zoom, style:v3.style, showH:v3.showH, labels:v3.labels});
  fitC(); paint();
  let drag3=null, last=performance.now();
  const tick=t=>{ if (!document.body.contains(cv3)) return; if (v3.spin && !drag3){ v3.rot=VIEW3D.mul(VIEW3D.rotY((t-last)/1000*0.5), v3.rot); paint(); } last=t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  cv3.onpointerdown=e=>{ drag3={x:e.clientX,y:e.clientY}; cv3.setPointerCapture(e.pointerId); cv3.style.cursor='grabbing'; };
  cv3.onpointermove=e=>{ if (!drag3) return; const dx=e.clientX-drag3.x, dy=e.clientY-drag3.y; drag3={x:e.clientX,y:e.clientY}; v3.rot=VIEW3D.mul(VIEW3D.mul(VIEW3D.rotY(dx*0.01),VIEW3D.rotX(-dy*0.01)), v3.rot); paint(); };
  cv3.onpointerup=cv3.onpointercancel=()=>{ drag3=null; cv3.style.cursor='grab'; };
  cv3.onwheel=e=>{ e.preventDefault(); v3.zoom=Math.min(6,Math.max(0.3,v3.zoom*Math.exp(-e.deltaY*0.002))); paint(); };
  dialog.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{ v3.style=b.dataset.style; dialog.querySelectorAll('[data-style]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); paint(); });
  $('#v3H').onchange=e=>{ v3.showH=e.target.checked; paint(); }; $('#v3L').onchange=e=>{ v3.labels=e.target.checked; paint(); }; $('#v3S').onchange=e=>{ v3.spin=e.target.checked; };
  $('#v3New').onclick=()=>{ v3.seed++; open3d(); };
  const base=fileBase()+' 3D';
  $('#v3Xyz').onclick=()=>saveFile(base+'.xyz', VIEW3D.xyz(v3.model));
  $('#v3Pdb').onclick=()=>saveFile(base+'.pdb', VIEW3D.pdb(v3.model));
  $('#v3Sdf').onclick=()=>saveFile(base+'.sdf', v3.model.mol.toMolfile()+'$$$$\n');
  $('#v3Png').onclick=()=>{ const c=document.createElement('canvas'); c.width=cv3.width*2; c.height=cv3.height*2; VIEW3D.draw(c, v3.model, {rot:v3.rot, zoom:v3.zoom, style:v3.style, showH:v3.showH, labels:v3.labels}, $('#transp').checked? null : '#fff'); c.toBlob(b=>saveFile(base+'.png', b),'image/png'); };
}

/* ================= mass spectrum dialog ================= */
let msState=null;
function openMs(tab){
  const selIds=selAtoms();
  const comps=components(doc,ix, selIds.length? selIds : null).sort((a,b)=>b.length-a.length);
  if (!comps.length){ toast('Draw or select a structure first'); return; }
  const comp=comps[0];
  const {mol, owner, generic}=toOCL(doc,ix,comp,{skipH:true});
  if (generic){ toast('Structures with R, X or custom labels have no defined mass'); return; }
  mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
  msState={comp, mol, owner, multi:comps.length>1, tab:tab||(msState&&msState.tab)||'mz', mode:(msState&&msState.mode)||'pos', energy:(msState&&msState.energy)||'medium', pick:null};
  renderMs();
}
function msStickSVG(peaks, opts={}){ // peaks: [{mz, rel, label?, i?}]
  const W=640, top=26, base=190, padL=36, padR=14;
  if (!peaks.length) return '<p class="note">No peaks.</p>';
  let lo=Math.min(...peaks.map(p=>p.mz)), hi=Math.max(...peaks.map(p=>p.mz)); const span=Math.max(hi-lo, opts.minSpan||10);
  lo=Math.max(0, lo-span*0.08); hi=lo+span*1.16;
  const X=m=>padL+(m-lo)/(hi-lo)*(W-padL-padR), Y=r=>base-r/100*(base-top);
  let g=`<line x1="${padL}" y1="${base}" x2="${W-padR}" y2="${base}" stroke="#18212b"/><line x1="${padL}" y1="${top}" x2="${padL}" y2="${base}" stroke="#18212b"/>`;
  const step=[1,2,5,10,20,50,100,200,500].find(s=>span/s<=10)||1000;
  for (let v=Math.ceil(lo/step)*step; v<=hi; v+=step) g+=`<line x1="${f2(X(v))}" y1="${base}" x2="${f2(X(v))}" y2="${base+4}" stroke="#18212b"/><text x="${f2(X(v))}" y="${base+15}" font-size="10" text-anchor="middle" fill="#18212b">${v}</text>`;
  for (const r of [0,50,100]) g+=`<text x="${padL-4}" y="${f2(Y(r)+3)}" font-size="9" text-anchor="end" fill="#56626f">${r}</text>`;
  g+=`<text x="${(W+padL)/2}" y="${base+30}" font-size="10.5" text-anchor="middle" fill="#56626f">m/z</text>`;
  const lab=[...peaks].sort((a,b)=>b.rel-a.rel).slice(0, opts.labels||8);
  for (const p of peaks){ const x=X(p.mz), on=opts.pick!=null && p.i===opts.pick;
    g+=`<line x1="${f2(x)}" y1="${base}" x2="${f2(x)}" y2="${f2(Y(p.rel))}" stroke="${p.color||(on?'#d6336c':'#2459a8')}" stroke-width="${on?2.4:1.6}"/>`;
    if (p.i!=null) g+=`<rect x="${f2(x-5)}" y="${top-6}" width="10" height="${base-top+6}" fill="transparent" data-peak="${p.i}" style="cursor:pointer"/>`; }
  for (const p of lab) g+=`<text x="${f2(X(p.mz))}" y="${f2(Y(p.rel)-4)}" font-size="9.5" text-anchor="middle" fill="#18212b">${esc(p.label||p.mz.toFixed(opts.dp??4))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${base+36}" font-family="Arial, Helvetica, sans-serif" class="msplot">${g}</svg>`;
}
function msStructSVG(st, peak){
  const d=subDoc(new Set(st.comp.map(id=>'a'+id))), dix=buildIndex(d); const {svg}=renderDoc(d,dix);
  let ov='';
  if (peak && peak.atoms){ const keep=new Set(peak.atoms.map(i=>st.owner[i]).filter(x=>x!=null));
    for (const b of d.bonds) if (keep.has(b.a)&&keep.has(b.b)){ const A=dix.atom.get(b.a),B=dix.atom.get(b.b); ov+=`<line x1="${f2(A.x)}" y1="${f2(A.y)}" x2="${f2(B.x)}" y2="${f2(B.y)}" stroke="#2459a8" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/>`; }
    for (const id of keep){ const a=dix.atom.get(id); if (a) ov+=`<circle cx="${f2(a.x)}" cy="${f2(a.y)}" r="3.4" fill="#2459a8" fill-opacity=".28"/>`; }
    for (const bi of peak.bonds||[]){ const i1=st.owner[st.mol.getBondAtom(0,bi)], i2=st.owner[st.mol.getBondAtom(1,bi)], A=dix.atom.get(i1), B=dix.atom.get(i2); if (!A||!B) continue;
      const m=mul(add(A,B),0.5), u=norm(sub(B,A)), n=perp(u); ov+=`<line x1="${f2(m.x+n.x*6)}" y1="${f2(m.y+n.y*6)}" x2="${f2(m.x-n.x*6)}" y2="${f2(m.y-n.y*6)}" stroke="#d6336c" stroke-width="1.4" stroke-dasharray="2 1.4"/>`; } }
  const b=measureBBox(svg+ov), pad=8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(b.x-pad)} ${f2(b.y-pad)} ${f2(b.width+2*pad)} ${f2(b.height+2*pad)}" style="max-height:260px">${ov}${svg}</svg>`;
}
function renderMs(){
  const st=msState, ad=MS.adducts(st.mol);
  const fmtF=f=>{ const m=/^(.*?)(?: (\d+))?([+-])?$/.exec(f); return esc(m[1]).replace(/([A-Za-z\)])(\d+)/g,'$1<sub>$2</sub>')+(m[3]?`<sup>${m[2]||''}${m[3]==='-'?'\u2212':'+'}</sup>`:''); };
  const tabs=`<div class="tabs" style="margin:0 0 10px"><button data-mt="mz" aria-pressed="${st.tab==='mz'}">m/z and adducts</button><button data-mt="iso" aria-pressed="${st.tab==='iso'}">Isotope pattern</button><button data-mt="msms" aria-pressed="${st.tab==='msms'}">MS/MS (predicted)</button></div>`;
  let body='', actions='';
  if (!Number.isFinite(ad.M)){ body='<p>This structure contains an element without isotope data, so exact masses can\u2019t be computed.</p>'; }
  else if (st.tab==='mz'){
    body=`<p style="margin:0 0 8px">Formula <b>${fmtF(MS.hill(ad.counts))}</b> \u00b7 monoisotopic mass <b>${ad.M.toFixed(4)}</b> \u00b7 MW <b>${analysisFor(st.comp).mw.toFixed(2)}</b> g/mol</p>
      <table class="peaks"><thead><tr><th>Ion</th><th>Formula</th><th>m/z</th><th></th></tr></thead><tbody>${ad.rows.map((r,i)=>`<tr><td>${esc(r.label)}</td><td>${fmtF(r.formula)}</td><td class="code">${r.mz.toFixed(4)}</td><td><button class="mini" data-cp="${r.mz.toFixed(4)}">Copy</button> <button class="mini" data-hrms="${i}">HRMS line</button></td></tr>`).join('')}</tbody></table>
      <p class="note">Monoisotopic masses with the electron mass taken into account. "HRMS line" copies a journal-style sentence such as \u201cHRMS (ESI) m/z: [M + H]+ calcd for C9H9O4+ 181.0495; found \u2014.\u201d</p>`;
  } else if (st.tab==='iso'){
    const z = ad.charge || (st.mode==='neg'?-1:1), base = ad.charge? ad.counts : {...ad.counts, H:(ad.counts.H||0)+z};
    const peaks=MS.isotopes(base, z), nom=MS.nominal(peaks);
    body=`<p style="margin:0 0 8px">${ad.charge? 'Ion as drawn' : (z>0?'[M+H]⁺':'[M−H]⁻')} ${fmtF(MS.hill(base))} \u00b7 <label>Mode <select class="sel" id="msMode"><option value="pos"${st.mode==='pos'?' selected':''}>Positive</option><option value="neg"${st.mode==='neg'?' selected':''}>Negative</option></select></label></p>
      <div class="nmrbox">${msStickSVG(peaks.map(p=>({mz:p.mz, rel:p.rel})), {minSpan:6, labels:6})}</div>
      <table class="peaks"><thead><tr><th>Peak</th><th>m/z</th><th>Relative</th></tr></thead><tbody>${nom.map(p=>`<tr><td>${p.label}</td><td class="code">${p.mz.toFixed(4)}</td><td>${p.rel.toFixed(1)}%</td></tr>`).join('')}</tbody></table>
      <p class="note">Natural isotope abundances (IUPAC). Fine structure closer than 0.005 Da is merged; the table sums each nominal mass.</p>`;
    actions=`<button class="tb" id="msCopyIso">Copy pattern</button>`;
  } else {
    const r=MS.msms(st.mol,{mode:st.mode, energy:st.energy});
    if (!r.precursor){ body=`<p>${esc(r.note||'No fragments for this structure.')}</p>`; }
    else {
      const peaks=r.peaks.map((p,i)=>({...p,i}));
      const plot=[...peaks, {mz:r.precursor.mz, rel:r.precursor.rel, label:r.precursor.mz.toFixed(4), color:'#56626f'}];
      const pk = st.pick!=null ? peaks[st.pick] : null;
      body=`<div class="row" style="margin-bottom:8px"><label>Mode <select class="sel" id="msMode"><option value="pos"${st.mode==='pos'?' selected':''}>ESI positive, [M+H]⁺</option><option value="neg"${st.mode==='neg'?' selected':''}>ESI negative, [M−H]⁻</option></select></label>
        <label>Collision energy <select class="sel" id="msEn">${['low','medium','high'].map(e=>`<option value="${e}"${st.energy===e?' selected':''}>${e[0].toUpperCase()+e.slice(1)}</option>`).join('')}</select></label>
        <span style="font-size:13px">Precursor ${esc(r.precursor.label)} <b class="code">${r.precursor.mz.toFixed(4)}</b></span></div>
        <div class="nmrgrid"><div class="nmrbox">${msStructSVG(st, pk)}<p class="note" style="margin:4px 6px">${pk? `m/z ${pk.mz.toFixed(4)}: ${esc(pk.how)}. Blue: atoms kept in the ion; red: bonds broken.` : 'Click a peak or a row to see which part of the molecule it comes from.'}</p></div>
        <div class="nmrbox" id="msPlot">${msStickSVG(plot,{pick:st.pick, labels:9})}</div></div>
        <table class="peaks"><thead><tr><th>m/z</th><th>Rel.</th><th>Ion formula</th><th>Origin</th></tr></thead><tbody>${peaks.map(p=>`<tr data-peak="${p.i}" style="cursor:pointer${st.pick===p.i?';background:var(--accent-soft)':''}"><td class="code">${p.mz.toFixed(4)}</td><td>${p.rel.toFixed(0)}</td><td>${fmtF(p.formula)}</td><td>${esc(p.how)}</td></tr>`).join('') || '<tr><td colspan="4">No fragments predicted</td></tr>'}</tbody></table>
        <p class="note">Rule-based estimate of collision-induced fragments: one-bond cleavages, ring openings and common neutral losses, scored by bond lability and ion stability. It is a guide to likely fragments, not a measured or library spectrum; relative intensities in particular are rough.</p>`;
      actions=`<button class="tb" id="msCopyMsms">Copy peak list</button>`;
      st._r=r;
    }
  }
  const notes = st.multi ? '<p class="note">Showing the largest structure. Select a structure to analyze another one.</p>' : '';
  openDialog(`<div class="dialog-inner"><h3>Mass spectrum</h3>${tabs}${body}${notes}<div class="actions" style="flex-wrap:wrap"><button class="tb" id="msNmr">Predict NMR</button>${actions}<button class="tb primary" data-close>Done</button></div></div>`);
  dialog.classList.add('wide');
  dialog.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.mt; st.pick=null; renderMs(); });
  const mm=$('#msMode'); if (mm) mm.onchange=e=>{ st.mode=e.target.value; st.pick=null; renderMs(); };
  const me=$('#msEn'); if (me) me.onchange=e=>{ st.energy=e.target.value; st.pick=null; renderMs(); };
  dialog.querySelectorAll('[data-peak]').forEach(el=>el.onclick=()=>{ const i=+el.dataset.peak; st.pick = st.pick===i? null : i; renderMs(); });
  dialog.querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>copyText(b.dataset.cp,'Copied'));
  dialog.querySelectorAll('[data-hrms]').forEach(b=>b.onclick=()=>copyText(MS.hrmsLine(ad.rows[+b.dataset.hrms]),'HRMS line copied'));
  $('#msNmr').onclick=()=>{ closeDialog(); sel=new Set(st.comp.map(id=>'a'+id)); openNmr(); };
  const ci=$('#msCopyIso'); if (ci) ci.onclick=()=>{ const z=ad.charge||(st.mode==='neg'?-1:1); const b={...ad.counts}; if (!ad.charge) b.H=(b.H||0)+z; copyText(MS.nominal(MS.isotopes(b,z)).map(p=>`${p.label}\t${p.mz.toFixed(4)}\t${p.rel.toFixed(1)}`).join('\n'),'Isotope pattern copied'); };
  const cm=$('#msCopyMsms'); if (cm) cm.onclick=()=>copyText(['m/z\trel\tformula\torigin', ...st._r.peaks.map(p=>`${p.mz.toFixed(4)}\t${p.rel.toFixed(0)}\t${p.formula}\t${p.how}`)].join('\n'),'MS/MS peak list copied');
}
function nmrAnnotSVG(st){
  const d=subDoc(new Set(st.comp.map(id=>'a'+id)));
  const dix=buildIndex(d); const {svg,labels}=renderDoc(d,dix);
  const byAtom=new Map();
  const list = st.tab==='H' ? st.res.H1 : st.res.C13;
  for (const g of list) for (const i of g.atoms){ const id=st.owner[i]; if (id==null) continue; const a=dix.atom.get(id); if(!a) continue;
    const v = st.tab==='H' ? g.shift.toFixed(2) : g.shift.toFixed(1); const arr=byAtom.get(id)||[]; if(!arr.includes(v)) arr.push(v); byAtom.set(id,arr); }
  let ann='';
  for (const [id,vals] of byAtom){ const a=dix.atom.get(id), info=labels.get(id); const dir=freeDirs(info,1)[0]||V(0,-1);
    const r = info.visible ? Math.max(8, (info.box.x1-info.box.x0)/2+3) : 7.5; const p=add(a,mul(dir,r));
    const anchor = dir.x>0.3?'start':dir.x<-0.3?'end':'middle';
    ann+=`<text x="${f2(p.x)}" y="${f2(p.y+2.2)}" font-size="5.6" fill="#2459a8" text-anchor="${anchor}" font-family="${esc(FONT)}">${esc(vals.join(' / '))}</text>`; }
  const b=measureBBox(svg+ann); const pad=6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(b.x-pad)} ${f2(b.y-pad)} ${f2(b.width+2*pad)} ${f2(b.height+2*pad)}" style="max-height:300px">${svg}${ann}</svg>`;
}
function nmrSpectrumSVG(st){
  const W=640, Hh=230, padL=14, padR=14, top=34, base=188;
  const isH=st.tab==='H';
  const list=isH?st.res.H1:st.res.C13;
  const maxS=list.length?Math.max(...list.map(g=>g.shift)):0;
  const hi = isH ? (maxS>10.5? 13 : 10.5) : (maxS>205? 230 : 210), lo = isH ? -0.3 : -5;
  const X=ppm=>padL+(hi-ppm)/(hi-lo)*(W-padL-padR);
  let g='';
  // axis
  g+=`<line x1="${padL}" y1="${base}" x2="${W-padR}" y2="${base}" stroke="#18212b" stroke-width="1"/>`;
  const step = isH?1:20;
  for (let v=Math.ceil(lo/step)*step; v<=hi; v+=step){ const x=X(v); g+=`<line x1="${f2(x)}" y1="${base}" x2="${f2(x)}" y2="${base+4}" stroke="#18212b" stroke-width="1"/><text x="${f2(x)}" y="${base+15}" font-size="10" text-anchor="middle" fill="#18212b">${v}</text>`; }
  g+=`<text x="${W/2}" y="${base+30}" font-size="10.5" text-anchor="middle" fill="#56626f">δ (ppm)</text>`;
  if (isH){
    const N=1600, gam=0.012, ys=new Float64Array(N); const pts=[];
    for (const grp of list){ const ls=NMR.lines(grp); for (const l of ls){ for (let k=0;k<N;k++){ const ppm=hi-(hi-lo)*k/(N-1); const dd=(ppm-l.ppm)/gam; ys[k]+=l.i*(grp.exch?0.35:1)/(1+dd*dd)*(grp.exch?0.5:1); } } }
    let mx=0; for (const v of ys) mx=Math.max(mx,v);
    for (let k=0;k<N;k++){ const x=padL+k/(N-1)*(W-padL-padR); const y=base-(mx?ys[k]/mx:0)*(base-top); pts.push(f2(x)+','+f2(y)); }
    g+=`<polyline points="${pts.join(' ')}" fill="none" stroke="#2459a8" stroke-width="1.1" stroke-linejoin="round"/>`;
  } else {
    const mc=Math.max(1,...list.map(x=>x.atoms.length));
    for (const grp of list){ const x=X(grp.shift), h=(base-top)*(0.45+0.55*grp.atoms.length/mc); g+=`<line x1="${f2(x)}" y1="${base}" x2="${f2(x)}" y2="${f2(base-h)}" stroke="#2459a8" stroke-width="1.4"/>`; }
  }
  // solvent markers
  if (st.solvent && SOLV_RES[st.solvent]){
    const r=SOLV_RES[st.solvent]; const marks = isH ? r.h.map(x=>({v:parseFloat(x[0]),t:SOLV_LABEL[st.solvent]})).concat(isNaN(parseFloat(r.w))?[]:[{v:parseFloat(r.w),t:'H₂O'}]) : r.c.map(x=>({v:parseFloat(x[0]),t:SOLV_LABEL[st.solvent]}));
    for (const mk of marks){ if (mk.v<lo||mk.v>hi) continue; const x=X(mk.v); g+=`<line x1="${f2(x)}" y1="${top+4}" x2="${f2(x)}" y2="${base}" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 2"/><text x="${f2(x+2)}" y="${base-4}" font-size="8" fill="#c0392b">${esc(mk.t)} ${mk.v}</text>`; }
  }
  // labels (spread to avoid overlap)
  const labs=list.map(gr=>({x:X(gr.shift), t: isH? gr.shift.toFixed(2) : gr.shift.toFixed(1), sub: isH? gr.n+'H' : ''})).sort((a,b)=>a.x-b.x);
  let last=-99; for (const l of labs){ l.lx=Math.max(l.x, last+11); last=l.lx; }
  for (const l of labs){ g+=`<path d="M${f2(l.x)} ${top-2} L${f2(l.lx)} ${top-8}" stroke="#9aa6b2" stroke-width="0.6" fill="none"/><text transform="translate(${f2(l.lx+3)},${top-10}) rotate(-90)" font-size="9" fill="#18212b">${l.t}</text>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" font-family="${esc(FONT)}"><rect x="0" y="0" width="${W}" height="${Hh}" fill="#fff"/>${g}</svg>`;
}
function renderNmr(){
  const st=nmrState, isH=st.tab==='H', list=isH?st.res.H1:st.res.C13;
  const typeC=g=>['C','CH','CH₂','CH₃','CH₄'][g.H]||'C';
  const rows = isH
    ? list.map(g=>`<tr><td>${g.shift.toFixed(2)}</td><td>${esc(g.mult)}</td><td>${g.J.length? g.J.map(j=>j.toFixed(1)).join(', ') : '–'}</td><td>${g.n}H</td><td>${esc(g.exch? g.kind+' (exchangeable)' : g.kind)}</td></tr>`).join('')
    : list.map(g=>`<tr><td>${g.shift.toFixed(1)}</td><td>${typeC(g)}</td><td>${g.atoms.length>1? g.atoms.length+' equivalent C':'1 C'}</td></tr>`).join('');
  const head = isH ? '<tr><th>δ (ppm)</th><th>Mult.</th><th>J (Hz)</th><th>Int.</th><th>Group</th></tr>' : '<tr><th>δ (ppm)</th><th>Type</th><th>Count</th></tr>';
  const notes=[];
  if (st.multi) notes.push('Showing the largest structure. Select a structure to predict another one.');
  if (st.generic) notes.push('Generic labels (R, X, custom text) are left out.');
  notes.push(`Estimated with additive increment rules, not a spectral database. Expect roughly ±0.3 ppm for ¹H and ±5 ppm for ¹³C on common organic compounds; strained, charged or highly conjugated systems can be worse. Exchangeable OH and NH shifts depend on solvent and concentration.`);
  openDialog(`<div class="dialog-inner"><h3>Predicted NMR</h3>
    <div class="row" style="justify-content:space-between;margin-bottom:8px"><div class="tabs" style="margin:0"><button data-tab="H" aria-pressed="${isH}">¹H (400 MHz)</button><button data-tab="C" aria-pressed="${!isH}">¹³C (101 MHz)</button></div>
      <div class="row"><label for="nmSolv" style="font-size:13px">Show solvent</label><select class="sel" id="nmSolv"><option value="">None</option>${SOLV_ORDER.map(s=>`<option value="${s}"${st.solvent===s?' selected':''}>${SOLV_LABEL[s]}</option>`).join('')}</select><button class="mini" id="nmSolvTbl">Solvent table</button></div></div>
    <div class="nmrgrid"><div class="nmrbox">${nmrAnnotSVG(st)}</div><div class="nmrbox">${nmrSpectrumSVG(st)}</div></div>
    <table class="peaks"><thead>${head}</thead><tbody>${rows || '<tr><td colspan="5">No signals</td></tr>'}</tbody></table>
    <p class="note">${notes.map(esc).join(' ')}</p>
    <div class="actions" style="flex-wrap:wrap"><button class="tb" id="nmCopy">Copy peak list</button><button class="tb" id="nmAdd">Add peak list to drawing</button><button class="tb" id="nmDl">Download spectrum</button><button class="tb primary" data-close>Done</button></div></div>`);
  dialog.classList.add('wide');
  dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.tab; renderNmr(); });
  $('#nmSolv').onchange=e=>{ st.solvent=e.target.value; renderNmr(); };
  $('#nmSolvTbl').onclick=()=>{ if (st.solvent) solvUI.solvent=st.solvent; openSolvents(); };
  $('#nmCopy').onclick=()=>copyText(NMR.journalText(st.res),'Peak list copied');
  $('#nmAdd').onclick=()=>{
    let x0=1e9,x1=-1e9,y1=-1e9; for(const id of st.comp){ const a=ix.atom.get(id); x0=Math.min(x0,a.x); x1=Math.max(x1,a.x); y1=Math.max(y1,a.y); }
    const txt=NMR.journalText(st.res).replace(/\u00B9H/,'1H').replace(/\u00B9\u00B3C/,'13C').replace(/\.\n/,'.\n');
    const wrapped=txt.split('\n').map(line=>{ const words=line.split(' '); const out=[]; let cur=''; for (const w of words){ if ((cur+' '+w).length>70){ out.push(cur); cur=w; } else cur=cur?cur+' '+w:w; } if(cur) out.push(cur); return out.join('\n'); }).join('\n');
    pushUndo(); doc.texts.push({id:nid(), x:(x0+x1)/2, y:y1+L*3.2, text:wrapped.replace(/1H NMR/,'^1H NMR').replace(/13C NMR/,'^13C NMR'), size:7, align:'left'}); closeDialog(); changed(); toast('Peak list added below the structure');
  };
  $('#nmDl').onclick=async()=>{
    const svg=nmrSpectrumSVG(st); const w=640*3, h=230*3;
    try{ const blob=await svgToPngBlob(svg.replace('<svg ',`<svg width="${w}" height="${h}" `), w, h, false); saveFile(fileBase()+(isH?' 1H':' 13C')+' predicted NMR.png', blob); }catch(e){ toast('Could not render the spectrum'); }
  };
}

/* ================= document / page setup ================= */
const PAGE_PRESETS = {
  letter:{w:612,h:792,n:'US Letter (8.5 × 11 in)'}, legal:{w:612,h:1008,n:'US Legal (8.5 × 14 in)'}, tabloid:{w:792,h:1224,n:'Tabloid (11 × 17 in)'},
  a4:{w:595.28,h:841.89,n:'A4 (210 × 297 mm)'}, a3:{w:841.89,h:1190.55,n:'A3 (297 × 420 mm)'},
  acs1:{w:240,h:648,n:'ACS single column (3.33 in wide)'}, acs2:{w:504,h:648,n:'ACS double column (7 in wide)'},
  slide169:{w:960,h:540,n:'Slide 16:9 (13.33 × 7.5 in)'}, slide43:{w:720,h:540,n:'Slide 4:3 (10 × 7.5 in)'},
};
const inch=v=>Math.round(v/72*100)/100;
function pageBounds(d){ const p=d.page; if(!p) return null; return {x0:p.x, y0:p.y, x1:p.x+p.w*p.across, y1:p.y+p.h*p.down}; }
function renderPageBackdrop(){
  const p=doc.page; if (!p) return '';
  const W=p.w*p.across, H=p.h*p.down, z=view.z;
  let s=`<rect x="-100000" y="-100000" width="200000" height="200000" fill="#dde2e7"/>`;
  s+=`<rect x="${f2(p.x+2/z)}" y="${f2(p.y+3/z)}" width="${f2(W)}" height="${f2(H)}" fill="#000" fill-opacity=".10"/>`;
  s+=`<rect x="${f2(p.x)}" y="${f2(p.y)}" width="${f2(W)}" height="${f2(H)}" fill="#fff" stroke="#b7c0c9" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  const m=36; // half-inch printable margin guide
  for (let i=0;i<p.across;i++) for (let j=0;j<p.down;j++){
    const x=p.x+i*p.w, y=p.y+j*p.h;
    if (p.w>2*m+20 && p.h>2*m+20) s+=`<rect x="${f2(x+m)}" y="${f2(y+m)}" width="${f2(p.w-2*m)}" height="${f2(p.h-2*m)}" fill="none" stroke="#e3e8ec" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`;
  }
  for (let i=1;i<p.across;i++){ const x=p.x+i*p.w; s+=`<line x1="${f2(x)}" y1="${f2(p.y)}" x2="${f2(x)}" y2="${f2(p.y+H)}" stroke="#9aa6b2" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`; }
  for (let j=1;j<p.down;j++){ const y=p.y+j*p.h; s+=`<line x1="${f2(p.x)}" y1="${f2(y)}" x2="${f2(p.x+W)}" y2="${f2(y)}" stroke="#9aa6b2" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`; }
  return s;
}
function openPageSetup(){
  const p=doc.page;
  const cur = p ? {preset:p.preset||'custom', w:p.w, h:p.h, across:p.across, down:p.down} : {preset:'none', w:612, h:792, across:1, down:1};
  const land = cur.w>cur.h;
  const opts=`<option value="none">No page (free canvas)</option>`+Object.entries(PAGE_PRESETS).map(([k,v])=>`<option value="${k}">${esc(v.n)}</option>`).join('')+`<option value="custom">Custom size</option>`;
  const nums=n=>Array.from({length:8},(_,i)=>`<option value="${i+1}"${i+1===n?' selected':''}>${i+1}</option>`).join('');
  openDialog(`<h3>Document size</h3><p>Like ChemDraw’s document setup: pick a sheet size, then span the drawing across several sheets for posters or large schemes.</p>
    <div class="row"><select class="sel" id="psSize" style="flex:1">${opts}</select></div>
    <div class="row" id="psCustom" style="display:none"><label>Width <input type="text" id="psW" style="width:70px" value="${inch(cur.w)}"> in</label><label>Height <input type="text" id="psH" style="width:70px" value="${inch(cur.h)}"> in</label></div>
    <div class="row"><div class="seg" id="psOr" style="max-width:260px"><button data-o="p" aria-pressed="${!land}">Portrait</button><button data-o="l" aria-pressed="${land}">Landscape</button></div></div>
    <p class="note" style="margin-top:14px;margin-bottom:6px">Pages (sheets across × down)</p>
    <div class="row"><select class="sel" id="psA">${nums(cur.across)}</select> × <select class="sel" id="psD">${nums(cur.down)}</select>
      <span style="width:8px"></span>${[1,2,3,4].map(n=>`<button class="mini" data-grid="${n}">${n} × ${n}</button>`).join('')}</div>
    <p class="note" id="psSum"></p>
    <label class="chk" style="margin-top:10px"><input type="checkbox" id="psAll"> Apply to every page in this project</label>
    <div class="actions"><button class="tb" data-close>Cancel</button><button class="tb primary" id="psGo">Apply</button></div>`);
  $('#psSize').value=cur.preset;
  let landscape=land;
  const dims=()=>{ const k=$('#psSize').value; if (k==='none') return null; let w,h;
    if (k==='custom'){ w=parseFloat($('#psW').value)*72; h=parseFloat($('#psH').value)*72; if(!(w>36&&h>36)) return null; }
    else { w=PAGE_PRESETS[k].w; h=PAGE_PRESETS[k].h; }
    if (k!=='custom' && landscape!==(w>h)) [w,h]=[h,w];
    return {preset:k,w,h,across:+$('#psA').value,down:+$('#psD').value}; };
  const upd=()=>{ const k=$('#psSize').value; $('#psCustom').style.display=k==='custom'?'flex':'none';
    const dis=k==='none'; ['#psA','#psD'].forEach(s=>$(s).disabled=dis); $('#psOr').style.opacity=dis?.4:1;
    const d=dims(); $('#psSum').textContent = !d ? (dis? 'The canvas has no edges. Exports crop to your drawing.' : 'Enter a width and height in inches.') :
      `Document: ${inch(d.w*d.across)} × ${inch(d.h*d.down)} in` + (d.across*d.down>1? `, printed on ${d.across*d.down} sheets of ${inch(d.w)} × ${inch(d.h)} in` : ''); };
  $('#psSize').onchange=()=>{ const k=$('#psSize').value; if (PAGE_PRESETS[k]) landscape=PAGE_PRESETS[k].w>PAGE_PRESETS[k].h; dialog.querySelectorAll('#psOr button').forEach(b=>b.setAttribute('aria-pressed', (b.dataset.o==='l')===landscape)); upd(); };
  dialog.querySelectorAll('#psOr button').forEach(b=>b.onclick=()=>{ landscape=b.dataset.o==='l'; dialog.querySelectorAll('#psOr button').forEach(x=>x.setAttribute('aria-pressed',x===b)); if ($('#psSize').value==='custom'){ const w=$('#psW').value,h=$('#psH').value; if ((parseFloat(w)>parseFloat(h))!==landscape){ $('#psW').value=h; $('#psH').value=w; } } upd(); });
  dialog.querySelectorAll('[data-grid]').forEach(b=>b.onclick=()=>{ $('#psA').value=b.dataset.grid; $('#psD').value=b.dataset.grid; upd(); });
  ['#psA','#psD','#psW','#psH'].forEach(s=>$(s).addEventListener('input',upd));
  upd();
  $('#psGo').onclick=()=>{
    const k=$('#psSize').value, d=dims(); if (k!=='none' && !d) return;
    const all=$('#psAll').checked; closeDialog();
    const applyTo=(dd)=>{
      if (!d){ delete dd.page; return; }
      let x,y;
      if (dd.page){ x=dd.page.x; y=dd.page.y; }
      else { const bb=contentBBox(dd); const W=d.w*d.across, H=d.h*d.down;
        if (bb){ x=(bb.x0+bb.x1)/2-W/2; y=(bb.y0+bb.y1)/2-H/2; } else { x=0; y=0; } }
      dd.page={...d, x, y};
    };
    if (all){ for (const pg of project.pages){ if (pg.doc!==doc) applyTo(pg.doc); } }
    pushUndo(); applyTo(doc); changed(); fit(); autosave();
    toast(d? `Document set to ${inch(d.w*d.across)} × ${inch(d.h*d.down)} in` : 'Page removed; the canvas is unbounded');
  };
}
/* ================= solvent reference tables ================= */
let solvUI={tab:'res', solvent:'CDCl3', q:''};
function openSolvents(){ renderSolvents(); }
function renderSolvents(){
  const u=solvUI;
  const chips=SOLV_ORDER.map(s=>`<button class="mini" data-sv="${s}" style="${u.solvent===s?'background:var(--accent);color:var(--accent-ink);border-color:transparent':''}">${SOLV_LABEL[s]}</button>`).join('')+`<button class="mini" data-sv="all" style="${u.solvent==='all'?'background:var(--accent);color:var(--accent-ink);border-color:transparent':''}">All solvents</button>`;
  let body='';
  if (u.tab==='res'){
    body=`<div style="overflow-x:auto"><table class="peaks"><thead><tr><th>Solvent</th><th>¹H residual (mult.)</th><th>H₂O / HDO</th><th>¹³C (mult.)</th></tr></thead><tbody>`+
      SOLV_ORDER.map(s=>{ const r=SOLV_RES[s]; return `<tr><td><b>${SOLV_LABEL[s]}</b></td><td>${r.h.map(x=>`${x[0]} (${x[1]})`).join(', ')}</td><td>${r.w}</td><td>${r.c.length? r.c.map(x=>`${x[0]} (${x[1]})`).join(', ') : '–'}</td></tr>`; }).join('')+`</tbody></table></div>`;
  } else {
    const isH=u.tab==='h1', data=isH?SOLV_H1:SOLV_C13, tol=isH?0.05:0.6;
    const qn=parseFloat(u.q); const numeric = u.q.trim()!=='' && !isNaN(qn) && /^[\s\d.\-]+$/.test(u.q);
    const fmt=v=> v==null ? '–' : typeof v==='number' ? v.toFixed(2) : v;
    const near=v=> typeof v==='number' && Math.abs(v-qn)<=tol;
    const cols = u.solvent==='all' ? SOLV_ORDER : [u.solvent];
    const ci = cols.map(c=>SOLV_COLS.indexOf(c));
    let rows=data.map(r=>({r, vals:ci.map(i=>r[3][i])}));
    if (u.q.trim()){
      if (numeric) rows=rows.filter(x=>x.vals.some(near)).sort((a,b)=>Math.min(...a.vals.filter(v=>typeof v==='number').map(v=>Math.abs(v-qn)))-Math.min(...b.vals.filter(v=>typeof v==='number').map(v=>Math.abs(v-qn))));
      else { const q=u.q.toLowerCase(); rows=rows.filter(x=>x.r[0].toLowerCase().includes(q)); }
    } else if (u.solvent!=='all') rows.sort((a,b)=>(typeof b.vals[0]==='number'?b.vals[0]:parseFloat(b.vals[0])||-99)-(typeof a.vals[0]==='number'?a.vals[0]:parseFloat(a.vals[0])||-99));
    let resLine='';
    if (numeric){ const hits=[]; for (const s of cols){ const r=SOLV_RES[s]; const list=isH? r.h.map(x=>x[0]).concat([r.w.split(' ')[0]]) : r.c.map(x=>x[0]); for (const v of list){ const f=parseFloat(v); if (!isNaN(f)&&Math.abs(f-qn)<=tol) hits.push(`${SOLV_LABEL[s]} ${isH && v===r.w.split(' ')[0] ? 'water' : 'solvent'} at ${v}`); } }
      if (hits.length) resLine=`<p class="note" style="margin:0 0 8px">Also matches: ${hits.map(esc).join('; ')}.</p>`; }
    body=`${resLine}<div style="overflow-x:auto;max-height:52vh;overflow-y:auto"><table class="peaks"><thead><tr><th>Compound</th><th>Group</th>${isH?'<th>Mult.</th>':''}${cols.map(c=>`<th>${SOLV_LABEL[c]}</th>`).join('')}</tr></thead><tbody>`+
      (rows.length? rows.map(x=>`<tr><td>${esc(x.r[0])}</td><td>${esc(x.r[1])}</td>${isH?`<td>${esc(x.r[2])}</td>`:''}${x.vals.map(v=>`<td${numeric&&near(v)?' style="background:var(--accent-soft);font-weight:700"':''}>${fmt(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length+3}">No matches${numeric?` within ±${tol} ppm`:''}.</td></tr>`)+`</tbody></table></div>`;
  }
  const searchRow = u.tab==='res' ? '' : `<div class="row" style="margin-bottom:8px">${chips}</div><div class="row" style="margin-bottom:10px"><input type="text" id="svQ" placeholder="Compound name, or a peak position such as 2.17" value="${esc(u.q)}" style="flex:1;height:32px;border:1px solid var(--line);border-radius:6px;background:var(--btn);padding:0 8px"></div>`;
  openDialog(`<h3>NMR solvent and impurity peaks</h3>
    <div class="tabs"><button data-st="res" aria-pressed="${u.tab==='res'}">Deuterated solvents</button><button data-st="h1" aria-pressed="${u.tab==='h1'}">¹H impurities</button><button data-st="c13" aria-pressed="${u.tab==='c13'}">¹³C impurities</button></div>
    ${searchRow}${body}
    <p class="note">${esc(SOLV_CITE)}${u.tab!=='res'?' Type a shift to find impurities within ±'+(u.tab==='h1'?'0.05':'0.6')+' ppm.':''}</p>
    <div class="actions"><button class="tb primary" data-close>Done</button></div>`);
  dialog.classList.add('wide');
  dialog.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{ u.tab=b.dataset.st; renderSolvents(); });
  dialog.querySelectorAll('[data-sv]').forEach(b=>b.onclick=()=>{ u.solvent=b.dataset.sv; renderSolvents(); });
  const q=$('#svQ'); if (q){ q.addEventListener('input',()=>{ u.q=q.value; const pos=q.selectionStart; renderSolvents(); const n=$('#svQ'); n.focus(); n.setSelectionRange(pos,pos); }); }
}

/* ================= pKa / BDE info cards ================= */
let infoUnits='kcal';
function siteContext(atomId){
  const a=ix.atom.get(atomId); if (!a) return null;
  let target=atomId;
  if (a.el==='H' && !a.charge && ix.adj.get(atomId).length===1) target=ix.adj.get(atomId)[0].o;
  const comp=components(doc,ix).find(c=>c.includes(target));
  const {mol,map,owner}=toOCL(doc,ix,comp,{skipH:true});
  return {mol,map,owner,target};
}
function closeInfo(){ const c=$('#infocard'); if (c) c.remove(); infoSite=null; render(); }
let infoSite=null;
function showInfo(html, screen, site){
  closeInfo(); infoSite=site;
  const c=document.createElement('div'); c.id='infocard'; c.className='infocard'; c.innerHTML=`<button class="ic-x" aria-label="Close">×</button>${html}`;
  stage.appendChild(c);
  const sw=stage.clientWidth, sh=stage.clientHeight, w=c.offsetWidth, h=c.offsetHeight;
  let x=screen.x+18, y=screen.y-h/2; if (x+w>sw-8) x=screen.x-w-18; x=Math.max(8,x); y=Math.max(8,Math.min(sh-h-60,y));
  c.style.left=x+'px'; c.style.top=y+'px';
  c.querySelector('.ic-x').onclick=closeInfo;
  render();
}
function fmtP(v){ return v==null ? '–' : (v<0?'\u2212':'')+Math.abs(v).toFixed(1); }
function pkaAt(atomId, screen){
  const ctx=siteContext(atomId); if (!ctx) return;
  const a=ix.atom.get(ctx.target);
  let res;
  try{
    if (kindOf(a.el)==='abbr'){ // check every hetero site inside the nickname
      let best=null; for (let i=0;i<ctx.owner.length;i++){ if (ctx.owner[i]!==ctx.target) continue; const r=NMR.acidity(ctx.mol,i); if (r.acid && r.acid.w!=null && (!best || r.acid.w<best.acid.w)) best=r; if(!best && r.base) best=r; }
      res=best||{acid:null,base:null};
    } else res=NMR.acidity(ctx.mol, ctx.map.get(ctx.target));
  }catch(e){ console.warn(e); toast('Could not evaluate this site'); return; }
  const A=res.acid, B=res.base;
  if (!A && !B){ toast('No acidic hydrogen or basic lone pair at this atom'); return; }
  let h=`<div class="ic-k">pKa estimate</div>`;
  const label=[];
  if (A){
    h+=`<div class="ic-site">${esc(A.cls)}</div>`;
    if (A.weak && A.w!=null && A.w>40) h+=`<p class="ic-n">Very weak acid; values above 35 are extrapolated.</p>`;
    h+=`<div class="ic-vals">${A.w!=null?`<div><b>${fmtP(A.w)}</b><span>water</span></div>`:''}${A.d!=null?`<div><b>${fmtP(A.d)}</b><span>DMSO</span></div>`:''}${A.thf!=null?`<div><b>${fmtP(A.thf)}</b><span>THF</span></div>`:''}${A.w==null&&A.d==null&&A.thf==null?'<div><span>No reliable value</span></div>':''}</div>`;
    const cTxt=(r)=> !r.corr ? '' : /Hammett/.test(r.ref||'') ? `; Σσ = ${(+r.corr).toFixed(2)}` : `; inductive shift ${r.corr>0?'\u2212':'+'}${Math.abs(r.corr).toFixed(1)} units`;
    if (A.ref) h+=`<p class="ic-n">Basis: ${esc(A.ref)}${cTxt(A)}${A.est?'. Additive estimate for multiply activated C–H.':''}</p>`;
    const v = A.w!=null ? `pKa ≈ ${fmtP(A.w)}` : A.d!=null ? `pKa ≈ ${fmtP(A.d)} (DMSO)` : A.thf!=null ? `pKa ≈ ${fmtP(A.thf)} (THF)` : null; if (v) label.push(v);
  }
  if (B){
    h+=`<div class="ic-site" style="margin-top:${A?10:0}px">${A?'As a base: ':''}${esc(B.cls)}</div><div class="ic-vals"><div><b>${fmtP(B.w)}</b><span>pKaH, water</span></div></div>`;
    if (B.ref) h+=`<p class="ic-n">Basis: ${esc(B.ref)}${!B.corr?'':/Hammett/.test(B.ref)?`; Σσ = ${(+B.corr).toFixed(2)}`:`; inductive shift ${B.corr>0?'\u2212':'+'}${Math.abs(B.corr).toFixed(1)} units`}</p>`;
    if (!A) label.push(`pKaH ≈ ${fmtP(B.w)}`);
  }
  h+=`<p class="ic-foot">Rule-based estimate from tabulated pKa values (Evans–Ripin; Bordwell/Reich DMSO; Williams water) with Hammett σ and inductive corrections. Usually within ±1 unit for simple sites; check multifunctional molecules against measured data.</p>`;
  h+=`<div class="ic-act"><button class="mini" id="icAdd">Add to drawing</button><button class="mini" id="icCopy">Copy</button></div>`;
  showInfo(h, screen, {atom:ctx.target});
  const txt=label.join(', ');
  $('#icCopy').onclick=()=>copyText(`${A?A.cls:B.cls}: ${txt}`,'Copied');
  $('#icAdd').onclick=()=>{ if(!txt) return; const info=layoutLabel(doc,ix,a); const dir=freeDirs(info,1)[0]||V(0,-1); const p=add(a,mul(dir,L*1.1));
    pushUndo(); doc.texts.push({id:nid(),x:p.x,y:p.y,text:txt.replace(/pKaH/,'pK_aH').replace(/pKa/,'pKa'),size:7,color:'#2459a8'}); closeInfo(); changed(); };
}
function bdeAt(kind, id, screen){
  let r, site, where;
  try{
    if (kind==='atom'){
      const ctx=siteContext(id); if(!ctx) return; const a=ix.atom.get(ctx.target);
      const idx=ctx.map.get(ctx.target); r=NMR.bdeAtom(ctx.mol, idx);
      if (!r){ toast('This atom has no hydrogen. Click a bond to get its BDE.'); return; }
      site={atom:ctx.target}; where={a};
    } else {
      const b=ix.bond.get(id); const A=ix.atom.get(b.a), B=ix.atom.get(b.b);
      const hA=A.el==='H'&&!A.charge, hB=B.el==='H'&&!B.charge;
      if (hA||hB){ return bdeAt('atom', hA? b.b : b.a, screen); }
      const ctx=siteContext(b.a); const ia=ctx.map.get(b.a), ib=ctx.map.get(b.b);
      if (ia==null||ib==null){ toast('Could not evaluate this bond'); return; }
      r=NMR.bdeBond(ctx.mol, ia, ib); site={bond:id}; where={mid:mul(add(A,B),0.5), n:perp(norm(sub(B,A)))};
      if (!r){ toast('No reference value for this bond'); return; }
    }
  }catch(e){ console.warn(e); toast('Could not evaluate this site'); return; }
  const kJ=v=>Math.round(v*4.184);
  const main = r.v==null ? '–' : infoUnits==='kcal' ? `${(+r.v).toFixed(1)}` : `${kJ(r.v)}`;
  let h=`<div class="ic-k">${r.avg?'Bond enthalpy (average)':'Bond dissociation energy'}</div><div class="ic-site">${esc(r.cls)}</div>`;
  h+=`<div class="ic-vals"><div><b>${main}</b><span>${infoUnits==='kcal'?'kcal/mol':'kJ/mol'}</span></div>${r.v!=null?`<div><b style="font-size:15px;color:var(--ink-2)">${infoUnits==='kcal'?kJ(r.v):(+r.v).toFixed(1)}</b><span>${infoUnits==='kcal'?'kJ/mol':'kcal/mol'}</span></div>`:''}</div>`;
  if (r.ref) h+=`<p class="ic-n">Basis: ${esc(r.ref)}${r.corr?`; Σσ⁺ ${(+r.corr).toFixed(2)}`:''}${r.est?' (estimate)':''}</p>`;
  if (r.note) h+=`<p class="ic-n">${esc(r.note)}</p>`;
  h+=`<p class="ic-foot">Gas-phase homolytic BDE at 298 K (bond → two radicals). Reference values from Blanksby & Ellison, Acc. Chem. Res. 2003, 36, 255, with additive radical-stabilization terms for substituted C–H bonds; expect about ±2–3 kcal/mol.</p>`;
  h+=`<div class="ic-act"><div class="seg" style="width:auto"><button data-u="kcal" aria-pressed="${infoUnits==='kcal'}">kcal</button><button data-u="kJ" aria-pressed="${infoUnits==='kJ'}">kJ</button></div><button class="mini" id="icAdd">Add to drawing</button><button class="mini" id="icCopy">Copy</button></div>`;
  showInfo(h, screen, site);
  document.querySelectorAll('#infocard [data-u]').forEach(b=>b.onclick=()=>{ infoUnits=b.dataset.u; bdeAt(kind,id,screen); });
  if (r.v==null){ $('#icAdd').disabled=true; }
  const txt = r.v==null? '' : infoUnits==='kcal' ? `BDE ≈ ${(+r.v).toFixed(1)} kcal/mol` : `BDE ≈ ${kJ(r.v)} kJ/mol`;
  $('#icCopy').onclick=()=>copyText(`${r.cls}: ${txt}`,'Copied');
  $('#icAdd').onclick=()=>{ if(!txt) return; let p;
    if (where.a){ const info=layoutLabel(doc,ix,where.a); const dir=freeDirs(info,1)[0]||V(0,-1); p=add(where.a,mul(dir,L*1.3)); }
    else p=add(where.mid, mul(where.n, L*0.75));
    pushUndo(); doc.texts.push({id:nid(),x:p.x,y:p.y,text:txt,size:7,color:'#b3261e'}); closeInfo(); changed(); };
}

function init(){
  renderTools(); renderSwatches(); renderTemplates(); initTextUI(); initLabelSize();
  let loaded=null, note=null;
  try{
    const el=document.getElementById('sk-project'); const raw=el && el.textContent.trim();
    if (raw){ loaded=JSON.parse(raw);
      try{ const local=localStorage.getItem('skeletal.p.'+loaded.uid); if (local){ const l=JSON.parse(local); if ((l.modified||0)>(loaded.modified||0)){ loaded=l; note='Restored your unsaved changes'; } } }catch(e){}
    }
  }catch(e){ loaded=null; }
  if (!loaded){
    try{ const last=localStorage.getItem('skeletal.last'); const s=last && localStorage.getItem('skeletal.p.'+last); if (s) loaded=JSON.parse(s);
      else { const old=localStorage.getItem('skeletal.doc'); if (old){ loaded=newProject(); loaded.pages[0].doc=JSON.parse(old); } } }catch(e){}
  }
  if (loaded) loadProject(loaded,true);
  ix=buildIndex(doc); setTool('bond',{bond:{order:1,stereo:'none'}});
  requestAnimationFrame(()=>{ fit(); scheduleAnalysis(); updateUndoButtons(); syncStyleUI(); renderPages(); renderVersions(); if(note) toast(note); });
}
init();
