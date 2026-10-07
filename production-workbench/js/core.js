'use strict';
/* All business data stays in the calling browser/worker. No network APIs. */
function installProductionCore(root) {
  const IO = typeof module !== 'undefined' ? require('./io.js') : root.ProductionIO;
  const VERSION = '1.0.0-rc.2';
  const FE = '\u00fe', SEP = '\u0014';
  const OPS = ['copy','blank','constant','map','name','list-map','join','datetime','integer','pages','children'];
  // Input layouts are exact; letters name the captured parts (y m d, H 24h, h 12h, M minute, S second, A AM/PM).
  const DATE_INPUTS = {
    'MM/DD/YYYY HH:mm:ss':[/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,'mdyHMS'],
    'MM/DD/YYYY HH:mm':[/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/,'mdyHM'],
    'DD/MM/YYYY HH:mm:ss':[/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,'dmyHMS'],
    'YYYY-MM-DD HH:mm:ss':[/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,'ymdHMS'],
    'YYYY-MM-DD HH:mm':[/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/,'ymdHM'],
    'YYYY-MM-DDTHH:mm:ss':[/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,'ymdHMS'],
    'MM/DD/YYYY hh:mm:ss A':[/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/,'mdyhMSA'],
    'MM/DD/YYYY hh:mm A':[/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM)$/,'mdyhMA']
  };
  const DATE_FORMATS = Object.keys(DATE_INPUTS);
  // Ticket instruction: MM/DD/YYYY HH:MM, 24-hour. Seconds are dropped, never rounded; the seconds variant is optional.
  const DATE_OUTPUTS = ['MM/DD/YYYY HH:mm','MM/DD/YYYY HH:mm:ss'];
  const fail = message => { throw new Error(message); };
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function safeValue(v) {
    if(typeof v !== 'string' || /[\u00fe\r\n\u0000]/.test(v)) fail('Value contains an unsupported DAT qualifier, line break, or NUL.');
    for(let i=0;i<v.length;i++) {
      const c=v.charCodeAt(i);
      if(c>=0xd800&&c<=0xdbff){const d=v.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))fail('Unpaired Unicode surrogate.');}
      else if(c>=0xdc00&&c<=0xdfff)fail('Unpaired Unicode surrogate.');
    }
    return v;
  }
  function compose(values) {
    const s=values.map(v=>FE+safeValue(v)+FE).join(SEP);
    if(s.length>32*1024*1024)fail('Output record exceeds the 32 Mi-character limit.');
    return s;
  }
  function fieldSignature(f) {const {reviewSignature,...rest}=f;return JSON.stringify(rest);}
  function parsePairs(text) {
    if(typeof text!=='string'||text.length>2*1024*1024)fail('Mapping table is missing or too large.');
    if(!text)fail('Enter a two-column, tab-separated mapping table.');
    const rows=[],p=IO.createIO().tableParser('\t',row=>rows.push(row));p.feed(text);p.finish();
    const seen=new Set();
    for(const row of rows){if(row.length!==2)fail('Every mapping row must have exactly two tab-separated cells.');if(seen.has(row[0]))fail('Duplicate mapping source value: '+row[0]);seen.add(row[0]);row.forEach(safeValue);}
    return rows;
  }
  function parseHeaders(text) {
    const rows=[],p=IO.createIO().tableParser('\t',r=>rows.push(r));p.feed(text);p.finish();
    let headers;
    if(rows.length===1)headers=rows[0];else if(rows.every(r=>r.length===1))headers=rows.map(r=>r[0]);else fail('Paste one header row, or one header per line.');
    IO.createIO().checkHeaders(headers,'Output');headers.forEach(safeValue);return headers;
  }
  function parseScrubRules(text, fields, layout, keepText, clearText, blankAction) {
    const terms=s=>new Set(s.split(/\r\n|\r|\n/).map(v=>v.trim()).filter(Boolean));
    const keep=terms(keepText),clear=terms(clearText);
    if(!keep.size||!clear.size)fail('Define both Keep and Scrub expressions.');
    for(const v of keep)if(clear.has(v))fail('Expression belongs to both Keep and Scrub: '+v);
    if(!['review','keep','clear'].includes(blankAction))fail('Invalid blank-rule policy.');
    if(typeof text!=='string'||text.length>2*1024*1024)fail('Rule table is missing or too large.');
    const rows=[],p=IO.createIO().tableParser('\t',r=>rows.push(r));p.feed(text);p.finish();
    const raw=new Array(fields.length),labels=new Array(fields.length).fill(null);
    if(layout==='named') {
      const seen=new Set();for(const row of rows){if(row.length!==2)fail('Named rules require field name + expression.');const i=fields.findIndex(f=>f.name===row[0]);if(i<0)fail('Unknown output field: '+row[0]);if(seen.has(i))fail('Duplicate rule field: '+row[0]);seen.add(i);raw[i]=row[1];}
      if(seen.size!==fields.length)fail('Every output field needs an explicit rule.');
    } else if(layout==='ordered') {
      if(rows.length===1&&rows[0].length===fields.length)raw.splice(0,raw.length,...rows[0]);
      else {const width=rows[0]?.length;if(![1,2].includes(width)||rows.length!==fields.length||rows.some(r=>r.length!==width))fail('Ordered rule count differs from output field count.');rows.forEach((r,i)=>{raw[i]=r[width-1];if(width===2)labels[i]=r[0];});}
    } else fail('Unknown rule layout.');
    const actions={},warnings=[];
    fields.forEach((f,i)=>{const t=raw[i].trim();if(labels[i]!==null&&labels[i]!==f.name)warnings.push('Row '+(i+1)+': SOW name '+labels[i]+' differs from output '+f.name+'.');if(keep.has(t))actions[f.id]='keep';else if(clear.has(t))actions[f.id]='clear';else if(t===''&&blankAction!=='review')actions[f.id]=blankAction;else fail(f.name+': unresolved expression '+JSON.stringify(raw[i]));});
    return {actions,raw,labels,warnings};
  }
  function checkDateFormats(format, output) {
    if(!DATE_INPUTS[format])fail('Select an explicit supported input date format.');
    if(!DATE_OUTPUTS.includes(output))fail('Select an explicit output date format.');
    if(output.endsWith(':ss')&&!DATE_INPUTS[format][1].includes('S'))fail('The input format has no seconds; seconds are not invented. Choose MM/DD/YYYY HH:mm output.');
  }
  function formatDate(value, format, output) {
    checkDateFormats(format,output);
    const [re,order]=DATE_INPUTS[format],m=re.exec(value);
    if(!m)fail('Date does not match the selected input format '+format+'. Zones, fractional seconds and date-only values are not inferred.');
    const p={};[...order].forEach((k,i)=>{p[k]=m[i+1];});
    const y=Number(p.y),mo=Number(p.m),d=Number(p.d),mi=Number(p.M),s=p.S===undefined?0:Number(p.S);let h;
    if(p.h!==undefined){h=Number(p.h);if(h<1||h>12)fail('Invalid 12-hour clock.');h=h%12+(p.A==='PM'?12:0);}else h=Number(p.H);
    const leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(y<1||mo<1||mo>12||d<1||d>days[mo-1]||h>23||mi>59||s>59)fail('Invalid calendar date or time.');
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(mo)}/${pad(d)}/${String(y).padStart(4,'0')} ${pad(h)}:${pad(mi)}`+(output.endsWith(':ss')?':'+pad(s):'');
  }
  function integer(value, positive=false) {
    if(!/^(0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(Number(value))||(positive&&Number(value)<1))fail('Expected '+(positive?'a positive':'a nonnegative')+' integer; whitespace, signs and leading zeroes are not inferred.');return value;
  }
  // Validates one output field rule against source headers and group names. Used by the editor and by preflight.
  function checkField(f, headers, groupNames) {
    const index=(i,label)=>{if(!Number.isInteger(i)||i<0||i>=headers.length)fail(label+': select a valid source field.');return i;};
    if(typeof f.name!=='string'||!f.name.trim())fail('Output field name cannot be blank.');safeValue(f.name);
    const r=f.rule;if(!r||!OPS.includes(r.op))fail(f.name+': select a supported operation.');
    if(!['all','group'].includes(r.scope))fail(f.name+': select an operation scope.');
    if(!['copy','blank','constant','children','join','name'].includes(r.op))index(r.source,f.name);
    if(r.op==='copy')index(r.source,f.name);
    if(r.scope==='group') {index(r.source,f.name+' outside-scope copy');if(!groupNames.includes(r.group))fail(f.name+': selected scope group is missing.');}
    if(r.op==='constant')safeValue(r.value);
    if(['map','list-map'].includes(r.op)) {
      if(!Array.isArray(r.pairs)||!r.pairs.length)fail(f.name+': supply a value mapping table.');const seen=new Set();
      for(const p of r.pairs){if(!Array.isArray(p)||p.length!==2)fail('Invalid mapping row.');p.forEach(safeValue);if(seen.has(p[0]))fail('Duplicate mapping source value: '+p[0]);seen.add(p[0]);if(r.yn&&!['Y','N'].includes(p[1]))fail('Redacted mapping outputs must be Y or N.');}
      if(!['error','keep'].includes(r.unknown))fail('Select how unknown mapping values are handled.');
      if(r.yn&&r.unknown!=='error')fail('Y/N mapping must reject unknown values.');
      if(r.yn&&r.empty==='keep')fail('Y/N mapping cannot preserve blanks. Block them, or map a blank input explicitly (empty first cell).');
    }
    if(r.op==='list-map'){safeValue(r.delimiter);if(!r.delimiter||r.delimiter===',')fail('Select an explicit person delimiter; comma cannot distinguish Last, First names.');}
    if(r.op==='join'){if(!Array.isArray(r.sources)||!r.sources.length)fail('Select fields to join.');r.sources.forEach(i=>index(i,f.name));safeValue(r.delimiter);if(!r.delimiter)fail('Join delimiter is required.');}
    if(r.op==='name'){index(r.last,'Last name');index(r.first,'First name');}
    if(r.op==='datetime')checkDateFormats(r.format,r.outputFormat);
    if(['datetime','name','list-map','integer','map'].includes(r.op)&&!['keep','error'].includes(r.empty))fail('Select an empty-value policy.');
    if(r.op==='pages'){index(r.flag,'Placeholder flag');if(!Array.isArray(r.placeholder)||!r.placeholder.length||r.placeholder.some(v=>typeof v!=='string'||v===''))fail('Specify exact, nonempty placeholder flag values.');r.placeholder.forEach(safeValue);}
    if(r.op==='children') {index(r.parent,'Parent document ID');if(!['direct','descendants'].includes(r.mode)||!['every','roots'].includes(r.writeTo))fail('Confirm child-count mode and output rows.');}
    return f;
  }
  function createEngine(options={}) {
    const io=IO.createIO(options),limit=options.maxIds||1000000;
    async function inspect(file) {
      const r=await io.datReader(file);let headers,count=0,eol=null;const samples=[];
      for await(const rec of r.records()) {
        if(!headers){headers=rec.values;io.checkHeaders(headers,'Source');headers.forEach(safeValue);}
        else {if(rec.values.length!==headers.length)fail('Source row '+rec.line+': field count differs from header.');rec.values.forEach(safeValue);if(++count>limit)fail('Source exceeds the '+limit+'-document limit.');if(samples.length<3)samples.push(rec.values);}
        if(rec.eol){if(eol!==null&&eol!==rec.eol)fail('Mixed record line endings are not supported.');eol=rec.eol;}
      }
      if(!headers||!count)fail('Source has no document records.');return {headers,rows:count,meta:r.meta,hash:r.digest,eol,samples,file:fileInfo(file)};
    }
    function index(i,info,label){if(!Number.isInteger(i)||i<0||i>=info.headers.length)fail(label+': select a valid source field.');return i;}
    function validateSpec(input,info) {
      const spec=JSON.parse(JSON.stringify(input));
      if(spec.version!==1)fail('Unsupported job schema version.');
      index(spec.key,info,'Document identity');
      if(!Array.isArray(spec.fields)||!spec.fields.length||spec.fields.length>2000)fail('Output must have 1–2,000 fields.');
      io.checkHeaders(spec.fields.map(f=>f.name),'Output');const ids=new Set();
      if(!Array.isArray(spec.groups)||spec.groups.length>100)fail('A job supports at most 100 groups.');
      const groupNames=spec.groups.map(g=>g.name);
      for(const f of spec.fields) {
        if(typeof f.id!=='string'||!f.id||ids.has(f.id))fail('Missing or duplicate output field identifier.');ids.add(f.id);
        if(f.reviewSignature!==fieldSignature(f))fail('Review and confirm output field: '+f.name);
        checkField(f,info.headers,groupNames);
      }
      const names=new Set();
      for(const g of spec.groups) {
        if(typeof g.name!=='string'||!g.name.trim()||g.name==='all'||names.has(g.name))fail('Group names must be nonempty and unique; all is reserved.');names.add(g.name);
        if(!same(Object.keys(g.actions||{}).sort(),[...ids].sort())||Object.values(g.actions).some(a=>!['keep','clear'].includes(a)))fail(g.name+': every output field needs a Keep/Scrub rule. Reapply rules after changing fields.');
      }
      const identityFields=spec.fields.filter(f=>f.rule.op==='copy'&&f.rule.source===spec.key&&f.rule.scope==='all');
      if(!identityFields.length)fail('Keep an unchanged copy of the document identity field in the output.');
      if(spec.groups.some(g=>identityFields.some(f=>g.actions[f.id]!=='keep')))fail('Document identity fields must be kept in every group.');
      return spec;
    }
    async function groupsIndex(spec,files) {
      if(files.length!==spec.groups.length)fail('Select all group target-list files.');
      const members=new Map(),details=[];
      for(let i=0;i<spec.groups.length;i++) {
        const g=spec.groups[i],file=files[i],own=new Set();if(!file)fail(g.name+': target file missing.');
        const inf=await io.listScan(file,(row,h,line)=>{
          const k=h.indexOf(g.key);if(k<0)fail(g.name+': target identity column missing.');
          const id=io.identity(row[k],g.name+' row '+line);if(own.has(id))fail(g.name+': duplicate target identity '+id);own.add(id);
          let m=members.get(id);if(!m){if(members.size>=limit)fail('Target identity limit exceeded.');m={groups:[],found:false};members.set(id,m);}
          for(const n of m.groups){const other=spec.groups[n];if(spec.fields.some(f=>other.actions[f.id]!==g.actions[f.id]))fail('Conflicting group rules for '+id+': '+other.name+' / '+g.name);}
          m.groups.push(i);
        });
        if(g.loadedHash!==inf.hash)fail(g.name+': target file changed; reload it.');
        details.push({name:g.name,file:fileInfo(file),hash:inf.hash,rows:inf.count,matched:0});
      }
      return {members,details};
    }
    function compiledRules(spec) {return spec.fields.map(f=>({...f.rule,valueMap:['map','list-map'].includes(f.rule.op)?new Map(f.rule.pairs):null}));}
    function applyRule(r,row,id,ctx) {
      const value=Number.isInteger(r.source)?row[r.source]:'';
      if(r.scope==='group'&&!ctx.inGroups.has(r.group))return value;
      // An explicit blank row in a value map is a user instruction and takes precedence over the empty policy.
      if(['datetime','integer','map','list-map'].includes(r.op)&&value===''&&!r.valueMap?.has('')){if(r.empty==='keep')return '';fail('Empty source value requires review.');}
      function mapped(v){if(r.valueMap.has(v))return r.valueMap.get(v);if(r.unknown==='keep')return v;fail('Unmapped source value: '+JSON.stringify(v.slice(0,100)));}
      switch(r.op) {
        case 'copy':return value;
        case 'blank':return '';
        case 'constant':return r.value;
        case 'map':return mapped(value);
        case 'name':if(row[r.last]===''&&row[r.first]===''&&r.empty==='keep')return '';if(row[r.last]===''||row[r.first]==='')fail('A separate last-name or first-name value is missing.');return row[r.last]+', '+row[r.first];
        case 'list-map':return value.split(r.delimiter).map(mapped).join(';');
        case 'join':return r.sources.map(i=>row[i]).filter(v=>v!=='').join(r.delimiter);
        case 'datetime':return formatDate(value,r.format,r.outputFormat);
        case 'integer':return integer(value);
        case 'pages':return r.placeholder.includes(row[r.flag])?'1':integer(value,true);
        case 'children':{const rel=ctx.relations.get(r.parent);if(r.writeTo==='roots'&&rel.parents.get(id)!=='')return '';return String((r.mode==='direct'?rel.direct:rel.descendants).get(id)||0);}
        default:fail('Unsupported transformation.');
      }
    }
    function expectedRow(plan,row,id) {
      const member=plan.members.get(id),inGroups=new Set((member?.groups||[]).map(i=>plan.spec.groups[i].name));
      return plan.rules.map((r,i)=> {
        const field=plan.spec.fields[i];
        // Scrub runs last. Scrubbed values do not need Delivery Work interpretation.
        if(member&&plan.spec.groups[member.groups[0]].actions[field.id]==='clear')return '';
        try{return safeValue(applyRule(r,row,id,{inGroups,relations:plan.relations}));}
        catch(e){e.field=field.name;throw e;}
      });
    }
    async function relationships(source,spec,hash) {
      const columns=[...new Set(spec.fields.filter(f=>f.rule.op==='children').map(f=>f.rule.parent))],relations=new Map();
      if(!columns.length)return relations;
      const r=await io.datReader(source),ids=new Set();columns.forEach(i=>relations.set(i,{parents:new Map(),direct:new Map(),descendants:new Map()}));
      for await(const rec of r.records()) {if(rec.line===1)continue;const id=io.identity(rec.values[spec.key],'Row '+rec.line);if(ids.has(id))fail('Duplicate source identity: '+id);ids.add(id);
        for(const [col,rel]of relations){const parent=rec.values[col];if(parent!=='')io.identity(parent,'Parent ID');if(parent===id)fail('Self-parent relationship for '+id);rel.parents.set(id,parent);}
      }
      if(r.digest!==hash)fail('Source changed while building child counts.');
      for(const rel of relations.values()) {
        for(const [id,p]of rel.parents){if(p&&!ids.has(p))fail('Parent '+p+' of '+id+' is absent. Child counts require the complete relationship set.');if(p)rel.direct.set(p,(rel.direct.get(p)||0)+1);}
        const pending=new Map(),queue=[];for(const id of ids){const n=rel.direct.get(id)||0;pending.set(id,n);rel.descendants.set(id,0);if(!n)queue.push(id);}
        let visited=0;for(let at=0;at<queue.length;at++){const id=queue[at],p=rel.parents.get(id);visited++;if(p){rel.descendants.set(p,rel.descendants.get(p)+1+rel.descendants.get(id));pending.set(p,pending.get(p)-1);if(pending.get(p)===0)queue.push(p);}}
        if(visited!==ids.size)fail('Cycle in parent/child relationships.');
      }
      return relations;
    }
    async function preflight(source,input,files,loadedHash) {
      const info=await inspect(source);if(info.hash!==loadedHash)fail('Source changed since loading. Reload and review again.');
      const spec=validateSpec(input,info),{members,details}=await groupsIndex(spec,files),relations=await relationships(source,spec,info.hash);
      const plan={source,spec,members,relations,rules:compiledRules(spec),files:files.slice(),info,details};
      const reader=await io.datReader(source),seen=new Set(),samples=[],exceptions=[];let rows=0,exceptionCount=0,matched=0,changed=0,scrubbed=0,overlap=0,secondsDropped=0;
      const fieldStats=spec.fields.map(f=>({name:f.name,changed:0,scrubbed:0,secondsDropped:0}));
      const dropsSeconds=(r,before,after)=>r.op==='datetime'&&!r.outputFormat.endsWith(':ss')&&after!==''&&before!==after&&(()=>{const [re,order]=DATE_INPUTS[r.format],m=re.exec(before),k=order.indexOf('S');return !!m&&k>=0&&m[k+1]!=='00';})();
      for await(const rec of reader.records()) {
        if(rec.line===1)continue;const id=io.identity(rec.values[spec.key],'Source row '+rec.line);if(seen.has(id))fail('Duplicate source identity: '+id);seen.add(id);rows++;
        const member=members.get(id);if(member){member.found=true;matched++;if(member.groups.length>1)overlap++;member.groups.forEach(i=>details[i].matched++);}
        try {
          const expected=expectedRow(plan,rec.values,id);compose(expected);
          const diffs=[];expected.forEach((v,i)=>{const r=spec.fields[i].rule,before=Number.isInteger(r.source)?rec.values[r.source]:null;const clear=member&&spec.groups[member.groups[0]].actions[spec.fields[i].id]==='clear';if(before!==v){changed++;fieldStats[i].changed++;if(diffs.length<12)diffs.push({field:spec.fields[i].name,before:before?.slice(0,160)??'(computed)',after:v.slice(0,160)});}if(clear&&before!==''){scrubbed++;fieldStats[i].scrubbed++;}if(!clear&&dropsSeconds(r,before,v)){secondsDropped++;fieldStats[i].secondsDropped++;}});
          if(samples.length<8)samples.push({row:rec.line,id,groups:member?.groups.map(i=>spec.groups[i].name)||[],changes:diffs});
        }catch(e){exceptionCount++;if(exceptions.length<40)exceptions.push({row:rec.line,id,field:e.field||null,message:e.message});}
      }
      if(reader.digest!==info.hash||rows!==info.rows)fail('Source changed during preflight.');
      const missing=[...members].filter(([,v])=>!v.found);if(missing.length)fail(missing.length+' target identities are absent from DAT: '+missing.slice(0,5).map(([id])=>id).join(', '));
      const used=new Set();spec.fields.forEach(f=>{const r=f.rule;for(const k of ['source','first','last','flag','parent'])if(Number.isInteger(r[k]))used.add(r[k]);(r.sources||[]).forEach(i=>used.add(i));});
      const report={version:VERSION,valid:exceptionCount===0,source:info.file,sourceHash:info.hash,rows,fields:spec.fields.length,matched,untouched:rows-matched,changed,scrubbed,secondsDropped,overlap,groups:details,fieldStats,samples,exceptionCount,exceptions,omittedExceptions:Math.max(0,exceptionCount-exceptions.length),unusedSourceFields:info.headers.filter((_,i)=>!used.has(i)),schemaChanged:!same(info.headers,spec.fields.map(f=>f.name)),encoding:info.meta.encoding};
      plan.report=report;return {plan:report.valid?plan:null,report};
    }
    async function checkFiles(plan) {
      for(let i=0;i<plan.files.length;i++){const info=await io.listScan(plan.files[i]);if(info.hash!==plan.details[i].hash)fail('Target list changed after preflight: '+plan.details[i].name);}
    }
    async function transform(plan,emit) {
      if(!plan?.report.valid)fail('A valid preflight is required.');await checkFiles(plan);
      const reader=await io.datReader(plan.source),outHash=io.hash();let rows=0,bytes=0,pieces=[],size=0;
      async function flush(){if(!size)return;const b=new Uint8Array(size);let p=0;for(const v of pieces){b.set(v,p);p+=v.length;}await emit(b);pieces=[];size=0;}
      async function write(b){outHash.update(b);bytes+=b.length;pieces.push(b);size+=b.length;if(size>=1024*1024)await flush();}
      await write(new Uint8Array(plan.info.meta.bom));
      for await(const rec of reader.records()) {
        const values=rec.line===1?plan.spec.fields.map(f=>f.name):expectedRow(plan,rec.values,rec.values[plan.spec.key]);if(rec.line!==1)rows++;
        await write(io.encode(compose(values)+rec.eol,reader.meta.encoding));
      }
      if(reader.digest!==plan.info.hash||rows!==plan.info.rows)fail('Source changed during output generation.');await flush();return {hash:outHash.hex(),bytes,rows};
    }
    async function verify(plan,output,expected) {
      if(!plan||!expected)fail('Generate the approved output before verification.');await checkFiles(plan);
      const src=await io.datReader(plan.source),out=await io.datReader(output);
      if(!same(out.meta,plan.info.meta))fail('Saved encoding or BOM differs from source.');if(output.size!==expected.bytes)fail('Saved output size differs from expected.');
      const a=src.records()[Symbol.asyncIterator](),b=out.records()[Symbol.asyncIterator]();let rows=0;
      for(;;){const [s,o]=await Promise.all([a.next(),b.next()]);if(s.done&&o.done)break;if(s.done||o.done)fail('Saved record count differs from source.');const sv=s.value,ov=o.value;
        if(sv.eol!==ov.eol)fail('Saved line ending differs at row '+sv.line);const wanted=sv.line===1?plan.spec.fields.map(f=>f.name):expectedRow(plan,sv.values,sv.values[plan.spec.key]);
        if(!same(wanted,ov.values)) {const i=wanted.findIndex((v,i)=>v!==ov.values[i]);fail('Saved content mismatch at row '+sv.line+', field '+(plan.spec.fields[i]?.name||'(structure)'));}if(sv.line!==1)rows++;
      }
      if(src.digest!==plan.info.hash)fail('Source changed during verification.');if(out.digest!==expected.hash||rows!==plan.info.rows)fail('Saved full-file hash or count differs from expected.');
      return {version:VERSION,status:'PASS',scope:'Entire saved file re-read against original and approved field / Delivery Work / scrub plan',verifiedAt:new Date().toISOString(),output:fileInfo(output),outputHash:out.digest,sourceHash:src.digest,rows,bytes:output.size};
    }
    // Standalone validator reuses the same frozen plan; independently supplied output must match it.
    async function expectedDigest(plan) {return transform(plan,async()=>{});}
    return {inspect,preflight,transform,verify,expectedDigest,validateSpec,io};
  }
  function fileInfo(f){return {name:f.name,size:f.size,lastModified:f.lastModified};}
  const api={VERSION,OPS,DATE_FORMATS,DATE_OUTPUTS,createEngine,compose,safeValue,fieldSignature,checkField,parsePairs,parseHeaders,parseScrubRules,formatDate,integer};
  if(typeof module!=='undefined')module.exports=api;else root.ProductionCore=api;
}
installProductionCore(globalThis);
