'use strict';
// Use an independent uptime monitor/cron; never send personal data to alerting services.
async function check({url,token,fetchFn=fetch,alertUrl}={}){
 if(!url||!token)throw Error('monitor_not_configured');
 let healthy=false,metrics={};
 try{const response=await fetchFn(url.replace(/\/$/,'')+'/queue/alerts',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(6000)});
  const data=await response.json();healthy=response.ok&&data.healthy===true;metrics=data.metrics||{};
  // A successful alerts query alone must not hide a readiness failure.
  if(healthy){
   const readyResponse=await fetchFn(url.replace(/\/$/,'')+'/ready',{signal:AbortSignal.timeout(6000)});
   const readiness=await readyResponse.json();
   healthy=readyResponse.ok&&readiness.ready===true;
   if(!healthy)metrics={...metrics,readiness:'database_unavailable'};
  }
 }catch{healthy=false;metrics={error:'unreachable'};}
 if(!healthy&&alertUrl){await fetchFn(alertUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'outbound-queue',status:'attention_required',metrics}),signal:AbortSignal.timeout(6000)});}
 return {healthy,metrics};
}
if(require.main===module){check({url:process.env.QUEUE_PRIVATE_URL,token:process.env.INTERNAL_API_TOKEN,alertUrl:process.env.MONITOR_WEBHOOK_URL}).then(x=>{console.log(JSON.stringify(x));if(!x.healthy)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={check};
