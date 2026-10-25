'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env(){
 let now=Date.parse('2026-10-25T05:00:00Z'),reads=0,lists=0,uuid=0;const properties={},cache=new Map(),audit=[],plans=[];
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const book={getSheetByName:()=>({getLastRow:()=>audit.length+1,getRange:(first,col,n,width)=>({getValues:()=>audit.slice(first-2,first-2+n).map(r=>r.slice(col-1,col-1+width))})})};
 const c=vm.createContext({Date:Clock,Number,JSON,Object,Array,String,Math,
  afRequireUser_:u=>assert.equal(u,'owner'),afResearchHash_:s=>'H:'+s,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v})},
  Utilities:{getUuid:()=>String(++uuid),formatDate:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10)},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v,ttl)=>{assert.equal(ttl,60);cache.set(k,v);}})},
  LockService:{getScriptLock(){throw Error('Status poll acquired a write lock');}},
  afResearchReadBook_:()=>{reads++;return book;},afPaperLatest_:()=>{lists++;return structuredClone(plans);},
  afPaperSummary_:p=>({counts:{PENDING:p.filter(x=>x.state==='PENDING').length,TP:p.filter(x=>x.state==='TP').length}}),
  afSharedStatus:()=>({enabled:true,health:'OK'}),afCallAnalyst_(){throw Error('Status poll called AI');},afReadMarket_(){throw Error('Status poll read provider');}
 });
 vm.runInContext(fs.readFileSync(__dirname+'/Monitoring.gs','utf8'),c);
 const p={key:'P:H:first',runId:'AF:original',state:'PENDING',revision:1,symbol:'XAUUSD',side:-1,entry:100,stop:110,target:80,createdAt:now,expiresAt:now+60000,holdUntil:null,fillAt:null,lastBarClose:now,replayEvidence:null};plans.push(p);
 audit.push([1,now,'H:owner','AF:duplicate','PAPER_SIGNAL_READY','blob','hash',p.key]);
 return {c,plans,audit,properties,cache,p,time:v=>now=v,get now(){return now;},get reads(){return reads;},get lists(){return lists;}};
}
let n=0;const test=(name,fn)=>{fn();n++;console.log('PASS '+name);};
test('a status read contains stable identity and aliases without acquiring a write lock or calling AI',()=>{const e=env(),r=e.c.afPaperStatus('owner');assert.equal(r.success,true);assert.equal(r.plans[0].view.planKey,e.p.key);assert.equal(r.aliases['AF:duplicate'],e.p.key);assert.equal(r.triggers[0].alertId,e.p.key);});
test('cached state recomputes the exact deadline without another ledger read',()=>{const e=env();e.c.afPaperStatus('owner');e.time(e.p.expiresAt);const r=e.c.afPaperStatus('owner');assert.equal(e.reads,1);assert.equal(r.plans[0].view.entryAllowed,false);assert.equal(r.triggers[0].status,'Review');assert.equal(e.p.state,'PENDING');});
test('committing a newer revision invalidates the cache immediately',()=>{const e=env();e.c.afPaperStatus('owner');e.p.state='TP';e.p.revision=2;e.c.afPaperStatusChanged_();const r=e.c.afPaperStatus('owner');assert.equal(e.reads,2);assert.equal(r.plans[0].state,'TP');assert.equal(r.triggers.length,0);});
test('cache eviction and corrupt cached values safely reload committed state',()=>{const e=env();e.c.afPaperStatus('owner');for(const key of e.cache.keys())e.cache.set(key,'broken');assert.equal(e.c.afPaperStatus('owner').success,true);e.cache.clear();assert.equal(e.c.afPaperStatus('owner').plans.length,1);assert.equal(e.lists,3);});
test('older repeated runs retain their Plan Key even beyond the recent audit window',()=>{const e=env();for(let i=0;i<250;i++)e.audit.push([i,e.now,'H:owner','AF:new'+i,'NO_TRADE','','','']);assert.equal(e.c.afPaperStatus('owner',[],['AF:duplicate']).aliases['AF:duplicate'],e.p.key);});
test('requested old plans remain visible when the response is bounded',()=>{const e=env();for(let i=0;i<120;i++)e.plans.push({...e.p,key:'P:H:key'+i,runId:'AF:run'+i,createdAt:e.now+i+1});const r=e.c.afPaperStatus('owner',[],['AF:duplicate']);assert.equal(r.plans.length,100);assert.ok(r.plans.some(p=>p.planKey===e.p.key));assert.equal(r.total,121);});
test('another owner audit cannot alias a plan into this view',()=>{const e=env();e.audit.push([2,e.now,'H:other','AF:other','PAPER_SIGNAL_READY','','','P:H:other']);assert.equal(e.c.afPaperStatus('owner',[],['AF:other']).aliases['AF:other'],undefined);});
test('unauthorized status reads stop before any ledger access',()=>{const e=env();assert.throws(()=>e.c.afPaperStatus('other'));assert.equal(e.reads,0);});
test('status DTO omits analysis bodies, credentials and mutable provider metadata',()=>{const e=env();e.p.sharedSignal={message:'private analysis'};e.p.metadata={secret:'fixture'};const r=JSON.stringify(e.c.afPaperStatus('owner'));assert.doesNotMatch(r,/private analysis|secret|sharedSignal|metadata/);});
console.log('PaperStatus: '+n+' groups passed');
