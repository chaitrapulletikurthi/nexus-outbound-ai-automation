const test=require('node:test'),assert=require('node:assert/strict');
const {VapiClient}=require('../src/vapi');
test('POST create and GET status with mock provider only',async()=>{
 const requests=[];
 const client=new VapiClient({apiKey:'MOCK_PRIVATE_KEY',assistantId:'mock-assistant',phoneNumberId:'mock-number',fetchFn:async(url,options)=>{
 requests.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify(options.method==='POST'?{id:'00000000-0000-4000-8000-000000000001',status:'queued'}:{id:'00000000-0000-4000-8000-000000000001',status:'ended'})};}});
 const call=await client.create({phone:'4155550100',buyerId:'demo',buyerName:'Taylor',propertyBriefing:'Fictional'});
 assert.equal(call.status,'queued');assert.equal(requests[0].url,'https://api.vapi.ai/call');
 assert.equal(JSON.parse(requests[0].options.body).customer.number,'+14155550100');
 const result=await client.get(call.id);assert.equal(result.status,'ended');assert.equal(requests[1].options.method,'GET');
});

test('network timeout is uncertain and not safe to retry automatically',async()=>{
 const client=new VapiClient({apiKey:'MOCK',assistantId:'a',phoneNumberId:'p',fetchFn:async()=>{throw Error('timeout')}});
 await assert.rejects(()=>client.create({phone:'4155550100'}),e=>e.uncertain===true);
});
test('Vapi create-call HTTP errors remain uncertain for call reconciliation',async()=>{
 const client=new VapiClient({apiKey:'MOCK',assistantId:'a',phoneNumberId:'p',fetchFn:async()=>({ok:false,status:503,text:async()=>'{"error":"busy"}'})});
 await assert.rejects(()=>client.create({phone:'4155550100'}),e=>e.uncertain===true&&e.status===503);
});
