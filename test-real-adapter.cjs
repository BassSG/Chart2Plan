const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const dir=path.join(__dirname,'chart2plan-source');
const c=vm.createContext({console,Math,Number,String,Boolean,Array,Object,Date,JSON,RegExp});
for(const n of ['AfUnifiedPlannerEngine.gs','Planner.gs']) vm.runInContext(fs.readFileSync(path.join(dir,n),'utf8'),c,{filename:n});

// Real afZoneReplay_ schema: score, tests, ATR, departure, source/structure/sweep/clean,
// but no family/isDefendCore/tags supplied by the adapter.
const zone={id:'900000:SD:1000:1',tf:'15m',tfMs:900000,tfSec:900,side:1,lo:3980,hi:3985,atr:4.5,
 knownAt:2000,sourceClose:2000,bornSeq:10,tests:0,touching:false,quality:.86,departure:.9,structure:true,sweep:true,
 pd:false,clean:true,source:true,imbalance:false,pattern:'RBR',score:78,sourceVersion:'All-Indy-1.3.5'};
// Real EBW Fibo book target-array schema; no scalar nextPendingTarget is supplied.
const fibo={id:'3600000:1700',tfMs:3600000,tf:'1h',side:1,symbol:'XAUUSD',sourceVersion:'EBW-Fibo-1.10.19',
 zero:3975,span:10,root:3970,born:1000,knownAt:2000,sourceClose:2000,broken:true,invalidated:false,historyComplete:true,
 anchors:{a:{p:3970},b:{p:3985},c:{p:3975}},targets:[
  {ratio:1.618,price:3991.18,pending:true,hitAt:null},
  {ratio:2,price:3995,pending:true,hitAt:null},
  {ratio:2.618,price:4001.18,pending:true,hitAt:null}
 ]};
const ctx={zones:[zone],fibos:[fibo],frames:{'15m':{tfMs:900000,liquidity:[]},'1h':{tfMs:3600000,liquidity:[]}},quote:{bid:3996,ask:3996.24},executionTF:'5m'};
const market={mintick:.01,totalCost:.26,bid:3996,ask:3996.24,chartSec:300};
const cs=c.afUnifiedCandidateList_(ctx,market,4.5);
console.log(JSON.stringify(cs.map(x=>({id:x.id,side:x.side,eligible:x.eligible,reason:x.gateCodes,entry:x.entry,sl:x.stop,tp:x.target,netR:x.netR,role:x.meta&&x.meta.role})),null,2));
assert.equal(cs.length,1);
assert.equal(cs[0].eligible,true);
assert.equal(cs[0].valid,true,'Prompt contract requires valid === true');
assert.equal(cs[0].meta.role,'MAJOR');
assert.equal(cs[0].setupMode,'TREND_CONTINUATION');
assert.ok(cs[0].netR>=1.5);
console.log('PASS: real All Indy adapter and EBW Fibo target-array schema produce an eligible unified BUY candidate');
