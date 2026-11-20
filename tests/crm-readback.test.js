'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createReceiver}=require('../src/airtable-crm-receiver');
const conf={token:'fictional',baseId:'base-fictional',buyerTableId:'buyers-fictional',actionTableId:'actions-fictional',bearerToken:'test-secret',callbackRequestField:'Callback Request'};
const action={actionKey:'call-test:callback',actionType:'callback',buyerRef:'rec1234567890ABCD',data:{requestedTime:'Tomorrow afternoon'}};
test('callback CRM write does not ACK if buyer readback disagrees',async()=>{
 const result=createReceiver(conf,{fetchFn:async(url,opts)=>({ok:true,json:async()=>opts.method==='GET'?{fields:{'Callback Request':'wrong'}}:{id:'rec1234567890ABCD'}})});
 await assert.rejects(result.apply(action),/airtable_buyer_write_not_verified/);
});
test('suppression CRM write does not ACK if readback says contact still allowed',async()=>{
 const result=createReceiver({...conf,callbackRequestField:''},{fetchFn:async(url,opts)=>({ok:true,json:async()=>opts.method==='GET'?{fields:{'Do Not Contact':false}}:{id:'rec1234567890ABCD'}})});
 await assert.rejects(result.apply({...action,actionType:'suppression'}),/airtable_buyer_write_not_verified/);
});
