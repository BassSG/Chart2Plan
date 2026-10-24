'use strict';
// Offline synthetic evidence only. Does NOT claim live provider/Pine/profit parity.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname,START=Date.UTC(2026,9,24,2,30,30),copy=x=>JSON.parse(JSON.stringify(x));
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
function runtime(provider=false){
 let now=START;class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const c=vm.createContext({Date:Clock,console});
 if(!provider)c.AF_PROVIDER_RUN={responses:{},quote:null,metadata:null};
 for(const name of ['Market.gs','Allindy.gs','Fibo.gs','AfUnifiedPlannerEngine.gs',...(provider?['Provider.gs']:[]),'Planner.gs','Workflow.gs'])
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c,{filename:name});
 c.setNow=n=>{now=n;};return c;
}
function fixture(){
 const close=tf=>Math.floor(START/tf)*tf,frames={};
 for(const [tf,ms] of Object.entries({'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000})){
  const end=close(ms),ohlc=[];
  const start=close(3600000)-7200000;
  for(let t=start;t<end;t+=ms)ohlc.push([t,t+ms,100,100.2,99.8,100,50]);
  frames[tf]={tfMs:ms,lastClosedUtc:new Date(end).toISOString(),atr:1,ema20:101,ema50:100,liquidity:[],closedOHLC:ohlc};
 }
 const zones=[1,-1].map(s=>({id:s===1?'buy-zone':'sell-zone',tf:'5m',tfMs:300000,side:s,
  lo:s===1?98:101,hi:s===1?99:102,atr:1,score:100,tests:0,knownAt:close(300000)-300000,
  sourceClose:close(300000),sourceVersion:'All-Indy-1.3.5',adapter:'afZoneReplay_',adapterVersion:null}));
 const fibos=[1,-1].map(s=>{const zero=s===1?96:104,span=3*s;return {
  id:s===1?'buy-fibo':'sell-fibo',tf:'1h',tfMs:3600000,side:s,sourceVersion:'EBW-Fibo-1.10.19',adapterVersion:'AF-FORM-CONTEXT-0.2',symbol:'XAUUSD',
  zero,span,root:s===1?95:105,knownAt:close(3600000)-3600000,sourceClose:close(3600000),born:close(3600000)-7200000,
  broken:true,invalidated:false,historyComplete:true,method:1,hitRatios:[],hitTimes:{},
  anchors:{a:{p:s===1?95:105,t:START-14400000,closeT:START-10800000,cycle:START-14400000,confirmed:true},
   b:{p:zero+span,t:START-10800000},c:{p:zero,t:START-7200000}},
  targets:[1.618,2,2.618,3.5,4.236,5.472].map(ratio=>({ratio,price:zero+span*ratio,pending:true,hitAt:null}))};});
 return {asOf:START,symbol:'XAUUSD',sourceId:'Eightcap-MT5-Live',executionTF:'5m',contextTF:'1h',style:'scalping',
  quote:{bid:100,ask:100.1,spread:0.1,timestamp:START/1000},frames,zones,fibos,
  coverage:{canonicalSD:'computed',normalFibo:'computed',OB_QML_Flip:'unavailable',NeckDivergence:'unavailable'}};
}
function build(c,x=fixture(),qc=null){return c.afPlannerBuild_(x,c.afPlannerQc_(qc),START);}
function buy(c,x=fixture(),qc=null){return build(c,x,qc).find(v=>v.side==='BUY');}
function decision(candidateId,extra={}){return Object.assign({decision:'PLAN',candidateId,analysis:'synthetic only',buyAssessment:'buy evidence',sellAssessment:'sell evidence'},extra);}
function auditValid(a){
 assert.equal(a.schemaVersion,'af.audit.v1');assert.match(a.evaluatedAt,/Z$/);assert.equal(typeof a.sourceVersion,'string');
 for(const k of ['symbol','executionTF','contextTF','quote','frames','modules','qc'])assert.ok(k in a.snapshot,k);
 for(const c of a.candidates)for(const k of ['id','stableKey','side','zoneId','fiboId','zoneTF','fiboTF','entry','stop','target','netR','evidenceScore','eligible','gateCodes','evidence'])assert.ok(k in c,k);
 (function walk(v){assert.notEqual(v,undefined);if(typeof v==='number')assert.ok(Number.isFinite(v));
  if(v&&typeof v==='object')Object.values(v).forEach(walk);})(a);
 assert.equal(JSON.stringify(a).includes('NaN'),false);
}
function workflow(opts={}){
 const c=runtime(),ctx=opts.ctx||fixture(),count={ai:0,quote:0,news:0,release:0,store:0};
 c.Utilities={getUuid:()=>String(count.ai)+'-test'};
 c.afRequireUser_=()=>{if(opts.auth)throw Error('AF_OWNER_CONTEXT_REQUIRED');};
 c.LockService={getScriptLock:()=>({tryLock:()=>!opts.busy,releaseLock:()=>{count.release++;}})};
 c.afNewsCheck_=()=>{count.news++;if(count.news>1&&opts.newsError)throw Error(opts.newsError);
  return count.news>1&&opts.newsAfter?opts.newsAfter:opts.news||{ok:true,canTrade:true};};
 c.afMt5Quote_=()=>{count.quote++;if(opts.quoteError&&count.quote>= (opts.postQuoteError?2:1))throw Error(opts.quoteError);
  return Object.assign({bid:100,ask:100.1,spread_price:.1,timestamp:START/1000},count.quote>1?opts.quoteAfter:{});};
 c.afMt5Json_=()=>({market_status:opts.rawStatus||'open',symbol:'XAUUSD',source_id:'Eightcap-MT5-Live',timestamp:START/1000});
 c.afBuildAnalystContext_=()=>{if(opts.dataError)throw Error(opts.dataError);return ctx;};
 c.afCallAnalyst_=(model,prompt)=>{count.ai++;if(opts.aiError)throw Error(opts.aiError);
  if(opts.delay)c.setNow(START+opts.delay);
  if(opts.aiResponse)return opts.aiResponse;
  var unifiedValid=[];
  try{var at=prompt.lastIndexOf('{\"snapshot\":');if(at>=0){var body=JSON.parse(prompt.slice(at)),dc=body.deterministicCandidates||{};unifiedValid=(dc.buy||[]).concat(dc.sell||[]).filter(function(v){return v.valid===true;});}}catch(_){}
  count.promptValidTrue=unifiedValid.length;
  var selected=opts.legacySelection?null:unifiedValid.find(function(v){return opts.sell?v.side===-1||v.side==='SELL':v.side===1||v.side==='BUY';});
  if(!selected)selected=build(c,ctx).find(function(v){return v.eligible&&(opts.sell?v.side==='SELL':v.side==='BUY');});
  return {decision:opts.aiDecision||decision(selected&&selected.id),cost:.01,usage:{prompt_tokens:60,completion_tokens:40,total_tokens:100,secret:'DO_NOT_RETURN'}};};
 c.afStoreResponse_=(r)=>{count.store++;if(opts.storeError)throw Error('private provider url token');
  return opts.storeFail?Object.assign({},r,{success:false,status:'SAVE_FAILED_OR_PARTIAL',plan:null}):r;};
 const r=c.processAnalysisWithDetailedLog('scalping',opts.symbol||'XAU/USD','owner','same-model',opts.qc);
 auditValid(r.audit);return {r,c,count};
}
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.gs')))new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
console.log('PARSE OK all GAS files');
test('deterministic accepted BUY and SELL before AI',()=>{
 const c=runtime(),a=build(c),b=build(c);assert.equal(a.length,2);assert.equal(JSON.stringify(a),JSON.stringify(b));
 assert.ok(a.every(x=>x.eligible&&x.netR>=1.5));assert.equal(new Set(a.map(x=>x.stableKey)).size,2);
 for(const v of a){const d=c.afPlannerDecision_(decision(v.id),a);assert.ok(d.accepted);assert.equal(d.plan.side,v.side==='BUY'?1:-1);assert.equal(d.plan.entry,v.entry);}
});
test('QC undefined/null/AUTO/auto are automatic, numeric strict',()=>{
 const c=runtime();for(const q of [undefined,null,'AUTO','auto',' Auto '])assert.equal(c.afPlannerQc_(q).threshold,null);
 for(const q of [NaN,Infinity,-1,101,'65','',false,{},[]])assert.throws(()=>c.afPlannerQc_(q),/AF_QC_INVALID/);
 assert.equal(c.afPlannerQc_(0).threshold,0);assert.equal(c.afPlannerQc_(100).threshold,100);
});
test('AI unknown IDs, arbitrary prices, invalid schemas, ineligible IDs rejected',()=>{
 const c=runtime(),list=build(c),id=list[0].id;
 for(const [d,code] of [[decision('unknown'),'AF_AI_UNKNOWN_CANDIDATE'],[decision(id,{entry:100}),'AF_AI_SCHEMA_INVALID'],
  [decision(id,{side:'BUY'}),'AF_AI_SCHEMA_INVALID'],[decision(id,{analysis:null}),'AF_AI_SCHEMA_INVALID'],
  [decision(id,{missingEvidence:['unknown OB']}),'AF_AI_MISSING_EVIDENCE'],[{decision:'NO_TRADE',candidateId:id,analysis:'a',buyAssessment:'b',sellAssessment:'s'},'AF_AI_SCHEMA_INVALID']])
  assert.equal(c.afPlannerDecision_(d,list).reasonCode,code);
 list[0].eligible=false;assert.equal(c.afPlannerDecision_(decision(id),list).reasonCode,'AF_AI_INELIGIBLE_CANDIDATE');
 assert.equal(c.afPlannerDecision_({decision:'NO_TRADE',candidateId:null,analysis:'a',buyAssessment:'b',sellAssessment:'s'},list).reasonCode,'AF_AI_NO_TRADE');
});
test('SL outward and TP conservative tick 0.01 on both sides',()=>{
 const c=runtime(),x=fixture();x.zones[0].lo=98.003;x.zones[0].hi=99.003;
 for(const v of build(c,x)){assert.ok(v.eligible);assert.ok(Math.abs(v.stop*100-Math.round(v.stop*100))<1e-8);
  const z=x.zones.find(z=>z.id===v.zoneId);assert.ok(v.side==='BUY'?v.stop<=z.lo-z.atr*.08:v.stop>=z.hi+z.atr*.08);
  assert.ok(v.side==='BUY'?v.target<=v.evidence.nextFibo.price:v.target>=v.evidence.nextFibo.price);}
});
test('first opposing zone (even exhausted/low score) clips TP',()=>{
 const c=runtime(),x=fixture();x.zones[1].tests=9;x.zones[1].score=0;
 const b=buy(c,x);assert.ok(b.eligible);assert.equal(b.target,100.99);assert.equal(b.evidence.firstObstacle.kind,'ZONE');
});
test('first liquidity clips before farther opposing zone',()=>{
 const c=runtime(),x=fixture();x.frames['15m'].liquidity=[{side:-1,price:100.3,knownAt:START-900000}];
 const b=buy(c,x);assert.ok(b.eligible);assert.equal(b.target,100.29);assert.equal(b.evidence.firstObstacle.kind,'LIQUIDITY');
});
test('near obstacle rejects net R rather than crossing it',()=>{
 const c=runtime(),x=fixture();x.frames['5m'].liquidity=[{side:-1,price:98.8,knownAt:START-300000}];
 assert.equal(buy(c,x).gateCodes[0],'AF_NET_RR_LOW');
});
test('no next target, already reached, or target behind entry never skips ahead',()=>{
 const c=runtime();let x=fixture();x.fibos[0].targets.forEach(t=>t.pending=false);x.fibos[0].hitRatios=x.fibos[0].targets.map(t=>t.ratio);
 assert.equal(buy(c,x).gateCodes[0],'AF_NO_NEXT_FIBO_TARGET');
 x=fixture();x.fibos[0].span=.2;x.fibos[0].targets.forEach(t=>t.price=x.fibos[0].zero+x.fibos[0].span*t.ratio);
 assert.equal(buy(c,x).gateCodes[0],'AF_NO_NEXT_FIBO_TARGET');
 x=fixture();x.zones=x.zones.slice(0,1);x.fibos[0].span=1;x.fibos[0].targets.forEach(t=>t.price=x.fibos[0].zero+t.ratio);
 assert.equal(buy(c,x).gateCodes[0],'AF_FIBO_TARGET_ALREADY_REACHED');
});
test('native shared IDs across TF do not collide; stable across run/order',()=>{
 const c=runtime(),x=fixture();x.zones[0].id='shared-zone';x.fibos[0].id='shared-fibo';
 x.zones.push(Object.assign({},x.zones[0],{tf:'15m',tfMs:900000}));
 x.fibos.push(Object.assign({},x.fibos[0],{tf:'4h',tfMs:14400000,sourceClose:Date.parse(x.frames['4h'].lastClosedUtc),knownAt:START-14400000,born:START-28800000}));
 const a=build(c,x);assert.equal(a.filter(v=>v.side==='BUY').length,4);assert.equal(new Set(a.map(v=>v.id)).size,a.length);
 const reverse=copy(x);reverse.zones.reverse();reverse.fibos.reverse();assert.equal(JSON.stringify(a),JSON.stringify(build(c,reverse)));
 const y=copy(x);y.sourceId='other';assert.notEqual(build(c,y)[0].stableKey,a[0].stableKey);
});
test('duplicate keys reject every ambiguous source and collapse deterministically',()=>{
 const c=runtime(),x=fixture();x.zones.push(Object.assign({},x.zones[0],{lo:98.1}));
 const a=build(c,x),b=a.find(v=>v.side==='BUY');assert.equal(b.eligible,false);assert.ok(b.gateCodes.includes('AF_DUPLICATE_SOURCE_KEY'));
 x.zones.reverse();assert.equal(JSON.stringify(build(c,x)),JSON.stringify(a));
 const y=fixture();y.fibos.push(copy(y.fibos[0]));assert.ok(buy(c,y).gateCodes.includes('AF_DUPLICATE_SOURCE_KEY'));
});
test('only referenced unknown modules block; method3 needs unavailable Neck',()=>{
 const c=runtime(),x=fixture();assert.ok(buy(c,x).eligible);x.coverage.canonicalSD='unknown';assert.equal(buy(c,x).gateCodes[0],'AF_MODULE_UNAVAILABLE');
 x.coverage.canonicalSD='computed';x.fibos[0].method=3;assert.equal(buy(c,x).gateCodes[0],'AF_MODULE_UNAVAILABLE');
});
test('invalid numerics, TF ATR, source times, stale data and costs fail closed',()=>{
 const c=runtime();const cases=[
  [x=>x.zones[0].lo='98','AF_ZONE_INVALID'],[x=>x.zones[0].tests=null,'AF_ZONE_INVALID'],
  [x=>x.zones[0].score=27,'AF_ZONE_SCORE_LOW'],[x=>x.frames['5m'].atr=0.1,'AF_STOP_ATR_RANGE'],
  [x=>x.frames['5m'].atr=NaN,'AF_FRAME_INVALID_OR_STALE'],[x=>x.zones[0].atr=100,'AF_STOP_ATR_RANGE'],
  [x=>x.zones[0].atr=.01,'AF_ZONE_EXHAUSTED_OR_WIDE'],[x=>x.zones[0].tfMs=60000,'AF_TF_INCOMPARABLE'],
  [x=>x.zones[0].knownAt=START+1,'AF_ZONE_NOT_KNOWABLE'],[x=>x.fibos[0].sourceClose=START+1,'AF_FIBO_NOT_KNOWABLE_OR_STALE'],
  [x=>x.fibos[0].historyComplete=false,'AF_FIBO_INVALID'],[x=>x.fibos[0].targets[0].price='100','AF_FIBO_TARGETS_INVALID'],
  [x=>x.fibos[0].targets[0].pending=null,'AF_FIBO_TARGETS_INVALID'],[x=>x.quote.timestamp-=121,'AF_QUOTE_INVALID_OR_STALE'],
  [x=>x.asOf-=121000,'AF_SNAPSHOT_STALE'],[x=>x.frames['5m'].lastClosedUtc=new Date(START-600000).toISOString(),'AF_FRAME_INVALID_OR_STALE'],
  [x=>{x.quote.ask=100.5;x.quote.spread=.5;},'AF_COST_TOO_HIGH']];
 for(const [mutate,code] of cases){const x=fixture();mutate(x);const b=buy(c,x);assert.equal(b.eligible,false,code);assert.equal(b.gateCodes[0],code);}
});
test('workflow accepts BUY/SELL using candidate prices, numeric side, audit and safe usage',()=>{
 for(const sell of [false,true]){const {r,count}=workflow({sell});assert.equal(r.status,'PAPER_SIGNAL_READY');assert.ok(r.success);
  assert.equal(r.plan.side,sell?-1:1);assert.equal(count.ai,1);assert.ok(count.promptValidTrue>0,'AI prompt must contain valid === true candidates');
  assert.ok(r.audit.candidates.filter(v=>String(v.id).startsWith('UNI:')).every(v=>v.valid===v.eligible),'Unified candidate valid alias matches eligibility');
  assert.equal(count.quote,2);assert.equal(count.news,2);assert.equal(count.release,1);
  assert.equal(typeof r.qcResult.percentage,'number');assert.equal(typeof r.qcResult.threshold,'number');assert.equal(r.usage.secret,undefined);
  const c=r.audit.candidates.find(v=>v.id===r.audit.selectedCandidateId);assert.equal(r.plan.entry,c.entry);assert.equal(r.plan.stop,c.stop);assert.equal(r.plan.target,c.target);
 }
});
test('early auth, busy, asset, QC and news skips carry audit; no AI',()=>{
 for(const [opts,status,stage] of [[{auth:true},'AUTH_REQUIRED','AUTH'],[{busy:true},'DATA_BUSY','LOCK'],
  [{symbol:'EURUSD'},'DATA_ASSET_UNAVAILABLE','INPUT'],[{qc:NaN},'INPUT_INVALID','INPUT'],
  [{news:{ok:true,canTrade:false}},'SKIP_NEWS','NEWS_PRE'],[{news:{ok:false,canTrade:false}},'DATA_NEWS_UNAVAILABLE','NEWS_PRE']]){
  const {r,count}=workflow(opts);assert.equal(r.status,status);assert.equal(r.audit.stage,stage);assert.equal(count.ai,0);assert.equal(r.plan,null);
 }
});
test('all rejected audit candidates preserved and AI not invoked',()=>{
 const x=fixture();x.zones.forEach(z=>z.tests=3);const {r,count}=workflow({ctx:x});
 assert.equal(r.audit.reasonCode,'AF_NO_ELIGIBLE_CANDIDATE');assert.equal(r.audit.candidates.length,2);assert.equal(count.ai,0);
 assert.ok(r.audit.candidates.every(c=>!c.eligible&&c.gateCodes.length));
});
test('stale snapshot and data/model exceptions classified without exception secrets',()=>{
 const x=fixture();x.asOf=START-121000;
 for(const opts of [{ctx:x},{dataError:'MT5_EMPTY_BARS'},{dataError:'https://secret.invalid/token'},
  {aiError:'AF_AI_REQUEST_FAILED'},{aiError:'AF_AI_HTTP_503'},{aiError:'AF_AI_JSON_INVALID'}]){
  const {r}=workflow(opts);assert.equal(r.success,false);assert.equal(r.plan,null);assert.equal(JSON.stringify(r).includes('secret.invalid'),false);
  if(opts.aiError)assert.equal(r.status,'MODEL_UNAVAILABLE');
 }
});
test('post-AI news unavailable/window have distinct stage, no signal',()=>{
 for(const ok of [true,false]){const {r,count}=workflow({newsAfter:{ok,canTrade:false}});
  assert.equal(r.audit.stage,'POST_NEWS');assert.equal(r.audit.reasonCode,ok?'AF_NEWS_WINDOW':'AF_NEWS_UNAVAILABLE');assert.equal(r.success,false);assert.equal(count.ai,1);
 }
});
test('post-AI invalid quote is QUOTE unavailable, not assumed closed',()=>{
 const {r}=workflow({quoteError:'MT5_QUOTE_NOT_FRESH_OR_VALID',postQuoteError:true});
 assert.equal(r.audit.stage,'POST_QUOTE');assert.equal(r.audit.reasonCode,'MT5_QUOTE_NOT_FRESH_OR_VALID');assert.notEqual(r.status,'SKIP_MARKET_CLOSED');
 const closed=workflow({quoteError:'MT5_QUOTE_NOT_FRESH_OR_VALID',rawStatus:'closed'}).r;
 assert.equal(closed.status,'SKIP_MARKET_CLOSED');assert.equal(closed.audit.stage,'QUOTE_PRE');
});
test('post-AI freshness, movement, entry touch, cost and RR gates',()=>{
 let r=workflow({delay:121000}).r;assert.equal(r.audit.reasonCode,'AF_SNAPSHOT_STALE');
 r=workflow({quoteAfter:{bid:101,ask:101.1}}).r;assert.equal(r.audit.reasonCode,'AF_QUOTE_MOVED');
 const x=fixture();Object.assign(x.zones[0],{lo:99.3,hi:100.3});Object.assign(x.zones[1],{lo:101.5,hi:102.5});
 const touched=workflow({ctx:x,quoteAfter:{bid:99.75,ask:99.8,spread_price:0.05}});r=touched.r;assert.equal(touched.count.ai,1);
 assert.equal(r.audit.stage,'POST_GATES');assert.equal(r.audit.reasonCode,'AF_LIMIT_ALREADY_MARKETABLE');
 r=workflow({quoteAfter:{ask:100.5,spread_price:.5}}).r;assert.equal(r.audit.reasonCode,'AF_COST_TOO_HIGH');assert.equal(r.audit.selectedCandidateId,null);
 const y=fixture();y.quote.ask=100;y.quote.spread=0;y.frames['5m'].liquidity=[{side:-1,price:99.75,knownAt:START-300000}];
 const rr=workflow({ctx:y});assert.equal(rr.count.ai,1);assert.equal(rr.r.audit.stage,'POST_GATES');assert.equal(rr.r.audit.reasonCode,'AF_NET_RR_LOW');
});
test('AI schema reject still rechecks quote/news; cannot spoof prices',()=>{
 const {r,count}=workflow({aiDecision:decision('fake',{entry:9999})});assert.equal(r.audit.reasonCode,'AF_AI_SCHEMA_INVALID');
 assert.equal(count.quote,2);assert.equal(count.news,2);assert.equal(r.plan,null);
});
test('store partial/catch keeps serializable audit and no exception text',()=>{
 const a=workflow({storeFail:true}).r;assert.equal(a.status,'SAVE_FAILED_OR_PARTIAL');assert.equal(a.audit.stage,'STORE');assert.equal(a.plan,null);
 const b=workflow({storeError:true}).r;assert.equal(b.success,false);assert.equal(b.audit.reasonCode,'AF_STORE_FAILED_OR_PARTIAL');assert.equal(b.message.includes('token'),false);
});
test('diagnostics public AI-free, secrets absent, modules truthful, all paths serialize',()=>{
 const {c,count}=workflow();count.ai=0;const r=c.afResearchDiagnostics();auditValid(r.audit);assert.equal(count.ai,0);
 assert.equal(r.aiCalled,false);assert.equal(r.audit.snapshot.modules.OB_QML_Flip,'unavailable');assert.equal(r.audit.snapshot.modules.canonicalSD,'computed');
 assert.equal(r.audit.snapshot.asOf,START);assert.equal(r.audit.snapshot.quote.timestamp,START/1000);
 assert.equal(r.audit.snapshot.frames['5m'].closedOHLC,undefined);assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
 auditValid(c.afResearchDiagnostics('scalping','EURUSD').audit);auditValid(c.afResearchDiagnostics('scalping','XAUUSD',NaN).audit);
});
test('real Provider wrapper: closed confirmed, open-stale/schema not mislabelled',()=>{
 const c=runtime(true);c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};
 for(const market_status of ['closed','open']){
  c.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({market_status,symbol:'XAUUSD',source_id:'Eightcap-MT5-Live',timestamp:START/1000})})};
  assert.throws(()=>c.afPlannerQuote_(),new RegExp(market_status==='closed'?'AF_MARKET_CLOSED':'MT5_QUOTE_NOT_FRESH_OR_VALID'));
 }
 // Provider validation permits session gaps in ordered bars; no invented gap reject.
 const ms=START/1000,iso=t=>new Date(t*1000).toISOString().slice(0,19),bars=[ms-30-600,ms-30-3600].map(t=>({time:t,timestamp:t,date:iso(t),datetime_utc:iso(t),datetime_th:iso(t+25200),open:100,high:102,low:98,close:101,spread:10,volume:1}));
 assert.equal(c.afMt5Bars_(bars,.01,300,ms).length,2);
});
test('real context adapters execute; coverage only after replay, preserve all obstacles',()=>{
 const c=runtime();c.afMt5Quote_=()=>({bid:100,ask:100.1,spread_price:.1,timestamp:START/1000});
 c.afLoadPack_=()=>{const p={};for(const [tf,ms] of Object.entries({'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000})){
  const end=Math.floor(START/ms)*ms;p[tf]=Array.from({length:60},(_,i)=>({openTime:end-(60-i)*ms,closeTime:end-(59-i)*ms,open:100+Math.sin(i),high:102+Math.sin(i),low:98+Math.sin(i),close:100+Math.cos(i),volume:1,confirmed:true}));}return p;};
 const ctx=c.afBuildAnalystContext_('scalping');assert.equal(c.afPlannerContextGate_(ctx,START),null);
 assert.equal(ctx.coverage.canonicalSD,'computed');assert.equal(ctx.coverage.OB_QML_Flip,'unavailable');assert.ok(ctx.frames['1m'].liquidity.length);
 assert.equal(c.afPlannerSnapshot_(ctx,c.afPlannerQc_(null)).provenance.canonicalSD.adapter,'afZoneReplay_');
 auditValid(Object.assign(c.afPlannerAudit_('real-context'),{snapshot:c.afPlannerSnapshot_(ctx,c.afPlannerQc_(null)),candidates:build(c,ctx)}));
 // Deterministic nonempty replay outputs test assembly metadata (the sine bars above need not form zones).
 c.afZoneReplay_=(bars,tfMs)=>[{sourceClose:bars[bars.length-1].closeTime,zones:[Object.assign(copy(fixture().zones[0]),{tfMs})],liquidity:[]}];
 c.afFiboReplay_=(bars,tfMs)=>({snapshots:[{records:[Object.assign(copy(fixture().fibos[0]),{tfMs})]}]});
 const assembled=c.afBuildAnalystContext_('scalping');assert.ok(assembled.zones.length);assert.ok(assembled.fibos.length);
 for(const z of assembled.zones){assert.equal(z.sourceVersion,'All-Indy-1.3.5');assert.equal(z.adapter,'afZoneReplay_');
  assert.equal(z.adapterVersion,null);assert.equal(z.sourceClose,Date.parse(assembled.frames[z.tf].lastClosedUtc));}
 for(const f of assembled.fibos)assert.equal(f.adapter,'afFiboReplay_');
});
test('frozen source evidence on accepted AND early-rejected candidates, independent of context',()=>{
 const c=runtime();for(const reject of [false,true]){
  const x=fixture(),qc=c.afPlannerQc_(null);if(reject)x.zones.forEach(z=>z.tests=3);
  const audit=c.afPlannerAudit_('frozen');audit.snapshot=c.afPlannerSnapshot_(x,qc);audit.candidates=build(c,x);
  const before=JSON.stringify(audit),b=audit.candidates.find(v=>v.side==='BUY'),e=b.evidence;
  assert.equal(b.eligible,!reject);assert.equal(e.zone.lo,98);assert.equal(e.zone.hi,99);assert.equal(e.zone.tests,reject?3:0);
  assert.equal(e.zone.score,100);assert.equal(e.zone.knownAt,x.zones[0].knownAt);assert.equal(e.zone.sourceClose,x.zones[0].sourceClose);
  for(const k of ['root','zero','span','born','method','broken','invalidated','historyComplete','knownAt','sourceClose'])assert.equal(e.fibo[k],x.fibos[0][k],k);
  assert.equal(e.fibo.targets.length,6);assert.equal(e.fibo.targets[0].pending,true);assert.equal(e.fibo.targets[0].hitAt,null);
  assert.equal(e.fibo.anchors.a.closeT,x.fibos[0].anchors.a.closeT);assert.equal(e.fibo.anchors.c.p,x.fibos[0].zero);
  x.zones[0].lo=1;x.zones[0].tests=100;x.zones[0].sourceClose=0;x.fibos[0].root=1;x.fibos[0].span=999;
  x.fibos[0].anchors.a.p=1;x.fibos[0].targets[0].price=1;x.fibos[0].hitRatios.push(2);x.fibos[0].hitTimes['2']=START;
  x.fibos[0].invalidated=true;x.frames['5m'].atr=999;x.frames['1h'].ema20=0;x.quote.bid=1;x.coverage.canonicalSD='unavailable';
  x.sourceId='mutated';x.zones.push(copy(x.zones[0]));x.fibos.length=0;qc.threshold=1;
  assert.equal(JSON.stringify(audit),before);auditValid(audit);
 }
});
test('source/adapter/policy provenance includes thresholds, not just planner version',()=>{
 const c=runtime(),x=fixture(),s=c.afPlannerSnapshot_(x,c.afPlannerQc_(70)),e=buy(c,x).evidence;
 for(const p of [s.provenance,e.provenance]){
  assert.equal(p.source.sourceId,'Eightcap-MT5-Live');assert.equal(p.canonicalSD.sourceVersion,'All-Indy-1.3.5');
  assert.equal(p.canonicalSD.adapter,'afZoneReplay_');assert.equal(p.canonicalSD.adapterVersion,null);
  assert.equal(p.normalFibo.sourceVersion,'EBW-Fibo-1.10.19');assert.equal(p.normalFibo.adapterVersion,'AF-FORM-CONTEXT-0.2');
  assert.equal(p.normalFibo.adapter,'afFiboReplay_');assert.equal(p.policy.version,c.AF_PLANNER_POLICY.version);
  assert.equal(p.policy.minNetR,1.5);assert.equal(p.policy.extraCost,.02);assert.equal(p.pineParityVerified,false);
 }
 assert.equal(e.fibo.sourceVersion,x.fibos[0].sourceVersion);assert.equal(s.qc.threshold,70);
 x.fibos[0].sourceVersion='unknown-source';const b=buy(c,x);assert.equal(b.gateCodes[0],'AF_FIBO_SOURCE_UNVERIFIED');
 assert.equal(b.evidence.fibo.sourceVersion,'unknown-source'); // Captured source claim != expected adapter provenance.
});
test('evidence whitelist bounded for oversized/cyclic payload, no provider/private fields',()=>{
 const c=runtime(),x=fixture(),huge='X'.repeat(200000),secret='DO_NOT_RETURN';x.zones[0].tests=3;
 x.providerConfig={apiKey:secret};x.zones[0].privateException=secret;x.zones[0].pattern=huge;
 x.fibos[0].anchors.a.privateException=secret;x.fibos[0].anchors.extra={secret};x.fibos[0].anchors.a.p={secret};
 x.fibos[0].targets=Array.from({length:10000},()=>({ratio:2,price:102,pending:true,hitAt:START,providerConfig:{secret}}));
 x.fibos[0].targets[0].ratio=huge;x.fibos[0].hitRatios=Array(10000).fill({secret});x.fibos[0].hitTimes.privateException=secret;
 x.fibos[0].privateException=x;x.frames['5m'].closedOHLC=Array(10000).fill(huge);x.coverage.extra={secret};
 const b=buy(c,x),s=c.afPlannerSnapshot_(x,c.afPlannerQc_(null)),text=JSON.stringify({s,e:b.evidence});
 assert.equal(b.evidence.zone.pattern.length,160);assert.equal(b.evidence.zone.truncated,true);
 assert.equal(b.evidence.fibo.truncated,true);assert.equal(b.evidence.fibo.targetCount,10000);assert.equal(b.evidence.fibo.targets.length,6);
 assert.equal(b.evidence.fibo.hitRatios.length,6);assert.equal(b.evidence.fibo.anchors.a.p,null);
 assert.equal(Object.keys(b.evidence.fibo.anchors).length,3);assert.ok(text.length<12000,'bounded snapshot + one candidate evidence');
 assert.equal(text.includes(secret),false);assert.equal(text.includes('privateException'),false);assert.equal(text.includes('providerConfig'),false);
});
test('first TP obstacle captures frozen bounds/source time or liquidity recognition time',()=>{
 const c=runtime(),x=fixture(),b=buy(c,x),old=JSON.stringify(b.evidence.firstObstacle);
 assert.equal(b.evidence.firstObstacle.source.lo,101);assert.equal(b.evidence.firstObstacle.source.knownAt,x.zones[1].knownAt);
 x.zones[1].lo=200;x.zones[1].knownAt=0;assert.equal(JSON.stringify(b.evidence.firstObstacle),old);
 const y=fixture();y.frames['15m'].liquidity=[{side:-1,price:100.3,knownAt:START-900000,secret:'DO_NOT_RETURN'}];
 const l=buy(c,y).evidence.firstObstacle;assert.equal(l.source.knownAt,START-900000);assert.equal(l.source.secret,undefined);
 y.frames['15m'].liquidity[0].knownAt=0;assert.equal(l.source.knownAt,START-900000);
});
test('empty zone/Fibo/no same-side pair reasons and per-side availability in workflow + diagnostics',()=>{
 for(const [kind,reason] of [['zones','AF_NO_ZONE_EVIDENCE'],['fibos','AF_NO_FIBO_EVIDENCE'],
  ['both','AF_NO_ZONE_OR_FIBO_EVIDENCE'],['opposite','AF_NO_SAME_SIDE_PAIR']]){
  const x=fixture();if(kind==='zones'||kind==='both')x.zones=[];if(kind==='fibos'||kind==='both')x.fibos=[];
  if(kind==='opposite'){x.zones=x.zones.filter(z=>z.side===1);x.fibos=x.fibos.filter(f=>f.side===-1);x.fibos.forEach(f=>f.targets.forEach(t=>{t.price=80;}));}
  const {r,c,count}=workflow({ctx:x});assert.equal(r.status,'NO_TRADE');assert.equal(r.audit.reasonCode,reason);
  assert.equal(r.audit.candidates.length,0);assert.equal(count.ai,0);
  const n=r.audit.snapshot.evidenceCounts;assert.equal(n.zones.total,x.zones.length);assert.equal(n.fibos.total,x.fibos.length);
  assert.equal(n.sameSidePairs.total,0);assert.equal(n.availability.BUY.sameSidePair,false);assert.equal(n.availability.SELL.sameSidePair,false);
  assert.equal(n.availability.BUY.modules.canonicalSD,'computed');assert.equal(n.availability.SELL.modules.NeckDivergence,'unavailable');
  assert.ok(r.audit.gateCodes.includes('AF_BUY_SAME_SIDE_PAIR_MISSING'));assert.ok(r.audit.gateCodes.includes('AF_SELL_SAME_SIDE_PAIR_MISSING'));
  const d=c.afResearchDiagnostics();assert.equal(d.audit.reasonCode,reason);assert.equal(count.ai,0);assert.ok(d.audit.gateCodes.includes(reason));auditValid(d.audit);
 }
});
test('availability describes raw pairs separately from required module and candidate eligibility',()=>{
 const c=runtime(),x=fixture();x.zones=x.zones.filter(z=>z.side===1);x.fibos=x.fibos.filter(f=>f.side===1);x.zones[0].tests=3;
 const s=c.afPlannerSnapshot_(x,c.afPlannerQc_(null));assert.equal(s.evidenceCounts.sameSidePairs.BUY,1);assert.equal(s.evidenceCounts.sameSidePairs.SELL,0);
 assert.equal(s.evidenceCounts.availability.BUY.sameSidePair,true);assert.equal(buy(c,x).eligible,false);
 assert.equal(s.evidenceCounts.availability.SELL.zones,false);assert.ok(s.evidenceCounts.gateCodes.includes('AF_SELL_ZONE_MISSING'));
 x.zones=[];x.coverage.canonicalSD='unavailable';const {r}=workflow({ctx:x});assert.equal(r.audit.reasonCode,'AF_MODULE_UNAVAILABLE');
 assert.equal(r.audit.snapshot.evidenceCounts.reasonCode,'AF_NO_ZONE_EVIDENCE');assert.equal(r.audit.snapshot.evidenceCounts.availability.BUY.modules.canonicalSD,'unavailable');
 assert.equal(workflow({auth:true}).r.audit.snapshot.evidenceCounts,null); // Not evaluated != observed empty.
});
test('returned audit snapshot/candidates detached after context mutation',()=>{
 const x=fixture(),{r}=workflow({ctx:x}),old=JSON.stringify(r.audit);
 x.zones[0].lo=0;x.fibos[0].targets[0].pending=false;x.fibos[0].anchors.a.p=0;x.quote.bid=0;x.frames['5m'].atr=0;
 x.coverage.normalFibo='unavailable';assert.equal(JSON.stringify(r.audit),old);
});
test('known sanitized AI cost/usage survive post-AI guards, request exceptions remain unknown',()=>{
 const opts=[{newsAfter:{ok:true,canTrade:false}},{newsAfter:{ok:false,canTrade:false}},
  {quoteError:'MT5_QUOTE_NOT_FRESH_OR_VALID',postQuoteError:true},{quoteError:'private exception DO_NOT_RETURN',postQuoteError:true},
  {delay:121000},{quoteAfter:{bid:101,ask:101.1}},{quoteAfter:{ask:100.3,spread_price:.3}},{storeError:true}];
 for(const o of opts){const {r,count}=workflow(o);assert.equal(count.ai,1);assert.equal(r.cost,.01);
  assert.deepEqual(copy(r.usage),{prompt_tokens:60,completion_tokens:40,total_tokens:100});assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);}
 for(const o of [{aiError:'AF_AI_REQUEST_FAILED'},{aiError:'private exception DO_NOT_RETURN'},{auth:true},{dataError:'MT5_EMPTY_BARS'}]){
  const {r}=workflow(o);assert.equal(r.cost,null);assert.deepEqual(copy(r.usage),{});}
});
test('invalid known AI billing never leaks arbitrary usage or nonfinite costs',()=>{
 for(const cost of [NaN,Infinity,-1,'0.01',null]){
  const {r}=workflow({newsAfter:{ok:true,canTrade:false},aiResponse:{cost,usage:{prompt_tokens:NaN,completion_tokens:-1,total_tokens:'100',apiKey:'DO_NOT_RETURN'}}});
  assert.equal(r.cost,null);assert.deepEqual(copy(r.usage),{});assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
 }
});
test('postChecks cost rejection preserves spread before/after and recomputable rejected evidence',()=>{
 const {r,c}=workflow({quoteAfter:{ask:100.3,spread_price:.3,timestamp:START/1000-1}}),a=r.audit,p=a.postChecks;
 const before=a.candidates.find(v=>v.id===p.attemptedCandidateId),after=p.candidate.rebuilt;
 assert.equal(r.audit.reasonCode,'AF_COST_TOO_HIGH');assert.equal(a.selectedCandidateId,null);
 assert.equal(a.snapshot.quote.spread,.1);assert.equal(p.quote.latest.spread,.3);assert.equal(p.quote.latest.ask,100.3);
 assert.equal(p.quote.latest.timestamp,START/1000-1);assert.equal(p.quote.ageMs,1000);assert.equal(p.quote.state,'AVAILABLE');
 assert.ok(before.eligible);assert.equal(after.id,before.id);assert.equal(after.eligible,false);assert.equal(after.evidence.cost,.32);
 assert.equal(before.evidence.cost,.1+a.snapshot.provenance.policy.extraCost);assert.equal(after.entry,before.entry);assert.equal(after.stop,before.stop);
 const risk=after.entry-after.stop,policy=a.snapshot.provenance.policy;
 assert.ok(p.quote.latest.spread+policy.extraCost>risk*policy.maxCostRisk+1e-8);
 assert.equal(after.evidence.risk,risk);assert.equal(p.candidate.code,'AF_COST_TOO_HIGH');assert.equal(p.candidate.state,'REJECTED');
 assert.deepEqual(copy(p.gateCodes),['AF_COST_TOO_HIGH']);
 const expectedNet=((after.target-after.entry)-p.quote.latest.spread-policy.extraCost)/(risk+p.quote.latest.spread+policy.extraCost);
 assert.ok(Math.abs(after.netR-expectedNet)<1e-9,'rejected evidence net R remains recomputable from the updated spread');
 assert.equal(p.news.state,'PASSED');assert.equal(p.snapshot.state,'PASSED');assert.equal(p.movement.state,'PASSED');
});
test('postChecks movement rejection records attempted ID and actual movement without claiming rebuild',()=>{
 const {r}=workflow({quoteAfter:{bid:101,ask:101.1}}),p=r.audit.postChecks;
 assert.equal(r.audit.reasonCode,'AF_QUOTE_MOVED');assert.equal(r.audit.snapshot.quote.bid,100);assert.equal(p.quote.latest.bid,101);
 assert.ok(r.audit.candidates.some(v=>v.id===p.attemptedCandidateId));assert.equal(r.audit.selectedCandidateId,null);
 assert.equal(p.movement.bidDelta,1);assert.equal(p.movement.absoluteBidDelta,1);assert.equal(p.movement.limit,.35);
 assert.equal(p.movement.state,'REJECTED');assert.equal(p.movement.code,'AF_QUOTE_MOVED');assert.equal(p.snapshot.ageMs,0);
 assert.deepEqual(copy(p.gateCodes),['AF_QUOTE_MOVED']);assert.equal(p.candidate.state,'NOT_RUN');assert.equal(p.candidate.rebuilt,null);
});
test('postChecks news unavailable/window keeps latest quote but no fabricated downstream pass',()=>{
 for(const ok of [false,true]){const {r}=workflow({newsAfter:{ok,canTrade:false,raw:'DO_NOT_RETURN'},quoteAfter:{ask:100.3,spread_price:.3}}),p=r.audit.postChecks;
  assert.equal(p.quote.latest.spread,.3);assert.equal(r.audit.snapshot.quote.spread,.1);assert.equal(p.news.ok,ok);assert.equal(p.news.canTrade,false);
  assert.equal(p.news.state,ok?'REJECTED':'UNAVAILABLE');assert.equal(p.news.code,ok?'AF_NEWS_WINDOW':'AF_NEWS_UNAVAILABLE');
  assert.equal(p.snapshot.state,'NOT_RUN');assert.equal(p.snapshot.checkedAt,null);assert.equal(p.snapshot.ageMs,0);
  assert.equal(p.movement.state,'NOT_RUN');assert.equal(p.movement.checkedAt,null);assert.equal(p.candidate.rebuilt,null);
  assert.ok(p.attemptedCandidateId);assert.equal(r.audit.selectedCandidateId,null);assert.deepEqual(copy(p.gateCodes),[p.news.code]);
  assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
 }
});
test('postChecks invalid quote and catches expose only safe state/code, not raw provider errors',()=>{
 for(const quoteError of ['MT5_QUOTE_NOT_FRESH_OR_VALID','private url token DO_NOT_RETURN']){
  const {r,count}=workflow({quoteError,postQuoteError:true}),p=r.audit.postChecks;
  assert.ok(p.attemptedCandidateId);assert.equal(p.quote.latest,null);assert.equal(p.quote.ageMs,null);assert.equal(p.quote.state,'UNAVAILABLE');
  assert.equal(p.quote.code,r.audit.reasonCode);assert.deepEqual(copy(p.gateCodes),[r.audit.reasonCode]);assert.equal(p.news.state,'NOT_RUN');
  assert.equal(count.news,1);assert.equal(p.candidate.rebuilt,null);assert.equal(r.audit.selectedCandidateId,null);
  assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
 }
 const {r}=workflow({newsError:'private url token DO_NOT_RETURN'}),p=r.audit.postChecks;
 assert.equal(p.quote.latest.spread,.1);assert.equal(p.news.state,'UNAVAILABLE');assert.equal(p.news.code,'AF_INTERNAL_UNAVAILABLE');
 assert.equal(p.news.ok,null);assert.equal(p.news.canTrade,null);assert.ok(p.attemptedCandidateId);assert.equal(p.snapshot.state,'NOT_RUN');
 assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
});
test('postChecks malformed returned quote whitelist remains numeric/null and does not invent validity',()=>{
 for(const quoteAfter of [{bid:NaN},{ask:'DO_NOT_RETURN'},{spread_price:Infinity},{timestamp:{secret:'DO_NOT_RETURN'}},{ask:99}]){
  const {r}=workflow({quoteAfter:Object.assign({providerError:'DO_NOT_RETURN'},quoteAfter)}),p=r.audit.postChecks;
  assert.equal(r.audit.reasonCode,'AF_QUOTE_INVALID_OR_STALE');assert.equal(p.quote.state,'REJECTED');assert.equal(p.quote.code,r.audit.reasonCode);
  assert.equal(p.snapshot.state,'REJECTED');assert.equal(p.movement.state,'NOT_RUN');assert.equal(p.candidate.state,'NOT_RUN');
  assert.ok(p.attemptedCandidateId);assert.equal(r.audit.selectedCandidateId,null);
  assert.equal(JSON.stringify(r).includes('DO_NOT_RETURN'),false);
  for(const value of Object.values(p.quote.latest))assert.ok(value===null||typeof value==='number');
 }
});
test('postChecks stale snapshot has actual age and threshold, no movement/candidate validation claimed',()=>{
 const {r}=workflow({delay:121000}),p=r.audit.postChecks;
 assert.equal(p.snapshot.ageMs,121000);assert.equal(p.snapshot.maxAgeMs,120000);assert.equal(p.snapshot.state,'REJECTED');
 assert.equal(p.snapshot.code,'AF_SNAPSHOT_STALE');assert.equal(p.quote.ageMs,121000);assert.ok(p.snapshot.checkedAt.endsWith('Z'));
 assert.equal(p.news.state,'PASSED');assert.equal(p.movement.state,'NOT_RUN');assert.equal(p.candidate.rebuilt,null);
 assert.deepEqual(copy(p.gateCodes),['AF_SNAPSHOT_STALE']);assert.ok(p.attemptedCandidateId);assert.equal(r.audit.selectedCandidateId,null);
});
test('postChecks attempted ID uses only valid admitted known selection; selected ID remains accepted-only',()=>{
 const c=runtime(),id=buy(c).id;
 for(const aiDecision of [decision('unknown'),decision(id,{entry:9999}),decision(id,{missingEvidence:['missing']}),
  {decision:'NO_TRADE',candidateId:null,analysis:'a',buyAssessment:'b',sellAssessment:'s'}]){
  const {r}=workflow({aiDecision}),p=r.audit.postChecks;assert.equal(p.attemptedCandidateId,null);assert.equal(r.audit.selectedCandidateId,null);
  assert.equal(p.quote.state,'AVAILABLE');assert.equal(p.news.state,'PASSED');assert.equal(p.candidate.state,'NOT_RUN');
 }
 for(const sell of [false,true]){const {r}=workflow({sell}),p=r.audit.postChecks;
  assert.equal(p.attemptedCandidateId,r.audit.selectedCandidateId);assert.equal(p.candidate.rebuilt.id,p.attemptedCandidateId);
  assert.equal(p.candidate.state,'PASSED');assert.equal(p.candidate.rebuilt.netR,r.plan.netR);assert.deepEqual(copy(p.gateCodes),[]);
 }
 const {r}=workflow({auth:true});assert.equal(r.audit.postChecks.startedAt,null);assert.equal(r.audit.postChecks.attemptedCandidateId,null);
 assert.equal(r.audit.postChecks.quote.state,'NOT_RUN');
});
test('postChecks leaves complete pre-AI snapshot/candidates immutable for accepted and rejected runs',()=>{
 for(const opts of [{},{sell:true},{quoteAfter:{ask:100.3,spread_price:.3}},{quoteAfter:{bid:101,ask:101.1}},
  {newsAfter:{ok:false,canTrade:false}},{quoteError:'MT5_QUOTE_NOT_FRESH_OR_VALID',postQuoteError:true},{delay:121000}]){
  const c=runtime(),x=fixture(),expectedLegacy=copy(build(c,x)),expectedSnapshot=copy(c.afPlannerSnapshot_(x,c.afPlannerQc_(null)));
  const expectedUnified=copy(c.afUnifiedCandidateList_(x,{mintick:.01,totalCost:x.quote.spread+.02,bid:x.quote.bid,ask:x.quote.ask,chartSec:300},x.frames['5m'].atr));
  const {r}=workflow(Object.assign({ctx:x},opts));
  const actualLegacy=r.audit.candidates.filter(v=>!String(v.id).startsWith('UNI:')).map(function(v){return {id:v.id,entry:v.entry,stop:v.stop,target:v.target,netR:v.netR,eligible:v.eligible,gateCodes:v.gateCodes};});
  const wantedLegacy=expectedLegacy.map(function(v){return {id:v.id,entry:v.entry,stop:v.stop,target:v.target,netR:v.netR,eligible:v.eligible,gateCodes:v.gateCodes};});
  const actualUnified=r.audit.candidates.filter(v=>String(v.id).startsWith('UNI:')).map(function(v){return {id:v.id,entry:v.entry,stop:v.stop,target:v.target,netR:v.netR,eligible:v.eligible,gateCodes:v.gateCodes};});
  const wantedUnified=expectedUnified.map(function(v){return {id:v.id,entry:v.entry,stop:v.stop,target:v.target,netR:v.netR,eligible:v.eligible,gateCodes:v.gateCodes};});
  assert.equal(JSON.stringify(actualLegacy),JSON.stringify(wantedLegacy));assert.equal(JSON.stringify(actualUnified),JSON.stringify(wantedUnified));
  assert.deepEqual(copy(r.audit.snapshot),expectedSnapshot);assert.ok(r.audit.candidates.every(v=>v.evidence.postQuote===undefined));
 }
});
console.log('RESULT '+passed+' test groups passed; synthetic/offline, no live AI/network calls.');
