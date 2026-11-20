'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const patterns=[/app[A-Za-z0-9]{14,}/g,/tbl[A-Za-z0-9]{14,}/g,/airtable\.com\/app[A-Za-z0-9]+/g,/nexkey-automation\.cloud/gi,/Bearer\s+(?:sk-|eyJ)/g,/\+1[2-9]\d{9}/g];
function check(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(['.git','node_modules'].includes(entry.name))continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())check(file);
  else if(entry.isFile()&&!file.endsWith('tests/safety-check.js')&&!file.endsWith('package-lock.json')){
   const content=fs.readFileSync(file,'utf8');
   for(const p of patterns){
    const clean=content.replace(/\+1[2-9]\d{2}55501\d{2}/g,'<fictional-555-number>');
    p.lastIndex=0;
    assert.ok(!p.test(clean),`Potential sensitive field in ${path.relative(root,file)}`);
   }
  }
 }
}
check(root);
for(const filename of ['archive/outbound-property-matching.sanitized.json','outbound-preparation-reference.json']){
 const w=JSON.parse(fs.readFileSync(path.join(root,'workflow',filename),'utf8'));
 assert.equal(w.active,false);assert.deepEqual(w.pinData||{},{});
 for(const n of w.nodes){assert.ok(!n.credentials||Object.keys(n.credentials).length===0,`Credential ref on ${n.name}`);
  if(n.type==='n8n-nodes-base.httpRequest')assert.equal(n.disabled,true,`HTTP node ${n.name} must be disabled`);
 }
}
console.log('PASS: sanitized exports inactive; HTTP calls disabled; repository tree scan passed (not history scan)');
