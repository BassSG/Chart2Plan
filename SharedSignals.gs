/* One PAPER plan per shared SignalLog row. The research ledger remains the state authority.
 * TAProAlerts is mirrored through SharedAlerts.gs; no broker commands or model calls. */
var AF_SHARED_CONFIG=Object.freeze({version:'AF-SHARED-SIGNALS-1',source:'ALLINDY_FIBO',
  spreadsheetId:'1jG-yyEs6PrRH1TK8VjQ4setEscwXC0cwAUCVghh3DZk',sheetName:'TAProSignalLog',sheetId:42397460});
var AF_SHARED_HEADERS=['Plan Source','Plan Key','Order Type','Pending ExpiresAt','Hold Until','Plan State',
  'Net Planned RR','Monitoring Mode','Source Revision','Signal Text','Shared Imported','Monitor CheckedAt','Plan State JSON','Sync Status'];
var AF_SHARED_CACHE=null,AF_SHARED_IMPORTING=false;
function afSharedEnabled_(){return PropertiesService.getScriptProperties().getProperty('AF_SHARED_ENABLED')==='1';}
function afSharedUrl_(row){return 'https://docs.google.com/spreadsheets/d/'+AF_SHARED_CONFIG.spreadsheetId+'/edit#gid='+AF_SHARED_CONFIG.sheetId+(row?'&range=A'+row:'');}
function afSharedCode_(error){var code=String(error&&error.message||'');return /^AF_SHARED_[A-Z_]+$/.test(code)?code:'AF_SHARED_SAVE_PENDING';}
function afSharedDirtyKey_(p){return 'AF_SHARED_DIRTY_'+afResearchHash_(p.key).replace(/[^A-Za-z0-9_-]/g,'');}
function afSharedMetadata_(response,request,snapshot,executionTF){
  var q=snapshot&&snapshot.quote||{},f=snapshot&&snapshot.frames&&snapshot.frames[executionTF]||{},qc=response.qcResult||{};
  return {model:String(request.model||'unknown').slice(0,120),score:Number.isFinite(qc.percentage)?qc.percentage:null,
    threshold:Number.isFinite(qc.threshold)?qc.threshold:null,atr:Number.isFinite(f.atr)?f.atr:null,
    spot:Number.isFinite(q.bid)?q.bid:null,message:String(response.message||'').slice(0,30000)};
}
function afSharedLegacyMetadata_(book,p){
  if(p.sharedSignal)return p.sharedSignal;
  var sheet=book.getSheetByName('Analysis'),last=sheet&&sheet.getLastRow(),found=null;
  if(last>1){var hits=sheet.getRange(2,2,last-1,1).createTextFinder(String(p.runId)).matchEntireCell(true).findAll();
    if(hits.length)found=sheet.getRange(hits[hits.length-1].getRow(),1,1,10).getValues()[0];}
  return {model:found&&String(found[5]||'unknown')||'unknown',score:found&&Number.isFinite(found[7])?found[7]:null,
    threshold:null,atr:null,spot:null,message:found?String(found[9]||'').slice(0,30000):''};
}
function afSharedSchema_(prepare){
  if(AF_SHARED_CACHE)return AF_SHARED_CACHE;
  var book=SpreadsheetApp.openById(AF_SHARED_CONFIG.spreadsheetId),sheet=book.getSheetByName(AF_SHARED_CONFIG.sheetName);
  if(!sheet||sheet.getSheetId()!==AF_SHARED_CONFIG.sheetId)throw Error('AF_SHARED_SHEET_MISMATCH');
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(x){return String(x).trim();});
  ['Run ID','Username','CreatedAt','Symbol','Model','Entry','SL','TP1','Entry Status','Exit Status','Outcome','Realized R','UpdatedAt'].forEach(function(h){
    if(headers.indexOf(h)<0||headers.indexOf(h)!==headers.lastIndexOf(h))throw Error('AF_SHARED_HEADER_MISMATCH');});
  var missing=AF_SHARED_HEADERS.filter(function(h){return headers.indexOf(h)<0;});
  if(missing.length){
    if(!prepare)throw Error('AF_SHARED_NOT_INITIALIZED');
    var start=headers.length+1,need=headers.length+missing.length;
    if(sheet.getMaxColumns()<need)sheet.insertColumnsAfter(sheet.getMaxColumns(),need-sheet.getMaxColumns());
    sheet.getRange(1,headers.length,1,1).copyFormatToRange(sheet,start,need,1,1);
    sheet.getRange(1,start,1,missing.length).setValues([missing]);headers=headers.concat(missing);
    missing.forEach(function(h,i){sheet.setColumnWidth(start+i,h==='Signal Text'||h==='Plan State JSON'?260:160);});
  }
  var map={};headers.forEach(function(h,i){if(h){if(map[h]!==undefined)throw Error('AF_SHARED_DUPLICATE_HEADER');map[h]=i;}});
  AF_SHARED_CACHE={book:book,sheet:sheet,headers:headers,map:map};return AF_SHARED_CACHE;
}
function afSharedFindRow_(schema,key){
  var sheet=schema.sheet,last=sheet.getLastRow();if(last<2)return null;
  var hits=sheet.getRange(2,schema.map['Plan Key']+1,last-1,1).createTextFinder(String(key)).matchEntireCell(true).findAll();
  if(hits.length>1)throw Error('AF_SHARED_DUPLICATE_PLAN');
  return hits.length?hits[0].getRow():null;
}
function afSharedCompactRow_(schema,index,force){
  if(force||schema.sheet.getRowHeight(index)!==36){
    schema.sheet.getRange(index,1,1,schema.headers.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('middle');
    schema.sheet.setRowHeightsForced(index,1,36);
  }
}
function afSharedState_(p){
  var view=afPaperView_(p),entered=Number.isFinite(p.fillAt),entry=entered?'Triggered':p.state==='PENDING'?'Active':p.state==='REVIEW'?'Unknown':'Not Filled';
  var exit={PENDING:'WAITING',ACTIVE:'WAITING',TP:'TP1',SL:'SL',EXPIRED:'Expired',CANCELLED:'Cancelled',REVIEW:'REVIEW',TIME_EXIT:'TIME_EXIT'}[p.state];
  var outcome={PENDING:'OPEN',ACTIVE:'OPEN',TP:'WIN',SL:'LOSS',EXPIRED:'CANCELLED',CANCELLED:'CANCELLED',REVIEW:'REVIEW',TIME_EXIT:'TIME_EXIT'}[p.state];
  if(!exit||!outcome)throw Error('AF_SHARED_STATE_INVALID');
  if(view.awaitingData){entry=entered?'Triggered':'Unknown';exit='REVIEW';outcome='REVIEW';}
  return {entry:entry,exit:exit,outcome:outcome};
}
function afSharedRow_(schema,p,meta,old,imported,now){
  if(!p||!p.key||!p.runId||![1,-1].includes(p.side)||![p.entry,p.stop,p.target,p.createdAt,p.expiresAt].every(Number.isFinite)||
    !(p.entry>0&&p.stop>0&&p.target>0&&p.side*(p.entry-p.stop)>0&&p.side*(p.target-p.entry)>0))throw Error('AF_SHARED_PLAN_INVALID');
  var map=schema.map,row=old?old.slice():new Array(schema.headers.length).fill(''),state=afSharedState_(p),view=afPaperView_(p,now),risk=Math.abs(p.entry-p.stop),reward=Math.abs(p.target-p.entry);
  function put(h,v){if(map[h]!==undefined)row[map[h]]=v==null?'':v;}
  function date(t){return Number.isFinite(t)?new Date(t):'';}
  var profile='Allindy + Fibo · '+String(meta.model||'unknown'),e=p.metadata&&p.metadata.evidence||{};
  put('Run ID',p.runId);put('Username',profile);put('CreatedAt',date(p.createdAt));put('Symbol',p.symbol==='XAUUSD'?'XAU/USD':p.symbol);
  put('Trade Type',p.style||'daytrade');put('Model',meta.model||'unknown');put('Code Version',AF_SHARED_CONFIG.version);
  put('Entry',p.entry);put('SL',p.stop);put('TP1',p.target);put('TPMost','');put('Risk Distance',risk);put('Reward Distance',reward);put('Planned RR',reward/risk);
  put('ATR',meta.atr);put('Spread',p.costs&&p.costs.spread);put('Current Price',meta.spot);
  put('QC Score',meta.score);put('QC Threshold',meta.threshold);put('QC Version',p.metadata&&p.metadata.ruleVersion||AF_RESEARCH_VERSION);
  put('QC Reasons',p.reason);put('QC Notes',view.label+' · Allindy + Fibo · PAPER · คะแนนหลักฐานไม่ใช่โอกาสชนะ');
  put('QC Breakdown JSON',JSON.stringify({zoneId:e.zoneId||null,fiboId:e.fiboId||null,executionTF:p.executionTF,contextTF:e.contextTF||null}));
  put('Entry Assessment','ราคาจากโซน Allindy และ Fibo ตามแผนที่ระบบเดิมคำนวณ');
  put('SL Assessment','จุดตัดขาดทุนที่ตรึงไว้ตอนรับแผน');put('TP Assessment','เป้าหมายที่ตรึงไว้ตอนรับแผน');
  var review={source:AF_SHARED_CONFIG.source,evidence:{}};
  ['zoneId','fiboId','executionTF','contextTF','setupMode','sourceTF','sourceScore','entryRole','targetRole','stopKind'].forEach(function(k){if(['string','number','boolean'].includes(typeof e[k]))review.evidence[k]=e[k];});
  put('Plan Review JSON',JSON.stringify(review));
  put('Bangkok Hour',Number(Utilities.formatDate(new Date(p.createdAt),'Asia/Bangkok','H')));put('Weekday',Utilities.formatDate(new Date(p.createdAt),'Asia/Bangkok','EEE'));
  put('Entry Status',state.entry);put('Exit Status',state.exit);put('Outcome',state.outcome);
  // The legacy PWA poller uses these cells as its own delivery ledger.
  // Imported history and plans that already ended must not become a late NEW_ORDER.
  if(map['New Order NotifiedAt']!==undefined&&!row[map['New Order NotifiedAt']]&&((!old&&imported)||!['PENDING','ACTIVE'].includes(p.state)||view.awaitingData))
    put('New Order NotifiedAt',!old&&imported?'AF_IMPORT_NO_BACKFILL':'AF_ENDED_OR_REVIEW_NO_NEW_ORDER');
  if(!old&&imported&&['WIN','LOSS'].includes(state.outcome)&&map['Final NotifiedAt']!==undefined&&!row[map['Final NotifiedAt']])put('Final NotifiedAt','AF_IMPORT_NO_BACKFILL');
  put('Realized R',['TP','SL','TIME_EXIT'].includes(p.state)&&Number.isFinite(p.pnlPrice)&&Number.isFinite(p.fillAt)?p.pnlPrice/risk:'');
  put('Entry TriggeredAt',date(p.fillAt));put('Exit TriggeredAt',date(p.exitAt));put('Trigger Source',AF_RESEARCH_VERSION+' | '+p.reason);put('UpdatedAt',new Date(now));
  put('Plan Source',AF_SHARED_CONFIG.source);put('Plan Key',p.key);put('Order Type',p.side===1?'Buy Limit':'Sell Limit');
  put('Pending ExpiresAt',date(p.expiresAt));put('Hold Until',date(p.holdUntil));put('Plan State',p.state);put('Net Planned RR',p.netR);
  put('Monitoring Mode','PAPER');put('Source Revision',p.revision);put('Signal Text',String(meta.message||'').slice(0,30000));
  put('Shared Imported',old?old[map['Shared Imported']]||'NO':imported?'YES':'NO');
  var completed=Number(PropertiesService.getScriptProperties().getProperty('AF_SHARED_LAST_CHECKED'));
  put('Monitor CheckedAt',completed>=p.createdAt?new Date(completed):'');put('Sync Status','SYNCED');
  put('Plan State JSON',JSON.stringify({version:AF_RESEARCH_VERSION,view:view,activationAt:p.activationAt,reason:p.reason,
    horizon:p.horizon,fillAt:p.fillAt,fillPrice:p.fillPrice,exitAt:p.exitAt,exitPrice:p.exitPrice,pnlPrice:p.pnlPrice,lastBarClose:p.lastBarClose,costs:p.costs,realBroker:false}));
  if(row.some(function(v){return typeof v==='string'&&v.length>45000;}))throw Error('AF_SHARED_CELL_TOO_LARGE');
  return row.map(afResearchCell_);
}
function afSharedUpsertLocked_(book,p,imported){
  var schema=afSharedSchema_(false),sheet=schema.sheet,map=schema.map,index=afSharedFindRow_(schema,p.key),old=index?sheet.getRange(index,1,1,schema.headers.length).getValues()[0]:null;
  if(old){
    if(old[map['Plan Source']]!==AF_SHARED_CONFIG.source||String(old[map['Run ID']])!==p.runId)throw Error('AF_SHARED_IDENTITY_CONFLICT');
    if(['Entry','SL','TP1'].some(function(h,i){return Number(old[map[h]])!==[p.entry,p.stop,p.target][i];}))throw Error('AF_SHARED_LEVELS_CHANGED');
    if(Number(old[map['Source Revision']])>p.revision)throw Error('AF_SHARED_REVISION_CONFLICT');
    var projected=afSharedState_(p),view=afPaperView_(p);
    if(Number(old[map['Source Revision']])===p.revision&&old[map['Entry Status']]===projected.entry&&old[map['Exit Status']]===projected.exit&&old[map.Outcome]===projected.outcome){
      afSharedCompactRow_(schema,index,false);
      var checked=Number(PropertiesService.getScriptProperties().getProperty('AF_SHARED_LAST_CHECKED'));
      if(checked>=p.createdAt)sheet.getRange(index,map['Monitor CheckedAt']+1).setValue(new Date(checked));
      return {success:true,state:'SYNCED',row:index,url:afSharedUrl_(index),deduplicated:true};
    }
  }
  var meta=afSharedLegacyMetadata_(book,p),row=afSharedRow_(schema,p,meta,old,imported,Date.now());
  if(index)sheet.getRange(index,1,1,row.length).setValues([row]);
  else{sheet.appendRow(row);index=afSharedFindRow_(schema,p.key);if(!index)throw Error('AF_SHARED_APPEND_UNCONFIRMED');}
  afSharedCompactRow_(schema,index,true);
  if(!old){
    ['CreatedAt','Entry TriggeredAt','Exit TriggeredAt','UpdatedAt','Pending ExpiresAt','Hold Until','Monitor CheckedAt'].forEach(function(h){if(map[h]!==undefined)sheet.getRange(index,map[h]+1).setNumberFormat('yyyy-mm-dd hh:mm:ss');});
    ['Entry','SL','TP1','Risk Distance','Reward Distance','Planned RR','Net Planned RR','Realized R'].forEach(function(h){if(map[h]!==undefined)sheet.getRange(index,map[h]+1).setNumberFormat('0.00');});
  }
  return {success:true,state:'SYNCED',row:index,url:afSharedUrl_(index),deduplicated:!!old};
}
function afSharedObservePaper_(book,p){
  if(!afSharedEnabled_())return {success:false,state:'NOT_CONNECTED',url:afSharedUrl_()};
  var props=PropertiesService.getScriptProperties(),key=afSharedDirtyKey_(p);
  props.setProperty(key,p.key);props.setProperty('AF_SHARED_NEEDS_SCAN','1');
  try{var alerts=afSharedSyncAlerts_(book,p),result=afSharedUpsertLocked_(book,p,AF_SHARED_IMPORTING);result.alertRows=alerts.rows;result.alertsUrl=alerts.url;props.deleteProperty(key);return result;}
  catch(error){var code=afSharedCode_(error);props.setProperty('AF_SHARED_LAST_ERROR',code);return {success:false,state:'RETRY_PENDING',code:code,url:afSharedUrl_()};}
}
function afSharedStatus(){
  var p=PropertiesService.getScriptProperties();return Object.assign({enabled:afSharedEnabled_(),alertsReady:p.getProperty('AF_SHARED_ALERTS_READY')==='1',url:afSharedUrl_(),alertsUrl:afSharedAlertsUrl_(),sheet:'TAProSignalLog',source:'Allindy + Fibo',
    monitorInstalled:p.getProperty('AF_SHARED_MONITOR_MODE')==='TAPRO_SCHEDULER',intervalMinutes:5,
    lastResult:p.getProperty('AF_SHARED_LAST_RESULT')||null,lastError:p.getProperty('AF_SHARED_LAST_ERROR')||null,realBroker:false},afSharedHealth_(p,Date.now()));
}
function afInitializeSharedSignals(){
  afRequireUser_(afSoloIdentity_().username);return afResearchLock_(function(){
    AF_SHARED_CACHE=null;afSharedSchema_(true);afSharedPrepareAlerts_();
    var props=PropertiesService.getScriptProperties(),book=afResearchBookLocked_(),plans=afPaperLatest_(book,afResearchHash_(afSoloIdentity_().username)),saved=0,waiting=0;
    props.setProperty('AF_SHARED_ENABLED','1');props.setProperty('AF_SHARED_ALERTS_READY','1');if(!props.getProperty('AF_SHARED_STARTED_AT'))props.setProperty('AF_SHARED_STARTED_AT',String(Date.now()));
    AF_SHARED_IMPORTING=true;
    try{plans.forEach(function(p){var r=afSharedObservePaper_(book,p);r.success?saved++:waiting++;});}finally{AF_SHARED_IMPORTING=false;}
    props.setProperty('AF_SHARED_MONITOR_MODE','TAPRO_SCHEDULER');props.setProperty('AF_SHARED_ACTIVE_COUNT',String(plans.filter(function(p){return ['PENDING','ACTIVE'].includes(p.state);}).length));
    props.setProperty('AF_SHARED_NEEDS_SCAN','1');SpreadsheetApp.flush();
    return Object.assign(afSharedStatus(),{success:waiting===0,imported:saved,retryPending:waiting,message:'เชื่อม TAPRO_2 แล้ว · หนึ่งแผนต่อหนึ่งแถว · ใช้รอบตรวจเดิมประมาณทุก 5 นาที'});
  });
}
function afSharedMonitor(){
  if(!afSharedEnabled_())return {skipped:'NOT_CONNECTED',aiCalls:0};
  var props=PropertiesService.getScriptProperties(),all=props.getProperties(),dirty=Object.keys(all).filter(function(k){return k.indexOf('AF_SHARED_DIRTY_')===0;});
  if(!dirty.length&&all.AF_SHARED_NEEDS_SCAN!=='1'&&Number(all.AF_SHARED_ACTIVE_COUNT)===0){props.setProperty('AF_SHARED_LAST_CHECKED',String(Date.now()));props.setProperty('AF_SHARED_LAST_RESULT','NO_OPEN_PLANS');return {skipped:'NO_OPEN_PLANS',aiCalls:0};}
  if(Date.now()-Number(all.AF_SHARED_MONITOR_LAST_STARTED||0)<45000)return {skipped:'RECENTLY_CHECKED',aiCalls:0};
  var lock=LockService.getScriptLock();if(!lock.tryLock(1))return {skipped:'ANALYSIS_BUSY',aiCalls:0};
  try{
    props.setProperty('AF_SHARED_MONITOR_LAST_STARTED',String(Date.now()));
    var user=afSoloIdentity_().username,book=afResearchBookLocked_(),plans=afPaperLatest_(book,afResearchHash_(user));
    plans.forEach(function(p){if(afSharedAlertCancellationRequested_(p)){p.state='CANCELLED';p.reason='USER_CANCELLED_SHARED_ALERTS';afPaperCommit_(book,p,'CANCELLED','PENDING');}});
    var open=plans.filter(function(p){return ['PENDING','ACTIVE'].includes(p.state);});
    plans.filter(function(p){return open.indexOf(p)>=0||dirty.some(function(k){return all[k]===p.key;});}).forEach(function(p){afSharedObservePaper_(book,p);});
    var oldest=open.reduce(function(t,p){return Math.min(t,p.lastBarClose);},Date.now()),limit=Math.max(30,Math.min(3000,Math.ceil((Date.now()-oldest)/60000)+3));
    var result=open.length?afPaperRefreshLocked_(user,{plans:plans,limit:limit}):afPaperSummary_(plans);
    var outcome=result.feed||'NO_OPEN_PLANS';
    if(result.feed==='VERIFIED_CLOSED_M1'){
      props.setProperty('AF_SHARED_LAST_READ_AT',String(Date.now()));
      if(Number.isFinite(result.latestClosedAt))props.setProperty('AF_SHARED_LAST_CANDLE_AT',String(result.latestClosedAt));
      if(result.replayedBars>0)props.setProperty('AF_SHARED_LAST_VERIFIED_AT',String(Date.now()));else outcome='NO_NEW_CLOSED_M1';
    }
    props.setProperty('AF_SHARED_ACTIVE_COUNT',String((result.counts.PENDING||0)+(result.counts.ACTIVE||0)));props.deleteProperty('AF_SHARED_NEEDS_SCAN');
    props.setProperty('AF_SHARED_LAST_CHECKED',String(Date.now()));props.setProperty('AF_SHARED_LAST_RESULT',outcome);
    // Re-read committed versions; replay may have advanced a plan. Update derived
    // deadline warnings after completion, without overwriting a newer revision.
    var latest=afPaperLatest_(book,afResearchHash_(user));
    latest.filter(function(p){return ['PENDING','ACTIVE'].includes(p.state)||dirty.some(function(k){return all[k]===p.key;});}).forEach(function(p){afSharedObservePaper_(book,p);});
    var remaining=Object.keys(props.getProperties()).filter(function(k){return k.indexOf('AF_SHARED_DIRTY_')===0;});if(!remaining.length){props.deleteProperty('AF_SHARED_LAST_ERROR');props.deleteProperty('AF_SHARED_NEEDS_SCAN');}
    return {success:remaining.length===0,feed:result.feed||null,changed:result.changed||0,retryPending:remaining.length,aiCalls:0,realBroker:false};
  }catch(error){var code=afSharedCode_(error);props.setProperty('AF_SHARED_LAST_ERROR',code);return {success:false,code:code,aiCalls:0,realBroker:false};}
  finally{lock.releaseLock();}
}
function afSharedMonitorRequest_(e){
  var text=e&&e.postData&&e.postData.contents||'',input;
  if(text.length>100)return afJson_({accepted:false,reason:'EXTERNAL_INGRESS_DISABLED'});
  try{input=JSON.parse(text);}catch(_){return afJson_({accepted:false,reason:'EXTERNAL_INGRESS_DISABLED'});}
  if(!input||input.action!=='shared_monitor'||Object.keys(input).length!==1)return afJson_({accepted:false,reason:'EXTERNAL_INGRESS_DISABLED'});
  if(!afSharedEnabled_())return afJson_({accepted:false,reason:'NOT_CONNECTED',aiCalls:0});
  PropertiesService.getScriptProperties().setProperty('AF_SHARED_MONITOR_REQUESTED_AT',String(Date.now()));
  return afJson_(Object.assign({accepted:true},afSharedMonitor()));
}
