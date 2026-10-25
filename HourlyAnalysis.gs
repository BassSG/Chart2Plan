/* Time-driven entry point. Reuses the complete workflow and its locks/gates.
 * Scheduler preflight never permits weekend test quotes to call AI. */
function afHourlyMarketGate_(q,now){
  if(!q||q.symbol!=='XAUUSD'||q.source_id!=='Eightcap-MT5-Live')return 'DATA_MARKET_UNAVAILABLE';
  if(q.market_status==='closed'||q.is_market_open===false||q.weekend_test_mode===true)return 'SKIP_MARKET_CLOSED';
  if(!Number.isSafeInteger(q.timestamp)||now/1000-q.timestamp < -2||now/1000-q.timestamp>120||q.market_status!=='open'||q.is_market_open===false)return 'DATA_MARKET_UNAVAILABLE';
  return 'OPEN';
}
// The scheduler uses a short user lock, independent of the candle ScriptLock.
function afHourlyJob_(props){try{return JSON.parse(props.getProperty('AF_HOURLY_JOB')||'null');}catch(_){return null;}}
function afHourlyResult_(props,value){value.checkedAt=new Date().toISOString();props.setProperty('AF_HOURLY_LAST_RESULT',JSON.stringify(value));Logger.log(JSON.stringify(value));return value;}
function afHourlyRemoveRetry_(id){
  if(!id)return;
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='afHourlyRetry'&&String(t.getUniqueId())===String(id))ScriptApp.deleteTrigger(t);});
}
function afHourlyAnalysis(){return afHourlyStart_(null);}
function afHourlyRetry(event){return afHourlyStart_(event||{});}
function afHourlyStart_(event){
  afAssertSandbox_();
  var props=PropertiesService.getScriptProperties(),lock=LockService.getUserLock(),now=Date.now(),hour=String(Math.floor(now/3600000)),job;
  if(!lock.tryLock(1000))return afHourlyResult_(props,{status:'DATA_BUSY_SCHEDULER',aiCalled:false});
  try{
    job=afHourlyJob_(props);
    if(event){
      if(!job||job.phase!=='WAITING'||!event.triggerUid||String(event.triggerUid)!==String(job.triggerId)){
        if(event.triggerUid)afHourlyRemoveRetry_(event.triggerUid);
        return afHourlyResult_(props,{status:'SKIP_UNREGISTERED_RETRY',aiCalled:false});
      }
      if(now<job.nextAt)return afHourlyResult_(props,{status:'SKIP_EARLY_RETRY',aiCalled:false});
      afHourlyRemoveRetry_(job.triggerId);
      if(job.hour!==hour||now>=job.expiresAt){job.phase='EXPIRED';props.setProperty('AF_HOURLY_JOB',JSON.stringify(job));return afHourlyResult_(props,{status:'SKIP_RETRY_WINDOW_ENDED',aiCalled:false});}
      if(props.getProperty('AF_HOURLY_CLAIM')===hour)return afHourlyResult_(props,{status:'SKIP_ALREADY_RUN_THIS_HOUR',aiCalled:false});
      job.retries++;delete job.triggerId;delete job.nextAt;
    }else{
      if(props.getProperty('AF_HOURLY_CLAIM')===hour)return afHourlyResult_(props,{status:'SKIP_ALREADY_RUN_THIS_HOUR',aiCalled:false});
      if(job&&job.hour===hour)return afHourlyResult_(props,{status:job.phase==='WAITING'?'SKIP_RETRY_ALREADY_QUEUED':'SKIP_HOURLY_JOB_ALREADY_RESERVED',aiCalled:false,nextAt:job.nextAt||null});
      if(job&&job.triggerId)afHourlyRemoveRetry_(job.triggerId);
      job={hour:hour,token:Utilities.getUuid(),retries:0,createdAt:now,expiresAt:Math.min((Number(hour)+1)*3600000,now+15*60000)};
    }
    job.phase='RUNNING';props.setProperty('AF_HOURLY_JOB',JSON.stringify(job));
    // Retain this reservation after an uncertain interruption or an AI attempt.
    props.setProperty('AF_HOURLY_CLAIM',hour);
  }finally{lock.releaseLock();}
  return afHourlyRunJob_(job);
}
function afHourlyRunJob_(job){
  var props=PropertiesService.getScriptProperties(),result,busy=false;
  try{
    var gate;try{gate=afHourlyMarketGate_(afMt5Json_('/api/quote'),Date.now());}catch(_){gate='DATA_MARKET_UNAVAILABLE';}
    if(gate!=='OPEN')result={status:gate,aiCalled:false};
    else for(var attempt=0;attempt<4;attempt++){
      if(attempt)Utilities.sleep([0,3000,7000,12000][attempt]);
      if(Date.now()>=job.expiresAt||String(Math.floor(Date.now()/3600000))!==job.hour){busy=false;result={status:'SKIP_RETRY_WINDOW_ENDED',aiCalled:false};break;}
      var response=processAnalysisWithDetailedLog('daytrade','XAU/USD',afSoloIdentity_().username,'google/gemini-3.8-flash',null,true);
      if(!response)throw Error('AF_HOURLY_RESPONSE_UNKNOWN');
      busy=response.status==='DATA_BUSY'&&response.aiAttempted===false&&response.audit&&response.audit.stage==='LOCK'&&response.audit.reasonCode==='AF_ANALYSIS_BUSY';
      if(busy&&attempt<3)continue;
      result={status:response.status,runId:response.runId,aiCalled:typeof response.aiAttempted==='boolean'?response.aiAttempted:null,attempts:attempt+1};break;
    }
  }catch(_){busy=false;result={status:'AF_HOURLY_OUTCOME_UNKNOWN',aiCalled:null};}
  result.model='google/gemini-3.8-flash';result.delayedRetries=job.retries;
  var lock=LockService.getUserLock();
  if(!lock.tryLock(5000))return afHourlyResult_(props,Object.assign(result,{stateUnconfirmed:true}));
  try{
    var current=afHourlyJob_(props);
    if(!current||current.token!==job.token||current.phase!=='RUNNING')return afHourlyResult_(props,Object.assign(result,{stateUnconfirmed:true}));
    if(busy&&job.retries<2&&Date.now()+120000<job.expiresAt){
      // Only explicit pre-AI LOCK rejection may release the reservation and
      // create one owned temporary retry. Provider/store/unknown errors cannot.
      try{
        var trigger=ScriptApp.newTrigger('afHourlyRetry').timeBased().after(120000).create();
        job.phase='WAITING';job.nextAt=Date.now()+120000;job.triggerId=String(trigger.getUniqueId());
        props.setProperty('AF_HOURLY_JOB',JSON.stringify(job));
        if(props.getProperty('AF_HOURLY_CLAIM')===job.hour)props.deleteProperty('AF_HOURLY_CLAIM');
        result.status='DATA_BUSY_RETRY_SCHEDULED';result.nextAt=job.nextAt;result.retryScheduled=true;
      }catch(_){job.phase='DONE';props.setProperty('AF_HOURLY_JOB',JSON.stringify(job));result.status='DATA_BUSY_RETRY_UNAVAILABLE';result.retryScheduled=false;}
    }else{
      job.phase=result.aiCalled===null?'UNCERTAIN':'DONE';props.setProperty('AF_HOURLY_JOB',JSON.stringify(job));
    }
    return afHourlyResult_(props,result);
  }finally{lock.releaseLock();}
}
// Create/delete only an owned probe to verify Trigger permission; no AI or plans.
function afVerifyHourlyRetryAccess(){
  afAssertSandbox_();var trigger=ScriptApp.newTrigger('afHourlyRetry').timeBased().after(120000).create();
  var id=String(trigger.getUniqueId());afHourlyRemoveRetry_(id);
  var report={retryTriggerAccess:true,temporaryTriggerRemoved:!ScriptApp.getProjectTriggers().some(function(t){return String(t.getUniqueId())===id;}),aiCalls:0};
  Logger.log(JSON.stringify(report));return report;
}
