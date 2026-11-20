'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {maintenance}=require('../src/maintenance');
test('retention uses a dedicated connection with recheck and releases it',async()=>{
 const trace=[];let clientReleased=false;
 const conn={query:async(sql)=>{
  trace.push('client:'+sql.replace(/\s+/g,' ').slice(0,45));
  if(sql.startsWith('SELECT * FROM outbound_jobs'))return {rows:[{id:'00000000-0000-4000-8000-000000000001'}]};
  if(sql.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:true}]};
  if(sql.startsWith('SELECT status IN'))return {rows:[{ok:true}]};
  return {rows:[]};
 },release(){clientReleased=true;trace.push('released');}};
 const pool={query:async(sql)=>{
  trace.push('pool:'+sql.replace(/\s+/g,' ').slice(0,45));
  if(sql.startsWith('SELECT j.id'))return {rows:[{id:'00000000-0000-4000-8000-000000000001'}]};
  return {rows:[]};
 },connect:async()=>conn};
 const result=await maintenance({db:pool,config:{RETENTION_DAYS:'180',ENABLE_RETENTION_PURGE:'true',PRIVACY_REVIEW_APPROVED:'true'},execute:true});
 assert.equal(result.purged,1);assert.equal(clientReleased,true);
 assert.ok(trace.some(x=>x==='client:BEGIN'));
 assert.ok(trace.some(x=>x==='client:COMMIT'));
 assert.ok(!trace.includes('pool:BEGIN'));
 assert.ok(trace.indexOf('client:COMMIT')<trace.indexOf('released'));
});
test('retention never purges record if open hold appears during recheck',async()=>{
 let deleted=false,rolledBack=false;
 const pool={query:async(sql)=>sql.startsWith('SELECT j.id')?{rows:[{id:'id-fixture'}]}:{rows:[]},connect:async()=>({query:async(sql)=>{
  if(sql.startsWith('SELECT * FROM outbound_jobs'))return {rows:[{id:'id-fixture'}]};
  if(sql.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:false}]};
  if(sql==='ROLLBACK')rolledBack=true;
  if(sql.startsWith('DELETE FROM outbound_jobs'))deleted=true;
  return {rows:[]};
 },release(){}})};
 const result=await maintenance({db:pool,config:{RETENTION_DAYS:'180',ENABLE_RETENTION_PURGE:'true',PRIVACY_REVIEW_APPROVED:'true'},execute:true});
 assert.equal(result.purged,0);assert.equal(deleted,false);assert.equal(rolledBack,true);
});
