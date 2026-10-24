'use strict';
// Offline GAS VM tests: no browser/network, credentials, or private configuration.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'ResearchLog.gs'),'utf8');
const T=Date.parse('2026-10-24T02:00:00Z'),M=60000;
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
function env(){
  let now=T,held=false,acquires=0,uuid=0,fetches=0,fail=null;
  const props={},books={};
  class Sheet{
    constructor(name,book){this.name=name;this.book=book;this.rows=[];}
    setName(name){delete this.book.sheets[this.name];this.name=name;this.book.sheets[name]=this;return this;}
    getLastRow(){return this.rows.length;}
    appendRow(row){if(fail===this.name)throw Error('SIMULATED_WRITE_FAILURE');this.rows.push(row.slice());return this;}
    getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())};}
    getRange(row,col,n=1,m=1){return {
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.rows[row-1+i]?.[col-1+j]??'')),
      setValues:values=>{if(fail===this.name)throw Error('SIMULATED_WRITE_FAILURE');
        values.forEach((r,i)=>r.forEach((v,j)=>{(this.rows[row-1+i]??=[])[col-1+j]=v;}));return this;}
    };}
  }
  class Book{
    constructor(){this.sheets={};this.id='book'+Object.keys(books).length;this.name='Allindy + Fibo — fixture';this.insertSheet('Sheet1');books[this.id]=this;}
    getId(){return this.id;}getName(){return this.name;}getSheets(){return Object.values(this.sheets);}
    getSheetByName(n){return this.sheets[n]||null;}insertSheet(n){return this.sheets[n]=new Sheet(n,this);}
  }
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const c={console,Date:Clock,AF_MT5_RUN:{responses:{old:true},quote:{old:true},metadata:{old:true}},
    afAssertSandbox_(){},afRequireUser_(u){if(u!=='owner')throw Error('DENIED');},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>{
      assert.equal(k,'AF_SHEET_ID','only workspace ID may be read');return props[k]||null;
    },setProperty:(k,v)=>{props[k]=v;}})},
    SpreadsheetApp:{create:()=>new Book(),openById:id=>books[id],flush:()=>{if(fail==='flush')throw Error('SIMULATED_FLUSH_FAILURE');}},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false,'nested lock');held=true;acquires++;},
      releaseLock(){assert.equal(held,true);held=false;}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe:arr=>Buffer.from(arr).toString('base64url'),getUuid:()=>String(++uuid),
      formatDate:(d,tz,fmt)=>{assert.equal(tz,'Asia/Bangkok');assert.equal(fmt,'yyyy-MM-dd');
        return new Date(d.getTime()+7*3600000).toISOString().slice(0,10);}},
    afMt5Quote_:()=>{fetches++;if(c.badFeed)throw Error('feed unavailable');return {quote_usable:true};},
    afReadMarket_:(tf,n)=>{fetches++;assert.equal(tf,'1m');assert.equal(n,3000);
      if(c.marketUnavailable)throw Error('market unavailable');
      return {symbol:'XAUUSD',sourceId:'Eightcap-MT5-Live',bars:c.bars||[]};}
  };
  vm.createContext(c);vm.runInContext(source,c,{filename:'ResearchLog.gs'});
  return {c,time:v=>{now=v;},get book(){return Object.values(books)[0];},
    get acquires(){return acquires;},get fetches(){return fetches;},fail:v=>{fail=v;},
    lock:fn=>c.afResearchLock_(fn),record:(r=response(),q=request())=>c.afResearchLock_(()=>c.afAuditRecord_(r,q))};
}
function request(){return {user:'owner',symbol:'XAUUSD',tradeType:'scalping',model:'unused'};}
function response(){return {runId:'run1',success:true,status:'PAPER_SIGNAL_READY',plan:{
  side:1,entry:100,stop:95,target:110,netR:1.8,createdAt:T-M,
  evidence:{zoneId:'zone1',fiboId:'fibo1',executionTF:'5m'}},
  audit:{snapshot:{quote:{spread:1}},candidates:[{id:'a',accepted:true},{id:'b',accepted:false,gates:['RR']}],
    gates:[{id:'data',status:'CLEAR'}],versions:{schema:1,planner:'fixture'},
    newsCoverage:[{from:T,to:T+100*M,knownAt:T,status:'CLEAR'}]}};}
function bar(t=T,o=102,h=104,l=101,c=102){return {openTime:t,closeTime:t+M,open:o,high:h,low:l,close:c,confirmed:true};}
function paper(e){e.record();return e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];}
function active(e,side=1){let p=paper(e);p.state='ACTIVE';p.fillAt=T;p.fillPrice=100;
  if(side===-1){p.side=-1;p.stop=105;p.target=90;}return p;}
function plain(v){return JSON.parse(JSON.stringify(v));}
test('first initialization under caller lock has no nested lock',()=>{
  const e=env();e.record();assert.equal(e.acquires,1);
  ['Analysis','Plans','Audit','Snapshots','Events','PaperPlans'].forEach(n=>assert.ok(e.book.getSheetByName(n)));
});
test('all rejected candidates, gates, versions and accepted snapshot durable',()=>{
  const e=env(),r=e.record(),a=e.c.afResearchReadBlob_(e.book,r.auditRef,r.auditHash);
  assert.equal(a.candidates.length,2);assert.equal(a.candidates[1].accepted,false);assert.equal(a.versions.planner,'fixture');
  assert.equal(a.acceptedPlan.entry,100);assert.equal(a.snapshot.quote.spread,1);
});
test('NO_TRADE and data-stage failures are always logged without plans',()=>{
  const e=env();e.record({runId:'no',success:false,status:'NO_TRADE',audit:{candidates:[],gates:[]}});
  e.record({runId:'fail',success:false,status:'DATA_UNAVAILABLE'});
  assert.equal(e.book.getSheetByName('Audit').rows.length,3);assert.equal(e.book.getSheetByName('PaperPlans').rows.length,1);
});
test('economic dedup ignores run ID and origin retains original audit',()=>{
  const e=env(),a=e.record(),r=response();r.runId='different';r.plan.createdAt=T-100*M;
  const b=e.record(r);assert.equal(b.deduplicated,true);assert.equal(a.planKey,b.planKey);
  assert.equal(e.book.getSheetByName('PaperPlans').rows.length,2);
  assert.equal(e.c.afResearchDashboard('owner').plans[0].runId,'run1');
});
test('economic key varies by side zone fibo prices and execution TF',()=>{
  const e=env(),p=response().plan,k=e.c.afPaperKey_(p,'XAUUSD');
  for(const field of ['entry','stop','target','side']){const q=plain(p);q[field]++;assert.notEqual(k,e.c.afPaperKey_(q,'XAUUSD'));}
  for(const field of ['zoneId','fiboId','executionTF']){const q=plain(p);q.evidence[field]='different';assert.notEqual(k,e.c.afPaperKey_(q,'XAUUSD'));}
});
test('context alias is accepted; snapshot does not retain secret keys',()=>{
  const e=env(),r=response();r.audit.context=r.audit.snapshot;delete r.audit.snapshot;
  r.audit.context.apiKey='private';r.audit.context.username='person';r.audit.context.nested={token:'secret',safe:7};
  const ref=e.record(r),a=e.c.afResearchReadBlob_(e.book,ref.auditRef);
  assert.equal(a.snapshot.apiKey,undefined);assert.equal(a.snapshot.username,undefined);assert.equal(a.snapshot.nested.safe,7);
});
test('chunked JSON <40k formula-safe monotonic keyed and exact Unicode roundtrip',()=>{
  const e=env();e.record();const value={text:'x'.repeat(35980)+'😀'.repeat(40000)+'=HYPERLINK("bad")'};
  const ref=e.lock(()=>e.c.afResearchBlob_(e.book,value));
  assert.deepEqual(plain(e.c.afResearchReadBlob_(e.book,ref.ref,ref.hash)),value);
  const rows=e.book.getSheetByName('Snapshots').rows.slice(1);
  rows.forEach((r,i)=>{assert.equal(r[0],i+1);assert.ok(r[5].length<40000);assert.equal(r[5].slice(0,2),'J:');});
});
test('tampered or missing chunks fail closed',()=>{
  const e=env(),r=e.record(),s=e.book.getSheetByName('Snapshots');s.rows[1][5]+='x';
  assert.throws(()=>e.c.afResearchReadBlob_(e.book,r.auditRef),/HASH/);s.rows.splice(1,1);
  assert.throws(()=>e.c.afResearchReadBlob_(e.book,r.auditRef),/CHUNKS/);
});
test('formula prefix is escaped in direct cells',()=>{
  const e=env();for(const s of ['=1','+cmd','-cmd','@foo',' \t=bad'])assert.equal(e.c.afResearchCell_(s),"'"+s);
});
test('storage failures throw and retry after plan commit deduplicates',()=>{
  const e=env();e.lock(()=>e.c.afResearchBookLocked_());e.fail('Events');
  assert.throws(()=>e.record(),/SIMULATED/);e.fail(null);
  assert.equal(e.record().deduplicated,true);assert.equal(e.book.getSheetByName('PaperPlans').rows.length,2);
});
test('audit chunk failure cannot claim saved or create plan',()=>{
  const e=env();e.lock(()=>e.c.afResearchBookLocked_());e.fail('Snapshots');assert.throws(()=>e.record(),/SIMULATED/);
  assert.equal(e.book.getSheetByName('PaperPlans').rows.length,1);
});
test('existing sheet data and incompatible header never cleared',()=>{
  const e=env();e.record();e.book.getSheetByName('Audit').rows[0][0]='foreign';
  const n=e.book.getSheetByName('Snapshots').rows.length;
  assert.throws(()=>e.record(),/HEADER/);assert.equal(e.book.getSheetByName('Snapshots').rows.length,n);
});
test('createdAt is acceptance time; partial minute schedules next M1 PENDING',()=>{
  const e=env();e.time(T+1);const p=paper(e);assert.equal(p.createdAt,T+1);assert.equal(p.originalCreatedAt,T-M);
  assert.equal(p.state,'PENDING');assert.equal(p.activationAt,T+M);assert.equal(p.lastBarClose,T+M);
  assert.equal(p.expiresAt,T+61*M);assert.equal(p.fillAt,null);
});
test('missing spread or structured evidence becomes REVIEW',()=>{
  for(const mutate of [r=>{delete r.audit.snapshot.quote.spread;},r=>{delete r.audit.versions;}]){
    const e=env(),r=response();mutate(r);assert.equal(e.record(r).state,'REVIEW');}
});
test('BUY LIMIT requires bid low PLUS frozen spread <= entry',()=>{
  const e=env(),p=paper(e);assert.equal(e.c.afPaperStep_(p,bar(T,102,104,99.5,102)).state,'PENDING');
  const next=e.c.afPaperStep_(p,bar(T,102,104,99,102));assert.equal(next.state,'ACTIVE');assert.equal(next.fillPrice,100);
});
test('SELL LIMIT uses bid high; SELL TP uses Ask not Bid',()=>{
  const e=env(),p=active(e,-1);p.state='PENDING';p.fillAt=null;
  assert.equal(e.c.afPaperStep_(p,bar(T,98,99.5,97,98)).state,'PENDING');
  assert.equal(e.c.afPaperStep_(p,bar(T,98,100,97,98)).state,'ACTIVE');
  p.state='ACTIVE';assert.equal(e.c.afPaperStep_(p,bar(T,92,93,89.5,92)).state,'ACTIVE');
  const end=e.c.afPaperStep_(p,bar(T,92,93,89,92));assert.equal(end.state,'TP');assert.equal(end.exitPrice,90);
});
test('BUY exits on bid; limit TP gap remains target, no favorable improvement',()=>{
  const e=env(),p=active(e),out=e.c.afPaperStep_(p,bar(T,112,114,111,113));
  assert.equal(out.state,'TP');assert.equal(out.exitPrice,110);assert.equal(out.pnlPrice,9.98);
});
test('adverse stop gap uses BUY bid open and SELL ask open',()=>{
  const e=env();let out=e.c.afPaperStep_(active(e),bar(T,92,94,91,93));
  assert.equal(out.state,'SL');assert.equal(out.exitPrice,92);assert.equal(out.pnlPrice,-8.02);
  out=e.c.afPaperStep_(active(e,-1),bar(T,106,107,105,106));assert.equal(out.exitPrice,107);assert.equal(out.pnlPrice,-7.02);
});
test('entry plus either exit and same-bar dual exits never count a win',()=>{
  const e=env(),p=paper(e);
  for(const b of [bar(T,102,111,99,102),bar(T,102,104,94,102)]){
    const out=e.c.afPaperStep_(p,b);assert.equal(out.state,'REVIEW');assert.equal(out.fillAt,null);assert.equal(out.pnlPrice,null);}
  const out=e.c.afPaperStep_(active(e),bar(T,100,112,94,100));assert.equal(out.state,'REVIEW');
});
test('missing partial/pre-created/skipped minute and weekend gap REVIEW',()=>{
  const e=env(),p=paper(e);
  for(const at of [T-M,T+M,T+2*24*60*M])assert.equal(e.c.afPaperStep_(p,bar(at)).state,'REVIEW');
});
test('pending expiry exactly 12 execution bars through observed M1 only',()=>{
  const e=env();let p=paper(e);assert.equal(p.expiresAt,T+60*M);
  for(let i=0;i<60;i++){p=e.c.afPaperStep_(p,bar(T+i*M));assert.equal(p.state,i===59?'EXPIRED':'PENDING');}
});
test('ACTIVE has no expiry and frozen geometry/metadata unaffected',()=>{
  const e=env(),p=active(e);p.expiresAt=T;const before=plain(p);
  const out=e.c.afPaperStep_(p,bar());assert.equal(out.state,'ACTIVE');assert.deepEqual(plain(p),before);
  ['entry','stop','target','costs','metadata'].forEach(k=>assert.deepEqual(plain(out[k]),plain(p[k])));
});
test('target before entry cancels execution only',()=>{
  const e=env(),p=paper(e),out=e.c.afPaperStep_(p,bar(T,106,111,105,107));
  assert.equal(out.state,'CANCELLED');assert.equal(out.metadata.evidence.fiboId,'fibo1');
});
test('archived blocked news cancels; unknown/future news does not imply CLEAR',()=>{
  const e=env(),p=paper(e);p.newsCoverage[0].status='BLOCKED';assert.equal(e.c.afPaperStep_(p,bar()).state,'CANCELLED');
  p.newsCoverage=[];assert.equal(e.c.afPaperStep_(p,bar(T,102,104,99,102)).reason,'ENTRY_NEWS_HISTORY_UNKNOWN');
  p.newsCoverage=[{from:T,to:T+M,knownAt:T+1,status:'CLEAR'}];
  assert.equal(e.c.afPaperStep_(p,bar(T,102,104,99,102)).state,'REVIEW');
});
test('stats exclude every unresolved state',()=>{
  const e=env(),plans=e.c.AF_PAPER_STATES.map(state=>({state,pnlPrice:null,fillAt:null}));
  plans.push({state:'TP',pnlPrice:2,fillAt:T},{state:'SL',pnlPrice:-1,fillAt:T});
  const s=e.c.afPaperSummary_(plans);assert.equal(s.stats.resolved,2);assert.equal(s.stats.pnlPrice,1);assert.equal(s.stats.excludedUnresolved,7);
});
test('manual refresh fresh provider replay persisted exactly once with evidence',()=>{
  const e=env();e.record();e.time(T+2*M);
  e.c.bars=[bar(T,102,104,99,102),bar(T+M,106,111,105,108)];
  const result=e.c.afRefreshPaper('owner');assert.equal(result.counts.TP,1);assert.equal(result.counts.Entry,1);
  assert.equal(result.realBroker,false);assert.equal(e.fetches,1);assert.deepEqual(plain(e.c.AF_MT5_RUN.responses),{});
  const p=e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];
  assert.equal(e.c.afResearchReadBlob_(e.book,p.replayEvidence.ref,p.replayEvidence.hash).bars.length,2);
  const n=e.book.getSheetByName('PaperPlans').rows.length;
  assert.equal(e.c.afRefreshPaper('owner').changed,0);assert.equal(e.book.getSheetByName('PaperPlans').rows.length,n);
});
test('stale/no-new bars and unavailable quotes keep PENDING without invented outcomes',()=>{
  for(const bad of [false,true]){const e=env();e.record();e.time(T+M);e.c.badFeed=bad;e.c.bars=[bar(T-M)];
    const out=e.c.afRefreshPaper('owner');assert.equal(out.counts.Pending,1);assert.equal(out.counts.Review,0);assert.equal(out.stats.resolved,0);}
});
test('forming/unordered/duplicate feed fails closed without manufacturing an outcome',()=>{
  for(const bars of [[bar(T+M)],[bar(T),bar(T)],[bar(T+M),bar(T)]]){
    const e=env();e.record();e.time(T+M);e.c.bars=bars;
    const out=e.c.afRefreshPaper('owner');assert.equal(out.counts.Pending,1);assert.equal(out.counts.Review,0);assert.equal(out.changed,0);
  }
});
test('no expiry from clock alone; unavailable coverage waits, never backfills from now',()=>{
  const e=env();e.record();e.time(T+3*24*60*M);e.c.badFeed=true;
  const out=e.c.afRefreshPaper('owner');assert.equal(out.counts.EXPIRED,0);assert.equal(out.counts.REVIEW,0);assert.equal(out.counts.PENDING,1);
});
test('dashboard stable public schema, Bangkok date, no provider or AI polling',()=>{
  const e=env();e.record();e.time(Date.parse('2026-10-24T18:00:00Z'));
  const d=e.c.afResearchDashboard('owner');assert.equal(e.fetches,0);assert.equal(d.mode,'TEST');
  assert.equal(d.today.date,'2026-10-25');assert.equal(d.today.entries,0);assert.equal(d.realBroker,false);
  assert.equal(d.recentRuns[0].runId,'run1');assert.equal(d.latestRuns[0].candidates.length,2);
  assert.equal(d.plans[0].entry,100);assert.equal(d.plans[0].netR,1.8);assert.ok(d.plans[0].id);
  assert.equal(d.desiredRange.researchOnly,true);assert.equal(d.desiredRange.enforcedQuota,false);
  assert.equal(d.counts.Pending,1);assert.equal(d.counts.Active,0);
});
test('today modeled fills uses Bangkok fill candle close; REVIEW is not manufactured fill',()=>{
  const e=env();e.record();e.time(T+M);e.c.bars=[bar(T,102,104,99,102)];e.c.afRefreshPaper('owner');
  const d=e.c.afResearchDashboard('owner');assert.equal(d.today.entries,1);assert.equal(d.todayPaperFills[0].realBroker,false);
});
test('owner-only retrieval refresh and cancellation',()=>{
  const e=env();assert.throws(()=>e.c.afResearchDashboard('other'),/DENIED/);
  assert.throws(()=>e.c.afRefreshPaper('other'),/DENIED/);assert.throws(()=>e.c.afPaperCancel_('other','x'),/DENIED/);
  const p=paper(e);assert.equal(e.c.afPaperCancel_('owner',p.key).state,'CANCELLED');
  assert.equal(e.c.afResearchDashboard('owner').plans[0].state,'CANCELLED');
});
test('TF string and equivalent milliseconds share economic key',()=>{
  const e=env(),p=response().plan,q=plain(p);delete q.evidence.executionTF;q.tfMs=300000;
  assert.equal(e.c.afPaperKey_(p,'XAUUSD'),e.c.afPaperKey_(q,'XAUUSD'));
});
test('flush failures propagate and committed-plan retry never re-enters',()=>{
  const e=env();e.fail('flush');assert.throws(()=>e.record(),/FLUSH/);e.fail(null);
  assert.equal(e.record().deduplicated,true);assert.equal(e.c.afResearchDashboard('owner').total,1);
});
test('NO_TRADE appends run event and carries staged reason',()=>{
  const e=env(),r=response();r.success=false;r.plan=null;r.status='NO_TRADE';r.audit.reason='NO_ELIGIBLE_GEOMETRY';
  e.record(r);const d=e.c.afResearchDashboard('owner');assert.equal(d.recentRuns[0].reason,'NO_ELIGIBLE_GEOMETRY');
  assert.equal(e.book.getSheetByName('Events').rows[1][4],'AUDIT_RECORDED');
});


function archivedNews(overrides={}){return Object.assign({ok:true,sourceAgeMinutes:0,events:[],beforeMinutes:2,afterMinutes:1},overrides);}
test('mid-minute refresh ignores creation interval touches and cannot fill before activation',()=>{
  const e=env();e.time(T+30000);const p=paper(e);
  e.time(T+M);e.c.bars=[bar(T-M,102,104,99,102),bar(T,102,104,99,102)];
  let out=e.c.afRefreshPaper('owner');assert.equal(out.counts.PENDING,1);assert.equal(out.changed,0);
  assert.equal(e.c.afResearchDashboard('owner').plans[0].fillAt,null);
  e.time(T+2*M);e.c.bars.push(bar(T+M));out=e.c.afRefreshPaper('owner');
  assert.equal(out.counts.PENDING,1);assert.equal(out.counts.ACTIVE,0);
  const latest=e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];
  assert.equal(latest.lastBarClose,T+2*M);assert.equal(latest.activationAt,p.activationAt);
  e.time(T+3*M);e.c.bars.push(bar(T+2*M,102,104,99,102));out=e.c.afRefreshPaper('owner');
  assert.equal(out.counts.ACTIVE,1);assert.equal(out.realBroker,false);
});
test('mid-minute TTL starts at activation and expires after exactly twelve execution bars',()=>{
  for(const [tf,minutes] of [['1m',1],['5m',5],['15m',15]]){
    const e=env(),r=response();r.plan.evidence.executionTF=tf;e.time(T+1);e.record(r);
    let p=e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];
    assert.equal(p.expiresAt,T+M+12*minutes*M);
    for(let i=0;i<12*minutes;i++){p=e.c.afPaperStep_(p,bar(T+M+i*M));assert.equal(p.state,i===12*minutes-1?'EXPIRED':'PENDING');}
  }
});
test('archive news knownAt rounds up; freshness window never covers past or partial minutes',()=>{
  const e=env(),at=T+30000,spans=e.c.afArchiveNewsCoverage_(archivedNews({sourceAgeMinutes:3}),at);
  assert.equal(spans.length,41);assert.equal(spans[0].from,T+M);assert.equal(spans[0].knownAt,at);
  assert.equal(spans.at(-1).to,T+42*M);assert.ok(spans.every(s=>s.status==='CLEAR'&&s.from>=at&&s.to<=at+42*M));
  const p={newsCoverage:spans};assert.equal(e.c.afPaperHistoricalNews_(p,bar(T)),'UNKNOWN');
  assert.equal(e.c.afPaperHistoricalNews_(p,bar(T+M)),'CLEAR');
  assert.equal(e.c.afPaperHistoricalNews_(p,bar(T+42*M)),'UNKNOWN');
  for(const age of [45,46])assert.equal(e.c.afArchiveNewsCoverage_(archivedNews({sourceAgeMinutes:age}),T).length,0);
  assert.equal(e.c.afArchiveNewsCoverage_(archivedNews(),undefined).length,0);
  assert.equal(e.c.afArchiveNewsCoverage_(archivedNews({ok:false}),T).length,0);
});
test('archive news blocks pre/post event window and blocked wins over overlapping clear',()=>{
  const e=env(),spans=e.c.afArchiveNewsCoverage_(archivedNews({events:[{timestamp:(T+10*M)/1000}]}),T),p={newsCoverage:spans};
  for(const i of [7,8,9,10,11])assert.equal(e.c.afPaperHistoricalNews_(p,bar(T+i*M)),'BLOCKED');
  for(const i of [6,12])assert.equal(e.c.afPaperHistoricalNews_(p,bar(T+i*M)),'CLEAR');
  p.newsCoverage.push({from:T,to:T+45*M,knownAt:T,status:'CLEAR'});
  assert.equal(e.c.afPaperHistoricalNews_(p,bar(T+10*M)),'BLOCKED');
});
test('audit news snapshot derives durable coverage; explicit array including empty overrides',()=>{
  for(const supplied of [undefined,[],[{from:T,to:T+M,knownAt:T,status:'BLOCKED'}]]){
    const e=env(),r=response();delete r.audit.newsCoverage;r.audit.newsSnapshot=archivedNews();r.audit.newsKnownAt=T;
    if(supplied!==undefined)r.audit.newsCoverage=supplied;
    const result=e.record(r),p=e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];
    const expected=supplied===undefined?plain(e.c.afArchiveNewsCoverage_(r.audit.newsSnapshot,T)):supplied;
    assert.deepEqual(plain(p.newsCoverage),expected);
    if(supplied&&supplied.length)assert.equal(e.c.afPaperStep_(p,bar()).state,'CANCELLED');
    assert.deepEqual(plain(e.c.afResearchReadBlob_(e.book,result.auditRef,result.auditHash).newsCoverage),expected);
  }
});
test('future-known calendar cannot contaminate earlier entry replay',()=>{
  const e=env(),r=response();delete r.audit.newsCoverage;r.audit.newsSnapshot=archivedNews();r.audit.newsKnownAt=T+M;e.record(r);
  const p=e.c.afPaperLatest_(e.book,e.c.afResearchHash_('owner'))[0];
  assert.equal(e.c.afPaperStep_(p,bar(T,102,104,99,102)).reason,'ENTRY_NEWS_HISTORY_UNKNOWN');
});
test('weekend replay resolves historical closed M1 with no fresh quote dependency',()=>{
  const e=env();e.record();e.c.afMt5Quote_=()=>{throw Error('QUOTE MUST NOT BE REQUESTED');};
  e.time(T+2*24*60*M);e.c.bars=[bar(T,102,104,99,102),bar(T+M,106,111,105,108)];
  const out=e.c.afRefreshPaper('owner');assert.equal(out.counts.TP,1);assert.equal(out.feed,'VERIFIED_CLOSED_M1');assert.equal(e.fetches,1);
});
test('transient market outage and no-new-bars preserve both PENDING and ACTIVE',()=>{
  for(const state of ['PENDING','ACTIVE'])for(const unavailable of [true,false]){
    const e=env();let p=paper(e);if(state==='ACTIVE'){p.state=state;p.fillAt=T;p.fillPrice=100;e.lock(()=>e.c.afPaperCommit_(e.book,p,'TEST_ACTIVE','PENDING'));}
    const rows=e.book.getSheetByName('PaperPlans').rows.length;e.time(T+100*M);e.c.marketUnavailable=unavailable;e.c.bars=[bar(T-M)];
    const out=e.c.afRefreshPaper('owner');assert.equal(out.counts[state],1);assert.equal(out.counts.REVIEW,0);assert.equal(out.changed,0);
    assert.equal(e.book.getSheetByName('PaperPlans').rows.length,rows);
  }
});
test('proven internal M1 gap produces REVIEW rather than inferred fill or win',()=>{
  const e=env();e.record();e.time(T+3*M);e.c.bars=[bar(T),bar(T+2*M,102,104,99,102)];
  const out=e.c.afRefreshPaper('owner');assert.equal(out.counts.REVIEW,1);assert.equal(out.counts.Entry,0);assert.equal(out.stats.resolved,0);
  assert.equal(e.c.afResearchDashboard('owner').plans[0].reason,'MISSING_OR_INVALID_M1_COVERAGE');
});
test('H prefix prevents leading-minus base64 formula escaping and dashboard hash mismatch',()=>{
  const e=env();let value;
  for(let i=0;i<10000;i++){const s='hash-regression-'+i;if(crypto.createHash('sha256').update(s).digest('base64url').startsWith('-')){value=s;break;}}
  assert.ok(value);const hash=e.c.afResearchHash_(value);assert.ok(hash.startsWith('H:-'));assert.equal(e.c.afResearchCell_(hash),hash);
  let payload;
  for(let i=0;i<10000;i++){const candidate={i};if(crypto.createHash('sha256').update(JSON.stringify(candidate)).digest('base64url').startsWith('-')){payload=candidate;break;}}
  assert.ok(payload);e.record();const hazard=e.lock(()=>e.c.afResearchBlob_(e.book,payload));
  assert.ok(hazard.hash.startsWith('H:-'));assert.deepEqual(plain(e.c.afResearchReadBlob_(e.book,hazard.ref,hazard.hash)),payload);
  const ref=e.lock(()=>e.c.afResearchBlob_(e.book,{value,text:'😀'.repeat(50000)}));
  assert.deepEqual(plain(e.c.afResearchReadBlob_(e.book,ref.ref,ref.hash)),{value,text:'😀'.repeat(50000)});
  assert.equal(e.c.afResearchDashboard('owner').total,1);
  for(const sheet of e.book.getSheets())for(const row of sheet.rows.slice(1))for(const cell of row){
    if(typeof cell==='string'&&cell.startsWith('H:'))assert.equal(e.c.afResearchCell_(cell),cell);
  }
});
test('multi-chunk payload corruption and removal fail closed after hash prefix fix',()=>{
  const e=env();e.record();const ref=e.lock(()=>e.c.afResearchBlob_(e.book,{text:'z'.repeat(100000)}));
  const sheet=e.book.getSheetByName('Snapshots'),rows=sheet.rows.filter(r=>r[1]===ref.ref);assert.ok(rows.length>=3);
  const original=rows[1][5];rows[1][5]+='x';assert.throws(()=>e.c.afResearchReadBlob_(e.book,ref.ref,ref.hash),/HASH/);
  rows[1][5]=original;assert.equal(e.c.afResearchReadBlob_(e.book,ref.ref,ref.hash).text.length,100000);
  sheet.rows.splice(sheet.rows.indexOf(rows[1]),1);assert.throws(()=>e.c.afResearchReadBlob_(e.book,ref.ref,ref.hash),/CHUNKS/);
});
console.log('\n'+passed+' offline ResearchLog tests passed. No live provider or broker assertions.');
