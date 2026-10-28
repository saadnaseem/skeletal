/* ================= 3D view =================
   A conformer from OpenChemLib (COD torsion library, then MMFF94s), drawn on a canvas with depth sorting.
   Drag to rotate, wheel to zoom. Exports XYZ, PDB and a 3D molfile. */
const VIEW3D = (()=>{
  // CPK-like colours and radii (Å): covalent for sticks, van der Waals for spacefill
  const COL={H:'#f2f2f2',C:'#4a4a4a',N:'#3050f8',O:'#ff2a1a',F:'#90e050',Cl:'#1ff01f',Br:'#a62929',I:'#940094',S:'#ffd02a',P:'#ff8000',B:'#ffb5b5',Si:'#c8a078',Na:'#ab5cf2',K:'#8f40d4',Li:'#cc80ff',Mg:'#8aff00',Fe:'#e06633',Cu:'#c88033',Zn:'#7d80b0',Se:'#ffa100'};
  const VDW={H:1.2,C:1.7,N:1.55,O:1.52,F:1.47,Cl:1.75,Br:1.85,I:1.98,S:1.8,P:1.8,B:1.92,Si:2.1};
  let resReady=null;
  function loadResources(){
    if (!resReady) resReady=(async()=>{
      const bin=Uint8Array.from(atob(OCL_RES_3D), c=>c.charCodeAt(0));
      const txt=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      OCL.Resources.register(JSON.parse(txt));
    })();
    return resReady;
  }
  // 3D coordinates for an OCL molecule; returns {atoms:[{el,x,y,z}], bonds:[{a,b,order}], mol}
  async function conformer(mol, seed=17){
    await loadResources();
    const gen=new OCL.ConformerGenerator(seed,false);
    const c=gen.getOneConformerAsMolecule(mol);
    if (!c) throw new Error('No conformer could be generated for this structure');
    try{ const FF=OCL.ForceFieldMMFF94; const ff=new FF(c, FF.MMFF94SPLUS); ff.minimise(); }catch(e){ /* unsupported atom types: keep the torsion-library geometry */ }
    const atoms=[], bonds=[];
    for (let i=0;i<c.getAllAtoms();i++) atoms.push({el:c.getAtomLabel(i), x:c.getAtomX(i), y:c.getAtomY(i), z:c.getAtomZ(i), charge:c.getAtomCharge(i)});
    for (let b=0;b<c.getAllBonds();b++) bonds.push({a:c.getBondAtom(0,b), b:c.getBondAtom(1,b), order:c.getBondOrder(b)});
    const cx=atoms.reduce((s,a)=>s+a.x,0)/atoms.length, cy=atoms.reduce((s,a)=>s+a.y,0)/atoms.length, cz=atoms.reduce((s,a)=>s+a.z,0)/atoms.length;
    for (const a of atoms){ a.x-=cx; a.y-=cy; a.z-=cz; }
    return {atoms, bonds, mol:c};
  }
  const shade=(hex,f)=>{ const n=parseInt(hex.slice(1),16); const ch=k=>Math.max(0,Math.min(255,Math.round(((n>>k)&255)*f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  // view: {rot:[3x3], zoom, style:'ball'|'space'|'stick', showH}
  function draw(cv, model, view, bg){
    const g=cv.getContext('2d'), W=cv.width, H=cv.height, R=view.rot;
    g.clearRect(0,0,W,H); if (bg){ g.fillStyle=bg; g.fillRect(0,0,W,H); }
    const span=Math.max(1,...model.atoms.map(a=>Math.hypot(a.x,a.y,a.z)));
    const sc=Math.min(W,H)/(2.1*span)*view.zoom;
    const P=model.atoms.map((a,i)=>({i, el:a.el, x:W/2+(R[0]*a.x+R[1]*a.y+R[2]*a.z)*sc, y:H/2-(R[3]*a.x+R[4]*a.y+R[5]*a.z)*sc, z:R[6]*a.x+R[7]*a.y+R[8]*a.z}));
    const vis=i=>view.showH || model.atoms[i].el!=='H';
    const rad=el=> view.style==='space' ? (VDW[el]||1.8)*sc : view.style==='stick' ? 0.16*sc : (el==='H'?0.22:0.32)*sc;
    const items=[];
    if (view.style!=='space') for (const b of model.bonds){ if (!vis(b.a)||!vis(b.b)) continue; items.push({z:(P[b.a].z+P[b.b].z)/2-0.01, bond:b}); }
    for (const p of P) if (vis(p.i)) items.push({z:p.z, atom:p});
    items.sort((u,v)=>u.z-v.z);
    const fog=z=>0.72+0.28*Math.max(0,Math.min(1,(z/span+1)/2));
    for (const it of items){
      if (it.bond){ const A=P[it.bond.a], B=P[it.bond.b], mx=(A.x+B.x)/2, my=(A.y+B.y)/2, w=view.style==='stick'?0.3*sc:0.13*sc, f=fog(it.z);
        const seg=(p,q,el)=>{ g.strokeStyle=shade(COL[el]||'#d070d0',f); g.lineWidth=Math.max(1.2,w); g.lineCap='round'; g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(q.x,q.y); g.stroke(); };
        const draw1=(ox,oy)=>{ seg({x:A.x+ox,y:A.y+oy},{x:mx+ox,y:my+oy},A.el); seg({x:mx+ox,y:my+oy},{x:B.x+ox,y:B.y+oy},B.el); };
        if (it.bond.order>1 && view.style==='ball'){ const dx=B.x-A.x, dy=B.y-A.y, l=Math.hypot(dx,dy)||1, off=0.09*sc, nx=-dy/l*off, ny=dx/l*off; g.lineWidth=w*0.6;
          if (it.bond.order===2){ draw1(nx/1.4,ny/1.4); draw1(-nx/1.4,-ny/1.4); } else { draw1(0,0); draw1(nx*1.3,ny*1.3); draw1(-nx*1.3,-ny*1.3); } }
        else draw1(0,0);
      } else { const p=it.atom, r=rad(p.el), c=COL[p.el]||'#d070d0', f=fog(p.z);
        const gr=g.createRadialGradient(p.x-r*0.35,p.y-r*0.35,r*0.1,p.x,p.y,r); gr.addColorStop(0,shade(c,Math.min(1.5,1.35*f))); gr.addColorStop(0.55,shade(c,f)); gr.addColorStop(1,shade(c,0.55*f));
        g.fillStyle=gr; g.beginPath(); g.arc(p.x,p.y,Math.max(1.5,r),0,2*Math.PI); g.fill(); }
    }
    if (view.labels){ g.font=`${Math.max(10,Math.round(0.28*sc))}px Arial, Helvetica, sans-serif`; g.textAlign='center'; g.textBaseline='middle';
      for (const p of P) if (vis(p.i) && p.el!=='C' && p.el!=='H'){ g.fillStyle='#111'; g.fillText(p.el,p.x,p.y); } }
  }
  const rotX=t=>[1,0,0, 0,Math.cos(t),-Math.sin(t), 0,Math.sin(t),Math.cos(t)];
  const rotY=t=>[Math.cos(t),0,Math.sin(t), 0,1,0, -Math.sin(t),0,Math.cos(t)];
  const mul=(A,B)=>{ const C=new Array(9).fill(0); for (let r=0;r<3;r++) for (let c=0;c<3;c++) for (let k=0;k<3;k++) C[r*3+c]+=A[r*3+k]*B[k*3+c]; return C; };
  function xyz(model, title){ return `${model.atoms.length}\n${title||'Lone Pair 3D conformer (OpenChemLib + MMFF94s)'}\n`+model.atoms.map(a=>`${a.el.padEnd(2)} ${a.x.toFixed(4).padStart(10)} ${a.y.toFixed(4).padStart(10)} ${a.z.toFixed(4).padStart(10)}`).join('\n')+'\n'; }
  function pdb(model){
    const n={}; const lines=['HEADER    LONE PAIR 3D CONFORMER','REMARK   1 GENERATED BY LONE PAIR (OPENCHEMLIB CONFORMER, MMFF94S)'];
    model.atoms.forEach((a,i)=>{ n[a.el]=(n[a.el]||0)+1; const name=(a.el+n[a.el]).slice(0,4);
      lines.push(`HETATM${String(i+1).padStart(5)} ${name.padEnd(4)} LIG A   1    ${a.x.toFixed(3).padStart(8)}${a.y.toFixed(3).padStart(8)}${a.z.toFixed(3).padStart(8)}  1.00  0.00          ${a.el.toUpperCase().padStart(2)}${a.charge? (Math.abs(a.charge)+(a.charge>0?'+':'-')) : ''}`); });
    const con=model.atoms.map(()=>[]); for (const b of model.bonds){ for (let k=0;k<b.order;k++){ con[b.a].push(b.b+1); con[b.b].push(b.a+1); } }
    con.forEach((c,i)=>{ for (let k=0;k<c.length;k+=4) lines.push('CONECT'+String(i+1).padStart(5)+c.slice(k,k+4).map(x=>String(x).padStart(5)).join('')); });
    lines.push('END'); return lines.join('\n')+'\n';
  }
  return {loadResources, conformer, draw, rotX, rotY, mul, xyz, pdb, COL};
})();
