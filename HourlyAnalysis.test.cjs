const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env(){
 let now=Date.parse('2026-10-25T05:00:00Z'),held=false,lockFailures=0,calls=0,dispatches=0,sleeps=[],responses=[];const props={};
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const c=vm.createContext({Date:Clock,Number,String,JSON,Logger:{log(){}},Utilities:{sleep:n=>{sleeps.push(n);now+=n;}},afAssertSandbox_(){},afSoloIdentity_:()=>({username:'owner-test'}),
  afMt5Json_:()=>({symbol:'XAUUSD',source_id:'Eightcap-MT5-Live',timestamp:Math.floor(now/1000),market_status:'open'}),
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]})},
  LockService:{getScriptLock:()=>({tryLock(){assert.equal(held,false);if(lockFailures-->0)return false;held=true;return true;},releaseLock(){held=false;}})},
  processAnalysisWithDetailedLog:(...args)=>{assert.equal(held,false);assert.deepEqual(args,['daytrade','XAU/USD','owner-test','google/gemini-3.8-flash',null,true]);calls++;const r=responses.length?responses.shift():{status:'NO_TRADE',aiAttempted:true,runId:'test'};if(r instanceof Error)throw r;if(r.aiAttempted)dispatches++;return r;}
 });vm.runInContext(fs.readFileSync(__dirname+'/HourlyAnalysis.gs','utf8'),c);
 return {c,props,sleeps,responses,get calls(){return calls;},get dispatches(){return dispatches;},failLocks:n=>lockFailures=n};
}
const busy=()=>({status:'DATA_BUSY',aiAttempted:false,audit:{stage:'LOCK',reasonCode:'AF_ANALYSIS_BUSY'}});
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('closed markets and weekend test quotes call no workflow or AI',()=>{for(const q of [{market_status:'closed'},{weekend_test_mode:true}]){const e=env(),read=e.c.afMt5Json_;e.c.afMt5Json_=()=>({...read(),...q});assert.equal(e.c.afHourlyAnalysis().status,'SKIP_MARKET_CLOSED');assert.equal(e.calls,0);}});
test('stale and failed market feeds never call the workflow',()=>{for(const failure of [false,true]){const e=env(),read=e.c.afMt5Json_;e.c.afMt5Json_=()=>{if(failure)throw Error('network');return {...read(),timestamp:1};};assert.equal(e.c.afHourlyAnalysis().status,'DATA_MARKET_UNAVAILABLE');assert.equal(e.calls,0);}});
test('a successful hour calls AI at most once',()=>{const e=env();assert.equal(e.c.afHourlyAnalysis().status,'NO_TRADE');assert.equal(e.c.afHourlyAnalysis().status,'SKIP_ALREADY_RUN_THIS_HOUR');assert.equal(e.calls,1);assert.equal(e.dispatches,1);});
test('initial monitor lock conflicts retry before claiming the hour',()=>{const e=env();e.failLocks(2);assert.equal(e.c.afHourlyAnalysis().status,'NO_TRADE');assert.equal(e.calls,1);assert.deepEqual(e.sleeps,[3000,7000]);});
test('the reservation-to-workflow race retries only before AI starts',()=>{const e=env();e.responses.push(busy(),busy());assert.equal(e.c.afHourlyAnalysis().status,'NO_TRADE');assert.equal(e.calls,3);assert.equal(e.dispatches,1);assert.deepEqual(e.sleeps,[3000,7000]);});
test('persistent workflow lock conflicts are bounded and release an unbilled hour',()=>{const e=env();e.responses.push(busy(),busy(),busy(),busy());assert.equal(e.c.afHourlyAnalysis().status,'DATA_BUSY');assert.equal(e.calls,4);assert.equal(e.dispatches,0);assert.equal(e.props.AF_HOURLY_CLAIM,undefined);assert.equal(e.c.afHourlyAnalysis().status,'NO_TRADE');assert.equal(e.dispatches,1);});
test('provider, model and store failures never retry or release the billed hour',()=>{for(const status of ['MODEL_UNAVAILABLE','SAVE_FAILED_OR_PARTIAL','DATA_ANALYSIS_UNAVAILABLE']){const e=env();e.responses.push({status,aiAttempted:true,audit:{stage:'MODEL'}});assert.equal(e.c.afHourlyAnalysis().status,status);assert.equal(e.calls,1);assert.equal(e.c.afHourlyAnalysis().status,'SKIP_ALREADY_RUN_THIS_HOUR');}});
test('unknown outcome retains the claim and records uncertainty',()=>{const e=env();e.responses.push(Error('interrupted'));assert.equal(e.c.afHourlyAnalysis().status,'AF_HOURLY_OUTCOME_UNKNOWN');assert.equal(e.c.afHourlyAnalysis().aiCalled,false);assert.equal(e.calls,1);});
test('DATA_BUSY without explicit proof of pre-AI state never retries',()=>{for(const response of [{status:'DATA_BUSY'},{...busy(),aiAttempted:true},{...busy(),audit:{stage:'MODEL',reasonCode:'AF_ANALYSIS_BUSY'}}]){const e=env();e.responses.push(response);e.c.afHourlyAnalysis();assert.equal(e.calls,1);assert.ok(e.props.AF_HOURLY_CLAIM);}});
test('a fully busy initial lock leaves a recorded result without an hour claim',()=>{const e=env();e.failLocks(4);assert.equal(e.c.afHourlyAnalysis().status,'DATA_BUSY');assert.equal(e.calls,0);assert.equal(e.props.AF_HOURLY_CLAIM,undefined);assert.equal(JSON.parse(e.props.AF_HOURLY_LAST_RESULT).aiCalled,false);});
console.log('HourlyAnalysis: '+count+' groups passed');
