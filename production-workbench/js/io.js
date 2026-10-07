'use strict';
// Streaming DAT/CSV I/O adapted from the preserved DAT Field Scrubber v1.2.0.
function createIO(options = {}) {
  const VERSION = '1.2.0';
  const FE = '\u00fe', SEP = '\u0014';
  const CHUNK = options.chunkBytes || 1024 * 1024;
  const MAX_RECORD = options.maxRecord || 32 * 1024 * 1024;
  const MAX_FIELDS = 2000, MAX_IDS = 1000000;
  const progress = options.progress || (() => {});
  function fail(message) { throw new Error(message); }
  function hash() {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64), buf = new Uint8Array(64);
    let used = 0, total = 0, done = false;
    const rr = (x,n) => (x >>> n) | (x << (32-n));
    function compress(b) {
      for(let i=0;i<16;i++) { const j=i*4; w[i]=((b[j]<<24)|(b[j+1]<<16)|(b[j+2]<<8)|b[j+3])>>>0; }
      for(let i=16;i<64;i++) w[i]=(w[i-16]+(rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3))+w[i-7]+(rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10)))>>>0;
      let [a,b0,c,d,e,f,g,z]=h;
      for(let i=0;i<64;i++) {
        const t1=(z+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
        const t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b0)^(a&c)^(b0&c)))>>>0;
        z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b0;b0=a;a=(t1+t2)>>>0;
      }
      [a,b0,c,d,e,f,g,z].forEach((v,i)=>{h[i]=(h[i]+v)>>>0;});
    }
    return {
      update(bytes) {
        if(done) fail('Hash already finalized.');
        total+=bytes.length; let i=0;
        if(used) {const take=Math.min(64-used,bytes.length);buf.set(bytes.subarray(0,take),used);used+=take;i=take;if(used===64){compress(buf);used=0;}}
        while(i+64<=bytes.length){compress(bytes.subarray(i,i+64));i+=64;}
        if(i<bytes.length){buf.set(bytes.subarray(i));used=bytes.length-i;}
      },
      hex() {
        if(done) fail('Hash already finalized.'); done=true;
        const tail=new Uint8Array(used<56?64:128);tail.set(buf.subarray(0,used));tail[used]=128;
        const dv=new DataView(tail.buffer);dv.setUint32(tail.length-8,Math.floor(total/0x20000000));dv.setUint32(tail.length-4,(total%0x20000000)*8);
        for(let i=0;i<tail.length;i+=64)compress(tail.subarray(i,i+64));
        return Array.from(h,v=>v.toString(16).padStart(8,'0')).join('');
      }
    };
  }
  async function metadata(file) {
    if(!file || !file.size) fail('Empty files cannot be used.');
    const b=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(b[0]===0xff&&b[1]===0xfe&&b[2]===0&&b[3]===0 || b[0]===0&&b[1]===0&&b[2]===0xfe&&b[3]===0xff) fail('UTF-32 is not supported. Export UTF-8 or UTF-16 instead.');
    let encoding='utf-8',bom=[];
    if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf) bom=[0xef,0xbb,0xbf];
    else if(b[0]===0xff&&b[1]===0xfe){encoding='utf-16le';bom=[0xff,0xfe];}
    else if(b[0]===0xfe&&b[1]===0xff){encoding='utf-16be';bom=[0xfe,0xff];}
    if(encoding==='utf-8'&&b.includes(0)) fail('Unsupported encoding or UTF-16 without a BOM. Use UTF-8 or UTF-16 with a BOM.');
    return {encoding,bom};
  }
  async function textReader(file) {
    const meta=await metadata(file),hasher=hash(),reader={meta,digest:null};
    reader.chunks=async function*() {
      const dec=new TextDecoder(meta.encoding,{fatal:true,ignoreBOM:true});
      try {
        for(let offset=0;offset<file.size;offset+=CHUNK) {
          const end=Math.min(offset+CHUNK,file.size),bytes=new Uint8Array(await file.slice(offset,end).arrayBuffer());
          if(bytes.length!==end-offset)fail('Incomplete file read: '+file.name);
          hasher.update(bytes);
          const skip=Math.min(bytes.length,Math.max(0,meta.bom.length-offset));
          const text=dec.decode(bytes.subarray(skip),{stream:true});
          if(text)yield text;
          progress(file.name||'File',end/file.size);
        }
        const end=dec.decode();if(end)yield end;reader.digest=hasher.hex();
      } catch(e) {
        if(e instanceof TypeError)fail('Invalid encoding or unreadable file: '+file.name+' (only UTF-8/UTF-16 are supported)');
        throw e;
      }
    };
    return reader;
  }
  function splitDAT(raw,line=0) {
    if(raw.length>MAX_RECORD)fail('DAT row '+line+' exceeds the record size limit.');
    if(!raw.startsWith(FE)||!raw.endsWith(FE)||raw.length<2)fail('DAT row '+line+': invalid enclosing þ qualifiers.');
    let count=1;for(const c of raw)if(c===SEP&&++count>MAX_FIELDS)fail('DAT exceeds the 2,000-field limit.');
    return raw.split(SEP).map((col,i)=>{
      if(col.length<2||!col.startsWith(FE)||!col.endsWith(FE))fail('DAT row '+line+' / column '+(i+1)+': invalid field qualifiers.');
      const value=col.slice(1,-1);
      if(value.includes(FE)||/[\r\n]/.test(value))fail('DAT row '+line+' / column '+(i+1)+': unsupported literal þ or raw line break inside a field.');
      return value;
    });
  }
  async function datReader(file) {
    const r=await textReader(file);
    r.records=async function*() {
      let pending='',line=0;
      for await(const chunk of r.chunks()) {
        pending+=chunk;let start=0;const re=/\r\n|\r|\n/g;let m;
        while((m=re.exec(pending))) {
          if(m[0]==='\r'&&m.index===pending.length-1)break;
          const raw=pending.slice(start,m.index);start=m.index+m[0].length;
          yield {raw,eol:m[0],values:splitDAT(raw,++line),line};
        }
        pending=pending.slice(start);if(pending.length>MAX_RECORD)fail('DAT row '+(line+1)+' exceeds the 32 Mi-character record size limit.');
      }
      if(pending) {
        const eol=pending.endsWith('\r')?'\r':'';
        const raw=eol?pending.slice(0,-1):pending;
        yield {raw,eol,values:splitDAT(raw,++line),line};
      }
    };
    return r;
  }
  function tableParser(delim,onRow) {
    let row=[],cell='',quoted=false,afterQuote=false,atStart=true,active=false,skipLF=false,units=0;
    function field(){row.push(cell);cell='';atStart=true;afterQuote=false;if(row.length>MAX_FIELDS)fail('Table exceeds the 2,000-column limit.');}
    function record(){field();onRow(row);row=[];active=false;units=0;}
    return {
      feed(s) {
        for(const c of s) {
          if(skipLF){skipLF=false;if(c==='\n')continue;}
          if(++units>MAX_RECORD)fail('A CSV/pasted-table record exceeds the size limit.');
          if(quoted) {if(c==='"'){quoted=false;afterQuote=true;}else cell+=c;active=true;continue;}
          if(afterQuote) {
            if(c==='"'){cell+='"';quoted=true;afterQuote=false;continue;}
            if(c!==delim&&c!=='\r'&&c!=='\n')fail('Unexpected character after a closing CSV/table quote.');
          }
          if(c===delim){field();active=true;continue;}
          if(c==='\r'||c==='\n'){record();skipLF=c==='\r';continue;}
          if(c==='"'){if(!atStart)fail('Unexpected quote inside an unquoted CSV/table cell.');quoted=true;atStart=false;active=true;continue;}
          cell+=c;atStart=false;active=true;
        }
      },
      finish(){if(quoted)fail('Unclosed final CSV/table quote.');if(active||row.length||cell||afterQuote)record();}
    };
  }
  function checkHeaders(headers,label) {
    if(!headers.length)fail(label+' has no fields.');const seen=new Set();
    for(const h of headers){if(!h.trim())fail(label+' contains a blank field name.');if(seen.has(h))fail(label+' contains a duplicate field name: '+h);seen.add(h);}
  }
  async function listFormat(file) {
    // A DAT list starts with þ in its own encoding; anything else is read as CSV. A wrong guess fails in either parser.
    const meta=await metadata(file),b=new Uint8Array(await file.slice(meta.bom.length,meta.bom.length+4).arrayBuffer());
    return new TextDecoder(meta.encoding,{ignoreBOM:true}).decode(b).startsWith(FE)?'DAT':'CSV';
  }
  async function listScan(file,onData) {
    try {
      const format=await listFormat(file);let headers=null,count=0,r;
      const take=(row,line)=>{
        if(!headers){headers=row;checkHeaders(headers,format);return;}
        count++;if(count>MAX_IDS)fail(format+' exceeds the 1,000,000-document limit.');
        if(row.length!==headers.length)fail(format+' row '+line+': column count differs from its header.');
        if(row.every(v=>v===''))fail(format+' row '+line+': blank record.');
        if(onData)onData(row,headers,line);
      };
      if(format==='DAT'){r=await datReader(file);for await(const rec of r.records())take(rec.values,rec.line);}
      else{r=await textReader(file);const p=tableParser(',',row=>take(row,count+2));for await(const chunk of r.chunks())p.feed(chunk);p.finish();}
      if(!headers||!count)fail(format+' has no document records.');
      return {headers,count,format,meta:r.meta,hash:r.digest};
    } catch(e) {fail((file&&file.name||'Target list')+': '+e.message);}
  }
  function identity(value,label) {
    if(!value||value!==value.trim()||/[\u0000-\u0020\u007f]/.test(value))fail(label+': Bates value is blank or contains whitespace/control characters.');
    if(value.length>512)fail(label+': Bates value exceeds 512 characters.');
    if(/^[-+]?\d+(?:\.\d+)?[eE][-+]?\d+$/.test(value))fail(label+': scientific notation is not accepted. Export the original Bates string.');
    return value;
  }
  function encode(text,encoding) {
    if(encoding==='utf-8')return new TextEncoder().encode(text);
    if(!['utf-16le','utf-16be'].includes(encoding))fail('Unsupported output encoding.');
    const bytes=new Uint8Array(text.length*2),view=new DataView(bytes.buffer),le=encoding==='utf-16le';
    for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),le);return bytes;
  }
  return {hash,metadata,textReader,datReader,splitDAT,tableParser,checkHeaders,listScan,identity,encode};
}
if(typeof module!=='undefined')module.exports={createIO};
else globalThis.ProductionIO={createIO};