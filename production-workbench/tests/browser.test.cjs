'use strict';
// Developer-only Chrome tests: actual DOM, Worker, CSP, file inputs, downloads and saved-file re-reads.
// Scope limits (reported in test-results/browser-results.json):
//  - Downloads are captured through Playwright's download event, not the user's Downloads folder.
//  - The streaming-save section replaces only showSaveFilePicker with an Origin Private File System handle.
//    Writes, close, abort and getFile use Chrome's real FileSystemWritableFileStream, but no OS save dialog
//    or user-visible disk folder is involved. Failure and delay injection wrap that real stream.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startServer}=require('./preview.cjs'),C=require('../js/core.js');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{console.error('Developer browser tests require Playwright. Set PLAYWRIGHT_MODULE to an existing installation. End users need no installation.');process.exit(2);}
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const headers=['ID','Value','Sent','Type','Page','Placeholder','Last','First','Names','Parent','Redaction'];
const rows=[['P','secret','2026-10-01 13:04:05','Mail','4','No','Kim','Jane','Jane Kim;John Doe','','True'],['C','keep','2026-10-02 00:00:00','IM','','Slip','Doe','John','John Doe','P','False']];
const datBytes=list=>Buffer.from(list.map(C.compose).join('\r\n')+'\r\n');
const bytes=datBytes([headers,...rows]);
const requests=[],errors=[],checks=[];let browser,server,downloads=0;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const waitBadge=(p,text)=>p.waitForFunction(t=>document.querySelector('#stateBadge').textContent===t,text);
const waitIdle=p=>p.waitForFunction(()=>document.querySelector('#progressBox').hidden);
const ui=p=>p.evaluate(()=>({badge:document.querySelector('#stateBadge').textContent,status:document.querySelector('#status').textContent,verification:document.querySelector('#verification').textContent,pending:!document.querySelector('#downloadPending').hidden,reportDisabled:document.querySelector('#downloadReport').disabled,saveDisabled:document.querySelector('#saveOutput').disabled,verifyDisabled:document.querySelector('#verifyOutput').disabled,approved:document.querySelector('#approvePlan').checked,preflightShown:!document.querySelector('#preflightPanel').hidden}));
async function assertNoPass(p,label,{approvalCleared=true}={}){
  const s=await ui(p);
  assert.notEqual(s.badge,'PASS',label+': badge');assert.ok(!s.verification.startsWith('PASS'),label+': verification panel');assert.equal(s.pending,false,label+': pending download notice');
  assert.ok(s.reportDisabled,label+': audit report button');
  if(approvalCleared){assert.ok(s.saveDisabled,label+': save button');assert.ok(s.verifyDisabled,label+': verify button');assert.equal(s.approved,false,label+': approval');assert.equal(s.preflightShown,false,label+': preflight panel');}
}
(async()=>{
 const started=await startServer(0,r=>requests.push(r.url));server=started.server;
 const executablePath=process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined);
 browser=await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1512,height:980}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
 await page.goto(started.url);await page.waitForSelector('#version');await page.screenshot({path:path.join(out,'01-source.png'),fullPage:true});
 await check('initial screen loads with strict CSP and no script errors',async()=>{assert.match(await page.title(),/Production Workbench/);assert.equal(errors.length,0);assert.ok(await page.locator('#saveOutput').isDisabled());});
 const initialRequests=requests.length;
 const tab=name=>page.locator(`[data-tab="${name}"]`).click();
 async function loadSource(buffer,name='synthetic.dat'){await tab('source');await page.locator('#sourceFile').setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.waitForFunction(n=>document.querySelector('#sourceInfo').textContent.includes(n),name);await waitIdle(page);}
 await loadSource(bytes);await page.locator('#identity').selectOption('0');await tab('fields');await page.locator('#confirmCopies').click();
 const editorError=()=>page.locator('#editorError').textContent();
 async function edit(name,op,fn){await page.getByRole('button',{name,exact:true}).click();if(op)await page.locator('#operation').selectOption(op);if(fn)await fn();await page.locator('#confirmField').click();assert.equal(await editorError(),'',name);}
 async function add(name,op,fn){await page.locator('#addField').click();await page.locator('#outputHeader').fill(name);await page.locator('#operation').selectOption(op);if(fn)await fn();await page.locator('#confirmField').click();assert.equal(await editorError(),'',name);}
 await check('all screenshot rule families are configurable in the actual browser',async()=>{
   await edit('Sent','datetime',async()=>{await page.locator('#opt-format').selectOption('YYYY-MM-DD HH:mm:ss');await page.locator('#opt-outputFormat').selectOption('MM/DD/YYYY HH:mm');});
   await edit('Type','map',async()=>{await page.locator('#opt-pairs').fill('Mail\tEmail\nIM\tChat');});
   await edit('Page','pages',async()=>{await page.locator('#opt-flag').selectOption('5');await page.locator('#opt-placeholder').fill('Slip\n');});
   await edit('Names','list-map',async()=>{await page.locator('#opt-pairs').fill('Jane Kim\tKim, Jane\nJohn Doe\tDoe, John');});
   await edit('Redaction','map',async()=>{await page.locator('#opt-pairs').fill('True\tY\nFalse\tN');await page.locator('#opt-yn').check();});
   await add('Custodian','name',async()=>{await page.locator('#opt-last').selectOption('6');await page.locator('#opt-first').selectOption('7');});
   await add('Attachment Count','children',async()=>{await page.locator('#opt-parent').selectOption('9');});
   await add('Confidentiality','constant',async()=>{await page.locator('#opt-value').fill('CONFIDENTIAL');});
   assert.match(await page.locator('#fieldCount').textContent(),/^14 output fields · 14 confirmed$/);
 });
 await check('incomplete rules are rejected in the editor and never marked confirmed',async()=>{
   await page.getByRole('button',{name:'Sent',exact:true}).click();await page.locator('#opt-outputFormat').selectOption('');await page.locator('#confirmField').click();assert.match(await editorError(),/output date format/);
   await page.locator('#discardDraft').click();await page.getByRole('button',{name:'Redaction',exact:true}).click();await page.locator('#opt-empty').selectOption('keep');await page.locator('#confirmField').click();assert.match(await editorError(),/cannot preserve blanks/);
   await page.locator('#discardDraft').click();assert.match(await page.locator('#fieldCount').textContent(),/14 confirmed/);
 });
 const card=page.locator('.group-card').first();
 async function applyGroupRules(){await card.getByRole('button',{name:'Set all fields to Keep'}).click();const area=card.locator('textarea[id^="group-rules-"]');await area.fill((await area.inputValue()).replace('Value\tPopulate','Value\tScrub'));await card.getByRole('button',{name:'Apply rule table',exact:true}).click();await card.locator('input[id^="group-review-"]').check();}
 async function loadTargets(text,name='targets.csv'){await card.locator('input[type=file]').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});await page.waitForFunction(n=>document.querySelector('.group-info')?.textContent.includes(n),name);await waitIdle(page);}
 await tab('groups');await page.locator('#addGroup').click();await card.locator('input[id^="group-name-"]').fill('Email');await card.locator('input[id^="group-name-"]').dispatchEvent('change');
 await loadTargets('ID\r\nP\r\n');await card.locator('select[id^="group-key-"]').selectOption('ID');await applyGroupRules();
 async function reachPass(){
   await tab('review');await page.locator('#runPreflight').click();await waitBadge(page,'PREFLIGHT READY');await page.locator('#approvePlan').check();await tab('save');
   const promise=page.waitForEvent('download');await page.locator('#saveOutput').click();const d=await promise;const file=path.join(out,`downloaded-${++downloads}.dat`);await d.saveAs(file);await waitBadge(page,'DISK VERIFICATION PENDING');
   assert.ok(await page.locator('#downloadReport').isDisabled());assert.ok(!(await page.locator('#verification').textContent()).startsWith('PASS'));
   await page.locator('#outputFile').setInputFiles(file);await page.locator('#verifyOutput').click();await waitBadge(page,'PASS');assert.ok(await page.locator('#downloadReport').isEnabled());return file;
 }
 await check('full mapped / Delivery Work / scrub preflight succeeds and shows the processing policy',async()=>{await tab('review');assert.match(await page.locator('#policy').textContent(),/Scrub last.*Exceptions block the whole file/s);await page.locator('#runPreflight').click();await waitBadge(page,'PREFLIGHT READY');const stats=await page.locator('#stats').textContent();assert.match(stats,/Exceptions0/);assert.match(stats,/Seconds dropped \(HH:mm\)1/);assert.match(stats,/Values to scrub1/);await page.screenshot({path:path.join(out,'02-preflight.png'),fullPage:true});});
 let firstOutput;
 await check('actual browser download is pending until the downloaded file is reselected and fully verified',async()=>{
   firstOutput=await reachPass();const actual=fs.readFileSync(firstOutput,'utf8');
   assert.ok(actual.startsWith('þIDþ\u0014þValueþ\u0014þSentþ'));assert.ok(actual.includes('þPþ\u0014þþ\u0014þ10/01/2026 13:04þ\u0014þEmailþ'));assert.ok(actual.includes('þCþ\u0014þkeepþ\u0014þ10/02/2026 00:00þ\u0014þChatþ\u0014þ1þ'));
   assert.ok(actual.includes('þKim, Jane;Doe, Johnþ'));assert.ok(actual.includes('þKim, Janeþ\u0014þ1þ\u0014þCONFIDENTIALþ'));assert.ok(actual.includes('þYþ'));
   await page.screenshot({path:path.join(out,'03-verified.png'),fullPage:true});
 });
 await check('job configuration and audit report download locally',async()=>{const auditPromise=page.waitForEvent('download');await page.locator('#downloadReport').click();const audit=await auditPromise;await audit.saveAs(path.join(out,'result.audit.json'));const report=JSON.parse(fs.readFileSync(path.join(out,'result.audit.json'),'utf8'));assert.equal(report.verification.status,'PASS');assert.equal(report.verification.job.fields.length,14);await tab('source');const jobPromise=page.waitForEvent('download');await page.locator('#exportJob').click();const job=await jobPromise;await job.saveAs(path.join(out,'job.json'));const saved=JSON.parse(fs.readFileSync(path.join(out,'job.json'),'utf8'));assert.equal(saved.fields.length,14);assert.equal(saved.groups[0].actions,undefined);assert.equal(saved.fields[0].reviewSignature,undefined);});
 await check('ticket change clears PASS, approval and save controls',async()=>{await page.locator('#ticket').fill('Changed ticket instruction');await assertNoPass(page,'ticket');});
 await check('field rule change (same output columns) clears PASS but keeps group rules linked',async()=>{
   await reachPass();await tab('fields');await edit('Confidentiality',null,async()=>{await page.locator('#ruleNote').fill('Ticket Notes item 7');});
   await assertNoPass(page,'field rule');await tab('groups');assert.match(await card.locator('.rule-state').textContent(),/Confidentiality → keep/);assert.ok(await card.locator('input[id^="group-review-"]').isChecked());
 });
 await check('output column rename clears PASS, unlinks group rules and blocks preflight until reapplied',async()=>{
   await reachPass();await tab('fields');await edit('Confidentiality',null,async()=>{await page.locator('#outputHeader').fill('Confidentiality Designation');});
   await assertNoPass(page,'rename');assert.match((await ui(page)).status,/Reapply the rule table for: Email/);
   await tab('groups');assert.equal(await card.locator('.rule-state').textContent(),'Rule table is not applied.');assert.ok(await card.locator('input[id^="group-review-"]').isDisabled());
   await tab('review');await page.locator('#runPreflight').click();assert.match((await ui(page)).status,/applied rules for the current output fields/);
   await tab('groups');await card.getByRole('button',{name:'Apply rule table',exact:true}).click();assert.match(await card.locator('.rule-state').textContent(),/Unknown output field: Confidentiality/);
   await applyGroupRules();const file=await reachPass();assert.ok(fs.readFileSync(file,'utf8').includes('þConfidentiality Designationþ'));
 });
 await check('output column reorder clears PASS and unlinks group rules',async()=>{
   await tab('fields');await page.locator('#fieldRows tr').nth(13).locator('button[title="Move output field"]').first().click();await assertNoPass(page,'reorder');
   await tab('groups');assert.equal(await card.locator('.rule-state').textContent(),'Rule table is not applied.');await applyGroupRules();
 });
 await check('group rule edit clears PASS and unchecks the review in place',async()=>{
   await reachPass();await tab('groups');await card.locator('textarea[id^="group-rules-"]').press('End');await card.locator('textarea[id^="group-rules-"]').type(' ');
   await assertNoPass(page,'group rule');assert.equal(await card.locator('input[id^="group-review-"]').isChecked(),false);assert.ok(await card.locator('input[id^="group-review-"]').isDisabled());assert.match(await card.locator('.rule-state').textContent(),/Apply it again/);
   await applyGroupRules();
 });
 await check('target ID column change clears PASS and the group review',async()=>{
   await reachPass();await tab('groups');await card.locator('select[id^="group-key-"]').selectOption('');await assertNoPass(page,'target key');assert.equal(await card.locator('input[id^="group-review-"]').isChecked(),false);
   await card.locator('select[id^="group-key-"]').selectOption('ID');await card.locator('input[id^="group-review-"]').check();
 });
 await check('target list replacement clears PASS and requires a new ID column and review',async()=>{
   await reachPass();await tab('groups');await loadTargets('ID\r\nC\r\n','targets-2.csv');await assertNoPass(page,'target replacement');
   assert.equal(await card.locator('select[id^="group-key-"]').inputValue(),'');assert.equal(await card.locator('input[id^="group-review-"]').isChecked(),false);
   await card.locator('select[id^="group-key-"]').selectOption('ID');await card.locator('input[id^="group-review-"]').check();
   const file=await reachPass();const text=fs.readFileSync(file,'utf8');assert.ok(text.includes('þPþ\u0014þsecretþ'));assert.ok(text.includes('þCþ\u0014þþ'));
 });
 await check('selecting another output file or withdrawing approval removes PASS',async()=>{
   await page.locator('#outputFile').setInputFiles({name:'other.dat',mimeType:'application/octet-stream',buffer:bytes});await assertNoPass(page,'output file',{approvalCleared:false});
   await page.locator('#verifyOutput').click();await waitBadge(page,'ERROR');await assertNoPass(page,'wrong output verification');
   await reachPass();await tab('review');await page.locator('#approvePlan').uncheck();await assertNoPass(page,'approval withdrawn',{approvalCleared:false});assert.ok(await page.locator('#saveOutput').isDisabled());
 });
 await check('pending download notice is removed by any later change',async()=>{
   await tab('review');await page.locator('#runPreflight').click();await waitBadge(page,'PREFLIGHT READY');await page.locator('#approvePlan').check();await tab('save');const promise=page.waitForEvent('download');await page.locator('#saveOutput').click();await (await promise).saveAs(path.join(out,`downloaded-${++downloads}.dat`));await waitBadge(page,'DISK VERIFICATION PENDING');
   assert.ok(await page.locator('#downloadPending').isVisible());await tab('source');await page.locator('#jobName').fill('Changed label');await assertNoPass(page,'after download');
 });
 await check('source replacement clears PASS, fields, groups and approval',async()=>{
   await reachPass();await loadSource(bytes,'replacement.dat');await assertNoPass(page,'source replacement');
   assert.match(await page.locator('#fieldCount').textContent(),/^11 output fields · 0 confirmed$/);assert.equal(await page.locator('.group-card').count(),0);
 });
 const snapshot=()=>page.evaluate(()=>({fields:[...document.querySelectorAll('#fieldRows .field-name')].map(b=>b.textContent),count:document.querySelector('#fieldCount').textContent,groups:document.querySelectorAll('.group-card').length,ticket:document.querySelector('#ticket').value,identity:document.querySelector('#identity').value}));
 await check('invalid job configurations are rejected atomically without changing the workspace',async()=>{
   await page.locator('#identity').selectOption('0');await page.locator('#ticket').fill('Current ticket');const before=await snapshot();const job=JSON.parse(fs.readFileSync(path.join(out,'job.json'),'utf8'));
   const variant=fn=>{const j=structuredClone(job);fn(j);return JSON.stringify(j);};
   const cases=[['not-json','{ broken',/not valid JSON/],['wrong-tool',variant(j=>{j.tool='Other';}),/Invalid job configuration/],['unknown-op',variant(j=>{j.fields[1].rule={op:'eval',scope:'all',source:1};}),/supported operation/],
     ['malformed-pairs',variant(j=>{j.fields.find(f=>f.rule.op==='map').rule.pairs='Mail\tEmail';}),/mapping table/],['bad-group',variant(j=>{j.groups[0].layout='bogus';}),/Invalid target group/],
     ['missing-group-scope',variant(j=>{j.fields[1].rule={op:'constant',scope:'group',group:'Nope',source:1,value:'X'};}),/scope group is missing/],['duplicate-output',variant(j=>{j.fields[1].name=j.fields[0].name;}),/duplicate field name/],
     ['other-source',variant(j=>{j.sourceHash='0'.repeat(64);}),/exact source DAT/],['bad-identity',variant(j=>{j.key=99;}),/identity/]];
   for(const [name,text,expected]of cases){await page.locator('#importJob').setInputFiles({name:name+'.json',mimeType:'application/json',buffer:Buffer.from(text)});await waitIdle(page);await page.waitForFunction(()=>document.querySelector('#stateBadge').textContent==='ERROR');
     assert.match((await ui(page)).status,expected,name);assert.deepEqual(await snapshot(),before,name);}
 });
 await check('valid job import binds the exact source and requires fresh field and group review',async()=>{await page.locator('#importJob').setInputFiles(path.join(out,'job.json'));await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Job loaded'));await tab('fields');assert.match(await page.locator('#fieldCount').textContent(),/^14 output fields · 0 confirmed$/);assert.equal(await page.locator('.group-card').count(),1);await assertNoPass(page,'import');await tab('review');await page.locator('#runPreflight').click();assert.match((await ui(page)).status,/Every group needs/);});
 await check('unapplied field drafts block preflight and a bad mapping paste is atomic',async()=>{
   await tab('fields');await page.getByRole('button',{name:'Sent',exact:true}).click();await page.locator('#outputHeader').fill('Unapplied');await tab('review');assert.match(await page.locator('#planSummary').textContent(),/unapplied field-rule draft/);await page.locator('#runPreflight').click();assert.match((await ui(page)).status,/draft/);
   await tab('fields');await page.locator('#discardDraft').click();const before=await snapshot();await page.locator('details:has(#bulkMap) > summary').click();await page.locator('#bulkMap').fill('ID\tID\nMissing\tValue');await page.locator('#applyMap').click();assert.match((await ui(page)).status,/Unknown source/);assert.deepEqual(await snapshot(),before);
   await tab('review');await page.locator('#runPreflight').click();assert.match((await ui(page)).status,/pasted header \/ mapping text/);await tab('fields');await page.locator('#bulkMap').fill('');
 });
 await check('no requests containing file data occur during file operations',async()=>{assert.equal(requests.length,initialRequests);assert.ok(requests.every(u=>!/synthetic|secret|targets|job/.test(u)));});
 await check('CSP blocks network APIs from the page and from a Blob worker created like the app worker',async()=>{
   const result=await page.evaluate(async url=>{
     const page={};
     try{await fetch(url+'/leak-fetch?synthetic=1');page.fetch=false;}catch{page.fetch=true;}
     page.xhr=await new Promise(r=>{const x=new XMLHttpRequest();try{x.open('GET',url+'/leak-xhr?synthetic=1');x.onerror=()=>r(true);x.onload=()=>r(false);x.send();}catch{r(true);}});
     page.websocket=await new Promise(r=>{try{const w=new WebSocket(url.replace('http','ws')+'/leak-ws');w.onerror=()=>r(true);w.onopen=()=>r(false);}catch{r(true);}});
     page.eventsource=await new Promise(r=>{try{const e=new EventSource(url+'/leak-sse');e.onerror=()=>{e.close();r(true);};e.onopen=()=>r(false);}catch{r(true);}});
     page.image=await new Promise(r=>{const i=new Image();i.onerror=()=>r(true);i.onload=()=>r(false);i.src=url+'/leak-img?synthetic=1';});
     try{navigator.sendBeacon(url+'/leak-beacon','synthetic');}catch{}
     const code=`onmessage=async e=>{const u=e.data,r={};try{await fetch(u+'/worker-fetch');r.fetch=false}catch{r.fetch=true}
       r.xhr=await new Promise(d=>{const x=new XMLHttpRequest();try{x.open('GET',u+'/worker-xhr');x.onerror=()=>d(true);x.onload=()=>d(false);x.send()}catch{d(true)}});
       try{importScripts(u.replace('127.0.0.1','localhost')+'/worker-import.js');r.importScripts=false}catch{r.importScripts=true}
       r.websocket=await new Promise(d=>{try{const w=new WebSocket(u.replace('http','ws')+'/worker-ws');w.onerror=()=>d(true);w.onopen=()=>d(false)}catch{d(true)}});
       postMessage(r)}`;
     const blobUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),w=new Worker(blobUrl);URL.revokeObjectURL(blobUrl);
     const worker=await new Promise(r=>{w.onmessage=e=>{w.terminate();r(e.data);};w.postMessage(url);});
     return {page,worker};
   },started.url);
   await new Promise(r=>setTimeout(r,500));
   assert.deepEqual(result,{page:{fetch:true,xhr:true,websocket:true,eventsource:true,image:true},worker:{fetch:true,xhr:true,importScripts:true,websocket:true}});
   assert.equal(requests.length,initialRequests,'server received: '+requests.slice(initialRequests).join(', '));
 });
 await check('actual browser cancellation rejects late processing and recovers the worker',async()=>{
   const big=datBytes([['ID','Value'],...Array.from({length:25000},(_,i)=>['D'+i,'a'.repeat(500)])]);
   await tab('source');await page.locator('#sourceFile').setInputFiles({name:'cancel.dat',mimeType:'application/octet-stream',buffer:big});await page.locator('#cancel').click();await waitBadge(page,'CANCELLED');await assertNoPass(page,'cancel');
   await loadSource(bytes,'recovered.dat');assert.match(await page.locator('#sourceInfo').textContent(),/2 documents/);
 });
 await check('synthetic sample job imported through the UI produces the published expected output byte-for-byte',async()=>{
   const samples=path.join(root,'samples'),job=JSON.parse(fs.readFileSync(path.join(samples,'sample-job.json'),'utf8'));
   await loadSource(fs.readFileSync(path.join(samples,'sample-source.dat')),'sample-source.dat');await page.locator('#importJob').setInputFiles(path.join(samples,'sample-job.json'));await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Job loaded'));
   await tab('fields');for(const f of job.fields)await edit(f.name,null);assert.match(await page.locator('#fieldCount').textContent(),/^13 output fields · 13 confirmed$/);
   await tab('groups');await loadTargets(fs.readFileSync(path.join(samples,'sample-targets.csv')).toString(),'sample-targets.csv');await card.locator('select[id^="group-key-"]').selectOption('BegBates');await card.getByRole('button',{name:'Apply rule table',exact:true}).click();await card.locator('input[id^="group-review-"]').check();
   const file=await reachPass();assert.deepEqual(fs.readFileSync(file),fs.readFileSync(path.join(samples,'sample-expected-output.dat')));
 });
 await check('no horizontal page overflow at 720px and 390px on every step',async()=>{for(const width of [720,390]){await page.setViewportSize({width,height:900});for(const name of ['source','fields','groups','review','save']){await tab(name);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`${width}px ${name}: ${overflow}px`);}await tab('source');await page.screenshot({path:path.join(out,`04-narrow-${width}.png`),fullPage:true});}await page.setViewportSize({width:1512,height:980});});

 // REAL-OPFS: Chrome's FileSystemWritableFileStream on the origin private file system. Not an OS save dialog.
 const opfsContext=await browser.newContext(),opfs=await opfsContext.newPage();opfs.on('pageerror',e=>errors.push(e.message));opfs.on('dialog',d=>d.accept());
 await opfs.addInitScript(()=>{
   globalThis.pickerTest={mode:'real',name:null};
   window.showSaveFilePicker=async({suggestedName})=>{
     const t=globalThis.pickerTest;if(t.mode==='abort')throw new DOMException('The user aborted a request.','AbortError');
     const handle=await (await navigator.storage.getDirectory()).getFileHandle(t.name||suggestedName,{create:true});if(t.mode==='real')return handle;
     return {getFile:()=>handle.getFile(),createWritable:async options=>{const w=await handle.createWritable(options);return {write:async b=>{if(t.mode==='fail')throw new Error('Injected write failure');await new Promise(r=>setTimeout(r,500));return w.write(b);},close:()=>w.close(),abort:reason=>w.abort(reason)};}};
   };
 });
 const opfsBytes=name=>opfs.evaluate(async n=>{try{const f=await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile();return Array.from(new Uint8Array(await f.arrayBuffer()));}catch{return null;}},name);
 const setPicker=(mode,name)=>opfs.evaluate(([m,n])=>{globalThis.pickerTest.mode=m;globalThis.pickerTest.name=n;},[mode,name]);
 async function opfsReady(buffer){await opfs.locator('[data-tab="source"]').click();await opfs.locator('#sourceFile').setInputFiles({name:'opfs-source.dat',mimeType:'application/octet-stream',buffer});await opfs.waitForFunction(()=>document.querySelector('#sourceInfo').textContent.includes('opfs-source.dat'));await waitIdle(opfs);await opfs.locator('#identity').selectOption('0');await opfs.locator('[data-tab="fields"]').click();await opfs.locator('#confirmCopies').click();await opfsPreflight();}
 async function opfsPreflight(){await opfs.locator('[data-tab="review"]').click();await opfs.locator('#runPreflight').click();await waitBadge(opfs,'PREFLIGHT READY');await opfs.locator('#approvePlan').check();await opfs.locator('[data-tab="save"]').click();}
 await opfs.goto(started.url);await opfsReady(bytes);
 await check('REAL-OPFS streaming writer: sequential write, close and full re-read reach PASS',async()=>{await setPicker('real','streamed.dat');await opfs.locator('#saveOutput').click();await waitBadge(opfs,'PASS');assert.deepEqual(Buffer.from(await opfsBytes('streamed.dat')),bytes);assert.match(await opfs.locator('#verification').textContent(),/^PASS · streamed\.dat/);});
 await check('REAL-OPFS existing destination is refused and the earlier PASS is cleared',async()=>{await opfs.locator('#saveOutput').click();await waitBadge(opfs,'ERROR');assert.match((await ui(opfs)).status,/Existing files/);await assertNoPass(opfs,'existing destination');assert.deepEqual(Buffer.from(await opfsBytes('streamed.dat')),bytes);});
 await check('REAL-OPFS closed save dialog writes nothing and keeps the approved plan',async()=>{await opfsPreflight();await setPicker('abort',null);await opfs.locator('#saveOutput').click();await waitIdle(opfs);const s=await ui(opfs);assert.equal(s.badge,'PREFLIGHT READY');assert.match(s.status,/Nothing was written/);assert.equal(s.saveDisabled,false);assert.ok(s.reportDisabled);});
 await check('REAL-OPFS write failure aborts the stream: no PASS, no committed bytes, plan cleared',async()=>{await setPicker('fail','failed.dat');await opfs.locator('#saveOutput').click();await waitBadge(opfs,'ERROR');assert.match((await ui(opfs)).status,/Injected write failure/);await assertNoPass(opfs,'write failure');assert.equal((await opfsBytes('failed.dat')).length,0);assert.equal(await opfs.locator('#cleanup').isHidden(),true);});
 await check('REAL-OPFS cancel during a slow write aborts, leaves no committed bytes and recovers the worker',async()=>{
   await opfsReady(datBytes([['ID','Value'],...Array.from({length:6000},(_,i)=>['S'+i,'b'.repeat(500)])]));await setPicker('slow','slow.dat');await opfs.locator('#saveOutput').click();
   await opfs.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Writing the approved DAT'));await opfs.locator('#cancel').click();await waitBadge(opfs,'CANCELLED');await assertNoPass(opfs,'cancel during write');
   await new Promise(r=>setTimeout(r,1500));assert.equal((await opfsBytes('slow.dat')).length,0);assert.equal(await opfs.locator('#cleanup').isHidden(),true);
   await opfsPreflight();assert.equal((await ui(opfs)).badge,'PREFLIGHT READY');
 });
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,passed:checks.length,browser:(executablePath?path.basename(executablePath):'bundled chromium')+' '+browser.version()+' (headless)',networkRequests:requests.slice(0,initialRequests),scope:{actual:'Chrome DOM, Blob Worker, CSP, file inputs, Playwright-captured downloads re-selected and re-read, Chrome FileSystemWritableFileStream on OPFS',notCovered:'OS save dialog (showSaveFilePicker UI), writing into a user-chosen disk folder, the user Downloads folder, Edge, low-memory hardware, real business data'}},null,2));
 console.log(`${checks.length} browser checks passed · ${executablePath?path.basename(executablePath):'chromium'} ${browser.version()}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
