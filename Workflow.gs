/* Existing RPC/response shape. Main owns ledger integration; no ledger writes here. */
function afPlannerQuote_(){
 try{return afMt5Quote_();}catch(e){
  // Closed/stale/schema share one Provider error. Confirm status, never infer it.
  if(String(e.message)==='MT5_QUOTE_NOT_FRESH_OR_VALID'){
   try{var raw=afMt5Json_('/api/quote'),now=Date.now()/1000;
    if(raw&&raw.symbol==='XAUUSD'&&raw.source_id==='Eightcap-MT5-Live'&&raw.market_status==='closed'&&
     Number.isSafeInteger(raw.timestamp)&&now-raw.timestamp>=-2&&now-raw.timestamp<=120)throw Error('AF_MARKET_CLOSED');}
   catch(statusError){if(statusError.message==='AF_MARKET_CLOSED')throw statusError;}
  }throw e;
 }
}
function afBuildAnalystContext_(tradeType,verifiedQuote){
 AF_MT5_RUN.responses={};AF_MT5_RUN.quote=null;AF_MT5_RUN.metadata=null;
 var style={scalping:{execution:'5m',context:'1h'},daytrade:{execution:'15m',context:'4h'},swingtrade:{execution:'1h',context:'4h'}}[tradeType];
 if(!style)throw Error('AF_TRADE_STYLE_UNSUPPORTED');
 var quote=verifiedQuote||afPlannerQuote_(),pack=afLoadPack_(),asOf=Date.now(),frames={},zoneBook=[],fibBook=[];
 Object.keys(pack).filter(function(tf){return tf!=='30m';}).forEach(function(tf){
  var bars=pack[tf],tfMs=AF_PLANNER_TF[tf];if(!tfMs||!Array.isArray(bars)||bars.length<50)throw Error('AF_MARKET_HISTORY_INCOMPLETE');
  if(bars.some(function(b){return b.confirmed!==true||!afPlannerNum_(b.openTime)||!afPlannerNum_(b.closeTime)||b.closeTime-b.openTime!==tfMs;}))throw Error('AF_MARKET_BAR_INVALID');
  var m=afMomentum(bars),atr=afAtr_(bars,14),fast=afEma_(bars.map(function(b){return b.close;}),20),slow=afEma_(bars.map(function(b){return b.close;}),50),last=bars[bars.length-1];
  if(last.closeTime>asOf||asOf-last.closeTime>tfMs+120000)throw Error('AF_MARKET_HISTORY_STALE');
  frames[tf]={tfMs:tfMs,lastClosedUtc:new Date(last.closeTime).toISOString(),atr:atr[atr.length-1],rsi:m[m.length-1].rsi,
   k:m[m.length-1].k,d:m[m.length-1].d,ema20:fast[fast.length-1],ema50:slow[slow.length-1],liquidity:[],
   closedOHLC:bars.slice(-3000).map(function(b){return [b.openTime,b.closeTime,b.open,b.high,b.low,b.close,b.volume||0];})};
  var zs=afZoneReplay_(bars,tfMs,.01,last.closeTime),z=zs[zs.length-1];
  // ALL live zones/liquidity retained as obstacles, including low-score/tested ones.
  z.zones.forEach(function(q){zoneBook.push(Object.assign({},q,{tf:tf,sourceClose:z.sourceClose,
   sourceVersion:'All-Indy-1.3.5',adapter:'afZoneReplay_',adapterVersion:null}));});frames[tf].liquidity=z.liquidity;
  if(tf!=='1m'){var f=afFiboReplay_(bars,tfMs),fLast=f.snapshots[f.snapshots.length-1];
   fLast.records.forEach(function(r){fibBook.push(Object.assign({},r,{tf:tf,adapter:'afFiboReplay_'}));});}
 });
 return {asOf:asOf,symbol:'XAUUSD',sourceId:'Eightcap-MT5-Live',style:tradeType,executionTF:style.execution,contextTF:style.context,
  quote:{bid:quote.bid,ask:quote.ask,spread:quote.spread_price,timestamp:quote.timestamp,market_status:quote.market_status,weekend_test_mode:quote.weekend_test_mode,priceBasis:'Bid candles; current quote includes Ask'},
  frames:frames,zones:zoneBook,fibos:fibBook,
  coverage:{canonicalSD:'computed',normalFibo:'computed',OB_QML_Flip:'unavailable',NeckDivergence:'unavailable',pineRuntimeParity:false}};
}
function afAnalystPrompt_(ctx,qc,candidates){
 return 'เลือกแผน paper Allindy + Fibo จาก eligible candidate ID เท่านั้น หรือ NO_TRADE. ห้ามสร้างราคา แก้ราคา สร้าง ID หรือใช้โมดูล unavailable. '+
  'ราคากับ hard gates คำนวณก่อน AI แล้ว คะแนนคือ evidenceScore ไม่ใช่ win probability. ห้ามลด gates เพื่อจำนวนไม้ เป้า 1–5 paper/day มีไว้สังเกตเท่านั้น. '+
  'ตอบ JSON object ตาม schema เคร่งครัด: {"decision":"PLAN หรือ NO_TRADE","candidateId":"eligible ID หรือ null เมื่อ NO_TRADE",'+
  '"analysis":"เหตุผลภาษาไทย","buyAssessment":"ประเมิน BUY","sellAssessment":"ประเมิน SELL",'+
  '"entryAssessment":"เหตุผลราคาเข้าที่กำหนดแล้ว","stopAssessment":"เหตุผล SL ที่กำหนดแล้ว","targetAssessment":"เหตุผลเป้า",'+
  '"invalidation":"เหตุยกเลิก","missingEvidence":[]} ห้ามเพิ่ม key อื่น โดยเฉพาะ entry/stop/target/zoneId/fiboId. '+
  'หากหลักฐานไม่พอให้ NO_TRADE ไม่เดา. ข้อมูลสรุป UTC และทั้งสองฝั่ง:\n'+
  JSON.stringify({snapshot:afPlannerSnapshot_(ctx,qc),candidates:candidates.filter(function(c){return c.eligible;})});
}
function afAdmitAiPlan_(d,ctx,userQc,candidates){
 var qc=afPlannerQc_(userQc);return afPlannerDecision_(d,candidates||afPlannerBuild_(ctx,qc,Date.now()));
}
function afWorkflowFailureCode_(e){
 var code=String(e&&e.message||'');return /^(?:AF|MT5)_[A-Z0-9_]+$/.test(code)?code:'AF_INTERNAL_UNAVAILABLE';
}
function afWorkflowStatus_(code){
 if(code==='AF_OWNER_CONTEXT_REQUIRED'||code==='AF_SANDBOX_ID_MISMATCH')return 'AUTH_REQUIRED';
 if(code==='AF_ANALYSIS_BUSY')return 'DATA_BUSY';
 if(code==='AF_NEWS_WINDOW')return 'SKIP_NEWS';
 if(/^AF_NEWS_/.test(code))return 'DATA_NEWS_UNAVAILABLE';
 if(code==='AF_MARKET_CLOSED')return 'SKIP_MARKET_CLOSED';
 if(/^AF_AI_/.test(code))return 'MODEL_UNAVAILABLE';
 if(/^AF_QC_|^AF_TRADE_STYLE_/.test(code))return 'INPUT_INVALID';
 return 'DATA_ANALYSIS_UNAVAILABLE';
}
/* ResearchLog compatibility. No direct ledger call: Workspace owns persistence. */
function afWorkflowAuditReady_(audit){
 var gates=audit.gateCodes.slice();
 audit.candidates.forEach(function(c){(c.gateCodes||[]).forEach(function(g){if(gates.indexOf(g)<0)gates.push(g);});});
 (audit.postChecks.gateCodes||[]).forEach(function(g){if(gates.indexOf(g)<0)gates.push(g);});
 audit.gates=gates;audit.reason=audit.reasonCode;return audit;
}
function afWorkflowStoreLocked_(response,request){
 try{response=afStoreResponse_(response,request);}
 catch(_){response=Object.assign({},response,{success:false,status:'SAVE_FAILED_OR_PARTIAL',message:'AF_STORE_FAILED_OR_PARTIAL',plan:null});}
 if(response.status==='SAVE_FAILED_OR_PARTIAL'){
  response.audit.stage='STORE';response.audit.reasonCode='AF_STORE_FAILED_OR_PARTIAL';response.audit.gateCodes=['AF_STORE_FAILED_OR_PARTIAL'];
  afWorkflowAuditReady_(response.audit);
 }
 return response;
}
/* Input is afNewsCheck_'s validated result, never raw HTTP/config/error payload. */
function afWorkflowNewsEvidence_(news){
 var out=afPlannerPick_(news,['ok','canTrade','blocked','beforeMinutes','afterMinutes','minImpact','pendingDeadlineTs','sourceAgeMinutes','freshnessBasis']);
 out.code=news&&/^AF_NEWS_[A-Z_]+$/.test(news.code)?news.code:'AF_NEWS_UNAVAILABLE';
 function event(e){return e?afPlannerPick_(e,['id','title','currency','impact','timestamp','updatedTs']):null;}
 out.events=news&&Array.isArray(news.events)?news.events.slice(0,500).map(event):null;
 out.event=event(news&&news.event);out.nextNews=event(news&&news.nextNews);return out;
}
function processAnalysisWithDetailedLog(tradeType,symbol,user,model,qc){
 var runId='AF:'+new Date().toISOString()+':'+Utilities.getUuid(),audit=afPlannerAudit_(runId),lock=null,held=false,req={},knownCost=null,knownUsage={};
 function finish(status,stage,code,extra,store){
  audit.stage=stage;audit.reasonCode=code;audit.gateCodes=code==='AF_PAPER_SIGNAL_READY'?[]:[code];
  // Capture interrupted post-checks before catch/early-return serializes the audit.
  var post=audit.postChecks;
  if(post.startedAt&&/^POST_/.test(stage)){
   if(post.gateCodes.indexOf(code)<0)post.gateCodes.push(code);
   ['quote','news','snapshot','movement','candidate'].forEach(function(k){
    if(post[k].state==='CHECKING'){post[k].state='UNAVAILABLE';post[k].code=code;}
   });
  }
  if(stage==='PLANNER'&&audit.snapshot.evidenceCounts)audit.gateCodes=audit.gateCodes.concat(
   audit.snapshot.evidenceCounts.gateCodes.filter(function(g){return audit.gateCodes.indexOf(g)<0;}));
  var response=Object.assign({success:false,status:status,message:code,runId:runId,mode:'TEST',liveTrading:false,plan:null,
   strategy:'ALLINDY_FIBO',cost:knownCost,usage:knownUsage,qcResult:{percentage:null,threshold:null}},extra||{});
  response.audit=afPlannerClean_(afWorkflowAuditReady_(audit));
  if(store&&held)response=afWorkflowStoreLocked_(response,req);
  return afPlannerClean_(response);
 }
 try{
  audit.stage='AUTH';afRequireUser_(user);
  req={tradeType:tradeType,symbol:String(symbol||''),user:user,model:String(model||'openai/gpt-6.1-sol-pro')};
  audit.stage='LOCK';lock=LockService.getScriptLock();held=lock.tryLock(1000);
  if(!held)return finish('DATA_BUSY','LOCK','AF_ANALYSIS_BUSY',null,false);
  audit.stage='INPUT';audit.snapshot.symbol=req.symbol;
  var quality=afPlannerQc_(qc);audit.snapshot.qc=quality;
  if(req.symbol.replace('/','')!=='XAUUSD')return finish('DATA_ASSET_UNAVAILABLE','INPUT','AF_ASSET_UNAVAILABLE',null,true);
  if(!['scalping','daytrade','swingtrade'].includes(tradeType))throw Error('AF_TRADE_STYLE_UNSUPPORTED');
  audit.stage='NEWS_PRE';var news=afNewsCheck_('XAUUSD',true);
  audit.newsKnownAt=Date.now();audit.newsSnapshot=afWorkflowNewsEvidence_(news);
  if(!news.ok||!news.canTrade)return finish(news.ok?'SKIP_NEWS':'DATA_NEWS_UNAVAILABLE','NEWS_PRE',news.ok?'AF_NEWS_WINDOW':'AF_NEWS_UNAVAILABLE',null,true);
  audit.stage='QUOTE_PRE';AF_MT5_RUN.quote=null;var preQuote=afPlannerQuote_();
  audit.stage='DATA_PRE';var context=afBuildAnalystContext_(tradeType,preQuote);
  audit.snapshot=afPlannerSnapshot_(context,quality);
  audit.postChecks.quote.original=afPlannerClean_(audit.snapshot.quote);
  var dataGate=afPlannerContextGate_(context,Date.now());if(dataGate)throw Error(dataGate);
  audit.stage='PLANNER';var candidates=afPlannerBuild_(context,quality,Date.now());audit.candidates=candidates;
  if(!candidates.some(function(c){return c.eligible;}))return finish('NO_TRADE','PLANNER',afPlannerNoCandidateReason_(audit.snapshot,candidates),
   {message:'NO_TRADE — ไม่มี candidate ผ่าน hard gates; ไม่เรียก AI',qcResult:{percentage:null,threshold:quality.threshold}},true);
  audit.stage='MODEL';var ai=afCallAnalyst_(req.model,afAnalystPrompt_(context,quality,candidates));
  // Persist only known, whitelisted billing values before any post-response guard.
  knownCost=ai&&afPlannerNum_(ai.cost)&&ai.cost>=0?ai.cost:null;knownUsage=afWorkflowUsage_(ai&&ai.usage);
  var d=ai&&ai.decision;
  var admitted=afAdmitAiPlan_(d,context,qc,candidates);
  var post=audit.postChecks;post.startedAt=new Date().toISOString();
  // Only a schema-valid, admitted known ID is an attempted selection; never echo AI input.
  post.attemptedCandidateId=admitted.accepted?admitted.candidate.id:null;
  post.snapshot.ageMs=Date.now()-context.asOf;
  // Always refresh quote/news after a model response, even NO_TRADE/schema reject.
  audit.stage='POST_QUOTE';post.quote.state='CHECKING';post.quote.checkedAt=new Date().toISOString();
  AF_MT5_RUN.quote=null;var latestQuote=afPlannerQuote_();
  post.quote.latest=afPlannerPostQuote_(latestQuote);post.quote.state='AVAILABLE';
  post.quote.ageMs=afPlannerNum_(post.quote.latest.timestamp)?Date.now()-post.quote.latest.timestamp*1000:null;
  // Observed movement is not a passed gate until the original checks below execute.
  post.movement.bidDelta=afPlannerNum_(post.quote.latest.bid)?post.quote.latest.bid-context.quote.bid:null;
  post.movement.absoluteBidDelta=post.movement.bidDelta===null?null:Math.abs(post.movement.bidDelta);
  post.movement.limit=context.frames[context.executionTF].atr*.25;
  audit.stage='POST_NEWS';post.news.state='CHECKING';post.news.checkedAt=new Date().toISOString();
  var newsAfter=afNewsCheck_('XAUUSD',true);
  audit.newsKnownAt=Date.now();audit.newsSnapshot=afWorkflowNewsEvidence_(newsAfter);
  post.news.ok=typeof newsAfter.ok==='boolean'?newsAfter.ok:null;
  post.news.canTrade=typeof newsAfter.canTrade==='boolean'?newsAfter.canTrade:null;
  post.news.code=!newsAfter.ok?'AF_NEWS_UNAVAILABLE':!newsAfter.canTrade?'AF_NEWS_WINDOW':null;
  post.news.state=!newsAfter.ok?'UNAVAILABLE':!newsAfter.canTrade?'REJECTED':'PASSED';
  if(!newsAfter.ok||!newsAfter.canTrade)return finish(newsAfter.ok?'SKIP_NEWS':'DATA_NEWS_UNAVAILABLE','POST_NEWS',newsAfter.ok?'AF_NEWS_WINDOW':'AF_NEWS_UNAVAILABLE',null,true);
  var latest=Object.assign({},context,{quote:{bid:latestQuote.bid,ask:latestQuote.ask,spread:latestQuote.spread_price,timestamp:latestQuote.timestamp,market_status:latestQuote.market_status,weekend_test_mode:latestQuote.weekend_test_mode}});
  audit.stage='POST_SNAPSHOT';var postNow=Date.now();post.snapshot.checkedAt=new Date(postNow).toISOString();post.snapshot.ageMs=postNow-context.asOf;
  var postGate=afPlannerContextGate_(latest,postNow);post.snapshot.code=postGate;post.snapshot.state=postGate?'REJECTED':'PASSED';
  if(postGate==='AF_QUOTE_INVALID_OR_STALE'){post.quote.state='REJECTED';post.quote.code=postGate;}
  if(postGate)return finish('DATA_ANALYSIS_UNAVAILABLE','POST_SNAPSHOT',postGate,null,true);
  post.movement.checkedAt=new Date().toISOString();
  post.movement.code=Math.abs(latest.quote.bid-context.quote.bid)>context.frames[context.executionTF].atr*.25?'AF_QUOTE_MOVED':null;
  post.movement.state=post.movement.code?'REJECTED':'PASSED';
  if(post.movement.code)return finish('NO_TRADE','POST_QUOTE','AF_QUOTE_MOVED',null,true);
  if(admitted.accepted){
   // Re-evaluate ORIGINAL prices; source evidence/candidates stay immutable.
   // The pre-model quote is preserved in postChecks.quote.original.
   audit.stage='POST_GATES';post.candidate.state='CHECKING';post.candidate.checkedAt=new Date().toISOString();
   var selected=admitted.candidate,rebuilt=afPlannerBuild_(latest,quality,Date.now()).filter(function(c){return c.id===selected.id;})[0];
   post.candidate.rebuilt=rebuilt?afPlannerClean_(rebuilt):null;
   post.candidate.code=!rebuilt||!rebuilt.eligible?rebuilt&&rebuilt.gateCodes[0]||'AF_CANDIDATE_DISAPPEARED':null;
   post.candidate.state=post.candidate.code?'REJECTED':'PASSED';
   if(post.candidate.code){post.gateCodes=rebuilt?rebuilt.gateCodes.slice():[];
    return finish('NO_TRADE','POST_GATES',post.candidate.code,null,true);}
   if(['entry','stop','target'].some(function(k){return rebuilt[k]!==selected[k];})){
    post.candidate.state='REJECTED';post.candidate.code='AF_CANDIDATE_CHANGED';
    return finish('NO_TRADE','POST_GATES','AF_CANDIDATE_CHANGED',null,true);}
   admitted.plan.netR=rebuilt.netR;admitted.plan.evidence.executionTF=context.executionTF;admitted.plan.evidence.contextTF=context.contextTF;
   admitted.plan.evidence.policyVersion=AF_PLANNER_POLICY.version;audit.selectedCandidateId=selected.id;
  }
  var p=admitted.plan,lines=['📈 '+req.symbol+' | Allindy + Fibo',admitted.accepted?'แผนจำลองผ่านเงื่อนไข':'NO_TRADE — '+admitted.reasonCode];
  if(admitted.reasonCode!=='AF_AI_SCHEMA_INVALID'&&d&&typeof d.analysis==='string')lines.push(d.analysis,'BUY: '+d.buyAssessment,'SELL: '+d.sellAssessment);
  if(p)lines.push('TypeOrder: '+(p.side===1?'Buy Limit':'Sell Limit'),'Entry: '+p.entry,'StopLoss: '+p.stop,'TP1: '+p.target+' (RR '+p.netR.toFixed(2)+':1)');
  lines.push('คะแนนหลักฐานไม่ใช่ win probability; โหมดทดสอบ ไม่ส่ง EA/LINE; ยังไม่ยืนยัน Pine runtime parity','Model: '+req.model);
  return finish(admitted.accepted?'PAPER_SIGNAL_READY':'NO_TRADE',admitted.accepted?'SIGNAL':'MODEL_DECISION',admitted.accepted?'AF_PAPER_SIGNAL_READY':admitted.reasonCode,
   {success:admitted.accepted,message:lines.join('\n'),plan:admitted.accepted?p:null,
    qcResult:{percentage:admitted.score,threshold:admitted.threshold}},true);
 }catch(e){var code=afWorkflowFailureCode_(e);return finish(afWorkflowStatus_(code),audit.stage,code,null,held);}
 finally{if(held&&lock){try{lock.releaseLock();}catch(_){/* Never emit secret exception text. */}}}
}
function afWorkflowUsage_(u){var out={};['prompt_tokens','completion_tokens','total_tokens'].forEach(function(k){if(u&&afPlannerNum_(u[k])&&u[k]>=0)out[k]=u[k];});return out;}
/* UI (tradeType,qc) and legacy RuntimeCheck (tradeType,symbol,qc).
 * Real owner/sandbox authentication; every authenticated result stored under lock.
 * Lock busy is explicit and cannot be stored without violating the write contract. */
function afResearchDiagnostics(tradeType,symbol,qc){
 var runId='DIAG:'+new Date().toISOString()+':'+Utilities.getUuid(),audit=afPlannerAudit_(runId),lock=null,held=false;
 var style=tradeType===undefined?'scalping':tradeType,legacy=arguments.length>=3||symbol==='XAUUSD'||symbol==='XAU/USD';
 var asset=legacy?(symbol===undefined?'XAUUSD':symbol):'XAUUSD',inputQc=legacy?qc:symbol;
 var request={user:'owner-test',symbol:'XAUUSD',tradeType:typeof style==='string'?style:null,model:'NO_AI_DIAGNOSTIC'};
 function finish(ok,status){
  afWorkflowAuditReady_(audit);
  var counts={};audit.candidates.forEach(function(c){c.gateCodes.forEach(function(g){counts[g]=(counts[g]||0)+1;});});
  audit.gates.forEach(function(g){if(!counts[g])counts[g]=1;});
  var response={success:ok,status:status,message:audit.reasonCode,runId:runId,audit:audit,
   diagnostics:{candidateCount:audit.candidates.length,eligibleCount:audit.candidates.filter(function(c){return c.eligible;}).length,gateCounts:counts},
   mode:'TEST',liveTrading:false,aiCalled:false,plan:null,scoreIsWinProbability:false,observePaperPerDay:[1,5],quotaEnforced:false};
  if(held)response=afWorkflowStoreLocked_(afPlannerClean_(response),request);
  return afPlannerClean_(response);
 }
 try{
  audit.stage='AUTH';afRequireUser_('owner-test');
  audit.stage='LOCK';lock=LockService.getScriptLock();held=lock.tryLock(1000);
  if(!held){audit.reasonCode='AF_ANALYSIS_BUSY';audit.gateCodes=[audit.reasonCode];return finish(false,'DATA_BUSY');}
  audit.stage='INPUT';audit.snapshot.symbol=typeof asset==='string'?asset:null;
  var quality=afPlannerQc_(inputQc);audit.snapshot.qc=quality;
  if(asset!=='XAUUSD'&&asset!=='XAU/USD')throw Error('AF_ASSET_UNAVAILABLE');
  if(!['scalping','daytrade','swingtrade'].includes(style))throw Error('AF_TRADE_STYLE_UNSUPPORTED');
  audit.stage='NEWS_PRE';var news=afNewsCheck_('XAUUSD',true);
  audit.newsKnownAt=Date.now();audit.newsSnapshot=afWorkflowNewsEvidence_(news);
  if(!news.ok||!news.canTrade)throw Error(news.ok?'AF_NEWS_WINDOW':'AF_NEWS_UNAVAILABLE');
  audit.stage='QUOTE_PRE';AF_MT5_RUN.quote=null;var preQuote=afPlannerQuote_();
  audit.stage='DATA_PRE';var ctx=afBuildAnalystContext_(style,preQuote);audit.snapshot=afPlannerSnapshot_(ctx,quality);
  var gate=afPlannerContextGate_(ctx,Date.now());if(gate)throw Error(gate);
  audit.stage='PLANNER';audit.candidates=afPlannerBuild_(ctx,quality,Date.now());
  audit.reasonCode=audit.candidates.some(function(c){return c.eligible;})?'AF_ELIGIBLE_CANDIDATES':afPlannerNoCandidateReason_(audit.snapshot,audit.candidates);
  audit.gateCodes=audit.snapshot.evidenceCounts.gateCodes.slice();
  if(audit.reasonCode!=='AF_ELIGIBLE_CANDIDATES'&&audit.gateCodes.indexOf(audit.reasonCode)<0)audit.gateCodes.unshift(audit.reasonCode);
  return finish(true,'DIAGNOSTICS_READY');
 }catch(e){audit.reasonCode=afWorkflowFailureCode_(e);audit.gateCodes=[audit.reasonCode];return finish(false,afWorkflowStatus_(audit.reasonCode));}
 finally{if(held&&lock){try{lock.releaseLock();}catch(_){}}}
}
