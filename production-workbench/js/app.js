'use strict';
(() => {
  const C=ProductionCore,$=id=>document.getElementById(id),MAX_DOWNLOAD=128*1024*1024;
  const labels={copy:'Copy source value',blank:'Explicit blank',constant:'Fixed value / Confidentiality',map:'Exact value map / Item Type / Y-N',name:'Custodian: last name + first name','list-map':'All Custodians: map names + semicolon',join:'Join selected fields',datetime:'Date / time format',integer:'Existing attachment count: validate',pages:'Image page count / placeholder',children:'Count child documents'};
  let worker,requestSerial=0,fieldSerial=0,groupSerial=0,revision=0,run=null,busy=false,dirty=false,page=0,selected=null;
  let source=null,sourceInfo=null,fields=[],groups=[],report=null,approvedJob=null,verified=null;
  const pending=new Map();
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function option(select,value,text){const n=el('option',text);n.value=value;select.append(n);}
  function fieldId(){return 'field-'+(++fieldSerial);}
  function sourceSelect(select,value=null,empty='Select source field') {select.replaceChildren();option(select,'',empty);(sourceInfo?.headers||[]).forEach((h,i)=>option(select,String(i),h));select.value=Number.isInteger(value)?String(value):'';}
  function status(text,kind=''){const n=$('status');n.textContent=text;n.className='status'+(kind?' '+kind:'');}
  function badge(text,kind=''){const n=$('stateBadge');n.textContent=text;n.className='badge'+(kind?' '+kind:'');}
  function tab(name){document.querySelectorAll('.tab').forEach(n=>n.hidden=n.id!=='tab-'+name);document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.tab===name));$('pageTitle').textContent=({source:'Source & ticket',fields:'Fields & Delivery Work',groups:'Targets & scrub rules',review:'Review & preflight',save:'Save & verify'})[name];if(name==='review')renderPlan();}
  // Every path that can make a shown PASS or pending download stale goes through here.
  function clearVerification(message='No current saved file has passed verification.'){verified=null;$('downloadPending').hidden=true;$('verification').className='verification';$('verification').textContent=message;}
  function invalidate(message='Inputs changed. Run preflight again.') {
    revision++;report=null;approvedJob=null;$('approvePlan').checked=false;$('preflightPanel').hidden=true;clearVerification();badge('UNVERIFIED');buttons();
    if(message)status(message);
  }
  function buttons(){const ready=!!report?.valid&&$('approvePlan').checked&&!dirty&&!busy;$('saveOutput').disabled=!ready;$('verifyOutput').disabled=!ready||!$('outputFile').files.length;$('downloadReport').disabled=busy||!verified;$('runPreflight').disabled=busy||!sourceInfo;$('goFields').disabled=busy||!sourceInfo;$('goSave').disabled=!ready;}
  function makeWorker(){
    const code="'use strict';globalThis.ProductionIO={createIO:"+ProductionIO.createIO.toString()+"};("+installProductionCore.toString()+")(globalThis);("+productionWorkerBoot.toString()+")();";
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    try{worker=new Worker(url);}finally{URL.revokeObjectURL(url);}const instance=worker;
    instance.onmessage=async ({data:m})=>{
      if(worker!==instance)return;const p=pending.get(m.request);
      if(m.type==='progress'){if(p&&run?.revision===revision){$('progress').value=m.fraction;$('progressText').textContent=m.file+' · '+Math.round(m.fraction*100)+'%';}return;}
      if(!p)return;
      if(m.type==='chunk'){try{await p.emit(new Uint8Array(m.buffer));if(worker===instance)instance.postMessage({type:'ack',chunk:m.chunk});}catch(e){if(worker===instance)instance.postMessage({type:'ack',chunk:m.chunk,error:e.message});}return;}
      pending.delete(m.request);if(m.type==='error')p.reject(new Error(m.message));else p.resolve(m.value);
    };
    instance.onerror=()=>{if(worker===instance){stopWorker('Local processing worker failed.');invalidate('Local processor failed. Run preflight again.');}};
  }
  function stopWorker(message){if(worker)worker.terminate();worker=null;for(const p of pending.values())p.reject(new Error(message));pending.clear();}
  function request(op,payload={},emit=async()=>{}){return new Promise((resolve,reject)=>{if(!worker){reject(new Error('Local processor unavailable. Reload this page.'));return;}const id=++requestSerial;pending.set(id,{resolve,reject,emit});try{worker.postMessage({request:id,op,...payload});}catch(e){pending.delete(id);reject(e);}});}
  function guard(r){if(run!==r||r.cancelled||r.revision!==revision)throw new Error('Operation was cancelled or superseded.');}
  async function owned(r,p){guard(r);const v=await p;guard(r);return v;}
  async function cleanup(r){if(r.writer){const w=r.writer;r.writer=null;try{await w.abort();}catch(e){$('cleanup').hidden=false;$('cleanup').textContent='Could not abort the pending output: '+e.message;}}
    if(r.committed&&!r.verified){$('cleanup').hidden=false;$('cleanup').textContent='The saved output '+r.name+' has not passed verification. Delete or quarantine it; do not deliver it.';}
  }
  async function operation(fn){
    if(busy)return;const r={revision,cancelled:false,writer:null,committed:false,verified:false,phase:'processing'};run=r;busy=true;$('workspace').disabled=true;$('progressBox').hidden=false;$('progress').value=0;$('cancel').disabled=false;$('cleanup').hidden=true;buttons();badge('RUNNING');
    try{return await fn(r);}
    catch(e){if(run===r&&!r.cancelled){
      if(e.keepPlan){clearVerification('No file was written.');status(e.message);badge(report?.valid?'PREFLIGHT READY':'UNVERIFIED');}
      else{invalidate(null);status(e.message,'error');badge(e.name==='AbortError'?'CANCELLED':'ERROR','error');}
    }}
    finally{await cleanup(r);if(run===r){run=null;busy=false;$('workspace').disabled=false;$('progressBox').hidden=true;buttons();}}
  }
  function baseField(name,sourceIdx=null){return {id:fieldId(),name,note:'',rule:{op:'copy',scope:'all',source:sourceIdx}};}
  // Group Keep/Scrub tables are keyed to output field identity, name and order; any schema change requires reapplying them.
  function schemaKey(){return JSON.stringify(fields.map(f=>[f.id,f.name]));}
  function changedFields(){
    const key=schemaKey(),stale=groups.filter(g=>g.actions&&g.schema!==key);
    stale.forEach(g=>{g.actions=null;g.reviewed=false;g.raw=null;g.warnings=null;});
    const message=stale.length?'Output fields changed. Reapply the rule table for: '+stale.map(g=>g.name).join(', ')+'.':'Field rules changed. Run preflight again.';
    invalidate(message);renderFields();renderGroups();return message;
  }
  function table(headers,rows){const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(v=>r.append(el('td',String(v??''))));body.append(r);});t.append(body);return t;}
  function renderSource(){
    $('sourceInfo').textContent=sourceInfo?`${sourceInfo.file.name}\n${sourceInfo.rows.toLocaleString()} documents · ${sourceInfo.headers.length} fields · ${sourceInfo.meta.encoding}\nSHA-256 ${sourceInfo.hash}`:'No file selected.';
    $('sourceSamples').replaceChildren();if(sourceInfo)$('sourceSamples').append(table(sourceInfo.headers,sourceInfo.samples.map(r=>r.map(v=>v.slice(0,160)))));sourceSelect($('identity'),null,'Select unique document identity');buttons();
  }
  function renderFields(){
    const query=$('fieldSearch').value.toLowerCase(),shown=fields.map((f,i)=>({f,i})).filter(({f})=>f.name.toLowerCase().includes(query));page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(shown.length/40)-1)));$('fieldRows').replaceChildren();
    for(const {f,i}of shown.slice(page*40,page*40+40)){
      const tr=el('tr');if(f.id===selected)tr.className='active';tr.append(el('td',i+1));
      const name=el('td'),b=el('button',f.name||'(unnamed)','field-name');b.type='button';b.addEventListener('click',()=>openEditor(f.id));name.append(b);tr.append(name);
      const src=Number.isInteger(f.rule.source)?sourceInfo?.headers[f.rule.source]??'(invalid source)':'(computed / unlinked)';tr.append(el('td',labels[f.rule.op]+'\n'+src),el('td',f.rule.scope==='all'?'All documents':f.rule.group),el('td',f.reviewSignature===C.fieldSignature(f)?'Confirmed':'Needs review'));
      const order=el('td'),box=el('div',undefined,'order-buttons');for(const [symbol,to]of [['⇈',0],['↑',i-1],['↓',i+1],['⇊',fields.length-1]]){const button=el('button',symbol,'small');button.type='button';button.disabled=to<0||to>=fields.length||to===i;button.title='Move output field';button.addEventListener('click',()=>{if(!discardAllowed())return;const [item]=fields.splice(i,1);fields.splice(to,0,item);changedFields();});box.append(button);}order.append(box);tr.append(order);$('fieldRows').append(tr);
    }
    $('fieldCount').textContent=fields.length+' output fields · '+fields.filter(f=>f.reviewSignature===C.fieldSignature(f)).length+' confirmed';$('pageInfo').textContent=`${shown.length? page*40+1:0}–${Math.min((page+1)*40,shown.length)} of ${shown.length}`;$('prevPage').disabled=page===0;$('nextPage').disabled=(page+1)*40>=shown.length;
  }
  function discardAllowed(){if(!dirty)return true;if(!window.confirm('Discard the unapplied field-rule draft?'))return false;dirty=false;return true;}
  function addOption(container,label,key,type,value,choices){const wrap=el('div'),l=el('label',label);l.htmlFor='opt-'+key;let n;
    if(type==='source'){n=el('select');sourceSelect(n,value);}
    else if(type==='select'){n=el('select');for(const [v,t]of choices)option(n,v,t);n.value=value??choices[0][0];}
    else if(type==='textarea'){n=el('textarea');n.rows=5;n.value=value??'';}
    else if(type==='checkbox'){n=el('input');n.type='checkbox';n.checked=!!value;}
    else{n=el('input');n.type='text';n.value=value??'';}
    n.id='opt-'+key;wrap.append(l,n);container.append(wrap);return n;
  }
  function optionsUI(op,r={}){
    const container=$('operationOptions');container.replaceChildren();const grid=el('div',undefined,'option-grid');container.append(grid);
    const empty=()=>addOption(grid,'Empty source values','empty','select',r.empty??'error',[['error','Require review / block'],['keep','Preserve blank']]);
    const pairs=()=>addOption(grid,'Exact mapping: input [TAB] output · no header','pairs','textarea',(r.pairs||[]).map(p=>p.join('\t')).join('\n'));
    const help={copy:'Preserve the source value exactly. No trimming or normalization.',blank:'Explicitly create a blank output value. Group scrubbing is configured separately.',constant:'Enter the exact ticket value, e.g. CONFIDENTIAL. Scope limits are configured above.',map:'Use an explicit value table. Unknown and blank values block by default. Blank-to-N happens only if you add a row with an empty input cell.',name:'Use separate Last Name and First Name fields. Output: Last, First. Free-form names must be mapped explicitly.', 'list-map':'Split with your stated person delimiter, map each exact name, then join with a semicolon. Whitespace and duplicate names are preserved.',join:'Join nonempty selected values in the order you specify. No deduplication or sorting.',datetime:'Choose the exact input layout and the ticket output layout. 24-hour output. No time-zone conversion. HH:mm output drops seconds without rounding; preflight counts affected values. Zones, fractional seconds and date-only values block.',integer:'Validate an existing nonnegative count. Does not derive attachments from Bates ranges.',pages:'Use the imaged page-count source. Write 1 only for exact placeholder flag values you identify. A blank page count is never turned into 1.',children:'Requires a complete explicit Parent ID relationship set. Missing parents and cycles block processing. No relationship is inferred from Bates.'};
    container.prepend(el('p',help[op],'hint operation-help'));
    if(op==='constant')addOption(grid,'Exact fixed value','value','text',r.value??'');
    if(op==='map'||op==='list-map'){pairs();addOption(grid,'Unknown values','unknown','select',r.unknown??'error',[['error','Require review / block'],['keep','Keep the exact original value']]);empty();if(op==='map')addOption(grid,'Require all mapped outputs to be Y or N (Redacted)','yn','checkbox',r.yn);else addOption(grid,'Exact input person delimiter','delimiter','text',r.delimiter??';');}
    if(op==='name'){addOption(grid,'Last Name source','last','source',r.last);addOption(grid,'First Name source','first','source',r.first);empty();}
    if(op==='join'){addOption(grid,'Source field names · one per line, exact order','sources','textarea',(r.sources||[]).map(i=>sourceInfo?.headers[i]).join('\n'));addOption(grid,'Output delimiter','delimiter','text',r.delimiter??';');}
    if(op==='datetime'){addOption(grid,'Exact input format','format','select',r.format??'',[['','Select input format'],...C.DATE_FORMATS.map(v=>[v,v])]);addOption(grid,'Output format','outputFormat','select',r.outputFormat??'',[['','Select output format'],['MM/DD/YYYY HH:mm','MM/DD/YYYY HH:mm · 24-hour (ticket)'],['MM/DD/YYYY HH:mm:ss','MM/DD/YYYY HH:mm:ss · 24-hour']]);empty();}
    if(op==='integer')empty();
    if(op==='pages'){addOption(grid,'Placeholder flag source','flag','source',r.flag);addOption(grid,'Exact placeholder flag values · one per line','placeholder','textarea',(r.placeholder||[]).join('\n'));}
    if(op==='children'){addOption(grid,'Parent ID source (blank = root)','parent','source',r.parent);addOption(grid,'What to count','mode','select',r.mode??'direct',[['direct','Direct child documents'],['descendants','All descendant documents']]);addOption(grid,'Which documents receive a count','writeTo','select',r.writeTo??'every',[['every','Every document: its own children'],['roots','Root documents only; child rows blank']]);}
  }
  function openEditor(id){if(!discardAllowed())return;const f=fields.find(f=>f.id===id);if(!f)return;selected=id;dirty=false;$('fieldEditor').hidden=false;$('editorTitle').textContent='Edit: '+f.name;$('outputHeader').value=f.name;$('operation').value=f.rule.op;sourceSelect($('ruleSource'),f.rule.source);$('ruleNote').value=f.note||'';
    $('ruleScope').replaceChildren();option($('ruleScope'),'all','All documents');groups.forEach(g=>option($('ruleScope'),g.name,g.name));$('ruleScope').value=f.rule.scope==='group'?f.rule.group:'all';optionsUI(f.rule.op,f.rule);$('editorError').textContent='';$('editorSamples').textContent=Number.isInteger(f.rule.source)?'Original sample values: '+sourceInfo.samples.map(r=>JSON.stringify(r[f.rule.source]?.slice(0,100))).join(' | '):'Confirm the rule parameters before preflight.';renderFields();
  }
  const lines=text=>text.split(/\r\n|\r|\n/).filter(v=>v!=='');
  function readRule(){
    const op=$('operation').value,scope=$('ruleScope').value,src=$('ruleSource').value,r={op,source:src===''?null:Number(src),scope:scope==='all'?'all':'group'};if(scope!=='all')r.group=scope;
    const val=k=>$('opt-'+k)?.value,idx=k=>val(k)===''?null:Number(val(k));
    if(op==='constant')r.value=val('value');
    if(['map','list-map'].includes(op)){r.pairs=C.parsePairs(val('pairs'));r.unknown=val('unknown');r.empty=val('empty');if(op==='map')r.yn=$('opt-yn').checked;else r.delimiter=val('delimiter');}
    if(op==='name'){r.last=idx('last');r.first=idx('first');r.empty=val('empty');}
    if(op==='join'){r.sources=lines(val('sources')).map(h=>{const i=sourceInfo.headers.indexOf(h);if(i<0)throw new Error('Unknown join source: '+h);return i;});r.delimiter=val('delimiter');}
    if(op==='datetime'){r.format=val('format');r.outputFormat=val('outputFormat');r.empty=val('empty');}
    if(op==='integer')r.empty=val('empty');
    if(op==='pages'){r.flag=idx('flag');r.placeholder=lines(val('placeholder'));}
    if(op==='children'){r.parent=idx('parent');r.mode=val('mode');r.writeTo=val('writeTo');}
    return r;
  }
  function validGroupName(name,g){return !!name.trim()&&name!=='all'&&!groups.some(o=>o!==g&&o.name===name);}
  function renderGroups(){
    $('groups').replaceChildren();$('noGroups').hidden=groups.length>0;
    for(const g of groups){
      const card=el('div',undefined,'group-card'),head=el('div',undefined,'panel-heading'),title=el('h3',g.name||'New group'),remove=el('button','Remove group','danger');remove.type='button';remove.addEventListener('click',()=>{if(!discardAllowed())return;groups=groups.filter(v=>v!==g);fields.forEach(f=>{if(f.rule.scope==='group'&&f.rule.group===g.name)delete f.reviewSignature;});invalidate('Group removed. Fields scoped to it need review.');renderGroups();renderFields();});head.append(title,remove);card.append(head);
      const result=el('div',undefined,'rule-state'),review=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.id='group-review-'+g.id;review.htmlFor=check.id;
      // Edits that invalidate a group's review update the visible state in place so focus is not lost.
      function stale(message){g.reviewed=false;check.checked=false;check.disabled=!g.actions;result.className='rule-state';result.textContent=message;invalidate();}
      const grid=el('div',undefined,'three-col');
      function control(label,input,key){input.id='group-'+key+'-'+g.id;const l=el('label',label);l.htmlFor=input.id;const wrap=el('div');wrap.append(l,input);grid.append(wrap);return input;}
      const name=control('Group name',el('input'),'name');name.type='text';name.value=g.name;name.addEventListener('change',()=>{const old=g.name;if(!validGroupName(name.value,g)){name.value=old;status('Group names must be nonempty, unique and not "all".','error');return;}g.name=name.value;fields.forEach(f=>{if(f.rule.scope==='group'&&f.rule.group===old){f.rule.group=g.name;delete f.reviewSignature;}});invalidate('Group renamed. Fields scoped to it need review.');renderGroups();renderFields();});
      const file=control('Local targets · CSV / DAT',el('input'),'file');file.type='file';file.accept='.csv,.dat,.txt';file.addEventListener('change',()=>{const chosen=file.files[0];if(!chosen)return;g.file=null;g.loadedHash=null;g.headers=[];g.key='';g.count=0;g.reviewed=false;invalidate();operation(async r=>{const info=await owned(r,request('list',{file:chosen}));g.file=chosen;g.headers=info.headers;g.loadedHash=info.hash;g.count=info.count;status('Loaded targets for '+g.name+'. Select the ID column and review rules.');badge('UNVERIFIED');}).finally(renderGroups);});
      const key=control('Target identity column',el('select'),'key');option(key,'','Select target ID');(g.headers||[]).forEach(h=>option(key,h,h));key.value=g.key||'';key.addEventListener('change',()=>{g.key=key.value;stale(g.actions?'Target ID column changed. Review the interpreted actions again.':'Rule table is not applied.');});card.append(grid,el('p',g.file?`${g.file.name} · ${g.count.toLocaleString()} targets\nSHA-256 ${g.loadedHash}`:'Select the target file for this job.','group-info'));
      const details=el('details'),sum=el('summary','Keep / Scrub expressions and pasted rules');details.open=true;details.append(sum);const options=el('div',undefined,'option-grid');
      const layout=addOption(options,'Rule layout','group-layout-'+g.id,'select',g.layout,[['named','Output field name + expression'],['ordered','Final output order: expressions or name + expression']]);
      const blank=addOption(options,'Blank rule cells','group-blank-'+g.id,'select',g.blank,[['review','Require review'],['keep','Keep value'],['clear','Scrub value']]);
      const keep=addOption(options,'Keep expressions · one per line','group-keep-'+g.id,'textarea',g.keep);const clear=addOption(options,'Scrub expressions · one per line','group-clear-'+g.id,'textarea',g.clear);details.append(options);
      const area=el('textarea');area.rows=5;area.value=g.text||'';area.id='group-rules-'+g.id;const areaLabel=el('label','Rules · every output field must be represented');areaLabel.htmlFor=area.id;details.append(areaLabel,area);
      for(const [n,k]of [[layout,'layout'],[blank,'blank'],[keep,'keep'],[clear,'clear'],[area,'text']])n.addEventListener('input',()=>{g[k]=n.value;g.actions=null;g.warnings=null;stale('Rule table changed. Apply it again.');});
      const apply=el('button','Apply rule table'),allKeep=el('button','Set all fields to Keep');apply.type=allKeep.type='button';allKeep.addEventListener('click',()=>{g.layout='named';g.text=fields.map(f=>f.name+'\t'+g.keep.split(/\r\n|\r|\n/)[0]).join('\n');g.actions=null;g.reviewed=false;invalidate();renderGroups();});
      result.textContent=g.actions?Object.entries(g.actions).map(([id,a])=>(fields.find(f=>f.id===id)?.name||id)+' → '+a).join('\n'):'Rule table is not applied.';
      apply.addEventListener('click',()=>{try{const parsed=C.parseScrubRules(g.text,fields,g.layout,g.keep,g.clear,g.blank);g.actions=parsed.actions;g.raw=parsed.raw;g.warnings=parsed.warnings;g.schema=schemaKey();g.reviewed=false;invalidate();renderGroups();}catch(e){g.actions=null;g.warnings=null;stale(e.message);result.className='rule-state error-text';status(e.message,'error');}});
      const actions=el('div',undefined,'button-row');actions.append(apply,allKeep);details.append(actions);card.append(details);if(g.warnings?.length)card.append(el('p',g.warnings.join('\n'),'notice'));card.append(result);
      check.checked=!!g.reviewed;check.disabled=!g.actions;check.addEventListener('change',()=>{g.reviewed=check.checked;invalidate();});review.append(check,el('span','I reviewed the target ID column and every interpreted field action'+(g.warnings?.length?', including the displayed SOW name differences.':'.')));card.append(review);$('groups').append(card);
    }
  }
  function spec(){return {version:1,key:$('identity').value===''?null:Number($('identity').value),jobName:$('jobName').value,ticket:$('ticket').value,fields:structuredClone(fields),groups:groups.map(g=>({name:g.name,key:g.key,actions:g.actions,loadedHash:g.loadedHash}))};}
  function usedSources(){const used=new Set();fields.forEach(f=>{const r=f.rule;for(const k of ['source','first','last','flag','parent'])if(Number.isInteger(r[k]))used.add(r[k]);(r.sources||[]).forEach(i=>used.add(i));});return used;}
  function renderPlan(){
    const n=$('planSummary');n.replaceChildren();if(!fields.length){n.append(el('p','Open a source file and configure output fields.','empty'));return;}
    n.append(el('p',fields.length+' output fields. Compare this count and order with the ticket before approving.','hint'));
    const wrap=el('div',undefined,'table-wrap');wrap.append(table(['#','Output field','Source','Operation','Delivery Work scope','Ticket instruction','Review'],fields.map((f,i)=>[i+1,f.name,Number.isInteger(f.rule.source)?sourceInfo?.headers[f.rule.source]:'(computed)',labels[f.rule.op],f.rule.scope==='all'?'All':f.rule.group,f.note,f.reviewSignature===C.fieldSignature(f)?'Confirmed':'Needs review'])));n.append(wrap);
    n.append(el('p','Targets: '+(groups.map(g=>`${g.name}: ${g.count??0} IDs, rules ${g.reviewed?'reviewed':'need review'}`).join(' · ')||'No group scrubbing'),'hint'));
    const used=usedSources(),omitted=sourceInfo?.headers.filter((_,i)=>!used.has(i))||[];if(omitted.length)n.append(el('p','Source columns not used by any output rule (omitted from output): '+omitted.join(', '),'notice'));
    if(dirty)n.append(el('p','An unapplied field-rule draft is pending. Apply or discard it before preflight.','notice'));
  }
  function renderReport(){
    $('preflightPanel').hidden=false;$('stats').replaceChildren();for(const [title,v]of [['Documents',report.rows],['Output fields',report.fields],['Planned cell changes',report.changed],['Exceptions',report.exceptionCount],['Target matches',report.matched],['Documents in no group',report.untouched],['Values to scrub',report.scrubbed],['Seconds dropped (HH:mm)',report.secondsDropped]]){const d=el('div',title,'stat');d.append(el('strong',v.toLocaleString()));$('stats').append(d);}
    $('exceptions').replaceChildren();if(report.exceptionCount){$('exceptions').append(el('p',`${report.exceptionCount} document(s) need review. Showing ${report.exceptions.length}; ${report.omittedExceptions} more omitted. Saving is blocked until the source or rules are corrected and preflight runs again.`,'notice'),table(['Source row','Document ID','Field','Problem'],report.exceptions.map(e=>[e.row,e.id,e.field,e.message])));}
    else $('exceptions').append(el('p','Full preflight passed. Review the plan and approve it before saving.','hint'));
    if(report.unusedSourceFields.length)$('exceptions').append(el('p','Omitted source columns: '+report.unusedSourceFields.join(', '),'notice'));
    if(report.groups.length)$('exceptions').append(table(['Group','List rows','DAT matches'],report.groups.map(g=>[g.name,g.rows,g.matched])));
    $('fieldStats').replaceChildren(table(['Output field','Planned changes','Values to scrub','Seconds dropped'],report.fieldStats.map(s=>[s.name,s.changed,s.scrubbed,s.secondsDropped])));
    const changes=[];report.samples.forEach(s=>s.changes.forEach(c=>changes.push([s.id,c.field,c.before,c.after])));$('changes').replaceChildren(table(['Document ID','Output field','Before','After'],changes));buttons();
  }
  function download(blob,name){const u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
  function validName(name){if(!/^[^\\/\u0000-\u001f<>:"|?*]+\.dat$/i.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name))throw new Error('Enter a valid new .dat filename without a path.');if(source&&name.toLowerCase()===source.name.toLowerCase())throw new Error('Use a different filename from the source.');}
  function publishVerified(r,result){guard(r);verified={...result,job:approvedJob};r.verified=true;badge('PASS','pass');status('Saved-file verification passed. Every output value matches the approved plan.','success');$('verification').className='verification pass';$('verification').textContent=`PASS · ${result.output.name}\n${result.rows.toLocaleString()} documents · ${result.bytes.toLocaleString()} bytes\nSHA-256 ${result.outputHash}\nEntire saved file re-read.`;$('downloadPending').hidden=true;buttons();}
  // Imported configurations are untrusted input: every field must be a complete rule or an unlinked placeholder.
  function checkConfigField(f,names){const r=f.rule;if(r&&r.op==='copy'&&r.scope==='all'&&r.source===null&&Object.keys(r).length===3){C.safeValue(f.name);return;}C.checkField(f,sourceInfo.headers,names);}
  function parseJob(job){
    const str=v=>typeof v==='string';
    if(!job||typeof job!=='object'||job.tool!=='Production Workbench'||job.version!==1||!Array.isArray(job.fields)||!Array.isArray(job.groups)||!job.fields.length||job.fields.length>2000||job.groups.length>100)throw new Error('Invalid job configuration.');
    if(!sourceInfo||job.sourceHash!==sourceInfo.hash||JSON.stringify(job.sourceHeaders)!==JSON.stringify(sourceInfo.headers))throw new Error('Open the exact source DAT used by this job configuration first.');
    if(!str(job.jobName??'')||!str(job.ticket??''))throw new Error('Invalid job label or ticket text.');
    if(job.key!==null&&!(Number.isInteger(job.key)&&job.key>=0&&job.key<sourceInfo.headers.length))throw new Error('Invalid document identity field.');
    const nextGroups=job.groups.map(g=>{if(!g||!str(g.name)||!str(g.key)||!['named','ordered'].includes(g.layout)||!['review','keep','clear'].includes(g.blank)||!str(g.keep)||!str(g.clear)||!str(g.text))throw new Error('Invalid target group in job configuration.');return {id:'group-'+(++groupSerial),name:g.name,key:'',layout:g.layout,blank:g.blank,keep:g.keep,clear:g.clear,text:g.text,file:null,headers:[],loadedHash:null,count:0,actions:null,reviewed:false};});
    const names=nextGroups.map(g=>g.name);if(names.some((n,i)=>!n.trim()||n==='all'||names.indexOf(n)!==i))throw new Error('Group names must be nonempty, unique and not "all".');
    const nextFields=job.fields.map(f=>{if(!f||!str(f.name)||!str(f.note??'')||!f.rule||typeof f.rule!=='object')throw new Error('Invalid field configuration.');const field={id:fieldId(),name:f.name,note:f.note||'',rule:structuredClone(f.rule)};try{checkConfigField(field,names);}catch(e){throw new Error('Invalid field configuration for '+JSON.stringify(f.name.slice(0,80))+': '+e.message);}return field;});
    ProductionIO.createIO().checkHeaders(nextFields.map(f=>f.name),'Output');
    return {fields:nextFields,groups:nextGroups,jobName:job.jobName||'',ticket:job.ticket||'',key:job.key};
  }
  document.querySelectorAll('.nav').forEach(n=>n.addEventListener('click',()=>tab(n.dataset.tab)));
  $('sourceFile').addEventListener('change',()=>{
    const chosen=$('sourceFile').files[0];if(!chosen)return;$('sourceFile').value='';invalidate();source=null;sourceInfo=null;fields=[];groups=[];selected=null;dirty=false;$('fieldEditor').hidden=true;renderSource();renderFields();renderGroups();
    operation(async r=>{const info=await owned(r,request('inspect',{file:chosen}));source=chosen;sourceInfo=info;fields=info.headers.map((h,i)=>baseField(h,i));renderSource();renderFields();status('Source validated. Select the document identity and confirm output fields.');badge('UNVERIFIED');});
  });
  $('identity').addEventListener('change',()=>invalidate());$('goFields').addEventListener('click',()=>tab('fields'));
  for(const id of ['jobName','ticket'])$(id).addEventListener('input',()=>invalidate());
  $('fieldSearch').addEventListener('input',()=>{page=0;renderFields();});$('prevPage').addEventListener('click',()=>{page--;renderFields();});$('nextPage').addEventListener('click',()=>{page++;renderFields();});
  $('addField').addEventListener('click',()=>{if(!sourceInfo||!discardAllowed())return;const f=baseField('New Field '+(fieldSerial+1));fields.push(f);changedFields();openEditor(f.id);});
  $('restoreFields').addEventListener('click',()=>{if(!sourceInfo||!discardAllowed())return;if(!window.confirm('Replace the current output schema and Delivery Work rules with source columns?'))return;fields=sourceInfo.headers.map((h,i)=>baseField(h,i));selected=null;$('fieldEditor').hidden=true;changedFields();});
  $('confirmCopies').addEventListener('click',()=>{if(!sourceInfo||dirty)return;const copies=fields.filter(f=>f.rule.op==='copy'&&f.rule.scope==='all'&&sourceInfo.headers[f.rule.source]===f.name);if(!copies.length)return;if(!window.confirm('Confirm '+copies.length+' unchanged copies with identical source/output names? Review other fields individually.'))return;copies.forEach(f=>f.reviewSignature=C.fieldSignature(f));invalidate();renderFields();});
  $('applyHeaders').addEventListener('click',()=>{try{if(!sourceInfo||!discardAllowed())return;const headers=C.parseHeaders($('clientHeaders').value);if(fields.length&&!window.confirm('Replace the output schema with the pasted client headers?'))return;fields=headers.map(h=>baseField(h));selected=null;$('fieldEditor').hidden=true;$('clientHeaders').value='';changedFields();}catch(e){status(e.message,'error');}});
  $('applyMap').addEventListener('click',()=>{try{if(!sourceInfo||!discardAllowed())return;const pairs=C.parsePairs($('bulkMap').value),changes=[];for(const [src,out]of pairs){const i=sourceInfo.headers.indexOf(src),f=fields.find(f=>f.name===out);if(i<0||!f)throw new Error('Unknown source / output in mapping: '+src+' → '+out);if(changes.some(c=>c.f===f))throw new Error('Duplicate output target: '+out);changes.push({f,i});}if(changes.some(c=>c.f.reviewSignature)&&!window.confirm('Replace existing reviewed mappings for the listed output fields?'))return;changes.forEach(({f,i})=>{f.rule={op:'copy',scope:'all',source:i};delete f.reviewSignature;});$('bulkMap').value='';changedFields();}catch(e){status(e.message,'error');}});
  for(const id of ['clientHeaders','bulkMap'])$(id).addEventListener('input',()=>invalidate('Pasted configuration changed. Apply it or clear the text before preflight.'));
  $('fieldEditor').addEventListener('input',e=>{if(e.target.closest('button'))return;dirty=true;invalidate('Field-rule draft changed. Apply and confirm it before preflight.');});
  $('operation').addEventListener('change',()=>optionsUI($('operation').value));
  $('confirmField').addEventListener('click',()=>{try{const f=fields.find(f=>f.id===selected);if(!f)return;const name=$('outputHeader').value;if(fields.some(v=>v!==f&&v.name===name))throw new Error('Duplicate output field name.');const candidate={...f,name,note:$('ruleNote').value,rule:readRule()};C.checkField(candidate,sourceInfo.headers,groups.map(g=>g.name));f.name=candidate.name;f.note=candidate.note;f.rule=candidate.rule;f.reviewSignature=C.fieldSignature(f);dirty=false;const message=changedFields();openEditor(f.id);status('Field confirmed. '+message);}catch(e){$('editorError').textContent=e.message;}});
  $('discardDraft').addEventListener('click',()=>{dirty=false;openEditor(selected);});$('removeField').addEventListener('click',()=>{if(!discardAllowed())return;fields=fields.filter(f=>f.id!==selected);selected=null;$('fieldEditor').hidden=true;changedFields();});
  $('addGroup').addEventListener('click',()=>{if(!sourceInfo)return;let n=groupSerial+1;while(groups.some(g=>g.name==='Group '+n))n++;groupSerial=n;groups.push({id:'group-'+n,name:'Group '+n,key:'',layout:'named',keep:'Populate',clear:'Scrub',blank:'review',text:'',actions:null,reviewed:false});invalidate();renderGroups();});
  $('runPreflight').addEventListener('click',()=>{
    if(dirty){status('Apply or discard the pending field draft.','error');return;}
    if($('clientHeaders').value||$('bulkMap').value){status('Apply or clear the pasted header / mapping text before preflight.','error');return;}
    if(groups.some(g=>!g.reviewed||!g.file||!g.actions||g.schema!==schemaKey())){status('Every group needs a selected target file, applied rules for the current output fields and your review confirmation.','error');return;}
    invalidate(null);const job=spec();operation(async r=>{status('Checking every source record and approved rule.');const result=await owned(r,request('preflight',{source,spec:job,files:groups.map(g=>g.file),hash:sourceInfo.hash}));report=result;approvedJob=result.valid?job:null;renderReport();badge(result.valid?'PREFLIGHT READY':'BLOCKED',result.valid?'':'error');status(result.valid?'Full preflight passed. Review the results and approve the plan.':result.exceptionCount+' document(s) require review. Saving is blocked.',result.valid?'success':'error');});
  });
  $('approvePlan').addEventListener('change',()=>{clearVerification();badge(report?.valid?'PREFLIGHT READY':'UNVERIFIED');buttons();});$('goSave').addEventListener('click',()=>tab('save'));
  $('outputName').addEventListener('input',()=>{clearVerification('Output name changed; verify the selected output again.');badge(report?.valid?'PREFLIGHT READY':'UNVERIFIED');buttons();});
  $('outputFile').addEventListener('change',()=>{clearVerification('Selected file is unverified.');badge(report?.valid?'PREFLIGHT READY':'UNVERIFIED');buttons();});
  $('saveOutput').addEventListener('click',()=>{
    if(!report?.valid||!$('approvePlan').checked||dirty)return;const name=$('outputName').value;
    clearVerification('Saving. No current output is verified.');operation(async r=>{
      validName(name);r.name=name;
      if(typeof window.showSaveFilePicker==='function'){
        let handle;try{handle=await owned(r,window.showSaveFilePicker({suggestedName:name,types:[{description:'Production DAT',accept:{'application/octet-stream':['.dat']}}]}));}
        catch(e){if(e.name==='AbortError'){const closed=new Error('Save dialog closed. Nothing was written; the approved plan is unchanged.');closed.keepPlan=true;throw closed;}throw e;}
        let actual=await owned(r,handle.getFile());validName(actual.name);r.name=actual.name;if(actual.size)throw new Error('Existing files cannot be overwritten. Choose a new filename.');
        r.writer=await handle.createWritable({keepExistingData:true,mode:'exclusive'});guard(r);const writer=r.writer;actual=await owned(r,handle.getFile());if(actual.size)throw new Error('Destination changed before writing.');
        status('Writing the approved DAT. Final disk-file verification is pending.');await owned(r,request('transform',{},async b=>{guard(r);await writer.write(b);guard(r);}));
        actual=await owned(r,handle.getFile());if(actual.size)throw new Error('Destination changed during writing.');guard(r);r.phase='commit';$('cancel').disabled=true;
        await writer.close();r.writer=null;r.committed=true;guard(r);r.phase='verification';$('cancel').disabled=false;status('Re-reading every saved record for final verification.');
        const file=await owned(r,handle.getFile());publishVerified(r,await owned(r,request('verify',{file})));
      }else {
        if(source.size>MAX_DOWNLOAD)throw new Error('Use Chrome/Edge streaming save for files above 128 MiB.');const chunks=[];let bytes=0;
        await owned(r,request('transform',{},b=>{guard(r);bytes+=b.length;if(bytes>MAX_DOWNLOAD)throw new Error('Output exceeds the download memory limit. Use Chrome/Edge streaming save.');chunks.push(b);}));
        const blob=new Blob(chunks,{type:'application/octet-stream'});await owned(r,request('verify',{file:new File([blob],name)}));guard(r);download(blob,name);$('downloadPending').hidden=false;$('verification').textContent='Generated content matched the plan in memory. The downloaded disk file is not verified yet: select it above and verify.';badge('DISK VERIFICATION PENDING');status('Generated content checked and download requested. Select the actual saved DAT to verify it.');
      }
    });
  });
  $('verifyOutput').addEventListener('click',()=>{const file=$('outputFile').files[0];if(!file||!report?.valid||!$('approvePlan').checked)return;clearVerification('Verifying the selected file.');operation(async r=>{status('Comparing the selected output with the complete approved plan.');publishVerified(r,await owned(r,request('validate',{file})));});});
  $('downloadReport').addEventListener('click',()=>{if(busy||!verified||!report?.valid||!$('approvePlan').checked)return;const {samples,...summary}=report;download(new Blob([JSON.stringify({tool:'Production Workbench',version:C.VERSION,verification:verified,preflight:summary},null,2)],{type:'application/json'}),verified.output.name.replace(/\.dat$/i,'')+'.audit.json');});
  $('exportJob').addEventListener('click',()=>{
    if(busy||dirty){status('Apply or discard the field draft before saving configuration.','error');return;}
    try{const names=groups.map(g=>g.name);fields.forEach(f=>{try{checkConfigField(f,names);}catch(e){throw new Error('Complete or remove output field '+JSON.stringify(f.name)+' before saving configuration: '+e.message);}});}catch(e){status(e.message,'error');return;}
    const job={tool:'Production Workbench',version:1,sourceHash:sourceInfo?.hash||null,sourceHeaders:sourceInfo?.headers||[],jobName:$('jobName').value,ticket:$('ticket').value,key:$('identity').value===''?null:Number($('identity').value),fields:fields.map(({name,note,rule})=>({name,note,rule})),groups:groups.map(({name,key,layout,blank,keep,clear,text})=>({name,key,layout,blank,keep,clear,text}))};
    download(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}),'production-job.json');status('Job configuration saved to this PC. It contains the ticket text and field rules; store it with the matter files.');
  });
  $('importJob').addEventListener('change',()=>{const file=$('importJob').files[0];if(!file)return;$('importJob').value='';operation(async r=>{if(file.size>4*1024*1024)throw new Error('Job configuration exceeds 4 MiB.');let job;try{job=JSON.parse(await owned(r,file.text()));}catch(e){if(e instanceof SyntaxError)throw new Error('Job configuration is not valid JSON.');throw e;}
      const next=parseJob(job);guard(r);
      fields=next.fields;groups=next.groups;$('jobName').value=next.jobName;$('ticket').value=next.ticket;$('identity').value=next.key===null?'':String(next.key);selected=null;dirty=false;$('fieldEditor').hidden=true;
      invalidate(null);renderFields();renderGroups();status('Job loaded. Review every field and reselect all group target files.');});});
  $('cancel').addEventListener('click',async()=>{
    const r=run;if(!r||r.phase==='commit')return;
    // Take ownership synchronously so a slow writer abort cannot race the operation's own cleanup.
    r.cancelled=true;run=null;busy=false;stopWorker('Operation cancelled.');invalidate('Operation cancelled. No current output is verified.');badge('CANCELLED','error');$('workspace').disabled=false;$('progressBox').hidden=true;
    try{makeWorker();}catch(e){status(e.message,'error');}buttons();await cleanup(r);
  });
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
  $('version').textContent=C.VERSION;$('footerVersion').textContent=C.VERSION;for(const [op,name]of Object.entries(labels))option($('operation'),op,name);
  try{makeWorker();}catch(e){status('Could not start local processing. Open the deployed HTTPS page in Chrome/Edge. '+e.message,'error');}
  renderSource();renderFields();renderGroups();buttons();
})();
