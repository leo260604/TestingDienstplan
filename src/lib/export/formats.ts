/* Export-Formate ohne Fremdbibliotheken: ZIP-Writer (für .xlsx) und PDF-Writer.
   Aus der Browser-Version übernommen. */
 
import { F } from '../dates';

export type Cell = string | number;
export interface XlsxOptions { title?: string; subtitle?: string; kindCol?: number; headKinds?: (string | null)[]; numCols?: number[]; intCols?: number[]; sumCols?: number[]; sumCol?: number; sumLabel?: string }
export interface PdfOptions { rightCols?: number[]; kindCol?: number; kindOf?: (v: any) => string; groupCol?: number; headKinds?: (string | null)[]; legend?: string[]; sumRow?: Cell[] | null; author?: string }

const CRC_TABLE=(():Uint32Array=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8:Uint8Array){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_TABLE[(c^u8[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
export function makeZip(files:{name:string;data:string|Uint8Array}[]):Blob{
 const enc=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 files.forEach(f=>{const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
  const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,0,true);lh.setUint16(12,0x21,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
  parts.push(new Uint8Array(lh.buffer),name,data);
  const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,0,true);ch.setUint16(14,0x21,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);
  central.push(new Uint8Array(ch.buffer),name);offset+=30+name.length+data.length;});
 const csize=central.reduce((s,p)=>s+p.length,0),end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,csize,true);end.setUint32(16,offset,true);
 return new Blob([...parts,...central,new Uint8Array(end.buffer)] as BlobPart[],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export const xmlEsc=(v:unknown)=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as Record<string,string>)[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
/* Farben der Arten wie im System (Dienst/Bereitschaft/Abwesenheit/Arbeitsort) */
export const KIND_HEX:Record<string,string>={Dienst:'14A1A9',Bereitschaft:'6C5CCF',Abwesenheit:'C27A12',Arbeitsort:'3974C6',Erfolgreich:'1F9A63',Verweigert:'D64550',Hinweis:'C27A12',Erstellt:'1F9A63',Geändert:'3974C6',Gelöscht:'D64550',Info:'596579'};
export const KIND_LIGHT:Record<string,string>={Dienst:'E3F4F5',Bereitschaft:'ECE9FA',Abwesenheit:'F8EEDF',Arbeitsort:'E4ECF8',Erfolgreich:'E3F3EB',Verweigert:'FBE6E8',Hinweis:'F8EEDF',Erstellt:'E3F3EB',Geändert:'E4ECF8',Gelöscht:'FBE6E8',Info:'EEF1F3'};
export const KIND_ORDER:string[]=['Dienst','Bereitschaft','Abwesenheit','Arbeitsort'];
export function makeXlsx(sheetName:string,rows:Cell[][],opts:XlsxOptions={}):Blob{
 const col=(i:number)=>{let s='';i++;while(i){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
 const head=rows[0],data=rows.slice(1),nc=head.length,num=new Set(opts.numCols||[]),ints=new Set(opts.intCols||[]),kc=opts.kindCol,hk=opts.headKinds||[],sums=opts.sumCols||(opts.sumCol!=null?[opts.sumCol]:[]);
 const top=opts.title?3:0,hr=top+1,first=hr+1,last=hr+data.length;
 const cell=(ref:string,v:Cell,st:number)=>typeof v==='number'&&isFinite(v)?`<c r="${ref}" s="${st}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
 let out='';
 if(opts.title){out+=`<row r="1" ht="22" customHeight="1">${cell('A1',opts.title,2)}</row>`;out+=`<row r="2">${cell('A2',opts.subtitle||'',3)}</row>`;}
 out+=`<row r="${hr}" ht="30" customHeight="1">${head.map((h:Cell,ci:number)=>cell(col(ci)+hr,h,KIND_ORDER.includes(hk[ci] as string)?13+KIND_ORDER.indexOf(hk[ci] as string):1)).join('')}</row>`;
 data.forEach((r:Cell[],i:number)=>{const rr=first+i;out+=`<row r="${rr}">${r.map((v:Cell,ci:number)=>{let st=4;if(ci===kc&&KIND_ORDER.includes(String(v)))st=6+KIND_ORDER.indexOf(String(v));else if(ints.has(ci)&&typeof v==='number')st=12;else if(num.has(ci)&&typeof v==='number')st=5;return cell(col(ci)+rr,v,st)}).join('')}</row>`});
 let sumRow='';
 if(sums.length&&data.length){const rr=last+1;sumRow=`<row r="${rr}" ht="20" customHeight="1">${head.map((_:Cell,ci:number)=>{if(sums.includes(ci)){const tot=data.reduce((t:number,r:Cell[])=>t+(typeof r[ci]==='number'?r[ci]:0),0);return `<c r="${col(ci)+rr}" s="${ints.has(ci)?17:11}"><f>SUM(${col(ci)}${first}:${col(ci)}${last})</f><v>${+tot.toFixed(2)}</v></c>`}return cell(col(ci)+rr,ci===0?(opts.sumLabel||'Summe'):'',10)}).join('')}</row>`;}
 const widths=head.map((h:Cell,i:number)=>Math.min(46,Math.max(Math.min(String(h).length+4,24),...data.slice(0,400).map((r:Cell[])=>String(r[i]??'').length+3),10)));
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="${opts.title?0:1}"><pane ySplit="${hr}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w:number,i:number)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${out}${sumRow}</sheetData><autoFilter ref="A${hr}:${col(nc-1)}${Math.max(hr,last)}"/>${opts.title?`<mergeCells count="2"><mergeCell ref="A1:${col(Math.max(1,nc-1))}1"/><mergeCell ref="A2:${col(Math.max(1,nc-1))}2"/></mergeCells>`:''}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
 const kFonts=KIND_ORDER.map(k=>`<font><b/><sz val="10"/><color rgb="FF${KIND_HEX[k]}"/><name val="Calibri"/></font>`).join('');
 const kFills=KIND_ORDER.map(k=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${KIND_LIGHT[k]}"/></patternFill></fill>`).join('');
 const kSolid=KIND_ORDER.map(k=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${KIND_HEX[k]}"/></patternFill></fill>`).join('');
 const bd='<border><left style="thin"><color rgb="FFE3E8EB"/></left><right style="thin"><color rgb="FFE3E8EB"/></right><top style="thin"><color rgb="FFE3E8EB"/></top><bottom style="thin"><color rgb="FFE3E8EB"/></bottom><diagonal/></border>';
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="9"><font><sz val="10"/><color rgb="FF17242B"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF17242B"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B7A83"/><name val="Calibri"/></font>${kFonts}<font><b/><sz val="10"/><color rgb="FF17242B"/><name val="Calibri"/></font></fonts><fills count="12"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14A1A9"/></patternFill></fill>${kFills}<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F4"/></patternFill></fill>${kSolid}</fills><borders count="2"><border/>${bd}</borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="18"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="2" applyFont="1"/><xf fontId="3" applyFont="1"/><xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>${KIND_ORDER.map((_,i)=>`<xf fontId="${4+i}" fillId="${3+i}" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join('')}<xf fontId="8" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf fontId="8" fillId="7" borderId="1" numFmtId="164" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/><xf numFmtId="3" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>${KIND_ORDER.map((_,i)=>`<xf fontId="1" fillId="${8+i}" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}<xf fontId="8" fillId="7" borderId="1" numFmtId="3" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const sn=xmlEsc(sheetName.slice(0,31));
 return makeZip([
  {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
  {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sn}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sn}'!$A$${hr}:$${col(nc-1)}$${Math.max(hr,last)}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${sn}'!$${hr}:$${hr}</definedName></definedNames></workbook>`},
  {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
  {name:'xl/worksheets/sheet1.xml',data:sheet},
  {name:'xl/styles.xml',data:styles}
 ]);
}
/* Minimaler PDF-Writer: Tabelle im Querformat (Helvetica, Seitenumbruch, Kopfzeile je Seite) */
export function makePdf(title:string,subtitle:string,headers:string[],rows:(Cell[]|{sum:Cell[];sub?:boolean})[],widths:number[],opts:PdfOptions={}):Blob{
 const W=842,H=595,M=34,LH=17,FS=8.5,toCp=(s:unknown)=>{let out='';for(const ch of String(s??'')){const c=ch.codePointAt(0);const map:Record<number,number>={0x20AC:0x80,0x2013:0x96,0x2014:0x97,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x201E:0x84,0x2022:0x95,0x2026:0x85,0x2192:0x3E};const v=c===undefined?0x3F:c<256?c:(map[c]||0x3F);out+=v===0x28||v===0x29||v===0x5C?'\\'+String.fromCharCode(v):v>126||v<32?'\\'+v.toString(8).padStart(3,'0'):String.fromCharCode(v)}return out};
 const rgb=(h:string)=>[0,2,4].map(i=>(parseInt(h.slice(i,i+2),16)/255).toFixed(3)).join(' ');
 const tw=(t:unknown,size:number,bold?:boolean)=>String(t??'').length*size*(bold?0.56:0.5);
 const total=widths.reduce((a,b)=>a+b,0),cw=widths.map(w=>w/total*(W-2*M)),fit=(t0:unknown,w:number,size:number,bold?:boolean)=>{const t=String(t0??'');const max=Math.floor(w/(size*(bold?0.56:0.5)));return t.length>max?t.slice(0,Math.max(1,max-1))+'…':t};
 const right=new Set(opts.rightCols||[]),kc=opts.kindCol,gc=opts.groupCol;
 const body:any[]=[...rows];if(opts.sumRow)body.push({sum:opts.sumRow});
 const perPage=Math.floor((H-2*M-92)/LH),pageCount=Math.max(1,Math.ceil(body.length/perPage));
 const pages:string[]=[];
 for(let p=0;p<pageCount;p++){const ops:string[]=[];let y=H-M;
  ops.push(`0.078 0.631 0.663 rg 0 ${H-6} ${W} 6 re f`);
  ops.push(`BT /F2 17 Tf 0.09 0.141 0.169 rg ${M} ${y-16} Td (${toCp(title)}) Tj ET`);
  ops.push(`BT /F1 9.5 Tf 0.42 0.478 0.514 rg ${M} ${y-32} Td (${toCp(subtitle)}) Tj ET`);
  if(opts.legend){let lx=W-M;const items=[...opts.legend].reverse();items.forEach(k=>{const w=tw(k,7.5,true)+14;lx-=w;ops.push(`${rgb(KIND_LIGHT[k]||'EEF2F4')} rg ${lx} ${y-34} ${w-4} 13 re f`);ops.push(`BT /F2 7.5 Tf ${rgb(KIND_HEX[k]||'6B7A83')} rg ${lx+5} ${y-30} Td (${toCp(k)}) Tj ET`);lx-=2})}
  y-=62;
  ops.push(`0.078 0.631 0.663 rg ${M} ${y-5} ${W-2*M} ${LH+2} re f`);
  let x=M;headers.forEach((h,i)=>{const hk=(opts.headKinds||[])[i];if(hk&&KIND_HEX[hk])ops.push(`${rgb(KIND_HEX[hk])} rg ${x} ${y-5} ${cw[i]} ${LH+2} re f`);const t=fit(h,cw[i]-10,FS,true);const tx=right.has(i)?x+cw[i]-6-tw(t,FS,true):x+6;ops.push(`BT /F2 ${FS} Tf 1 1 1 rg ${tx} ${y+1} Td (${toCp(t)}) Tj ET`);x+=cw[i]});
  y-=LH+2;
  let prevG:any=p>0&&gc!=null?null:undefined;
  body.slice(p*perPage,(p+1)*perPage).forEach((r:any,ri:number)=>{
   if(r.sum){ops.push(`${r.sub?'0.965 0.973 0.976':'0.933 0.949 0.957'} rg ${M} ${y-5} ${W-2*M} ${LH} re f`);let xs=M;r.sum.forEach((v:any,i:number)=>{if(v!==''&&v!=null){const t=fit(v,cw[i]-10,FS,true);const tx=right.has(i)?xs+cw[i]-6-tw(t,FS,true):xs+6;ops.push(`BT /F2 ${FS} Tf 0.09 0.141 0.169 rg ${tx} ${y} Td (${toCp(t)}) Tj ET`)}xs+=cw[i]});y-=LH;return}
   const newGroup=gc!=null&&r[gc]!==prevG;
   if(ri%2)ops.push(`0.976 0.98 0.984 rg ${M} ${y-5} ${W-2*M} ${LH} re f`);
   ops.push(`${newGroup&&ri>0?'0.78 0.82 0.84':'0.91 0.93 0.94'} RG ${newGroup&&ri>0?0.8:0.4} w ${M} ${newGroup&&ri>0?y+LH-5:y-5} m ${W-M} ${newGroup&&ri>0?y+LH-5:y-5} l S`);
   let x2=M;r.forEach((v:any,i:number)=>{
    const kk=i===kc?(opts.kindOf?opts.kindOf(v):v):null;if(kk&&KIND_HEX[kk]){const t=fit(v,cw[i]-16,7.8,true),w=tw(t,7.8,true)+12;ops.push(`${rgb(KIND_LIGHT[kk])} rg ${x2+4} ${y-3} ${w} 12 re f`);ops.push(`BT /F2 7.8 Tf ${rgb(KIND_HEX[kk])} rg ${x2+10} ${y} Td (${toCp(t)}) Tj ET`)}
    else{const show=i===gc&&!newGroup&&ri>0?'':v;const bold=i===gc;const t=fit(show,cw[i]-10,FS,bold);if(t){const tx=right.has(i)?x2+cw[i]-6-tw(t,FS,bold):x2+6;ops.push(`BT /${bold?'F2':'F1'} ${FS} Tf ${i===gc?'0.09 0.141 0.169':'0.2 0.247 0.275'} rg ${tx} ${y} Td (${toCp(t)}) Tj ET`)}}
    x2+=cw[i]});
   if(gc!=null)prevG=r[gc];
   y-=LH});
  ops.push(`0.89 0.91 0.92 RG 0.5 w ${M} ${M-2} m ${W-M} ${M-2} l S`);
  ops.push(`BT /F1 7.5 Tf 0.5 0.55 0.58 rg ${M} ${M-14} Td (${toCp('DienstPlan Pro · erstellt am '+F.fmtDateTime(Date.now())+' von '+(opts.author||''))}) Tj ET`);
  const pg=`Seite ${p+1} von ${pageCount}`;ops.push(`BT /F1 7.5 Tf 0.5 0.55 0.58 rg ${W-M-tw(pg,7.5)} ${M-14} Td (${toCp(pg)}) Tj ET`);
  pages.push(ops.join('\n'));}
 const objs:string[]=[];const add=(s:string)=>{objs.push(s);return objs.length};
 add('<< /Type /Catalog /Pages 2 0 R >>');add('PAGES');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const kids=pages.map(c=>{const cs=add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cs} 0 R >>`)});
 objs[1]=`<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;
 let out='%PDF-1.4\n%âãÏÓ\n';const offs:number[]=[];objs.forEach((o,i)=>{offs.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`});
 const xref=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const u8=new Uint8Array(out.length);for(let i=0;i<out.length;i++)u8[i]=out.charCodeAt(i)&0xFF;
 return new Blob([u8],{type:'application/pdf'});
}
