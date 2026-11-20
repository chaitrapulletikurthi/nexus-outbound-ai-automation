'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {check}=require('../src/monitor');
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
test('monitor alerts when database is not ready even if alerts route succeeds',async()=>{
 const called=[];
 const result=await check({url:'http://localhost:8080',token:'fictional',alertUrl:'http://localhost:9999',fetchFn:async(url)=>{
  called.push(url);
  if(url.endsWith('/queue/alerts'))return response(200,{healthy:true,metrics:{stuck_calls:0}});
  if(url.endsWith('/ready'))return response(503,{ready:false});
  return response(200,{});
 }});
 assert.equal(result.healthy,false);
 assert.equal(result.metrics.readiness,'database_unavailable');
 assert(called.some(x=>x.endsWith('/ready')));
 assert(called.some(x=>x.endsWith(':9999')));
});
test('monitor remains healthy when alerts and readiness checks pass',async()=>{
 const result=await check({url:'http://localhost:8080',token:'fictional',fetchFn:async(url)=>url.endsWith('/ready')?response(200,{ready:true}):response(200,{healthy:true,metrics:{}})});
 assert.equal(result.healthy,true);
});
