'use strict';
// Developer-only loopback preview. Users open the hosted HTTPS URL.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function startServer(port=0,onRequest=()=>{}) {
  const server=http.createServer((req,res)=>{
    onRequest(req);let target;
    try{const decoded=decodeURIComponent(new URL(req.url,'http://localhost').pathname);target=path.resolve(root,'.'+decoded);if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');}
    catch{res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.dat':'application/octet-stream','.csv':'text/csv; charset=utf-8'};
    res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(target).on('error',()=>{res.destroy();}).pipe(res);
  });
  return new Promise((resolve,reject)=>{server.on('error',reject);server.listen(port,'127.0.0.1',()=>resolve({server,url:'http://127.0.0.1:'+server.address().port}));});
}
if(require.main===module)startServer(4173).then(({url})=>console.log('Developer preview: '+url)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={startServer};
