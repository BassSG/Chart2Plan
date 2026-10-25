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
  var props=PropertiesService.getScriptProperties(),now=Date.now(),hour=String(Math.floor(now/3600000)),lock=LockService.getScriptLock(),result,held=false;
  function finish(value){value.checkedAt=new Date().toISOString();props.setProperty('AF_HOURLY_LAST_RESULT',JSON.stringify(value));Logger.log(JSON.stringify(value));return value;}
  for(var i=0;i<4&&!held;i++){if(i)Utilities.sleep([0,3000,7000,12000][i]);held=lock.tryLock(1000);}
  if(!held)return finish({status:'DATA_BUSY',aiCalled:false,attempts:4});
  try{
    if(props.getProperty('AF_HOURLY_CLAIM')===hour)return finish({status:'SKIP_ALREADY_RUN_THIS_HOUR',aiCalled:false});
    var gate;
    try{gate=afHourlyMarketGate_(afMt5Json_('/api/quote'),Date.now());}catch(_){gate='DATA_MARKET_UNAVAILABLE';}
    if(gate!=='OPEN')return finish({status:gate,aiCalled:false});
    // Reserve before releasing the lock; concurrent triggers cannot double bill.
    props.setProperty('AF_HOURLY_CLAIM',hour);
  }finally{lock.releaseLock();}
  try{
    for(var attempt=0;attempt<4;attempt++){
      if(attempt)Utilities.sleep([0,3000,7000,12000][attempt]);
      var response=processAnalysisWithDetailedLog('daytrade','XAU/USD',afSoloIdentity_().username,'google/gemini-3.8-flash',null,true);
      // Every fact is required. Model/provider/store failures must never retry.
      var busy=response&&response.status==='DATA_BUSY'&&response.aiAttempted===false&&response.audit&&response.audit.stage==='LOCK'&&response.audit.reasonCode==='AF_ANALYSIS_BUSY';
      if(busy&&attempt<3)continue;
      result={status:response.status,runId:response.runId,aiCalled:typeof response.aiAttempted==='boolean'?response.aiAttempted:null,model:'google/gemini-3.8-flash',attempts:attempt+1};
      if(busy&&lock.tryLock(1000)){
        try{if(props.getProperty('AF_HOURLY_CLAIM')===hour)props.deleteProperty('AF_HOURLY_CLAIM');}finally{lock.releaseLock();}
      }
      return finish(result);
    }
  }catch(_){
    // Retain the reservation: an interrupted call may already have billed AI.
    return finish({status:'AF_HOURLY_OUTCOME_UNKNOWN',aiCalled:null,model:'google/gemini-3.8-flash'});
  }
}
