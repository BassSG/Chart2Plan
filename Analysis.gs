const AF_EXPECTED_SCRIPT_ID='1SM3hKmFADM-gYV6IuuZiH6XreZcwhIiAqUaObuiZf5KXGmUMKBHUfzdu';
function afAssertSandbox_(){if(ScriptApp.getScriptId()!==AF_EXPECTED_SCRIPT_ID)throw Error('AF_SANDBOX_ID_MISMATCH');}
/* Manual TEST analysis. All writes belong to this new GAS project only. */
function afMarketStatus(){
 afAssertSandbox_();
 var p=PropertiesService.getScriptProperties();return {provider:'SAME_MT5_AND_NEWS_AS_REFERENCE',keyOverrideConfigured:!!p.getProperty('AF_MT5_API_KEY'),mode:'TEST',liveTrading:false,detectorPolicy:'AF-STRICT-SD-0.1 + AF-NORMAL-FORM-0.1',pineParityVerified:false,aiCallsEnabled:false};
}
function afLoadPack_(){var pack={};['1m','5m','15m','1h','4h'].forEach(function(tf){pack[tf]=afReadMarket_(tf,3000).bars;});pack['30m']=afAggregateClosed_(pack['15m'],900000,1800000);return pack;}
function afResearchReplay_(pack){
 var f=afFiboReplay_(pack['1h'],3600000),a=afAllindyReplay_(pack,.01),aligned=0,proposals=0;
 a.forEach(function(x,i){var frame=afLatestKnowable(f.snapshots,pack['5m'][i].openTime);x.proposals.forEach(function(p){proposals++;if(frame&&frame.records.some(function(r){return r.side===p.side;}))aligned++;});});
 return {allindy:a,fibo:f,report:{policy:'EXPERIMENTAL_SOURCE_SUBSET',executionTF:'5m',fiboTF:'1h',pineParityVerified:false,allindyProposals:proposals,sameSideFiboContexts:aligned,fiboStats:f.stats,ebwReadyBars:a.filter(function(x){return x.readiness.ebw;}).length,sourceLongBars:a.filter(function(x){return x.diagnostics.sourceLong;}).length,sourceShortBars:a.filter(function(x){return x.diagnostics.sourceShort;}).length,maxZoneScore:a.reduce(function(v,x){return Math.max(v,x.diagnostics.maxZoneScore);},0),actionableZoneBars:a.filter(function(x){return x.diagnostics.actionableZoneCount>0;}).length,historicalNewsModeled:false,profitabilityTest:false}};
}
function afAnalyzeMarket(){
 afAssertSandbox_();
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {mode:'TEST',decision:'WAIT',reason:'ANALYSIS_BUSY'};
 try{
  AF_MT5_RUN.responses={};AF_MT5_RUN.quote=null;AF_MT5_RUN.metadata=null;
  var startedAt=Date.now(),pack=afLoadPack_(),run=afResearchReplay_(pack),quote=afMt5Quote_(),news=afNewsCheck_('XAUUSD',true),asOf=Date.now(),last=pack['5m'][pack['5m'].length-1],ai=run.allindy[run.allindy.length-1],fi=afLatestKnowable(run.fibo.snapshots,last.openTime),result={decision:'NO_TRADE',reason:'NO_CONFIRMED_STRICT_SUBSET_SIGNAL'},props=PropertiesService.getScriptProperties(),stateKey='AF_PAPER_XAUUSD_5M',old=props.getProperty(stateKey),state=old?JSON.parse(old):null;
  if(state&&['PENDING','ACTIVE'].indexOf(state.status)>=0){
   if(state.status==='PENDING'&&news.ok&&news.blocked){state.status='CANCELLED';state.reason='NEWS_WINDOW';}
   else {var following=pack['5m'].filter(function(b){return b.closeTime>(state.lastBarClose||state.createdAt);});try{following.forEach(function(b){state=afAdvance(state,b);});}catch(_){state.status='REVIEW';state.reason='MISSING_OR_NON_CAUSAL_HISTORY';}}
   props.setProperty(stateKey,JSON.stringify(state));
  }
  var busy=state&&['PENDING','ACTIVE','REVIEW'].indexOf(state.status)>=0;
  if(busy)result={decision:'NO_TRADE',reason:'PAPER_STATE_BUSY_OR_REVIEW'};
  else if(!news.ok||!news.canTrade)result={decision:'NO_TRADE',reason:news.code};
  else if(ai.proposals.length===1&&fi){var candidate=ai.proposals[0],fib=fi.records.filter(function(r){return r.side===candidate.side;}).sort(function(a,b){return b.born-a.born;})[0];
   if(fib){result=afCompose({schemaVersion:1,asOf:asOf,market:{symbol:'XAUUSD',tick:.01,cost:Number(quote.spread_price)+.02,tfMs:300000},bar:Object.assign({},last,{atr:afAtr_(pack['5m'],14).slice(-1)[0]}),allindy:candidate,fibo:fib,guards:{news:'CLEAR',risk:'CLEAR',data:'CLEAR'}});if(result.decision==='PAPER_PLAN'){if(props.getProperty('AF_LAST_PLAN_ID')===result.id)result={decision:'NO_TRADE',reason:'DUPLICATE_PLAN'};else{result.executionModel='BID_REFERENCE_TOUCHES_ONLY_NOT_VERIFIED_BROKER_FILLS';result.costAssumption='CURRENT_SPREAD_PLUS_2_TICKS_FEES_NOT_MODELED';props.setProperty(stateKey,JSON.stringify(result));props.setProperty('AF_LAST_PLAN_ID',result.id);state=result;}}}
   else result={decision:'NO_TRADE',reason:'NO_SAME_SIDE_FIBO'};
  }
  var summary={mode:'TEST',liveTrading:false,runId:'AF:'+new Date(asOf).toISOString()+':'+Utilities.getUuid(),startedAtUtc:new Date(startedAt).toISOString(),asOfUtc:new Date(asOf).toISOString(),symbol:'XAUUSD',executionTF:'5m',fiboTF:'1h',priceBasis:'BID_REFERENCE_ONLY',result:result,paperState:state,news:{ok:news.ok,code:news.code},latestClosedUtc:new Date(last.closeTime).toISOString(),quoteUtc:new Date(quote.timestamp*1000).toISOString(),replay:run.report,latestDiagnostics:ai.diagnostics,pineParityVerified:false};
  props.setProperty('AF_LAST_ANALYSIS',JSON.stringify(summary));return summary;
 }catch(e){var code=String(e.message||'');return {mode:'TEST',liveTrading:false,decision:'NO_TRADE',reason:/^(MT5|AF_MARKET|AF_NEWS|NEWS)_[A-Z0-9_]+$/.test(code)?code:'ANALYSIS_DATA_OR_ENGINE_UNAVAILABLE'};}finally{lock.releaseLock();}
}
function afLastAnalysis(){afAssertSandbox_();var s=PropertiesService.getScriptProperties().getProperty('AF_LAST_ANALYSIS');return s?JSON.parse(s):{mode:'TEST',state:'NO_MANUAL_ANALYSIS_YET'};}
