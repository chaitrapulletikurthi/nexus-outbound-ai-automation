'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/service.js'),'utf8');
const mod={exports:{}};
let databaseOnline=false;
const loader=n=>n==='pg'?{Pool:class{async query(query){if(!databaseOnline)throw Error('private database details');return {rows:[{ready:1}]};}}}:require(n.startsWith('.')?path.join(__dirname,'../src',n):n);
const env={INTERNAL_API_TOKEN:'fictional-private-token',REVIEW_ADMIN_TOKEN:'fictional-admin-token',WEBHOOK_BEARER_TOKEN:'fictional-event-token'};
vm.runInNewContext('(function(require,module,exports,process,fetch,Buffer){'+source+'\n})',{console,setInterval,AbortSignal})(loader,mod,mod.exports,{env},async()=>{throw Error('network_unavailable');},Buffer);
test('private HTTP endpoints reject missing or wrong credentials',async()=>{
 const server=mod.exports.server;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const req=(path,authorization)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{} )},body:'{}'});
  for(const endpoint of ['/jobs','/prepare-and-enqueue','/vapi/webhook','/reviews/reconcile','/reviews/resolve']){
   const res=await req(endpoint,'Bearer wrong-secret');
   assert.equal(res.status,401,endpoint);
   assert.equal(res.headers.get('cache-control'),'no-store');
  }
  assert.equal((await fetch(base+'/health')).status,200);
  const unavailable=await fetch(base+'/ready');
  assert.equal(unavailable.status,503);
  assert.deepEqual(await unavailable.json(),{ready:false,error:'database_unavailable'});
  databaseOnline=true;
  const available=await fetch(base+'/ready');
  assert.equal(available.status,200);
  assert.deepEqual(await available.json(),{ready:true});
  databaseOnline=false;
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await req('/vapi/webhook','Bearer fictional-event-token')).status,422);
  const malformed=await fetch(base+'/vapi/webhook',{method:'POST',headers:{authorization:'Bearer fictional-event-token','content-type':'application/json'},body:'{not json'});
  assert.equal(malformed.status,422);assert.equal((await malformed.json()).error,'invalid_json');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
