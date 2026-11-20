'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Requires a throwaway PostgreSQL database; CI provides one. Not run against company data.
const url=process.env.TEST_DATABASE_URL;
test('real PostgreSQL schema, idempotency and single-owner advisory lock', {skip:!url},async()=>{
 const {Pool}=require('pg');const pool=new Pool({connectionString:url,max:3});
 try{
  for(const name of ['schema.sql','upgrade-v3.sql','upgrade-v4.sql'])await pool.query(fs.readFileSync(path.join(__dirname,'../../sql',name),'utf8'));
  const c1=await pool.connect(),c2=await pool.connect();
  try{
   const k1=await c1.query('SELECT pg_try_advisory_lock(718217,301) locked');assert.equal(k1.rows[0].locked,true);
   const k2=await c2.query('SELECT pg_try_advisory_lock(718217,301) locked');assert.equal(k2.rows[0].locked,false);
   await c1.query('SELECT pg_advisory_unlock(718217,301)');
   const k3=await c2.query('SELECT pg_try_advisory_lock(718217,301) locked');assert.equal(k3.rows[0].locked,true);
   await c2.query('SELECT pg_advisory_unlock(718217,301)');
  }finally{c1.release();c2.release();}
  const c3=await pool.connect(),c4=await pool.connect();
  try{
   await c3.query('BEGIN');
   await c3.query('SELECT pg_advisory_xact_lock(hashtext($1))',['+14155550100']);
   const blocked=await c4.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['+14155550100']);
   assert.equal(blocked.rows[0].locked,false,'suppression and dial-intent share a per-contact lock');
   await c3.query('COMMIT');
   const free=await c4.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',['+14155550100']);
   assert.equal(free.rows[0].locked,true);
  }finally{await c3.query('ROLLBACK').catch(()=>{});c3.release();c4.release();}
  const id='00000000-0000-4000-8000-000000000123';
  await pool.query("INSERT INTO outbound_jobs(id,buyer_ref,phone_e164,payload,idempotency_key) VALUES($1,'buyer-fixture','+14155550100','{}'::jsonb,'integration-fixture') ON CONFLICT (idempotency_key) DO NOTHING",[id]);
  await assert.rejects(pool.query("INSERT INTO outbound_jobs(id,buyer_ref,phone_e164,payload,idempotency_key) VALUES($1,'buyer-duplicate','+14155550100','{}'::jsonb,'integration-fixture')",['00000000-0000-4000-8000-000000000124']),/duplicate key/);
  const job=await pool.query("SELECT id,status,call_id FROM outbound_jobs WHERE idempotency_key='integration-fixture'");assert.equal(job.rows.length,1);assert.equal(job.rows[0].status,'queued');
  const f=await pool.query('INSERT INTO outbound_reconciliation_flags(job_id,kind) VALUES($1,$2) RETURNING id',[id,'fictional_duplicate']);
  await pool.query('INSERT INTO outbound_reconciliation_flags(job_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,'fictional_duplicate']);
  const count=await pool.query('SELECT count(*)::int AS n FROM outbound_reconciliation_flags WHERE job_id=$1 AND kind=$2 AND reviewed_at IS NULL',[id,'fictional_duplicate']);
  assert.equal(count.rows[0].n,1,'at most one open flag per job and kind');
  await pool.query('UPDATE outbound_reconciliation_flags SET reviewed_at=now() WHERE id=$1',[f.rows[0].id]);
  await pool.query('DELETE FROM outbound_reconciliation_flags WHERE job_id=$1',[id]);
  await pool.query('DELETE FROM outbound_jobs WHERE id=$1',[id]);
 }finally{await pool.end();}
});
