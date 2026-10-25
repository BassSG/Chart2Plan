/* Time-driven entry point. Reuses the complete workflow and its locks/gates.
 * Scheduler preflight never permits weekend test quotes to call AI. */
function afHourlyMarketGate_(q,now){
  if(!q||q.symbol!=='XAUUSD'||q.source_id!=='Eightcap-MT5-Live')return 'DATA_MARKET_UNAVAILABLE';
  if(q.market_status==='closed'||q.is_market_open===false||q.weekend_test_mode===true)return 'SKIP_MARKET_CLOSED';
  if(!Number.isSafeInteger(q.timestamp)||now/1000-q.timestamp < -2||now/1000-q.timestamp>120||q.market_status!=='open'||q.is_market_open===false)return 'DATA_MARKET_UNAVAILABLE';
  return 'OPEN';
}
function afHourlyAnalysis(){
  afAssertSandbox_();
  var props=PropertiesService.getScriptProperties(),now=Date.now(),hour=String(Math.floor(now/3600000)),lock=LockService.getScriptLock(),result;
  if(!lock.tryLock(1000))return {status:'DATA_BUSY',aiCalled:false};
  try{
    if(props.getProperty('AF_HOURLY_CLAIM')===hour)return {status:'SKIP_ALREADY_RUN_THIS_HOUR',aiCalled:false};
    var gate;
    try{gate=afHourlyMarketGate_(afMt5Json_('/api/quote'),now);}catch(_){gate='DATA_MARKET_UNAVAILABLE';}
    if(gate!=='OPEN'){
      result={status:gate,aiCalled:false,checkedAt:new Date(now).toISOString()};
      props.setProperty('AF_HOURLY_LAST_RESULT',JSON.stringify(result));Logger.log(JSON.stringify(result));return result;
    }
    // Reserve before releasing the lock; concurrent triggers cannot double bill.
    props.setProperty('AF_HOURLY_CLAIM',hour);
  }finally{lock.releaseLock();}
  var response=processAnalysisWithDetailedLog('daytrade','XAU/USD',afSoloIdentity_().username,'google/gemini-3.8-flash',null,true);
  result={status:response.status,runId:response.runId,model:'google/gemini-3.8-flash',checkedAt:new Date().toISOString()};
  props.setProperty('AF_HOURLY_LAST_RESULT',JSON.stringify(result));Logger.log(JSON.stringify(result));return result;
}
