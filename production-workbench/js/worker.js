'use strict';
// Loaded as trusted page code. A Blob worker inherits the document's CSP,
// including connect-src 'none', unlike a separately fetched worker response.
function productionWorkerBoot(){
let plan=null, expected=null, busy=false, serial=0, currentRequest=0;
const acknowledgements=new Map();
let lastProgress=0;
const engine=ProductionCore.createEngine({progress:(file,fraction)=>{
  const now=Date.now();if(now-lastProgress>120||fraction===1){lastProgress=now;postMessage({type:'progress',request:currentRequest,file,fraction});}
}});
onmessage=async ({data:m})=>{
  if(m.type==='ack'){const p=acknowledgements.get(m.chunk);if(p){acknowledgements.delete(m.chunk);m.error?p.reject(new Error(m.error)):p.resolve();}return;}
  if(busy){postMessage({type:'error',request:m.request,message:'An operation is already active.'});return;}
  busy=true;currentRequest=m.request;
  try {
    let value;
    switch(m.op){
      case 'reset':plan=null;expected=null;value=true;break;
      case 'inspect':plan=null;expected=null;value=await engine.inspect(m.file);break;
      case 'list':plan=null;expected=null;value=await engine.io.listScan(m.file);break;
      case 'preflight':{plan=null;expected=null;const r=await engine.preflight(m.source,m.spec,m.files,m.hash);plan=r.plan;value=r.report;break;}
      case 'transform':{
        expected=null;
        value=await engine.transform(plan,bytes=>new Promise((resolve,reject)=>{
          const chunk=++serial;acknowledgements.set(chunk,{resolve,reject});postMessage({type:'chunk',request:m.request,chunk,buffer:bytes.buffer},[bytes.buffer]);
        }));expected=value;break;
      }
      case 'verify':value=await engine.verify(plan,m.file,expected);break;
      case 'validate':expected=null;expected=await engine.expectedDigest(plan);value=await engine.verify(plan,m.file,expected);break;
      default:throw new Error('Unknown operation.');
    }
    postMessage({type:'result',request:m.request,value});
  }catch(e){if(['inspect','list','preflight','transform'].includes(m.op)){plan=null;expected=null;}postMessage({type:'error',request:m.request,message:e.message});}
  finally{busy=false;}
};
}
