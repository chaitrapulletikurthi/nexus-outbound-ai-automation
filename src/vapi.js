'use strict';
const {createCallPayload}=require('./core');
class VapiClient {
  constructor({apiKey,assistantId,phoneNumberId,baseUrl='https://api.vapi.ai',fetchFn=fetch,timeoutMs=8000}) {
    this.apiKey=apiKey;this.assistantId=assistantId;this.phoneNumberId=phoneNumberId;this.baseUrl=baseUrl;this.fetchFn=fetchFn;this.timeoutMs=timeoutMs;
  }
  async request(method,path,body) {
    if(!this.apiKey) throw new Error('Missing Vapi private API key');
    let res;
    try {
      res=await this.fetchFn(this.baseUrl+path,{method,headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(this.timeoutMs)});
    } catch(e) {
      const err=new Error('Vapi transport outcome uncertain');err.uncertain=true;err.cause=e;throw err;
    }
    const text=await res.text();let data;
    try{data=JSON.parse(text)}catch{data={message:text.slice(0,200)}}
    if(!res.ok){const err=new Error(`Vapi ${method} ${path}: HTTP ${res.status}`);err.status=res.status;err.uncertain=(method==='POST');throw err;}
    return data;
  }
  create(job){return this.request('POST','/call',createCallPayload(job,this.assistantId,this.phoneNumberId));}
  get(callId){if(!/^[a-f\d-]{20,}$/i.test(callId))throw new Error('Invalid call ID');return this.request('GET',`/call/${callId}`);}
}
module.exports={VapiClient};
