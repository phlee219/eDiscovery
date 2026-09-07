import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const html=readFileSync(new URL('../field_mapper.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
class Element{
  constructor(){this.value='';this.checked=false;this.disabled=false;this.inert=false;this.style={};this.dataset={};this.children=[];this.files=[];this.textContent='';this.innerHTML='';this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
  addEventListener(type,fn){(this.listeners??=new Map()).set(type,fn);} appendChild(el){this.children.push(el);return el;} append(...els){this.children.push(...els);} remove(){} click(){} focus(){} setAttribute(){} removeAttribute(){} scrollIntoView(){} querySelector(){return new Element();} querySelectorAll(){return [];} closest(){return null;}
}
const elements=new Map();const get=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s);};
const document={querySelector:get,querySelectorAll:s=>s==='main, .topbar'?[get('main'),get('.topbar')]:[],getElementById:id=>get('#'+id),createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:new Element(),addEventListener(){}};
let handle;const messages=[];
const errors=[];
const context=vm.createContext({console:{...console,error:err=>errors.push(String(err))},TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint32Array,DataView,ArrayBuffer,File,Blob,URL,document,
  window:{addEventListener(){},showSaveFilePicker:async()=>handle},navigator:{},requestAnimationFrame:fn=>fn(),
  setTimeout:(fn,ms)=>ms>100?0:setTimeout(fn,ms),clearTimeout,alert:m=>messages.push(m),confirm:()=>false});
vm.runInContext(source,context);
const run=s=>vm.runInContext(s,context);
assert.equal(run('coreSelfTestOk'),true);assert.equal(run('SHA256_SELF_TEST_OK'),true);
const declaredVersion=/Field Mapper v([0-9.]+)/.exec(html)?.[1];
assert.equal(declaredVersion,run('TOOL_VERSION'),'HTML release comment and runtime TOOL_VERSION must match');
assert.equal(run('TOOL_BUILD'),'2026-09-06-h7','runtime build metadata must match the release build');
run('toast=msg=>__messages.push(msg); showSaveWarnings=toast;');
context.__messages=messages;
const inputRows=[['DOCID','NAME','TEXT'],['D1','Alice','한국어 😀'],['D2','Bob',''],['D3','Carol','  ®  ']];
context.inputRows=inputRows;
context.input=new File([new TextEncoder().encode(run("inputRows.map(feCompose).join('\\r\\n')+'\\r\\n'"))],'source.dat');
async function setup(){errors.length=0;await run('loadFile(input)');assert.deepEqual(errors,[]);assert.equal(run('state.parseInfo.dataRecords'),3);run('state.orderTarget=[2,0]; cl.rows=[{name:"ID",mapped:0},{name:"Body",mapped:2},{name:"Copy",mapped:2}];');}
let disk,closed,aborted;
function sink({corrupt=false,failWrite=false}={}){
  disk=new File([],'output.dat');closed=0;aborted=0;const chunks=[];
  handle={getFile:async()=>disk,createWritable:async()=>({write:async b=>{if(failWrite)throw Error('disk full');chunks.push(new Uint8Array(b));},abort:async()=>{aborted++;},close:async()=>{closed++;const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());if(corrupt)bytes[bytes.length-5]^=1;disk=new File([bytes],'output.dat');}})};
}
let passed=1;console.log('PASS whole page bootstrap and startup self-tests');
// v2.18.2 local-only static guards: CSP forbids network fetch/connect and the
// shipped HTML must not reference external origins or legacy network dials.
assert.match(html,/connect-src 'none'/);
for(const banned of ['fetch(','XMLHttpRequest','new WebSocket','navigator.sendBeacon','EventSource(','<script src=','href="http://','href="https://','src="http','src="https']) assert(!html.includes(banned),'banned token present: '+banned);
passed++;console.log('PASS local-only CSP and no external-resource guards');
for(const mode of ['reorder','client']){
  await setup();sink();messages.length=0;
  await run(mode==='client'?'saveClientFile()':'saveFile()');
  assert.equal(closed,1);assert.equal(run('lastSavedDiskBacked'),true);assert.equal(get('main').inert,false);
  const bytes=new Uint8Array(await disk.arrayBuffer());assert.equal(run('lastSavedOutHash'),createHash('sha256').update(bytes).digest('hex'));
  const expected=mode==='client'?[['ID','Body','Copy'],...inputRows.slice(1).map(r=>[r[0],r[2],r[2]])]:inputRows.map(r=>[r[2],r[0]]);
  context.expected=expected;assert.equal(new TextDecoder().decode(bytes),run("expected.map(feCompose).join('\\r\\n')+'\\r\\n'"));
  context.saved=disk;await run("valLoadSide('src',input,false); ");await run("valLoadSide('out',saved,false)");
  run(mode==='client'?'validator.mapping=[0,2,2]':'validator.mapping=[2,0]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
  await run('valRunValidate()');assert.match(run('valReportText'),/PARSED-VALUE PASS/);
  passed++;console.log('PASS '+mode+' save → disk bytes → mapped validator (audit disabled)');
  // A different valid manual pair must not inherit the saved hashes.
  context.manual=new File([new TextEncoder().encode('þDOCIDþ\u0014þTEXTþ\r\nþM1þ\u0014þDifferentþ\r\n')],'manual.dat');
  await run("valLoadSide('src',manual,false)");await run("valLoadSide('out',manual,false)");run('validator.mapping=[0,1]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
  await run('valRunValidate()');assert.match(run('valReportText'),/PARSED-VALUE PASS/);assert(!run('valReportText').includes('Saved==Disk'));
  passed++;console.log('PASS unrelated manual validation does not use saved hashes');
  await setup();sink({corrupt:true});messages.length=0;await run(mode==='client'?'saveClientFile()':'saveFile()');
  assert.equal(run('lastSavedDiskBacked'),false);assert.equal(run('lastSavedMode'),null);assert(messages.some(m=>m.includes('INCOMPLETE')));
  passed++;console.log('PASS '+mode+' same-size disk corruption never reports usable save');
  // Audit failures must agree with the usability state, and name the actual
  // re-read scope instead of claiming that no re-read occurred.
  await setup();sink({corrupt:true});get(mode==='client'?'#clAuditCbx':'#reorderAuditCbx').checked=true;
  await run(mode==='client'?'saveClientFile()':'saveFile()');
  assert.match(run('auditText'),/FAILED — OUTPUT UNUSABLE/);assert.match(run('auditText'),/selected disk file/);assert.match(run('auditText'),/Re-read SHA-256/);
  get(mode==='client'?'#clAuditCbx':'#reorderAuditCbx').checked=false;
  passed++;console.log('PASS '+mode+' audit records failed byte check and disk scope');
  await setup();sink({failWrite:true});messages.length=0;await run(mode==='client'?'saveClientFile()':'saveFile()');
  assert.equal(closed,0);assert(aborted>0);assert.equal(run('lastSavedDiskBacked'),false);assert.equal(get('main').inert,false);
  passed++;console.log('PASS '+mode+' disk-full abort and UI unlock');
}
await setup();sink();run('state.parseInfo.dataRecords=99');await run('saveFile()');assert.equal(closed,0);assert(aborted>0);
passed++;console.log('PASS record reconciliation blocks commit');
await setup();sink();let release;context.gate=new Promise(r=>release=r);run('const originalPreflight=requireSafePreflight; requireSafePreflight=async()=>{await gate; return true;}');
const saving=run('saveFile()');await new Promise(r=>setTimeout(r,5));assert.equal(get('main').inert,true);await run('saveClientFile()');assert(messages.some(m=>m.includes('already in progress')));release();await saving;assert.equal(get('main').inert,false);
passed++;console.log('PASS saving locks keyboard/mapping UI and concurrent saves');
run('requireSafePreflight=originalPreflight');
// Invalid indices must never be converted into empty source values.
run('validator.mapping=[0,NaN]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;await run('valRunValidate()');assert.equal(run('valReportText'),'');assert(messages.some(m=>m.includes('invalid source column index')));
passed++;console.log('PASS invalid validator mapping cannot reuse an old PASS');
// A readable File snapshot can be replaced in a provider without changing its
// size/name. Bind every later pass to the bytes actually analyzed.
let mutableBytes=new Uint8Array(await context.input.arrayBuffer());
context.mutable={name:'mutable.dat',get size(){return mutableBytes.length;},slice(start,end){return new Blob([mutableBytes.slice(start,end)]);}};
await run('loadFile(mutable)');run('state.orderTarget=[0,2]');
mutableBytes=new TextEncoder().encode(new TextDecoder().decode(mutableBytes).replace('Alice','Elise'));
sink();await run('saveFile()');assert.equal(closed,0,'changed source bytes must block commit even in a removed column');
passed++;console.log('PASS source fingerprint prevents changes between analysis and write');
await run("valLoadSide('src',mutable,false)");await run("valLoadSide('out',mutable,false)");run('validator.mapping=[0,1,2]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
mutableBytes=new TextEncoder().encode(new TextDecoder().decode(mutableBytes).replace('Elise','Alice'));
await run('valRunValidate()');assert(!run('valReportText').includes('PARSED-VALUE PASS'),'both changed files must not pass against old analysis');
passed++;console.log('PASS validator binds comparison to analyzed file fingerprints');
await setup();sink();await run('saveFile()');
// The old saved File object remains readable while the handle now returns a
// changed destination: one-click must reacquire the current disk file.
const oldDisk=disk;disk=new File([new TextDecoder().decode(await disk.arrayBuffer()).replace('D1','Z1')],'output.dat');
await run('launchSavedValidation()');await new Promise(r=>setTimeout(r,80));
assert.equal(run('validator.out'),disk,'one-click must reacquire the current destination File snapshot');
assert.equal(get('#valApproveIdentity').checked,false,'seeded identity suggestion must not be auto-approved');
assert.equal(run('valReportText'),'','one-click must not auto-start validation before identity approval');
passed++;console.log('PASS one-click reopens current destination and waits for identity approval');
context.badFile=new File(['not a DAT'],'bad.dat');await run('loadFile(badFile)');assert.equal(run('state.file'),null,'failed direct load must invalidate the prior source');
passed++;console.log('PASS every loader entry invalidates stale source');
await setup();let releaseRead;let firstRead=true;
context.pendingFile={name:'pending.dat',size:context.input.size,slice(start,end){return {arrayBuffer:async()=>{
  if(firstRead){firstRead=false;await new Promise(r=>{releaseRead=r;});}
  return context.input.slice(start,end).arrayBuffer();
}};}};
const pending=run('loadFile(pendingFile)');await new Promise(r=>setTimeout(r,5));
assert.equal(run('state.parsing'),true);await run('loadFile(input)');releaseRead();await pending;
assert.equal(run('state.file'),context.input);assert.equal(run('state.parsing'),false);
get('#fmtOverride').value='fe';await get('#fmtOverride').listeners.get('change')();assert.equal(run('state.file'),context.input);assert.equal(typeof run('state.parseInfo.byteHash'),'string');
passed++;console.log('PASS overlapping loads and re-parse use one transaction');
assert.throws(()=>run("parsePastedClientHeaders('DOCID\\tID\\nNAME\\t')"),/blank|column|width/i);
assert.throws(()=>run("parsePastedClientHeaders('DOCID\\tID\\textra\\nNAME\\tName\\textra')"),/column|width/i);
assert.equal(run("parsePastedClientHeaders('Export\\tClient Field\\nDOCID\\tID').length"),2,'real field names must not be guessed to be a title row');
passed++;console.log('PASS ambiguous pasted maps are blocked without dropping fields');
context.blankHeaders=new File(['þDOCIDþ\u0014þþ\r\nþD1þ\u0014þvþ\r\n'],'blank.dat');
await run("valLoadSide('src',blankHeaders,false)");await run("valLoadSide('out',blankHeaders,false)");run('validator.mapping=[0,1]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;await run('valRunValidate()');
assert(!run('valReportText').includes('PARSED-VALUE PASS'));
passed++;console.log('PASS validator rejects blank delivery headers');
assert.equal(run("parsePastedClientHeaders('DOCID\\tDelivery ID',true)[0].hint"),'DOCID');
assert.equal(run("parsePastedClientHeaders('\\tDelivery ID\\nDOCID\\tID')[0].hint"),'');
assert(run("valEscapeForReport('x'.repeat(100000)).length")<2200);
assert.match(run("valEscapeForReport('A\\u0014B')"),/\\u0014/);
passed++;console.log('PASS one-row renamed map, explicit blank source, and bounded report samples');
await setup();sink();run("requireSafePreflight=async()=>{throw new Error('preflight read failure');}");
await run('saveFile()');run('requireSafePreflight=originalPreflight');assert.equal(closed,0);assert.equal(get('main').inert,false);
assert(run("operationErrors.entries.some(e=>e.operation==='save-preflight')"));
passed++;console.log('PASS preflight failure restores interaction and records structured error');
for(const phase of ['close','reopen']){
  await setup();sink();const base=handle;let reads=0;
  handle={getFile:async()=>{reads++;if(phase==='reopen' && reads>1)throw Error('saved file unreadable');return base.getFile();},createWritable:async()=>{
    const writer=await base.createWritable();if(phase==='close')writer.close=async()=>{throw Error('close failed');};return writer;
  }};
  await run('saveFile()');assert.equal(run('lastSavedDiskBacked'),false);assert.equal(get('main').inert,false);
}
passed++;console.log('PASS close and saved-file reopen errors never qualify as usable output');
const priorTotal=run('operationErrors.total');for(let i=0;i<110;i++)run("reportOperationError('test',new Error('x'.repeat(10000)))");
assert.equal(run('operationErrors.entries.length'),100);assert.equal(run('operationErrors.total'),priorTotal+110);assert(run('operationErrors.omitted')>0);
assert(run('operationErrors.entries.every(e=>e.message.length<=2048 && e.identity===null)'));
passed++;console.log('PASS structured error report stays bounded with truthful unknown identity');
// v2.18.2: pasted client headers are preserved verbatim (no implicit trim).
const kept=run("parsePastedClientHeaders(' Control Number \\tCONTROLNO\\n  Bates  \\tBEGDOC ')");
assert.equal(kept.length,2);
assert.equal(kept[0].name,'CONTROLNO');assert.equal(kept[0].hint,' Control Number ');
assert.equal(kept[1].name,'BEGDOC ');assert.equal(kept[1].hint,'  Bates  ');
const vert=run("parsePastedClientHeaders(' Control Number \\nCustodian')");
assert.equal(vert[0].name,' Control Number ');
assert.equal(vert[1].name,'Custodian');
passed++;console.log('PASS pasted client-header whitespace is preserved verbatim');
// v2.18.2: validator identity fallback stores a SOURCE index, not an output
// column index (mapping=[8,2,5] previously selected output column 0).
context.wideRows=[['F0','F1','F2','F3','F4','F5','F6','F7','F8','F9'],['a','b','c','d','e','f','g','h','i','j']];
context.wideFile=new File([new TextEncoder().encode(run("wideRows.map(feCompose).join('\\r\\n')+'\\r\\n'"))],'wide.dat');
await run("valLoadSide('src',wideFile,false)");await run("valLoadSide('out',wideFile,false)");
run("validator.mapping=[8,2,5]");run('identityUserChoice=null; valSelectMappedIdentity()');
assert.equal(get('#valIdentityField').value,'8');
passed++;console.log('PASS validator identity fallback selects the mapped SOURCE column');
// v2.18.2: a blocked validation start surfaces as BLOCKED, never a stale result.
run('validator.mapping=null');get('#valIdentityField').value='0';messages.length=0;
await run('valRunValidate()');
assert.equal(get('#valStatusBadge').textContent,'BLOCKED');
assert(messages.some(m=>m.includes('mapping')));
passed++;console.log('PASS blocked validation start surfaces BLOCKED immediately');
// v2.18.2: abort/cleanup failures are recorded and surfaced, never swallowed.
await setup();messages.length=0;let cleanupAborts=0;
const cleanupDisk=new File([],'output.dat');
handle={getFile:async()=>cleanupDisk,createWritable:async()=>({
  write:async()=>{throw new Error('disk write failed');},
  abort:async()=>{cleanupAborts++;throw new Error('abort also failed');},
  close:async()=>{throw new Error('must not close');}
})};
await run('saveFile()');
assert(cleanupAborts>=1);
assert(run("operationErrors.entries.some(e=>e.operation==='reorder-save-cleanup')"));
assert(messages.some(m=>m.includes('cleanup/abort also failed')));
passed++;console.log('PASS abort/cleanup failure is recorded and reported');
// v2.18.3: identity suggestions are never approvals.
await run("valLoadSide('src',wideFile,false)");await run("valLoadSide('out',wideFile,false)");
run("validator.mapping=[0,1,2,3,4,5,6,7,8,9]; validator.mappingTiers=new Array(10).fill(1); identityUserChoice=null; valSelectMappedIdentity()");
assert.notEqual(get('#valIdentityField').value,'');assert.equal(get('#valApproveIdentity').checked,false);
messages.length=0;await run('valRunValidate()');assert.equal(get('#valStatusBadge').textContent,'BLOCKED');assert(messages.some(m=>m.includes('approve')));
passed++;console.log('PASS suggested identity requires explicit operator approval');
// T2 auto matches require approval in client save and Validator.
await setup();run("cl.rows=[{name:'doc id',hint:null,mapped:null,tier:null}]");get('#clTierSel').value='2';get('#btnClAutoGuess').listeners.get('click')();
assert.equal(run('cl.rows[0].tier'),2);assert.equal(get('#clApproveT2').checked,false);messages.length=0;await run('saveClientFile()');assert(messages.some(m=>m.includes('T2')));
await run("valLoadSide('src',input,false)");await run("valLoadSide('out',input,false)");get('#valTierSel').value='2';run('valAutoMap()');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
// Force one safe normalized T2 provenance while retaining a full valid map.
run('validator.mapping=[0,1,2]; validator.mappingTiers=[2,1,1]');get('#valApproveT2').checked=false;messages.length=0;await run('valRunValidate()');assert.equal(get('#valStatusBadge').textContent,'BLOCKED');assert(messages.some(m=>m.includes('T2')));
get('#valApproveT2').checked=true;await run('valRunValidate()');assert.match(run('valReportText'),/PARSED-VALUE PASS/);
passed++;console.log('PASS T2 mappings require explicit approval before save or validation');
// Pasted structures fail closed: no blank rows/columns or extra empty columns
// are silently removed; vertical names retain exact whitespace.
assert.throws(()=>run("parsePastedClientHeaders('A\\n\\nB')"),/row 2.*blank/i);
assert.throws(()=>run("parsePastedClientHeaders('A\\tB\\t')"),/column 3.*blank|more than|exactly two/i);
assert.throws(()=>run("parsePastedClientHeaders('A\\tB\\t\\nC\\tD\\t')"),/exactly two/i);
assert.throws(()=>run("parsePastedClientHeaders('A\\tB\\nC\\t')"),/blank output/i);
const preservedVertical=run("parsePastedClientHeaders(' A \\nB ')");assert.equal(preservedVertical[0].name,' A ');assert.equal(preservedVertical[1].name,'B ');
passed++;console.log('PASS pasted map blank structure is blocked without silent deletion');
// Cooperative cancellation wakes both pair producers and always releases the
// validation lock so another run can start.
const slowRows=[['DOCID','V']];for(let i=0;i<3000;i++)slowRows.push(['D'+i,String(i)]);
context.slowRows=slowRows;context.slow=new File([new TextEncoder().encode(run("slowRows.map(feCompose).join('\\r\\n')+'\\r\\n'"))],'slow.dat');
await run("valLoadSide('src',slow,false)");await run("valLoadSide('out',slow,false)");run('validator.mapping=[0,1];validator.mappingTiers=[1,1]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
const originalSplit=run('valSplitRow');context.__originalSplit=originalSplit;run("valSplitRow=(fmt,raw)=>{ const until=Date.now()+1; while(Date.now()<until){} return __originalSplit(fmt,raw); }");
const running=run('valRunValidate()');await new Promise(r=>setTimeout(r,10));get('#btnCancelValidation').listeners.get('click')();await running;run('valSplitRow=__originalSplit');
assert.equal(run('validationActive'),false);assert.equal(run('currentValidationOperation'),null);assert.equal(get('#valStatusBadge').textContent,'CANCELLED');assert.equal(run('valReportText'),'');
passed++;console.log('PASS validator cancellation stops producers and releases the operation lock');
// A settings change during validation cancels the old run and leaves the
// engine reusable (regression for validationActive staying true forever).
await run("valLoadSide('src',slow,false)");await run("valLoadSide('out',slow,false)");run('validator.mapping=[0,1];validator.mappingTiers=[1,1]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;
context.__originalSplit=run('valSplitRow');run("valSplitRow=(fmt,raw)=>{ const until=Date.now()+1; while(Date.now()<until){} return __originalSplit(fmt,raw); }");
const superseded=run('valRunValidate()');await new Promise(r=>setTimeout(r,10));run("valInvalidateResult('Mapping changed during validation')");await superseded;run('valSplitRow=__originalSplit');
assert.equal(run('validationActive'),false);assert.equal(run('currentValidationOperation'),null);
run('validator.mapping=[0,1];validator.mappingTiers=[1,1]');get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;await run('valRunValidate()');assert.match(run('valReportText'),/PARSED-VALUE PASS/);
passed++;console.log('PASS superseded validation releases lock and permits a clean rerun');
// Cross-side loads maintain separate busy owners: completion of src must not
// hide busy while out is still pending.
let releaseOut;let firstOut=true;context.pendingOut={name:'pending-out.dat',size:context.input.size,slice(start,end){return {arrayBuffer:async()=>{if(firstOut){firstOut=false;await new Promise(r=>{releaseOut=r;});}return context.input.slice(start,end).arrayBuffer();}};}};
const outLoading=run("valLoadSide('out',pendingOut,false)");await new Promise(r=>setTimeout(r,5));await run("valLoadSide('src',input,false)");assert(run('busyOwners.size')>0);releaseOut();await outLoading;assert.equal(run('busyOwners.size'),0);
passed++;console.log('PASS cross-side validator loads preserve busy ownership');
// T2 approval is invalidated whenever a mapping changes.
await setup();run("cl.rows=[{name:'doc id',hint:null,mapped:0,tier:2}];cl.sel=0");get('#clApproveT2').checked=true;get('#clApproveT2').listeners.get('change')();run('clMapSrcToRow(1,0)');assert.equal(get('#clApproveT2').checked,false);
passed++;console.log('PASS mapping changes invalidate prior T2 approval');
// Validator mapping reconstruction invalidates identity approval even when an
// explicit identity selection remains applicable by source index/name.
await run("valLoadSide('src',input,false)");await run("valLoadSide('out',input,false)");run("identityUserChoice={name:'DOCID',index:0}");get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;run('valAutoMap()');assert.equal(get('#valApproveIdentity').checked,false);
passed++;console.log('PASS mapping reconstruction invalidates prior identity approval');
// v2.18.4: pasted validator maps retain truthful per-column provenance. A
// normalized source-name resolution is T2 (approval required), exact is
// manual-exact, and output columns omitted from the pasted map stay unresolved.
await run("valLoadSide('src',input,false)");await run("valLoadSide('out',input,false)");
context.__pairs=[{src:'doc id',out:'DOCID'},{src:'NAME',out:'NAME'}];run('valBuildMapFromPairs(__pairs)');
assert.equal(run('validator.mapping[0]'),0);assert.equal(run('validator.mappingTiers[0]'),2);
assert.equal(run('validator.mapping[1]'),1);assert.equal(run('validator.mappingTiers[1]'),'manual-exact');
assert.equal(run('validator.mapping[2]'),null);assert.equal(run('validator.mappingTiers[2]'),null);
get('#valIdentityField').value='0';get('#valApproveIdentity').checked=true;messages.length=0;await run('valRunValidate()');assert.equal(get('#valStatusBadge').textContent,'BLOCKED');
get('#valApproveT2').checked=true;run('validator.expectedBlank.add(2)');assert.equal(run('validationPreflightBlock()'),null);
passed++;console.log('PASS pasted validator map provenance is truthful and missing columns stay unresolved');
console.log(`\n${passed} DOM/save/validator integration groups passed (mock File System Access).`);
