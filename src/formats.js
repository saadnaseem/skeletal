/* ================= chemical file formats =================
   Writers and readers for ChemDraw (CDXML, CDX), CML, MRV, JME, chemfig, SDF and RXN.
   Each writer takes a drawing (doc) and returns a string or Uint8Array; each reader returns a doc fragment. */
const FORMATS = (()=>{
  const ZOF = el => ELEMENTS.indexOf(el)+1;
  const num = v => { const r=Math.round(v*100)/100; return (Object.is(r,-0)?0:r).toString(); };

  /* ---------- tiny XML (works in Node and the browser) ---------- */
  const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e)=> e[0]==='#' ? String.fromCodePoint(e[1]==='x'||e[1]==='X'? parseInt(e.slice(2),16) : +e.slice(1)) : (ENT[e]!=null?ENT[e]:m));
  function xmlParse(s){
    const root={name:'#root',attrs:{},children:[],text:''}, st=[root]; let i=0;
    while (i<s.length){
      const lt=s.indexOf('<',i);
      if (lt<0){ st[st.length-1].text+=unent(s.slice(i)); break; }
      if (lt>i) st[st.length-1].text+=unent(s.slice(i,lt));
      if (s.startsWith('<!--',lt)){ i=s.indexOf('-->',lt)+3; if (i<3) break; continue; }
      if (s.startsWith('<![CDATA[',lt)){ const e=s.indexOf(']]>',lt); st[st.length-1].text+=s.slice(lt+9,e); i=e+3; continue; }
      if (s[lt+1]==='?'||s[lt+1]==='!'){ i=s.indexOf('>',lt)+1; if (!i) break; continue; }
      const gt=s.indexOf('>',lt); if (gt<0) break;
      let tag=s.slice(lt+1,gt); i=gt+1;
      if (tag[0]==='/'){ if (st.length>1) st.pop(); continue; }
      const self=tag.endsWith('/'); if (self) tag=tag.slice(0,-1);
      const m=/^([^\s/]+)/.exec(tag); if (!m) continue;
      const node={name:m[1].replace(/^\w+:/,''), attrs:{}, children:[], text:''};
      for (const a of tag.slice(m[1].length).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[a[1]]=unent(a[3]!=null?a[3]:a[4]);
      st[st.length-1].children.push(node);
      if (!self) st.push(node);
    }
    return root;
  }
  function xmlWrite(n, ind=''){
    const at=Object.entries(n.attrs||{}).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>` ${k}="${esc(v)}"`).join('');
    if (n.text!=null && !(n.children||[]).length) return `${ind}<${n.name}${at}>${esc(n.text)}</${n.name}>`;
    if (!(n.children||[]).length) return `${ind}<${n.name}${at}/>`;
    const inline = n.children.every(c=>c.text!=null && !(c.children||[]).length) && n.name==='t';
    return inline ? `${ind}<${n.name}${at}>${n.children.map(c=>xmlWrite(c,'')).join('')}</${n.name}>`
      : `${ind}<${n.name}${at}>\n${n.children.map(c=>xmlWrite(c,ind+' ')).join('\n')}\n${ind}</${n.name}>`;
  }
  const E=(name,attrs,children,text)=>({name,attrs:attrs||{},children:children||[],text});
  const kids=(n,name)=>n.children.filter(c=>c.name===name);
  const walk=(n,fn)=>{ fn(n); for (const c of n.children) walk(c,fn); };

  /* ---------- nicknames as real atoms (oriented away from the bond) ---------- */
  function abbrLayout(el){
    const m=OCL.Molecule.fromSmiles(ABBR[el].s); m.inventCoordinates(); scaleLayout(m);
    const pts=[]; for (let i=0;i<m.getAllAtoms();i++) pts.push(V(m.getAtomX(i)*L,m.getAtomY(i)*L));
    const bonds=[]; for (let b=0;b<m.getAllBonds();b++) bonds.push({a:m.getBondAtom(0,b), b:m.getBondAtom(1,b), order:Math.min(3,m.getBondOrder(b)||1)});
    const atoms=pts.map((p,i)=>({p, el:m.getAtomLabel(i), charge:m.getAtomCharge(i)||0}));
    return {atoms,bonds};
  }
  // place a nickname's atoms with atom 0 at `at`, pointing away from `from`
  function placeAbbr(el, at, from){
    const f=abbrLayout(el), p0=f.atoms[0].p;
    let c=V(0,0); f.atoms.forEach(a=>c=add(c,a.p)); c=mul(c,1/f.atoms.length);
    const want = from ? norm(sub(at,from)) : V(1,0), have = f.atoms.length>1 ? norm(sub(c,p0)) : V(1,0);
    const t=angOf(want)-angOf(have);
    f.atoms.forEach(a=>{ a.p=add(at, rotAround(sub(a.p,p0),V(0,0),t)); });
    return f;
  }
  // a copy of the drawing with nicknames expanded; generic labels are kept as-is
  function expandDoc(d){
    const ix=buildIndex(d), out={...d, atoms:[], bonds:[]}; let nid=1; const map=new Map();
    for (const a of d.atoms){ if (kindOf(a.el)!=='abbr'){ const n={...a,id:nid++}; out.atoms.push(n); map.set(a.id,n.id); } }
    for (const a of d.atoms){ if (kindOf(a.el)!=='abbr') continue;
      const nb=(ix.adj.get(a.id)||[])[0], from=nb? ix.atom.get(nb.o) : null;
      const f=placeAbbr(a.el, a, from), ids=f.atoms.map(q=>{ const n={id:nid++,x:q.p.x,y:q.p.y,el:q.el,charge:q.charge,lp:0,rad:0}; out.atoms.push(n); return n.id; });
      f.bonds.forEach(b=>out.bonds.push({id:nid++,a:ids[b.a],b:ids[b.b],order:b.order,stereo:'none'}));
      map.set(a.id, ids[0]); }
    for (const b of d.bonds) if (map.has(b.a)&&map.has(b.b)) out.bonds.push({...b,id:nid++,a:map.get(b.a),b:map.get(b.b)});
    return out;
  }
  const oclOf = (d, ids) => { const ix=buildIndex(d); const r=toOCL(d,ix,ids); r.mol.ensureHelperArrays(OCL.Molecule.cHelperParities); return r.mol; };

  /* ---------- reaction roles from the first straight arrow ---------- */
  function reactionRoles(d){
    const ix=buildIndex(d), ar=d.arrows.find(r=>!CURVED.has(r.type)&&r.type!=='resonance'&&r.type!=='retro'); if (!ar) return null;
    const P1=V(ar.x1,ar.y1), u=norm(sub(V(ar.x2,ar.y2),P1)), len0=dist(P1,V(ar.x2,ar.y2));
    const re=[], pr=[];
    for (const comp of components(d,ix)){ let c=V(0,0); comp.forEach(id=>c=add(c,ix.atom.get(id))); c=mul(c,1/comp.length);
      const t=dot(sub(c,P1),u); if (t<0) re.push(comp); else if (t>len0) pr.push(comp); }
    if (!re.length || !pr.length) return null;
    const above=[], below=[];
    for (const t of d.texts){ const q=dot(sub(t,P1),u), s=cross(u,sub(t,P1)); if (q>-L && q<len0+L && Math.abs(s)<L*3) (s<0?above:below).push(t); }
    return {arrow:ar, reactants:re, products:pr, above, below};
  }

  /* ---------- ChemDraw object tree ---------- */
  const FONT_IDS={sans:3, serif:4, mono:5};
  function cdxTree(d0){
    const d=d0, ix=buildIndex(d), st=S(d); let nid=1; const id=()=>String(nid++);
    const colors=[]; const colorIdx=c=>{ if (!c || /^#0{3}(0{3})?$/i.test(c)) return undefined; let i=colors.indexOf(c.toLowerCase()); if (i<0){ colors.push(c.toLowerCase()); i=colors.length-1; } return String(i+4); };
    const fs=st.fontSize, page=E('page',{id:id()}), objs=[];
    const fragOf=new Map();
    for (const comp of components(d,ix)){
      const fr=E('fragment',{id:id()}), nodeId=new Map();
      for (const aid of comp){ const a=ix.atom.get(aid), k=kindOf(a.el), lb=layoutLabel(d,ix,a), n=E('n',{id:id(), p:`${num(a.x)} ${num(a.y)}`});
        nodeId.set(aid,n.attrs.id); fr.children.push(n);
        const right = lb.visible && lb.items.length && lb.items[0].x+0.01 < a.x - tw(a.el[0],fs,st.fontWeight)/2 - 0.5; // label reads leftward
        const label=txt=>{ const just=right?'Right':'Left'; const ch=a.el[0], w=tw(right? txt[txt.length-1]:ch,fs,st.fontWeight);
          n.children.push(E('t',{p:`${num(right? a.x+w/2 : a.x-w/2)} ${num(a.y+fs*0.36)}`, LabelJustification:just, Justification:right?'Right':undefined, LabelAlignment:right?'Right':undefined},
            [E('s',{font:'3',size:num(fs),face:'96',color:colorIdx(a.color)},[],txt)])); };
        if (k==='element'){
          if (a.el!=='C') n.attrs.Element=String(ZOF(a.el));
          if (a.charge) n.attrs.Charge=String(a.charge);
          if (a.rad) n.attrs.Radical='Doublet';
          if (a.color) n.attrs.color=colorIdx(a.color);
          if (lb.visible){ const h=implicitH(a,bondSum(ix,aid)); n.attrs.NumHydrogens=String(h);
            label(a.el+(h?'H'+(h>1?h:''):'')+(a.charge? (Math.abs(a.charge)>1?Math.abs(a.charge):'')+(a.charge>0?'+':'-') : '')); }
        } else if (k==='abbr'){
          n.attrs.NodeType='Nickname';
          const nb=(ix.adj.get(aid)||[])[0], from=nb? ix.atom.get(nb.o):null, f=placeAbbr(a.el,a,from);
          const inner=E('fragment',{id:id()}), iid=f.atoms.map(q=>{ const m=E('n',{id:id(), p:`${num(q.p.x)} ${num(q.p.y)}`}); if (q.el!=='C') m.attrs.Element=String(ZOF(q.el)); if (q.charge) m.attrs.Charge=String(q.charge); inner.children.push(m); return m.attrs.id; });
          if (from){ const ecp=E('n',{id:id(), p:`${num(from.x)} ${num(from.y)}`, NodeType:'ExternalConnectionPoint', ExternalConnectionNum:'1'}); inner.children.push(ecp); inner.children.push(E('b',{id:id(), B:ecp.attrs.id, E:iid[0]})); }
          f.bonds.forEach(b=>inner.children.push(E('b',{id:id(), B:iid[b.a], E:iid[b.b], Order:b.order>1?String(b.order):undefined})));
          n.children.push(inner); label(a.el);
        } else { n.attrs.NodeType='GenericNickname'; n.attrs.GenericNickname=a.el; label(a.el); }
      }
      for (const b of d.bonds){ if (!nodeId.has(b.a)||!nodeId.has(b.b)) continue;
        const at={id:id(), B:nodeId.get(b.a), E:nodeId.get(b.b)};
        if (b.order>1) at.Order=String(b.order);
        if (b.order===1 && b.stereo!=='none') at.Display={wedge:'WedgeBegin',hash:'WedgedHashBegin',wavy:'Wavy',bold:'Bold'}[b.stereo];
        if (b.order===2 && b.dbPos && b.dbPos!=='auto') at.DoublePosition={center:'Center',left:'Left',right:'Right'}[b.dbPos];
        if (b.color) at.color=colorIdx(b.color);
        fr.children.push(E('b',at)); }
      for (const aid of comp) fragOf.set(aid, fr.attrs.id); objs.push(fr);
    }
    const textIds=new Map();
    for (const t of d.texts){ const m=textMetrics(d,t), fid=String(FONT_IDS[t.font]||3), base=(t.bold?1:0)+(t.italic?2:0), al=t.align||'center';
      const x= al==='left'? t.x-m.w/2 : al==='right'? t.x+m.w/2 : t.x, y=t.y-m.h/2+m.fs*0.92;
      const runs=[]; m.lines.forEach((ln,i)=>{ for (const r of textRuns(ln)) runs.push(E('s',{font:fid,size:num(m.fs),face:String(base+(r.m==='sub'?32:r.m==='sup'?64:0)),color:colorIdx(t.color)},[],r.t)); if (i<m.lines.length-1) runs.push(E('s',{font:fid,size:num(m.fs),face:String(base)},[],'\n')); });
      const el=E('t',{id:id(), p:`${num(x)} ${num(y)}`, BoundingBox:`${num(t.x-m.w/2)} ${num(t.y-m.h/2)} ${num(t.x+m.w/2)} ${num(t.y+m.h/2)}`, Justification:{left:'Left',right:'Right',center:'Center'}[al], InterpretChemically:'no'}, runs);
      textIds.set(t, el.attrs.id); objs.push(el); }
    for (const q of d.pluses) objs.push(E('graphic',{id:id(), BoundingBox:`${num(q.x)} ${num(q.y+3.75)} ${num(q.x)} ${num(q.y-3.75)}`, GraphicType:'Symbol', SymbolType:'Plus', color:colorIdx(q.color)}));
    const arrowIds=new Map();
    for (const r of d.arrows){ const pts=arrowSamples(r); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for (const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
      const at={id:id(), BoundingBox:`${num(x0)} ${num(y0)} ${num(x1)} ${num(y1)}`, FillType:'None', ArrowheadHead:'Full', ArrowheadType:'Solid', HeadSize:'1000', ArrowheadCenterSize:'875', ArrowheadWidth:'250',
        Head3D:`${num(r.x2)} ${num(r.y2)} 0`, Tail3D:`${num(r.x1)} ${num(r.y1)} 0`, color:colorIdx(r.color)};
      if (r.type==='equilibrium'){ at.ArrowheadHead='HalfLeft'; at.ArrowheadTail='HalfLeft'; at.ArrowShaftSpacing='300'; }
      else if (r.type==='retro'){ at.ArrowheadType='Angle'; at.ArrowShaftSpacing='600'; at.HeadSize='600'; at.ArrowheadCenterSize='600'; at.ArrowheadWidth='150'; }
      else if (r.type==='resonance') at.ArrowheadTail='Full';
      else if (r.type==='dashed') at.LineType='Dashed';
      else if (r.type==='nogo') at.NoGo='Cross';
      if (CURVED.has(r.type)){ // circle through tail, curve midpoint and head
        const P1=V(r.x1,r.y1), P2=V(r.x2,r.y2), M=quadPt(P1,arrowControl(r),P2,0.5);
        const ax=P1.x,ay=P1.y,bx=M.x,by=M.y,cx=P2.x,cy=P2.y, dd=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
        if (Math.abs(dd)>1e-6){ const a2=ax*ax+ay*ay,b2=bx*bx+by*by,c2=cx*cx+cy*cy;
          const C=V((a2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/dd,(a2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/dd), R=dist(C,P1);
          let sw=angOf(sub(P2,C))-angOf(sub(P1,C)); const sm=angOf(sub(M,C))-angOf(sub(P1,C));
          const nrm=x=>{ while(x>Math.PI) x-=2*Math.PI; while(x<-Math.PI) x+=2*Math.PI; return x; };
          sw=nrm(sw); const smn=nrm(sm); if (Math.sign(smn)!==Math.sign(sw) || Math.abs(smn)>Math.abs(sw)) sw = sw>0? sw-2*Math.PI : sw+2*Math.PI;
          Object.assign(at,{Center3D:`${num(C.x)} ${num(C.y)} 0`, MajorAxisEnd3D:`${num(C.x+R)} ${num(C.y)} 0`, MinorAxisEnd3D:`${num(C.x)} ${num(C.y+R)} 0`, AngularSize:num(sw*180/Math.PI)}); }
        if (r.type==='fishhook') at.ArrowheadHead='HalfLeft';
      }
      const el=E('arrow',at); arrowIds.set(r, el.attrs.id); objs.push(el); }
    page.children.push(...objs);
    const rr=reactionRoles(d);
    if (rr){ const ids=c=>c.map(x=>fragOf.get(x[0])).join(' ');
      page.children.push(E('scheme',{id:id()},[E('step',{id:id(), ReactionStepReactants:ids(rr.reactants), ReactionStepProducts:ids(rr.products), ReactionStepArrows:arrowIds.get(rr.arrow),
        ReactionStepObjectsAboveArrow:rr.above.map(t=>textIds.get(t)).join(' ')||undefined, ReactionStepObjectsBelowArrow:rr.below.map(t=>textIds.get(t)).join(' ')||undefined})])); }
    const hex=c=>[1,3,5].map(i=>num(parseInt(c.length===4? c[(i+1)/2].repeat(2) : c.slice(i,i+2),16)/255));
    const colortable=E('colortable',{},[E('color',{r:'1',g:'1',b:'1'}),E('color',{r:'0',g:'0',b:'0'}),...colors.map(c=>{ const [r,g,b]=hex(c); return E('color',{r,g,b}); })]);
    const fonttable=E('fonttable',{},[E('font',{id:'3',charset:'iso-8859-1',name:'Arial'}),E('font',{id:'4',charset:'iso-8859-1',name:'Times New Roman'}),E('font',{id:'5',charset:'iso-8859-1',name:'Courier New'})]);
    // colortable index 2 is its first entry; we list white, black, then custom colors (from index 4)
    const root=E('CDXML',{CreationProgram:'Skeletal', Name:'skeletal', BondLength:num(L), LineWidth:num(st.lineWidth), BoldWidth:num(st.boldWidth), BondSpacing:num(st.spacing*100), HashSpacing:num(st.hashSpacing), MarginWidth:num(st.margin),
      LabelFont:'3', LabelSize:num(fs), LabelFace:'96', CaptionFont:'3', CaptionSize:num(st.fontSize), CaptionFace:'0', color:'3', bgcolor:'2'},[colortable,fonttable,page]);
    return root;
  }
  const CDXML_HEAD='<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n';

  /* ---------- CDX binary (tags and types from the ChemDraw CDX spec, as tabulated in Indigo's CDXCommons.h) ---------- */
  const OBJ={CDXML:0x8000,page:0x8001,group:0x8002,fragment:0x8003,n:0x8004,b:0x8005,t:0x8006,graphic:0x8007,scheme:0x800d,step:0x800e,arrow:0x8027};
  const OBJN=Object.fromEntries(Object.entries(OBJ).map(([k,v])=>[v,k]));
  const P={CreationProgram:[0x3,'str'],Name:[0x8,'str'],p:[0x200,'pt2'],BoundingBox:[0x204,'rect'],Head3D:[0x207,'pt3'],Tail3D:[0x208,'pt3'],Center3D:[0x20d,'pt3'],MajorAxisEnd3D:[0x20e,'pt3'],MinorAxisEnd3D:[0x20f,'pt3'],
    color:[0x301,'u16'],bgcolor:[0x302,'u16'],NodeType:[0x400,'i16'],Element:[0x402,'i16'],Charge:[0x421,'i8'],Radical:[0x422,'u8'],NumHydrogens:[0x42b,'u16'],GenericNickname:[0x433,'str'],
    Order:[0x600,'i16'],Display:[0x601,'i16'],DoublePosition:[0x603,'i16'],B:[0x604,'u32'],E:[0x605,'u32'],Justification:[0x701,'i8'],LabelAlignment:[0x705,'i8'],InterpretChemically:[0x708,'bool'],
    BondSpacing:[0x804,'i16'],BondLength:[0x805,'coord'],BoldWidth:[0x806,'coord'],LineWidth:[0x807,'coord'],MarginWidth:[0x808,'coord'],HashSpacing:[0x809,'coord'],LabelJustification:[0x823,'i8'],
    GraphicType:[0xa00,'i16'],LineType:[0xa01,'i16'],ArrowType:[0xa02,'i16'],SymbolType:[0xa07,'i16'],HeadSize:[0xa20,'i16'],AngularSize:[0xa21,'i16'],ArrowheadType:[0xa2f,'i16'],ArrowheadCenterSize:[0xa30,'u16'],
    ArrowheadWidth:[0xa31,'u16'],ArrowShaftSpacing:[0xa33,'u16'],ArrowheadHead:[0xa35,'i16'],ArrowheadTail:[0xa36,'i16'],FillType:[0xa37,'i16'],NoGo:[0xa3b,'i8'],
    ReactionStepReactants:[0xc01,'ids'],ReactionStepProducts:[0xc02,'ids'],ReactionStepArrows:[0xc04,'ids'],ReactionStepObjectsAboveArrow:[0xc05,'ids'],ReactionStepObjectsBelowArrow:[0xc06,'ids'],SupersededBy:[0x12,'u32']};
  const PN=Object.fromEntries(Object.entries(P).map(([k,v])=>[v[0],k]));
  const ENUM={
    NodeType:['Unspecified','Element','ElementList','ElementListNickname','Nickname','Fragment','Formula','GenericNickname','AnonymousAlternativeGroup','NamedAlternativeGroup','MultiAttachment','VariableAttachment','ExternalConnectionPoint','LinkNode'],
    Display:['Solid','Dash','Hash','WedgedHashBegin','WedgedHashEnd','Bold','WedgeBegin','WedgeEnd','Wavy','HollowWedgeBegin','HollowWedgeEnd','WavyWedgeBegin','WavyWedgeEnd','Dot','DashDot'],
    GraphicType:['Undefined','Line','Arc','Rectangle','Oval','Orbital','Bracket','Symbol'],
    SymbolType:['LonePair','Electron','RadicalCation','RadicalAnion','CirclePlus','CircleMinus','Dagger','DoubleDagger','Plus','Minus','Racemic','Absolute','Relative'],
    Radical:['None','Singlet','Doublet','Triplet'], LabelAlignment:['Auto','Left','Center','Right','Above','Below','Best'],
  };
  const EMAP={ Order:{'1':1,'2':2,'3':4,'1.5':0x80}, DoublePosition:{Center:0x100,Right:0x101,Left:0x102}, LineType:{Solid:0,Dashed:1,Bold:2,Wavy:4},
    ArrowheadHead:{Full:2,HalfLeft:3,HalfRight:4}, ArrowheadType:{Solid:1,Hollow:2,Angle:3}, FillType:{None:1,Solid:2,Shaded:4}, NoGo:{None:1,Cross:2,Hash:3},
    Justification:{Right:-1,Left:0,Center:1,Full:2,Above:3,Below:4,Auto:5,Best:6}, ArrowType:{NoHead:0,HalfHead:1,FullHead:2,Resonance:4,Equilibrium:8,Hollow:16,RetroSynthetic:32} };
  EMAP.ArrowheadTail=EMAP.ArrowheadHead; EMAP.LabelJustification=EMAP.Justification;
  for (const [k,arr] of Object.entries(ENUM)) EMAP[k]=Object.fromEntries(arr.map((s,i)=>[s,i]));
  const EREV=Object.fromEntries(Object.entries(EMAP).map(([k,m])=>[k,Object.fromEntries(Object.entries(m).map(([s,v])=>[v,s]))]));
  const CHARSET={'iso-8859-1':1252,'x-mac-roman':10000,'Unknown':0};
  const WIN1252={0x20AC:0x80,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x2030:0x89,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2212:0x96,0x2014:0x97};
  const W1252R=Object.fromEntries(Object.entries(WIN1252).map(([k,v])=>[v,+k]));
  const enc1252=s=>[...s].map(ch=>{ const c=ch.codePointAt(0); return c<0x80||(c>=0xA0&&c<=0xFF)? c : (WIN1252[c]||0x3F); });
  const dec1252=bytes=>bytes.map(b=>String.fromCodePoint(W1252R[b]||b)).join('');

  function cdxEncode(root){
    const out=[]; const u8=v=>out.push(v&255), u16=v=>{ u8(v); u8(v>>8); }, i32=v=>{ u16(v&0xFFFF); u16((v>>>16)&0xFFFF); };
    const fx=v=>Math.round(parseFloat(v)*65536);
    const prop=(tag,bytes)=>{ u16(tag); u16(bytes.length); out.push(...bytes); };
    const B={ u16:v=>[v&255,(v>>8)&255], i32:v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255] };
    function value(name, v){
      const [tag,type]=P[name]; let iv;
      if (EMAP[name]){ iv=EMAP[name][v]; if (iv==null) iv=parseInt(v,10); if (!Number.isFinite(iv)) return; } else iv=parseInt(v,10);
      if (name==='BondSpacing') iv=Math.round(parseFloat(v)*10);
      if (name==='AngularSize') iv=Math.round(parseFloat(v)*10);
      switch(type){
        case 'str': { const b=enc1252(v); prop(tag,[0,0,...b]); break; }
        case 'i8': case 'u8': prop(tag,[iv&255]); break;
        case 'i16': case 'u16': prop(tag,B.u16(iv)); break;
        case 'u32': prop(tag,B.i32(iv)); break;
        case 'coord': prop(tag,B.i32(fx(v))); break;
        case 'bool': if (v==='yes') prop(tag,[]); break;
        case 'ids': { const a=String(v).trim().split(/\s+/).filter(Boolean); prop(tag,a.flatMap(x=>B.i32(+x))); break; }
        case 'pt2': case 'rect': { const a=String(v).trim().split(/\s+/); const s=[]; for (let i=0;i<a.length;i+=2){ s.push(a[i+1],a[i]); } prop(tag,s.flatMap(x=>B.i32(fx(x)))); break; }
        case 'pt3': { const a=String(v).trim().split(/\s+/); prop(tag,a.flatMap(x=>B.i32(fx(x)))); break; }
      }
    }
    function obj(n){
      if (n.name==='fonttable'){ const fonts=kids(n,'font'); const b=[0,0,...B.u16(fonts.length)]; for (const f of fonts){ const nm=enc1252(f.attrs.name); b.push(...B.u16(+f.attrs.id),...B.u16(CHARSET[f.attrs.charset]??0),...B.u16(nm.length),...nm); } prop(0x100,b); return; }
      if (n.name==='colortable'){ const cs=kids(n,'color'); const b=[...B.u16(cs.length)]; for (const c of cs) for (const k of ['r','g','b']) b.push(...B.u16(Math.round(parseFloat(c.attrs[k])*65535))); prop(0x300,b); return; }
      const tag=OBJ[n.name]; if (tag==null) return;
      u16(tag); i32(+(n.attrs.id||0));
      for (const [k,v] of Object.entries(n.attrs)) if (k!=='id' && P[k] && v!=null) value(k,v);
      if (n.name==='t'){ const runs=kids(n,'s'); let text=''; const st=[];
        for (const s of runs){ st.push(...B.u16(text.length),...B.u16(+(s.attrs.font||3)),...B.u16(+(s.attrs.face||0)),...B.u16(Math.round(parseFloat(s.attrs.size||10)*20)),...B.u16(+(s.attrs.color||3))); text+=(s.text||'').replace(/\n/g,'\r'); }
        prop(0x700,[...B.u16(runs.length),...st,...enc1252(text)]); }
      else for (const c of n.children) obj(c);
      u16(0);
    }
    for (const ch of 'VjCD0100') u8(ch.charCodeAt(0));
    u8(4); u8(3); u8(2); u8(1); for (let i=0;i<10;i++) u8(0);
    obj(root); u16(0);
    return new Uint8Array(out);
  }
  function cdxDecode(bytes){
    const dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(...bytes.subarray(0,4))!=='VjCD') throw new Error('Not a ChemDraw CDX file');
    let p=22;
    const fixed=o=>dv.getInt32(o,true)/65536;
    function readObj(tag){
      const id=dv.getUint32(p,true); p+=4;
      const n=E(OBJN[tag]||('obj'+tag.toString(16)),{id:String(id)});
      while (p+2<=bytes.length){
        const t=dv.getUint16(p,true); p+=2;
        if (t===0) break;
        if (t & 0x8000){ n.children.push(readObj(t)); continue; }
        let len=dv.getUint16(p,true); p+=2; if (len===0xFFFF){ len=dv.getUint32(p,true); p+=4; }
        const o=p; p+=len;
        if (t===0x700){ const nr=dv.getUint16(o,true), runs=[]; for (let i=0;i<nr;i++){ const q=o+2+i*10; runs.push({at:dv.getUint16(q,true),font:dv.getUint16(q+2,true),face:dv.getUint16(q+4,true),size:dv.getUint16(q+6,true)/20,color:dv.getUint16(q+8,true)}); }
          const txt=dec1252([...bytes.subarray(o+2+nr*10,o+len)]).replace(/\r/g,'\n');
          if (!runs.length) runs.push({at:0,font:3,face:0,size:10,color:3});
          runs.forEach((r,i)=>n.children.push(E('s',{font:String(r.font),face:String(r.face),size:num(r.size),color:String(r.color)},[],txt.slice(r.at, i+1<runs.length? runs[i+1].at : txt.length))));
          continue; }
        const name=PN[t]; if (!name) continue;
        const type=P[name][1]; let v;
        switch(type){
          case 'str': { const nr=dv.getUint16(o,true); v=dec1252([...bytes.subarray(o+2+nr*10,o+len)]); break; }
          case 'i8': v=dv.getInt8(o); break; case 'u8': v=dv.getUint8(o); break;
          case 'i16': v= len>=2? dv.getInt16(o,true) : dv.getInt8(o); break; case 'u16': v= len>=2? dv.getUint16(o,true) : dv.getUint8(o); break;
          case 'u32': v=dv.getUint32(o,true); break; case 'coord': v=num(fixed(o)); break; case 'bool': v='yes'; break;
          case 'ids': { const a=[]; for (let i=0;i+4<=len;i+=4) a.push(dv.getUint32(o+i,true)); v=a.join(' '); break; }
          case 'pt2': case 'rect': { const a=[]; for (let i=0;i+8<=len;i+=8) a.push(num(fixed(o+i+4)),num(fixed(o+i))); v=a.join(' '); break; }
          case 'pt3': { const a=[]; for (let i=0;i+4<=len;i+=4) a.push(num(fixed(o+i))); v=a.join(' '); break; }
        }
        if (name==='BondSpacing') v=num(v/10); else if (name==='AngularSize') v=num(v/10);
        else if (name==='Order'){ const m={1:'1',2:'2',4:'3',0x80:'1.5'}; v=m[v]||'1'; }
        else if (EREV[name] && EREV[name][v]!=null) v=EREV[name][v];
        n.attrs[name]=String(v);
      }
      return n;
    }
    const t0=dv.getUint16(p,true); p+=2;
    const root=readObj(t0||0x8000); root.name='CDXML';
    return root;
  }

  /* ---------- ChemDraw tree -> drawing ---------- */
  function kekulize(atoms, bonds){ // aromatic (1.5) bonds -> alternating single/double
    const ar=bonds.filter(b=>b.order===1.5); if (!ar.length) return;
    const byId=new Map(atoms.map(a=>[a.id,a])), deg=new Map(), other=new Map();
    for (const b of bonds) for (const x of [b.a,b.b]){ deg.set(x,(deg.get(x)||0)+1); if (b.order!==1.5) other.set(x,(other.get(x)||0)+b.order); }
    const need=id=>{ const a=byId.get(id); const v={C:4,N:3,P:3,B:3,Si:4,As:3}[a.el]; if (!v) return false; return v-(a.charge&&a.el!=='C'? -a.charge:Math.abs(a.charge||0))-(other.get(id)||0)-(ar.filter(b=>b.a===id||b.b===id).length)-(a.h||0)>=1; };
    const nodes=[...new Set(ar.flatMap(b=>[b.a,b.b]))].filter(need), mate=new Map(); let budget=20000;
    const adj=id=>ar.filter(b=>(b.a===id||b.b===id)).map(b=>b.a===id?b.b:b.a).filter(x=>nodes.includes(x));
    function solve(i){ if (--budget<0) return true; while (i<nodes.length && mate.has(nodes[i])) i++; if (i>=nodes.length) return true;
      const a=nodes[i]; for (const n of adj(a)) if (!mate.has(n)){ mate.set(a,n); mate.set(n,a); if (solve(i+1)) return true; mate.delete(a); mate.delete(n); }
      return solve(i+1); } // leave unmatched if impossible
    solve(0);
    for (const b of ar) b.order = mate.get(b.a)===b.b ? 2 : 1;
  }
  function treeToDoc(root){
    const atoms=[], bonds=[], arrows=[], texts=[], pluses=[]; let nid=1;
    const pt=s=>{ const a=String(s||'0 0').trim().split(/\s+/).map(parseFloat); return V(a[0]||0,a[1]||0); };
    const sText=t=>kids(t,'s').map(s=>{ const f=+(s.attrs.face||0), x=s.text||''; return (f&64)? '^'+x : x; }).join('') || (t.text||'').trim();
    const nodeMap=new Map(), multi=new Map(); // CDX node id -> our atom id; nicknames with several attachment points
    function addFragment(fr){
      for (const n of kids(fr,'n')){
        const ty=n.attrs.NodeType||'Element', p=pt(n.attrs.p), lab=kids(n,'t')[0];
        if (ty==='ExternalConnectionPoint') continue;
        const label = lab ? sText(lab).replace(/\^/g,'') : '';
        let el;
        if (ty==='GenericNickname') el=n.attrs.GenericNickname||label||'R';
        else if (ty==='Nickname' || ty==='Fragment' || ty==='Unspecified' || ty==='Formula'){
          const known = label && (ABBR[label] ? label : Object.keys(ABBR).find(k=>ABBR[k].l===label));
          const inner=kids(n,'fragment')[0];
          if (known) el=known;
          else if (inner && (ty==='Fragment'||ty==='Nickname')){ // expand the inner fragment
            const before=new Set(nodeMap.keys()); addFragment(inner);
            // attachment points: ConnectionOrder (or document order) pairs with the outer node's BondOrdering
            const byId=new Map(kids(inner,'n').map(x=>[x.attrs.id,x]));
            const ecps=(inner.attrs.ConnectionOrder? inner.attrs.ConnectionOrder.trim().split(/\s+/).map(i=>byId.get(i)) : kids(inner,'n').filter(x=>x.attrs.NodeType==='ExternalConnectionPoint')).filter(Boolean);
            const atts=ecps.map(e=>{ const b=kids(inner,'b').find(b=>b.attrs.B===e.attrs.id||b.attrs.E===e.attrs.id); const a=b && (b.attrs.B===e.attrs.id? b.attrs.E : b.attrs.B); return a && nodeMap.has(a) ? {atom:nodeMap.get(a), p:e.attrs.p? pt(e.attrs.p) : null} : null; }).filter(Boolean);
            const first = atts.length ? atts[0].atom : nodeMap.get(kids(inner,'n').map(x=>x.attrs.id).find(x=>!before.has(x)&&nodeMap.has(x)));
            if (first!=null) nodeMap.set(n.attrs.id, first);
            if (atts.length>1) multi.set(n.attrs.id, {atts, order:(n.attrs.BondOrdering||'').trim().split(/\s+/).filter(Boolean), used:0});
            continue; }
          else el=label||'R';
        } else {
          const z=+(n.attrs.Element||6); el=ELEMENTS[z-1]||'C';
          if (label && z===6 && /^[A-Z]/.test(label) && !/^C(H\d*)?$/.test(label)){ const lb=label.replace(/[+-]\d*$/,''); if (ABBR[lb]) el=lb; else if (!ELEMENTS.includes(lb) && !/^[A-Z][a-z]?(H\d*)?$/.test(lb)) el=lb; }
        }
        const a={id:nid++, x:p.x, y:p.y, el, charge:+(n.attrs.Charge||0)||0, lp:0, rad: n.attrs.Radical==='Doublet'?1:0, h: n.attrs.NumHydrogens!=null? +n.attrs.NumHydrogens : 0};
        atoms.push(a); nodeMap.set(n.attrs.id, a.id);
      }
      const posOf=id=>{ const a=atoms.find(x=>x.id===id); return a? V(a.x,a.y) : null; };
      const end=(nodeId, other, bondId)=>{ const m=multi.get(nodeId); if (!m) return nodeMap.get(nodeId);
        let k=m.order.indexOf(bondId);
        if (k<0 && m.atts.every(t=>t.p) && other!=null){ const q=posOf(other); if (q) k=m.atts.reduce((bi,t,i)=>dist(t.p,q)<dist(m.atts[bi].p,q)?i:bi,0); }
        if (k<0) k=m.used++;
        return (m.atts[k]||m.atts[0]).atom; };
      for (const b of kids(fr,'b')){
        const A=end(b.attrs.B, nodeMap.get(b.attrs.E), b.attrs.id), Bb=end(b.attrs.E, nodeMap.get(b.attrs.B), b.attrs.id); if (A==null||Bb==null||A===Bb) continue;
        const o=String(b.attrs.Order||'1').split(/\s+/)[0]; let order = o==='1.5'? 1.5 : Math.max(1,Math.min(3,Math.round(+o)||1));
        const dsp=b.attrs.Display||'Solid'; let stereo='none', a1=A, a2=Bb;
        if (dsp==='WedgeBegin') stereo='wedge'; else if (dsp==='WedgeEnd'){ stereo='wedge'; a1=Bb; a2=A; }
        else if (dsp==='WedgedHashBegin') stereo='hash'; else if (dsp==='WedgedHashEnd'){ stereo='hash'; a1=Bb; a2=A; }
        else if (dsp==='Wavy') stereo='wavy'; else if (dsp==='Bold') stereo='bold';
        const bd={id:nid++, a:a1, b:a2, order, stereo}; const dp=b.attrs.DoublePosition; if (dp) bd.dbPos={Center:'center',Left:'left',Right:'right'}[dp];
        bonds.push(bd);
      }
    }
    const seenArrows=new Set();
    function visit(n, inNode){
      for (const c of n.children){
        if (c.name==='fragment' && !inNode) addFragment(c);
        else if (c.name==='t' && !inNode){ const s=sText(c); if (!s) continue; const bb=c.attrs.BoundingBox? String(c.attrs.BoundingBox).split(/\s+/).map(parseFloat) : null;
          const s0=kids(c,'s')[0]||{attrs:{}}, size=parseFloat(s0.attrs.size||10), f=+(s0.attrs.face||0);
          const p=pt(c.attrs.p), j=c.attrs.Justification;
          const t={id:nid++, x: bb? (bb[0]+bb[2])/2 : p.x, y: bb? (bb[1]+bb[3])/2 : p.y-size*0.35, text:s.replace(/\r/g,'\n')};
          if (Math.abs(size-10)>0.01) t.size=size; if (f&1) t.bold=true; if (f&2) t.italic=true; if (j==='Left'&&bb) t.align='left'; else if (j==='Right'&&bb) t.align='right';
          texts.push(t); }
        else if (c.name==='graphic'){
          const bb=String(c.attrs.BoundingBox||'').split(/\s+/).map(parseFloat);
          if (c.attrs.GraphicType==='Symbol' && c.attrs.SymbolType==='Plus' && bb.length===4) pluses.push({id:nid++, x:(bb[0]+bb[2])/2, y:(bb[1]+bb[3])/2});
          else if (c.attrs.GraphicType==='Line' && c.attrs.ArrowType && !c.attrs.SupersededBy && bb.length===4){ const at=c.attrs.ArrowType;
            arrows.push({id:nid++, type: at==='Equilibrium'?'equilibrium': at==='RetroSynthetic'?'retro': at==='Resonance'?'resonance': c.attrs.LineType==='Dashed'?'dashed':'reaction', x1:bb[2], y1:bb[3], x2:bb[0], y2:bb[1]}); }
        }
        else if (c.name==='arrow' && !seenArrows.has(c)){ seenArrows.add(c);
          const h=pt(c.attrs.Head3D), t=pt(c.attrs.Tail3D), A=c.attrs;
          let type='reaction';
          if (A.NoGo && A.NoGo!=='None') type='nogo';
          else if (A.AngularSize && Math.abs(parseFloat(A.AngularSize))>0.5) type = /Half/.test(A.ArrowheadHead||'') ? 'fishhook' : 'curly';
          else if (A.ArrowShaftSpacing && A.ArrowheadType==='Angle') type='retro';
          else if (/Half/.test(A.ArrowheadHead||'') && /Half/.test(A.ArrowheadTail||'')) type='equilibrium';
          else if (A.ArrowheadHead && A.ArrowheadTail==='Full') type='resonance';
          else if (A.LineType==='Dashed') type='dashed';
          const r={id:nid++, type, x1:t.x, y1:t.y, x2:h.x, y2:h.y};
          if ((type==='curly'||type==='fishhook') && A.Center3D){ const C=pt(A.Center3D), R=dist(C,t), sw=parseFloat(A.AngularSize)*Math.PI/180;
            // the arc from tail to head: pick the side whose span matches |AngularSize|
            const a0=angOf(sub(t,C)); let d=angOf(sub(h,C))-a0; while(d>Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI;
            if (Math.abs(sw)>Math.PI+1e-3) d = d>0? d-2*Math.PI : d+2*Math.PI;
            const M=add(C,mul(fromAng(a0+d/2),R)), ctl=sub(mul(M,2),mul(add(t,h),0.5)); r.cx=ctl.x; r.cy=ctl.y; }
          arrows.push(r); }
        else if (c.name==='n') continue;
        else visit(c, inNode);
      }
    }
    visit(root,false);
    kekulize(atoms,bonds);
    // fold back explicit-H labels on carbons drawn as ChemDraw "C" text nodes
    for (const a of atoms) delete a.h;
    return scaleToL({atoms,bonds,arrows,texts,pluses});
  }
  function scaleToL(d){
    const ls=d.bonds.map(b=>{ const A=d.atoms.find(a=>a.id===b.a), B=d.atoms.find(a=>a.id===b.b); return dist(A,B); }).filter(x=>x>1e-6).sort((a,b)=>a-b);
    const med=ls.length? ls[ls.length>>1] : L, k=L/med; if (Math.abs(k-1)<1e-3) return d;
    const sc=o=>{ for (const key of ['x','y','x1','y1','x2','y2','cx','cy']) if (o[key]!=null) o[key]*=k; };
    d.atoms.forEach(sc); d.arrows.forEach(sc); d.texts.forEach(sc); d.pluses.forEach(sc);
    return d;
  }

  /* ---------- CML and Marvin MRV ---------- */
  const ANG=1.54; // Å per bond, used by CML and MRV coordinates (y up)
  function cmlWrite(d0, marvin){
    const d=expandDoc(d0), ix=buildIndex(d), aid=new Map(); d.atoms.forEach((a,i)=>aid.set(a.id,'a'+(i+1)));
    const X=a=>num(a.x/L*ANG), Y=a=>num(-a.y/L*ANG);
    if (marvin){
      const cols=k=>d.atoms.map(k).join(' ');
      const atomArray=E('atomArray',{atomID:cols(a=>aid.get(a.id)), elementType:cols(a=>kindOf(a.el)==='element'?a.el:'R'), x2:cols(X), y2:cols(Y),
        formalCharge: d.atoms.some(a=>a.charge)? cols(a=>String(a.charge||0)) : undefined, radical: d.atoms.some(a=>a.rad)? cols(a=>a.rad?'monovalent':'0') : undefined});
      const bonds=d.bonds.map((b,i)=>E('bond',{id:'b'+(i+1), atomRefs2:aid.get(b.a)+' '+aid.get(b.b), order:String(b.order)}, b.order===1&&(b.stereo==='wedge'||b.stereo==='hash')? [E('bondStereo',{},[],b.stereo==='wedge'?'W':'H')] : []));
      return '<?xml version="1.0" encoding="UTF-8"?>\n'+xmlWrite(E('cml',{xmlns:'http://www.chemaxon.com', version:'ChemAxon file format v20.20.0, generated by Skeletal'},[E('MDocument',{},[E('MChemicalStruct',{},[E('molecule',{molID:'m1'},[atomArray,E('bondArray',{},bonds)])])])]))+'\n';
    }
    const atoms=d.atoms.map(a=>E('atom',{id:aid.get(a.id), elementType:kindOf(a.el)==='element'?a.el:'R', x2:X(a), y2:Y(a), formalCharge:a.charge?String(a.charge):undefined, spinMultiplicity:a.rad?'2':undefined, hydrogenCount:a.rad&&kindOf(a.el)==='element'?String(implicitH(a,bondSum(ix,a.id))):undefined}));
    const bonds=d.bonds.map((b,i)=>E('bond',{id:'b'+(i+1), atomRefs2:aid.get(b.a)+' '+aid.get(b.b), order:String(b.order)}, b.order===1&&(b.stereo==='wedge'||b.stereo==='hash')? [E('bondStereo',{},[],b.stereo==='wedge'?'W':'H')] : []));
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+xmlWrite(E('cml',{xmlns:'http://www.xml-cml.org/schema'},[E('molecule',{id:'m1'},[E('atomArray',{},atoms),E('bondArray',{},bonds)])]))+'\n';
  }
  function cmlRead(text){
    const root=xmlParse(text), atoms=[], bonds=[]; let nid=1; const ref=new Map();
    walk(root, n=>{
      if (n.name!=='atomArray') return;
      if (n.attrs.atomID){ // Marvin/CML array form
        const col=k=>(n.attrs[k]||'').trim().split(/\s+/), ids=col('atomID'), el=col('elementType'), x=col('x2'), y=col('y2'), ch=n.attrs.formalCharge?col('formalCharge'):[], rad=n.attrs.radical?col('radical'):[];
        ids.forEach((id,i)=>{ const a={id:nid++, x:+x[i]/ANG*L, y:-(+y[i])/ANG*L, el:el[i]==='R'?'R':el[i], charge:+(ch[i]||0)||0, lp:0, rad:rad[i]&&rad[i]!=='0'?1:0}; atoms.push(a); ref.set(id,a.id); });
      } else for (const c of kids(n,'atom')){ const A=c.attrs, x=+(A.x2??A.x3??0), y=+(A.y2??A.y3??0);
        const a={id:nid++, x:x/ANG*L, y:-y/ANG*L, el:A.elementType||'C', charge:+(A.formalCharge||0)||0, lp:0, rad:A.spinMultiplicity==='2'?1:0}; atoms.push(a); ref.set(A.id,a.id); }
    });
    walk(root, n=>{
      if (n.name!=='bond' || !n.attrs.atomRefs2) return;
      const [p,q]=n.attrs.atomRefs2.trim().split(/\s+/), o=String(n.attrs.order||'1').toUpperCase(), st=(kids(n,'bondStereo')[0]||{}).text;
      const order = o==='A'? 1.5 : o==='D'||o==='2'? 2 : o==='T'||o==='3'? 3 : 1;
      if (ref.has(p)&&ref.has(q)) bonds.push({id:nid++, a:ref.get(p), b:ref.get(q), order, stereo: st==='W'?'wedge': st==='H'?'hash':'none'});
    });
    kekulize(atoms,bonds);
    return scaleToL({atoms,bonds,arrows:[],texts:[],pluses:[]});
  }

  /* ---------- JME (JSME) ---------- */
  function jmeWrite(d0){
    const d=expandDoc(d0), ix=buildIndex(d);
    return components(d,ix).map(comp=>{ const idx=new Map(comp.map((id,i)=>[id,i+1]));
      const at=comp.map(id=>{ const a=ix.atom.get(id), c=a.charge||0; return `${kindOf(a.el)==='element'?a.el:'R'}${c? (c>0?'+':'-')+(Math.abs(c)>1?Math.abs(c):'') : ''} ${num(a.x/L*ANG)} ${num(-a.y/L*ANG)}`; });
      const bd=d.bonds.filter(b=>idx.has(b.a)&&idx.has(b.b)).map(b=>`${idx.get(b.a)} ${idx.get(b.b)} ${b.order===1&&b.stereo==='wedge'?-1: b.order===1&&b.stereo==='hash'?-2 : b.order}`);
      return `${at.length} ${bd.length} ${at.join(' ')} ${bd.join(' ')}`.trim(); }).join('|');
  }

  /* ---------- chemfig (LaTeX) ---------- */
  function chemfigWrite(d0){
    const d=d0, ix=buildIndex(d);
    const lab=a=>{ const k=kindOf(a.el), lb=layoutLabel(d,ix,a); if (k==='element' && !lb.visible) return '';
      let s = k==='element' ? a.el+(()=>{ const h=implicitH(a,bondSum(ix,a.id)); return h? 'H'+(h>1?'_'+h:'') : ''; })() : (a.el.replace(/(\d+)/g,'_$1'));
      if (a.charge) s+=`^{${Math.abs(a.charge)>1?Math.abs(a.charge):''}${a.charge>0?'+':'-'}}`;
      if (a.rad) s+='^{\\bullet}'; return /[_^\\]/.test(s)||s.length>1? `{${s}}` : s; };
    function one(comp){
      const set=new Set(comp), seen=new Set(), used=new Set(); let hook=0; const hooks=new Map(); // atom -> [names]
      const start=comp.slice().sort((p,q)=>{ const A=ix.atom.get(p),B=ix.atom.get(q); return (ix.adj.get(p).length-ix.adj.get(q).length)||(A.x-B.x); })[0];
      // first pass: spanning tree, collect ring-closure bonds
      const tree=new Map(), closures=[]; (function dfs(id){ seen.add(id); tree.set(id,[]);
        for (const {b,o} of ix.adj.get(id)) { if (!set.has(o)||used.has(b)) continue; used.add(b); if (seen.has(o)) closures.push({b,from:id,to:o}); else { tree.get(id).push({b,o}); dfs(o); } } })(start);
      const open=new Map(), close=new Map();
      for (const c of closures){ const nm=String.fromCharCode(97+(hook++%26)); (open.get(c.to)||open.set(c.to,[]).get(c.to)).push(nm); (close.get(c.from)||close.set(c.from,[]).get(c.from)).push({nm,b:c.b}); }
      const bondTok=(b,from)=>{ if (b.order===2) return '='; if (b.order===3) return '~'; if (b.stereo==='wedge') return b.a===from? '<' : '>'; if (b.stereo==='hash') return b.a===from? '<:' : '>:'; return '-'; };
      const closTok=b=> b.order===2?'=': b.order===3?'~':'-';
      function emit(id){
        let s=lab(ix.atom.get(id));
        for (const nm of open.get(id)||[]) s+=`?[${nm}]`;
        for (const {nm,b} of close.get(id)||[]) s+=`?[${nm},{${closTok(b)}}]`;
        const ch=tree.get(id);
        ch.forEach(({b,o},i)=>{ const A=ix.atom.get(id),B=ix.atom.get(o); const ang=Math.round(Math.atan2(-(B.y-A.y),B.x-A.x)*180/Math.PI);
          const part=`${bondTok(b,id)}[:${(ang+360)%360}]${emit(o)}`; s += i<ch.length-1 ? `(${part})` : part; });
        return s;
      }
      return `\\chemfig{${emit(start)}}`;
    }
    const comps=components(d,ix).filter(c=>c.length);
    const rr=reactionRoles(d);
    if (rr){ const f=cs=>cs.map(one).join(' \\+ '); const above=rr.above.map(t=>t.text).join(', ');
      return `% requires \\usepackage{chemfig}\n\\schemestart\n${f(rr.reactants)}\n\\arrow{->[${above.replace(/[{}]/g,'')}]}\n${f(rr.products)}\n\\schemestop\n`; }
    return '% requires \\usepackage{chemfig}\n'+comps.map(one).join('\n')+'\n';
  }

  /* ---------- molfile family ---------- */
  function molWrite(d0, v3){ const d=expandDoc(d0); const m=oclOf(d); return v3? m.toMolfileV3() : m.toMolfile(); }
  function sdfWrite(d0){ const d=expandDoc(d0), ix=buildIndex(d);
    return components(d,ix).map(c=>{ const m=oclOf(d,c); let mf=m.toMolfile(); if (!/\n$/.test(mf)) mf+='\n'; return mf+`> <SMILES>\n${m.toIsomericSmiles()}\n\n$$$$\n`; }).join(''); }
  function rxnWrite(d0, v3){
    const d=expandDoc(d0), rr=reactionRoles(d); if (!rr) throw new Error('Draw a reaction arrow with structures on both sides first');
    const r=OCL.Reaction.create(); rr.reactants.forEach(c=>r.addReactant(oclOf(d,c))); rr.products.forEach(c=>r.addProduct(oclOf(d,c)));
    return v3? r.toRxnV3() : r.toRxn();
  }

  const LIST=[
    {id:'cdxml', name:'ChemDraw XML', ext:'cdxml', mime:'chemical/x-cdxml', binary:false, read:true},
    {id:'cdx', name:'ChemDraw (binary)', ext:'cdx', mime:'chemical/x-cdx', binary:true, read:true},
    {id:'mol', name:'MDL Molfile V2000', ext:'mol', mime:'chemical/x-mdl-molfile', binary:false},
    {id:'molV3', name:'MDL Molfile V3000', ext:'mol', mime:'chemical/x-mdl-molfile', binary:false},
    {id:'sdf', name:'SD file', ext:'sdf', mime:'chemical/x-mdl-sdfile', binary:false},
    {id:'rxn', name:'MDL Reaction (RXN)', ext:'rxn', mime:'chemical/x-mdl-rxnfile', binary:false},
    {id:'rxnV3', name:'MDL Reaction V3000', ext:'rxn', mime:'chemical/x-mdl-rxnfile', binary:false},
    {id:'cml', name:'Chemical Markup Language', ext:'cml', mime:'chemical/x-cml', binary:false, read:true},
    {id:'mrv', name:'Marvin (MRV)', ext:'mrv', mime:'chemical/x-mrv', binary:false, read:true},
    {id:'jme', name:'JME / JSME', ext:'jme', mime:'text/plain', binary:false},
    {id:'smarts', name:'SMARTS', ext:'sma', mime:'text/plain', binary:false},
    {id:'chemfig', name:'chemfig (LaTeX)', ext:'tex', mime:'application/x-tex', binary:false},
  ];
  function write(fmt, d){
    switch(fmt){
      case 'cdxml': return CDXML_HEAD+xmlWrite(cdxTree(d))+'\n';
      case 'cdx': return cdxEncode(cdxTree(d));
      case 'cml': return cmlWrite(d,false);
      case 'mrv': return cmlWrite(d,true);
      case 'jme': return jmeWrite(d);
      case 'chemfig': return chemfigWrite(d);
      case 'mol': return molWrite(d,false);
      case 'molV3': return molWrite(d,true);
      case 'sdf': return sdfWrite(d);
      case 'rxn': return rxnWrite(d,false);
      case 'rxnV3': return rxnWrite(d,true);
      case 'smarts': return oclOf(expandDoc(d)).toSmarts();
    }
    throw new Error('Unknown format '+fmt);
  }
  function read(fmt, data){
    if (fmt==='cdxml') return treeToDoc(kids(xmlParse(typeof data==='string'? data : new TextDecoder().decode(data)),'CDXML')[0] || xmlParse(String(data)));
    if (fmt==='cdx') return treeToDoc(cdxDecode(data instanceof Uint8Array? data : new Uint8Array(data)));
    if (fmt==='cml' || fmt==='mrv') return cmlRead(typeof data==='string'? data : new TextDecoder().decode(data));
    throw new Error('Unknown format '+fmt);
  }
  return {list:LIST, write, read, expandDoc, _xmlParse:xmlParse, _cdxTree:cdxTree, _cdxDecode:cdxDecode};
})();
