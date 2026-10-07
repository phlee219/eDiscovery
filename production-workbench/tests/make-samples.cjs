'use strict';
// Developer-only: regenerates the fictional samples in samples/. Every name, ID and date is invented.
const fs=require('node:fs'),path=require('node:path');
const C=require('../js/core.js'),{createIO}=require('../js/io.js');
const dir=path.resolve(__dirname,'..','samples');
const headers=['BegBates','EndBates','ParentBates','CustodianLast','CustodianFirst','AllCustodiansRaw','DocType','DateSent','DateReceived','DateCreated','DateModified','PageCount','PlaceholderFlag','RedactionStatus','FileName'];
const rows=[
  ['SYN000001','SYN000003','','Rivera','Ana','Ana Rivera|Ben Okafor','E-mail','2026-03-02 09:15:30','2026-03-02 09:16:02','','','3','No','Not Redacted','Quarterly plan.msg'],
  ['SYN000004','SYN000005','SYN000001','Rivera','Ana','Ana Rivera','Edoc','','','2026-02-27 17:45:00','2026-03-01 08:00:59','2','No','Redacted','Plan draft.docx'],
  ['SYN000006','SYN000006','SYN000001','Rivera','Ana','Ana Rivera','Edoc','','','2026-02-20 10:00:00','2026-02-21 11:30:00','','Yes','Not Redacted','Budget model.xlsx'],
  ['SYN000007','SYN000007','','Okafor','Ben','Ben Okafor|Chloe Park','IM','2026-03-03 22:05:07','2026-03-03 22:05:07','','','1','No','Not Redacted','Chat 2026-03-03.rsmf'],
  ['SYN000008','SYN000008','','Park','Chloe','Chloe Park','Contact','','','2025-12-01 08:00:00','2026-01-15 16:20:00','1','No','Not Redacted','Vendor contact.vcf'],
  ['SYN000009','SYN000009','','Park','Chloe','Chloe Park','Appointment','2026-03-04 07:30:00','2026-03-04 07:30:00','','','1','No','Redacted','Kickoff.ics'],
  ['SYN000010','SYN000010','','Okafor','Ben','Ben Okafor','Note','','','2026-03-05 12:00:00','2026-03-05 12:10:45','1','No','Not Redacted','Call notes.txt'],
  ['SYN000011','SYN000011','','Rivera','Ana','Ana Rivera','Task','','','2026-03-06 09:00:00','2026-03-06 09:00:00','1','No','Not Redacted','Follow up.task']
];
const people=[['Ana Rivera','Rivera, Ana'],['Ben Okafor','Okafor, Ben'],['Chloe Park','Park, Chloe']];
const types=[['E-mail','Email'],['IM','Chat'],['Contact','Contact'],['Appointment','Calendar Item'],['Note','Note'],['Task','Task'],['Edoc','Edoc']];
const h=name=>headers.indexOf(name);
const date=(name,source,note)=>({name,note,rule:{op:'datetime',scope:'all',source:h(source),format:'YYYY-MM-DD HH:mm:ss',outputFormat:'MM/DD/YYYY HH:mm',empty:'keep'}});
const fields=[
  {name:'BegBates',note:'',rule:{op:'copy',scope:'all',source:h('BegBates')}},
  {name:'EndBates',note:'',rule:{op:'copy',scope:'all',source:h('EndBates')}},
  {name:'Attachment Count',note:'Notes 1: Number of child documents',rule:{op:'children',scope:'all',source:null,parent:h('ParentBates'),mode:'direct',writeTo:'every'}},
  {name:'Custodian',note:'Notes 2: Last Name, First Name',rule:{op:'name',scope:'all',source:null,last:h('CustodianLast'),first:h('CustodianFirst'),empty:'error'}},
  {name:'All Custodians',note:'Notes 3: Last Name, First Name; semicolon delimited',rule:{op:'list-map',scope:'all',source:h('AllCustodiansRaw'),pairs:people,delimiter:'|',unknown:'error',empty:'error'}},
  {name:'Page Count',note:'Notes 4: imaged pages; placeholder = 1',rule:{op:'pages',scope:'all',source:h('PageCount'),flag:h('PlaceholderFlag'),placeholder:['Yes']}},
  {name:'Item Type',note:'Notes 5: Email, Chat, Contact, Calendar Item, Note, Task, etc.',rule:{op:'map',scope:'all',source:h('DocType'),pairs:types,unknown:'error',empty:'error',yn:false}},
  date('Email Date Sent','DateSent','Notes 6: MM/DD/YYYY HH:MM 24-hour'),
  date('Email Date Received','DateReceived','Notes 6: MM/DD/YYYY HH:MM 24-hour'),
  date('File Created','DateCreated','Notes 6: MM/DD/YYYY HH:MM 24-hour'),
  date('File Last Modified','DateModified','Notes 6: MM/DD/YYYY HH:MM 24-hour'),
  {name:'Confidentiality',note:'Notes 7: CONFIDENTIAL',rule:{op:'constant',scope:'all',source:null,value:'CONFIDENTIAL'}},
  {name:'Redacted',note:'Notes 8: Y/N',rule:{op:'map',scope:'all',source:h('RedactionStatus'),pairs:[['Redacted','Y'],['Not Redacted','N']],unknown:'error',empty:'error',yn:true}}
];
const groupText=fields.map(f=>f.name+'\t'+(f.name==='All Custodians'?'Scrub':'Populate')).join('\n');
const group={name:'Sample scrub group',key:'BegBates',layout:'named',blank:'review',keep:'Populate',clear:'Scrub',text:groupText};
async function main(){
  fs.mkdirSync(dir,{recursive:true});
  const source=Buffer.from('﻿'+[headers,...rows].map(C.compose).join('\r\n')+'\r\n','utf8');
  const targets=Buffer.from('BegBates\r\nSYN000007\r\n','utf8');
  fs.writeFileSync(path.join(dir,'sample-source.dat'),source);fs.writeFileSync(path.join(dir,'sample-targets.csv'),targets);
  const engine=C.createEngine(),sourceFile=new File([source],'sample-source.dat'),info=await engine.inspect(sourceFile);
  fs.writeFileSync(path.join(dir,'sample-job.json'),JSON.stringify({tool:'Production Workbench',version:1,sourceHash:info.hash,sourceHeaders:headers,jobName:'SYNTHETIC sample delivery',ticket:'SYNTHETIC sample. Delivery Work Notes 1-8 translated into explicit rules. Not a real ticket.',key:0,fields,groups:[group]},null,2)+'\n');
  const {output}=await expected(engine,sourceFile,info);fs.writeFileSync(path.join(dir,'sample-expected-output.dat'),output);
  console.log('Samples written to '+dir);
}
// Shared with tests/core.test.cjs so the published samples are checked by the engine.
async function expected(engine,sourceFile,info,job=JSON.parse(fs.readFileSync(path.join(dir,'sample-job.json'),'utf8'))){
  const targetFile=new File([fs.readFileSync(path.join(dir,'sample-targets.csv'))],'sample-targets.csv'),targetInfo=await createIO().listScan(targetFile);
  const specFields=job.fields.map((f,i)=>{const x={id:'f'+i,...f};x.reviewSignature=C.fieldSignature(x);return x;});
  const g=job.groups[0],actions=C.parseScrubRules(g.text,specFields,g.layout,g.keep,g.clear,g.blank).actions;
  const result=await engine.preflight(sourceFile,{version:1,key:job.key,fields:specFields,groups:[{name:g.name,key:g.key,actions,loadedHash:targetInfo.hash}]},[targetFile],info.hash);
  if(!result.report.valid)throw new Error('Sample job is not valid: '+JSON.stringify(result.report.exceptions));
  const parts=[];await engine.transform(result.plan,b=>parts.push(Buffer.from(b)));return {output:Buffer.concat(parts),report:result.report};
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={expected,dir};
