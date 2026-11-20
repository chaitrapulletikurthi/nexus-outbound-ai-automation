'use strict';
// Administrative retention task. It is NOT run automatically by the call worker.
// Load pg lazily so dry-run policy tests do not require installed dependencies.
const env=process.env;
function validateRetention(config=env){
 const days=Number(config.RETENTION_DAYS);
 if(!Number.isSafeInteger(days)||days<30||days>3650)throw Error('RETENTION_DAYS_must_be_30_to_3650');
 return days;
}
async function maintenance({db,config=env,execute=false}={}){
 const days=validateRetention(config);
 if(execute && (config.ENABLE_RETENTION_PURGE!=='true'||config.PRIVACY_REVIEW_APPROVED!=='true'))throw Error('purge_not_authorized');
 const resource=db||new (require('pg').Pool)({connectionString:config.DATABASE_URL,max:2});
 const own=!db;
 try{
  const query=`SELECT j.id FROM outbound_jobs j WHERE j.status IN ('ended','blocked','failed') AND j.created_at < now() - ($1::int * interval '1 day')
    AND NOT EXISTS(SELECT 1 FROM outbound_call_actions a WHERE a.job_id=j.id AND a.synced_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM outbound_reconciliation_flags f WHERE f.job_id=j.id AND f.reviewed_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM outbound_legal_holds h WHERE h.job_id=j.id)
    ORDER BY j.created_at LIMIT 100`;
  const r=await resource.query(query,[days]);
  if(!execute)return {dryRun:true,eligible:r.rows.length,recordsLimitedAt:100};
  // FK-safe delete; race protection by one transaction per job and rechecking open holds.
  let purged=0;
  for(const row of r.rows){
   const client=await resource.connect();
   try{
   await client.query('BEGIN');
   try{
    const lock=await client.query('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE',[row.id]);
    if(!lock.rows.length){await client.query('ROLLBACK');continue;}
    const safe=await client.query(`SELECT NOT EXISTS(SELECT 1 FROM outbound_call_actions WHERE job_id=$1 AND synced_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM outbound_reconciliation_flags WHERE job_id=$1 AND reviewed_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM outbound_legal_holds WHERE job_id=$1) AS ok`,[row.id]);
    const expired=await client.query(`SELECT status IN ('ended','blocked','failed') AND created_at < now()-($2::int*interval '1 day') AS ok FROM outbound_jobs WHERE id=$1`,[row.id,days]);
    if(!safe.rows[0].ok || !expired.rows[0]?.ok){await client.query('ROLLBACK');continue;}
    for(const table of ['outbound_call_events','outbound_call_actions','outbound_reconciliation_flags','outbound_operator_audit'])await client.query(`DELETE FROM ${table} WHERE job_id=$1`,[row.id]);
    await client.query('DELETE FROM outbound_jobs WHERE id=$1',[row.id]);
    await client.query('COMMIT');purged++;
   }catch(e){await client.query('ROLLBACK');throw e;}
   }finally{client.release();}
  }
  // Only consumed events can be deleted; unmatched events remain for operator review.
  await resource.query(`DELETE FROM outbound_unmatched_events WHERE consumed_at IS NOT NULL AND received_at < now() - ($1::int * interval '1 day')`,[days]);
  return {dryRun:false,purged};
 }finally{if(own)await resource.end();}
}
if(require.main===module){maintenance({execute:process.argv.includes('--apply')}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={maintenance,validateRetention};
