/* Presentation and health only. Never infer an Entry, exit or P&L from wall time. */
function afPaperView_(p,now){
  now=Number.isFinite(now)?now:Date.now();
  var pending=p.state==='PENDING',late=pending&&Number.isFinite(p.expiresAt)&&now>=p.expiresAt;
  var hold=p.state==='ACTIVE'&&Number.isFinite(p.holdUntil)&&now>=p.holdUntil;
  return {planKey:p.key||p.planKey||null,runId:p.runId||null,revision:p.revision||0,paperState:p.state,expiresAt:p.expiresAt,holdUntil:p.holdUntil,state:late?'PENDING_DATA_GAP':hold?'HOLD_DATA_GAP':p.state,
    awaitingData:late||hold,entryAllowed:pending&&!late,
    label:late?'พ้นเวลารอเข้า — รอข้อมูลยืนยันผล':hold?'ครบเวลาถือ — รอข้อมูลยืนยันผล':
      ({PENDING:'อยู่ในเวลารอเข้า',ACTIVE:'เข้าแผนจำลองแล้ว',REVIEW:'ต้องตรวจสอบหลักฐาน',TP:'ถึงเป้า TP',SL:'ถึงจุด SL',EXPIRED:'หมดอายุโดยไม่เข้า',CANCELLED:'ยกเลิก',TIME_EXIT:'ปิดครบเวลาถือ'})[p.state]||p.state,
    verifiedThrough:Number.isFinite(p.lastBarClose)&&p.replayEvidence?p.lastBarClose:null};
}
// Invalidate status caches only after a committed ledger/audit write. Cache data
// is disposable; the append-only, hash-checked ledger remains authoritative.
function afPaperStatusChanged_(){PropertiesService.getScriptProperties().setProperty('AF_PAPER_STATUS_VERSION',Utilities.getUuid());}
function afPaperTriggers_(plans){
  return plans.filter(function(p){return ['PENDING','ACTIVE','REVIEW'].includes(p.state);}).map(function(p){
    return {alertId:p.planKey,symbol:p.symbol,type:p.side===1?'Buy Limit':'Sell Limit',alertType:'Paper '+p.state,targetPrice:p.entry,
      status:p.state==='REVIEW'||p.view.awaitingData?'Review':'Active',statusLabel:p.view.label,entryAllowed:p.view.entryAllowed,paperState:p.state};
  });
}
// Read-only UI polling: no ScriptLock, provider requests, replay, or AI. A cache
// miss reads only committed ledger rows and small audit alias columns.
function afPaperStatus(user,requestedKeys,requestedRuns){
  afRequireUser_(user);
  var props=PropertiesService.getScriptProperties(),version=props.getProperty('AF_PAPER_STATUS_VERSION')||'initial';
  var keys=Array.isArray(requestedKeys)?requestedKeys.filter(function(k){return typeof k==='string'&&/^P:H:[A-Za-z0-9_-]+$/.test(k);}).slice(0,50).sort():[];
  var runs=Array.isArray(requestedRuns)?requestedRuns.filter(function(r){return typeof r==='string'&&r.length<=150&&r.indexOf('AF:')===0;}).slice(0,50).sort():[];
  var cacheKey='AF-PAPER-STATUS-1:'+afResearchHash_(user+'|'+version+'|'+JSON.stringify([keys,runs])),cache=null,snapshot=null;
  try{cache=CacheService.getScriptCache();var cached=cache.get(cacheKey);if(cached)snapshot=JSON.parse(cached);}catch(_){}
  if(!snapshot){
    var book=afResearchReadBook_(),owner=afResearchHash_(user),all=book?afPaperLatest_(book,owner):[],aliases={};
    if(book){var sheet=book.getSheetByName('Audit'),last=sheet.getLastRow(),first=runs.length?2:Math.max(2,last-199);
      if(last>=first)sheet.getRange(first,3,last-first+1,6).getValues().forEach(function(r,i){
        if(r[0]===owner&&r[5]&&(first+i>last-200||runs.indexOf(String(r[1]))>=0))aliases[String(r[1])]=String(r[5]);
      });}
    keys=keys.concat(runs.map(function(r){return aliases[r];}).filter(Boolean));
    var ordered=all.slice().sort(function(a,b){return Number(keys.indexOf(b.key)>=0)-Number(keys.indexOf(a.key)>=0)||b.createdAt-a.createdAt;});
    var plans=ordered.slice(0,100).map(function(p){return {planKey:p.key,runId:p.runId,symbol:p.symbol,side:p.side,entry:p.entry,stop:p.stop,target:p.target,
      state:p.state,revision:p.revision,createdAt:p.createdAt,expiresAt:p.expiresAt,holdUntil:p.holdUntil,fillAt:p.fillAt,lastBarClose:p.lastBarClose,
      replayEvidence:!!p.replayEvidence};});
    plans.forEach(function(p){aliases[p.runId]=p.planKey;});
    var today=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
    snapshot={plans:plans,aliases:aliases,counts:afPaperSummary_(all).counts,total:all.length,snapshotAt:Date.now(),
      today:{date:today,entries:all.filter(function(p){return Number.isFinite(p.fillAt)&&Utilities.formatDate(new Date(p.fillAt),'Asia/Bangkok','yyyy-MM-dd')===today;}).length}};
    // Never publish an older snapshot under a newer commit's cache key.
    if(cache&&(props.getProperty('AF_PAPER_STATUS_VERSION')||'initial')===version)try{cache.put(cacheKey,JSON.stringify(snapshot),60);}catch(_){}
  }
  var now=Date.now(),plans=snapshot.plans.map(function(p){return Object.assign({},p,{view:afPaperView_(p,now)});});
  return {success:true,mode:'TEST',realBroker:false,asOf:now,snapshotAt:snapshot.snapshotAt,plans:plans,aliases:snapshot.aliases,
    counts:snapshot.counts,total:snapshot.total,today:snapshot.today,triggers:afPaperTriggers_(plans),sharedStatus:afSharedStatus()};
}
function afSharedHealth_(props,now){
  var get=function(k){return Number(props.getProperty(k))||null;},requested=get('AF_SHARED_MONITOR_REQUESTED_AT'),completed=get('AF_SHARED_LAST_CHECKED');
  var fresh=function(t){return !!t&&now-t>=0&&now-t<=15*60000;};
  var connected=fresh(requested)&&fresh(completed),feed=props.getProperty('AF_SHARED_LAST_RESULT'),error=props.getProperty('AF_SHARED_LAST_ERROR');
  return {monitorConnected:connected,health:!connected?'STALE':error?'DEGRADED':feed==='UNAVAILABLE_NO_OUTCOMES_INFERRED'?'DATA_UNAVAILABLE':feed==='NO_NEW_CLOSED_M1'?'WAITING_BARS':'OK',
    lastRequestedAt:requested,lastAttemptAt:get('AF_SHARED_MONITOR_LAST_STARTED'),lastCheckedAt:completed,
    lastReadAt:get('AF_SHARED_LAST_READ_AT'),lastVerifiedAt:get('AF_SHARED_LAST_VERIFIED_AT'),lastCandleAt:get('AF_SHARED_LAST_CANDLE_AT')};
}
