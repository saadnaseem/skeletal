/* ================= vector PDF export =================
   Converts the SVG this app produces (line, path M/L/Q/C/Z, circle, rect,
   text + tspan) into PDF drawing operators with the 14 standard fonts. */
const PDF = (()=>{
  const FONTS = ['Helvetica','Helvetica-Bold','Helvetica-Oblique','Helvetica-BoldOblique','Times-Roman','Times-Bold','Times-Italic','Times-BoldItalic','Courier','Courier-Bold','Courier-Oblique','Courier-BoldOblique','Symbol'];
  const WIN = {0x2212:0x96,0x2013:0x96,0x2014:0x97,0x2022:0x95,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2026:0x85,0x20AC:0x80,0x2030:0x89,0x2020:0x86,0x2021:0x87};
  const SYM = {'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'h','θ':'q','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','π':'p','ρ':'r','σ':'s','τ':'t','υ':'u','φ':'f','χ':'c','ψ':'y','ω':'w',
    'Α':'A','Β':'B','Γ':'G','Δ':'D','Ε':'E','Θ':'Q','Λ':'L','Π':'P','Σ':'S','Φ':'F','Ψ':'Y','Ω':'W','→':'\u00AE','←':'\u00AC','↔':'\u00AB','⇌':'\u00AB','≈':'\u00BB','≠':'\u00B9','≤':'\u00A3','≥':'\u00B3','×':'\u00B4','÷':'\u00B8','∞':'\u00A5','·':'\u00D7'};
  const num=v=>{ const r=Math.round(v*1000)/1000; return (Object.is(r,-0)?0:r).toString(); };
  function rgb(c){
    if (!c || c==='none') return null;
    let m=c.match(/^#([0-9a-f]{6})$/i); if (m){ const n=parseInt(m[1],16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]; }
    m=c.match(/^#([0-9a-f]{3})$/i); if (m){ return m[1].split('').map(h=>parseInt(h+h,16)/255); }
    m=c.match(/rgba?\(([^)]+)\)/); if (m){ const p=m[1].split(',').map(parseFloat); return [p[0]/255,p[1]/255,p[2]/255]; }
    if (c==='white') return [1,1,1];
    return [0,0,0];
  }
  function attr(el, name, inh){ let e=el; while (e && e.getAttribute){ const v=e.getAttribute(name); if (v!=null) return v; if (!inh) break; e=e.parentNode; } return null; }
  function strEsc(bytes){ let s=''; for (const b of bytes){ if (b===40||b===41||b===92) s+='\\'+String.fromCharCode(b); else if (b<32||b>126) s+='\\'+b.toString(8).padStart(3,'0'); else s+=String.fromCharCode(b); } return '('+s+')'; }
  function segments(text){ // split into [{sym, bytes, str}]
    const out=[]; let cur=null;
    for (const ch of text){
      const cp=ch.codePointAt(0); let sym=false, b;
      if (SYM[ch]!=null){ sym=true; b=SYM[ch].charCodeAt(0); }
      else if (cp<128 || (cp>=0xA0 && cp<=0xFF)) b=cp; else if (WIN[cp]!=null) b=WIN[cp]; else b=63;
      if (!cur || cur.sym!==sym){ cur={sym,bytes:[],str:''}; out.push(cur); }
      cur.bytes.push(b); cur.str+=ch;
    }
    return out;
  }
  function fontIndex(family, bold, italic){
    const f0=(family.split(',')[0]||'').replace(/['"]/g,'').trim().toLowerCase();
    const base = /courier|mono/.test(f0) ? 8 : (/times|georgia|garamond/.test(f0) || (f0==='serif')) ? 4 : 0;
    return base + (bold?1:0) + (italic?2:0);
  }
  function pathOps(d){
    const t=d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e-?\d+)?/g)||[]; let i=0, cmd='', cx=0, cy=0, sx=0, sy=0; const ops=[];
    const n=()=>parseFloat(t[i++]);
    while (i<t.length){
      if (/[A-Za-z]/.test(t[i])) cmd=t[i++];
      if (cmd==='M'){ cx=n(); cy=n(); sx=cx; sy=cy; ops.push(`${num(cx)} ${num(cy)} m`); cmd='L'; }
      else if (cmd==='L'){ cx=n(); cy=n(); ops.push(`${num(cx)} ${num(cy)} l`); }
      else if (cmd==='Q'){ const qx=n(),qy=n(),x=n(),y=n(); const c1x=cx+2/3*(qx-cx), c1y=cy+2/3*(qy-cy), c2x=x+2/3*(qx-x), c2y=y+2/3*(qy-y); ops.push(`${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)} c`); cx=x; cy=y; }
      else if (cmd==='C'){ const a=n(),b=n(),c=n(),e=n(),x=n(),y=n(); ops.push(`${num(a)} ${num(b)} ${num(c)} ${num(e)} ${num(x)} ${num(y)} c`); cx=x; cy=y; }
      else if (cmd==='Z'||cmd==='z'){ ops.push('h'); cx=sx; cy=sy; }
      else { i++; }
    }
    return ops.join('\n');
  }
  function paint(el, geom, defFill){
    const st=attr(el,'stroke',true), fl=attr(el,'fill',true);
    const fill = fl==null ? (defFill?[0,0,0]:null) : rgb(fl);
    const stroke = rgb(st);
    if (!fill && !stroke) return '';
    const o=['q'];
    if (stroke){ o.push(`${stroke.map(num).join(' ')} RG`); o.push(`${num(parseFloat(attr(el,'stroke-width',true)||'1'))} w`);
      const cap=attr(el,'stroke-linecap',true); o.push(`${cap==='round'?1:cap==='square'?2:0} J`);
      const join=attr(el,'stroke-linejoin',true); o.push(`${join==='round'?1:join==='bevel'?2:0} j`);
      const da=attr(el,'stroke-dasharray',false); if (da && da!=='none') o.push(`[${da.split(/[ ,]+/).map(parseFloat).map(num).join(' ')}] 0 d`); }
    if (fill) o.push(`${fill.map(num).join(' ')} rg`);
    o.push(geom);
    o.push(fill&&stroke?'B':fill?'f':'S'); o.push('Q');
    return o.join('\n');
  }
  function textOps(el){
    const family=attr(el,'font-family',true)||'Helvetica';
    const size=parseFloat(attr(el,'font-size',true)||'10');
    const bold=parseInt(attr(el,'font-weight',true)||'400',10)>=600;
    const italic=(attr(el,'font-style',true)||'')==='italic';
    const anchor=attr(el,'text-anchor',true)||'start';
    const fillC=rgb(attr(el,'fill',true)||'#000')||[0,0,0];
    const cssFam = family;
    const runs=[]; let dy=0;
    const kids = el.querySelectorAll('tspan').length ? [...el.childNodes] : [el];
    for (const k of kids){
      if (k.nodeType===3){ if (k.textContent) runs.push({t:k.textContent,size,dy}); continue; }
      if (k===el){ runs.push({t:el.textContent,size,dy}); continue; }
      if (k.nodeType!==1) continue;
      dy+=parseFloat(k.getAttribute('dy')||'0');
      runs.push({t:k.textContent, size:parseFloat(k.getAttribute('font-size')||size), dy});
    }
    let total=0; for (const r of runs){ r.w=tw(r.t, r.size, bold?700:400, cssFam, italic); total+=r.w; }
    let x=parseFloat(el.getAttribute('x')||'0'); const y=parseFloat(el.getAttribute('y')||'0');
    if (anchor==='middle') x-=total/2; else if (anchor==='end') x-=total;
    const fi=fontIndex(cssFam,bold,italic);
    const o=[`${fillC.map(num).join(' ')} rg`];
    for (const r of runs){
      let rx=x;
      for (const sg of segments(r.t)){
        const f = sg.sym ? 12 : fi;
        o.push(`BT /F${f+1} ${num(r.size)} Tf 1 0 0 -1 ${num(rx)} ${num(y+r.dy)} Tm ${strEsc(sg.bytes)} Tj ET`);
        rx+=tw(sg.str, r.size, bold?700:400, cssFam, italic);
      }
      x+=r.w;
    }
    return 'q\n'+o.join('\n')+'\nQ';
  }
  function walk(node, out){
    for (const el of node.children){
      const tag=el.tagName.toLowerCase();
      if (tag==='g' || tag==='svg') walk(el,out);
      else if (tag==='line'){ const g=`${num(+el.getAttribute('x1'))} ${num(+el.getAttribute('y1'))} m ${num(+el.getAttribute('x2'))} ${num(+el.getAttribute('y2'))} l`; out.push(paint(el,g,false)); }
      else if (tag==='path'){ out.push(paint(el, pathOps(el.getAttribute('d')||''), true)); }
      else if (tag==='polyline'||tag==='polygon'){ const p=(el.getAttribute('points')||'').trim().split(/[ ,]+/).map(parseFloat); let g=''; for(let i=0;i<p.length;i+=2) g+=`${num(p[i])} ${num(p[i+1])} ${i?'l':'m'}\n`; if(tag==='polygon') g+='h'; out.push(paint(el,g,tag==='polygon')); }
      else if (tag==='circle'){ const cx=+el.getAttribute('cx'), cy=+el.getAttribute('cy'), r=+el.getAttribute('r'), k=0.5523*r;
        const g=`${num(cx+r)} ${num(cy)} m ${num(cx+r)} ${num(cy+k)} ${num(cx+k)} ${num(cy+r)} ${num(cx)} ${num(cy+r)} c ${num(cx-k)} ${num(cy+r)} ${num(cx-r)} ${num(cy+k)} ${num(cx-r)} ${num(cy)} c ${num(cx-r)} ${num(cy-k)} ${num(cx-k)} ${num(cy-r)} ${num(cx)} ${num(cy-r)} c ${num(cx+k)} ${num(cy-r)} ${num(cx+r)} ${num(cy-k)} ${num(cx+r)} ${num(cy)} c h`;
        out.push(paint(el,g,true)); }
      else if (tag==='rect'){ const x=+el.getAttribute('x'), y=+el.getAttribute('y'), w=+el.getAttribute('width'), h=+el.getAttribute('height'); out.push(paint(el,`${num(x)} ${num(y)} ${num(w)} ${num(h)} re`,true)); }
      else if (tag==='text'){ out.push(textOps(el)); }
    }
  }
  // pages: array of SVG strings (viewBox in pt)
  function build(svgs){
    const objs=[]; const add=s=>{ objs.push(s); return objs.length; };
    const catalog=add(null), pagesObj=add(null);
    const fontIds=FONTS.map(f=> add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f}${f==='Symbol'?'':' /Encoding /WinAnsiEncoding'} >>`));
    const fontRes='<< '+fontIds.map((id,i)=>`/F${i+1} ${id} 0 R`).join(' ')+' >>';
    const pageIds=[];
    for (const s of svgs){
      const doc=new DOMParser().parseFromString(s,'image/svg+xml'); const root=doc.documentElement;
      const vb=(root.getAttribute('viewBox')||'0 0 100 100').split(/[ ,]+/).map(parseFloat);
      const [x0,y0,w,h]=vb;
      const ops=[`1 0 0 -1 ${num(-x0)} ${num(y0+h)} cm`]; walk(root,ops);
      const content=ops.filter(Boolean).join('\n');
      const cid=add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pid=add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Resources << /Font ${fontRes} >> /Contents ${cid} 0 R >>`);
      pageIds.push(pid);
    }
    objs[catalog-1]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj-1]=`<< /Type /Pages /Kids [${pageIds.map(p=>p+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
    let out='%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n'; const offs=[];
    objs.forEach((o,i)=>{ offs.push(out.length); out+=`${i+1} 0 obj\n${o}\nendobj\n`; });
    const xref=out.length;
    out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
    out+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R /Producer (Skeletal) >>\nstartxref\n${xref}\n%%EOF`;
    const bytes=new Uint8Array(out.length); for (let i=0;i<out.length;i++) bytes[i]=out.charCodeAt(i)&255;
    return bytes;
  }
  return {build};
})();
