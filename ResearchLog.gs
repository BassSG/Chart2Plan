/* Scoped research ledger v1. No broker orders or verified fills; no private config reads.
 * afAuditRecord_(response,request) requires caller's ScriptLock; *Locked_ NEVER lock.
 * audit={snapshot:context,candidates:[],gates:[],versions:{...}}; context alias supported.
 * PaperPlans = append-only committed revisions. Snapshots = hash-checked JSON chunks.
 * FROZEN COST MODEL: quote spread in price units, no inferred historical Ask/spread.
 * BUY entry Ask, exit Bid; SELL entry Bid, exit Ask=Bid+spread. Limit fill at entry
 * (no favorable improvement), TP at target; SL gaps at adverse open. Deduct 0.02
 * adverse exit allowance from resolved PnL, NOT spread twice. No size/money modeled.
 * Not tick/Ask history. Explicit paper activation = next complete M1 open.
 * The creation partial minute is deliberately not active, never backfilled.
 * Subsequent closed M1 must be contiguous, weekends included: no session guesses.
 * Daytrade: pending 60m from acceptance, hold 240m from modeled fill; frozen per plan.
 * Other/legacy plans retain 12 execution-TF pending durations. Closed M1 required.
 * Legacy ACTIVE has no timeout. Daytrade TIME_EXIT uses the final observed M1 close.
 * Entry+exit or TP+SL in the same candle => unresolved REVIEW.
 * Optional audit.newsCoverage=[{from,to,knownAt,status:'CLEAR'|'BLOCKED'}] in UTC ms.
 * Only pre-known archived coverage enclosing a full M1 is used; unknown entry news =>
 * REVIEW. Live news now is never substituted for historical entry news. Source-book
 * state is never rewritten by execution target-before-entry cancellation.
 */
var AF_RESEARCH_VERSION='AF-RESEARCH-3';
var AF_PAPER_STATES=['PENDING','ACTIVE','TP','SL','EXPIRED','CANCELLED','REVIEW','TIME_EXIT'];
var AF_RESEARCH_HEADERS={
  Audit:['seq','recordedAt','owner','runId','status','evidenceRef','evidenceHash','planKey'],
  Snapshots:['seq','ref','chunk','total','sha256','json'],
  Events:['seq','recordedAt','owner','planKey','kind','from','to','revisionRef'],
  PaperPlans:['seq','recordedAt','owner','planKey','state','revision','previousRef','revisionRef','sha256']
};
function afResearchHash_(s){return 'H:'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function afResearchCell_(v){return typeof v==='string'&&/^[\s]*[=+\-@]/.test(v)?"'"+v:v;}
function afResearchAppend_(sheet,row){sheet.appendRow(row.map(afResearchCell_));}
// Called ONLY under outer write lock. Do not call afEnsureWorkspace_ (nested lock).
function afResearchBookLocked_(){
  afAssertSandbox_();
  var props=PropertiesService.getScriptProperties(),id=props.getProperty('AF_SHEET_ID'),book;
  if(id){book=SpreadsheetApp.openById(id);if(book.getName().indexOf('Allindy + Fibo')!==0)throw Error('AF_WORKSPACE_ID_MISMATCH');}
  else{
    book=SpreadsheetApp.create('Allindy + Fibo — Independent Workspace');
    book.getSheets()[0].setName('Analysis');
    book.getSheetByName('Analysis').appendRow(['UTC','Run ID','User','Symbol','Style','Model','Status','QC','AI Cost USD','Result']);
    book.insertSheet('Plans').appendRow(['Run ID','User','Symbol','Type','Entry','SL','TP','State','UTC','Evidence']);
    props.setProperty('AF_SHEET_ID',book.getId());
  }
  Object.keys(AF_RESEARCH_HEADERS).forEach(function(name){
    var s=book.getSheetByName(name)||book.insertSheet(name),header=AF_RESEARCH_HEADERS[name];
    if(!s.getLastRow())s.appendRow(header);
    else if(JSON.stringify(s.getRange(1,1,1,header.length).getValues()[0])!==JSON.stringify(header))throw Error('AF_RESEARCH_HEADER_MISMATCH');
  });return book;
}
function afResearchLock_(fn){var lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn();}finally{lock.releaseLock();}}
function afResearchRows_(book,name){return book.getSheetByName(name).getDataRange().getValues().slice(1);}
// Do not serialize requests/config/provider exceptions. Redact irrelevant sensitive keys.
function afResearchClean_(value){
  if(Array.isArray(value))return value.map(afResearchClean_);
  if(value&&typeof value==='object'){
    var out={};Object.keys(value).forEach(function(k){
      if(!/(?:password|secret|token|api.?key|authorization|cookie|email|username|displayname|^user$)/i.test(k))out[k]=afResearchClean_(value[k]);
    });return out;
  }return value===undefined?null:value;
}
function afResearchBlob_(book,value){
  var text=JSON.stringify(value),hash=afResearchHash_(text),ref='J:'+hash+':'+Utilities.getUuid(),s=book.getSheetByName('Snapshots'),rows=[];
  var size=36000,parts=[],seq=s.getLastRow();
  for(var at=0;at<text.length;){
    var end=Math.min(at+size,text.length);
    if(end<text.length&&/[\uD800-\uDBFF]/.test(text.charAt(end-1)))end--;
    parts.push(text.slice(at,end));at=end;
  }
  parts.forEach(function(part,i){rows.push([seq+i,ref,i+1,parts.length,hash,'J:'+part]);});
  s.getRange(s.getLastRow()+1,1,rows.length,6).setValues(rows);return {ref:ref,hash:hash};
}
function afResearchReadBlob_(book,ref,expectedHash){
  // Read the small reference column first. Never reload every audit payload to find one blob.
  var sheet=book.getSheetByName('Snapshots'),last=sheet.getLastRow(),positions=[],chunks=[];
  if(last>1)sheet.getRange(2,2,last-1,1).getValues().forEach(function(r,i){if(r[0]===ref)positions.push(i+2);});
  for(var p=0;p<positions.length;){var start=positions[p],end=start;p++;while(p<positions.length&&positions[p]===end+1){end=positions[p];p++;}
    chunks=chunks.concat(sheet.getRange(start,1,end-start+1,6).getValues());}
  chunks.sort(function(a,b){return a[2]-b[2];});
  if(!chunks.length||chunks.length!==chunks[0][3])throw Error('AF_RESEARCH_CHUNKS_MISSING');
  var text='',hash=chunks[0][4],prev=0;
  chunks.forEach(function(r,i){
    if(r[2]!==i+1||r[3]!==chunks.length||r[4]!==hash||r[0]<=prev||typeof r[5]!=='string'||r[5].slice(0,2)!=='J:')throw Error('AF_RESEARCH_CHUNKS_INVALID');
    prev=r[0];text+=r[5].slice(2);
  });
  if(hash!==afResearchHash_(text)||(expectedHash&&hash!==expectedHash)||ref.indexOf('J:'+hash+':')!==0)throw Error('AF_RESEARCH_HASH_MISMATCH');
  return JSON.parse(text);
}
function afPaperTfMs_(p){
  var tf=(p.evidence||{}).executionTF||p.executionTF;
  return ({'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000})[tf]||p.tfMs||null;
}
function afPaperKey_(p,symbol){
  var e=p.evidence||{};
  return 'P:'+afResearchHash_(JSON.stringify([symbol,p.side,e.zoneId||e.zone||null,e.fiboId||e.fibo||null,p.entry,p.stop,p.target,afPaperTfMs_(p)]));
}
function afPaperLatest_(book,owner){
  var latest={};afResearchRows_(book,'PaperPlans').forEach(function(r){if(r[2]===owner)latest[r[3]]=r;});
  return Object.keys(latest).map(function(k){var row=latest[k],p=afResearchReadBlob_(book,row[7],row[8]);
    if(p.key!==k||p.owner!==owner||p.state!==row[4]||p.revision!==row[5])throw Error('AF_RESEARCH_REVISION_MISMATCH');
    p._ref=row[7];return p;
  });
}
function afPaperCommit_(book,p,kind,from){
  var previous=p._ref||'',copy=JSON.parse(JSON.stringify(p));delete copy._ref;copy.revision=(copy.revision||0)+1;
  var blob=afResearchBlob_(book,copy),s=book.getSheetByName('PaperPlans'),at=Date.now();
  afResearchAppend_(s,[s.getLastRow(),at,p.owner,p.key,p.state,copy.revision,previous,blob.ref,blob.hash]);
  p.revision=copy.revision;p._ref=blob.ref;
  var events=book.getSheetByName('Events');
  afResearchAppend_(events,[events.getLastRow(),at,p.owner,p.key,kind,from||'',p.state,blob.ref]);
}
function afResearchAuditDone_(book,owner,key,blob,result,kind){
  var s=book.getSheetByName('Events');
  afResearchAppend_(s,[s.getLastRow(),Date.now(),owner,key||'',kind||'AUDIT_RECORDED','','',blob.ref]);
  SpreadsheetApp.flush();return result;
}
function afArchiveNewsCoverage_(news,at){
  if(!news||news.ok!==true||!Number.isFinite(at)||!Number.isFinite(news.sourceAgeMinutes)||!Array.isArray(news.events)||!Number.isFinite(news.beforeMinutes)||!Number.isFinite(news.afterMinutes))return [];
  var until=at+Math.max(0,45-news.sourceAgeMinutes)*60000,from=Math.ceil(at/60000)*60000,out=[];
  for(var t=from;t+60000<=until;t+=60000){
    var blocked=news.events.some(function(e){return Number.isFinite(e.timestamp)&&t<=e.timestamp*1000+news.afterMinutes*60000&&t+60000>=e.timestamp*1000-news.beforeMinutes*60000;});
    out.push({from:t,to:t+60000,knownAt:at,status:blocked?'BLOCKED':'CLEAR',basis:'ARCHIVED_VALIDATED_CALENDAR_FRESHNESS_WINDOW'});
  }return out;
}
function afAuditRecord_(response,request){
  var book=afResearchBookLocked_(),now=Date.now(),a=response.audit||{},owner=afResearchHash_(request.user),p=response.success&&response.plan;
  var snapshot=a.snapshot||a.context||null,symbol=String(request.symbol||'').replace('/',''),key=p?afPaperKey_(p,symbol):'';
  var archivedNews=Array.isArray(a.newsCoverage)?a.newsCoverage:afArchiveNewsCoverage_(a.newsSnapshot,a.newsKnownAt);
  var activationAt=Math.ceil(now/60000)*60000;
  var evidence={schemaVersion:1,ledgerVersion:AF_RESEARCH_VERSION,runId:String(response.runId||''),recordedAt:now,
    status:String(response.status||''),reason:String(a.reason||response.reason||response.status||''),symbol:symbol,style:request.tradeType||null,
    versions:afResearchClean_(a.versions||{status:'NOT_SUPPLIED'}),snapshot:afResearchClean_(snapshot),
    candidates:afResearchClean_(a.candidates||[]),gates:afResearchClean_(a.gates||[]),
    acceptedPlan:p?afResearchClean_(p):null,newsCoverage:afResearchClean_(archivedNews),newsSnapshot:afResearchClean_(a.newsSnapshot||null),
    evidenceComplete:!!(snapshot&&Array.isArray(a.candidates)&&Array.isArray(a.gates)&&a.versions)};
  var blob=afResearchBlob_(book,evidence),s=book.getSheetByName('Audit');
  afResearchAppend_(s,[s.getLastRow(),now,owner,evidence.runId,evidence.status,blob.ref,blob.hash,key]);
  var result={auditRef:blob.ref,auditHash:blob.hash,planKey:key||null,realBroker:false};
  if(!p)return afResearchAuditDone_(book,owner,key,blob,result);
  var prior=afPaperLatest_(book,owner).find(function(x){return x.key===key;});
  if(prior){result.deduplicated=true;result.state=prior.state;return afResearchAuditDone_(book,owner,key,blob,result,'AUDIT_DEDUPLICATED');}
  var e=p.evidence||{},tf=e.executionTF||p.executionTF,tfMs=afPaperTfMs_(p);
  var q=(snapshot||{}).quote||{},spread=typeof q.spread==='number'?q.spread:q.spread_price;
  var state='PENDING',reason='AWAITING_CLOSED_M1';
  if(symbol!=='XAUUSD'||![1,-1].includes(p.side)||![p.entry,p.stop,p.target].every(function(n){return Number.isFinite(n)&&n>0;})||p.side*(p.entry-p.stop)<=0||p.side*(p.target-p.entry)<=0||!Number.isFinite(tfMs)||tfMs<60000||tfMs%60000){state='REVIEW';reason='INVALID_FROZEN_PLAN';}
  else if(!Number.isFinite(spread)||spread<0){state='REVIEW';reason='MISSING_FROZEN_SPREAD';}
  else if(!evidence.evidenceComplete){state='REVIEW';reason='MISSING_AUDIT_EVIDENCE';}
  // This is a scheduled paper plan, not an order claimed active during an unseen partial minute.
  var horizon=request.tradeType==='daytrade'?afDayTradeHorizon_(now):null;
  var paper={schemaVersion:1,ledgerVersion:AF_RESEARCH_VERSION,key:key,owner:owner,symbol:symbol,runId:evidence.runId,auditRef:blob.ref,
    createdAt:now,activationAt:activationAt,activationModel:'NEXT_COMPLETE_M1_OPEN',originalCreatedAt:p.createdAt||null,side:p.side,entry:p.entry,stop:p.stop,target:p.target,netR:Number.isFinite(p.netR)?p.netR:null,
    style:request.tradeType||null,horizon:horizon,holdUntil:null,
    executionTF:tf||null,tfMs:tfMs||null,expiresAt:horizon?horizon.pendingDeadline:Number.isFinite(tfMs)?activationAt+12*tfMs:null,
    costs:{model:'FROZEN_SPREAD_PLUS_EXIT_ALLOWANCE_V1',spread:Number.isFinite(spread)?spread:null,exitAllowance:0.02,units:'price',realBroker:false},
    metadata:afResearchClean_({evidence:e,invalidation:p.invalidation||null,ruleVersion:p.ruleVersion||null,versions:evidence.versions}),
    newsCoverage:afResearchClean_(archivedNews),
    state:state,reason:reason,lastBarClose:activationAt,fillAt:null,fillPrice:null,exitAt:null,exitPrice:null,pnlPrice:null,revision:0};
  afPaperCommit_(book,paper,'CREATED','');result.state=state;return afResearchAuditDone_(book,owner,key,blob,result);
}
function afPaperReview_(p,reason){p.state='REVIEW';p.reason=reason;p.pnlPrice=null;return p;}
function afPaperHistoricalNews_(p,b){
  var spans=(p.newsCoverage||[]).filter(function(x){return x&&[x.from,x.to,x.knownAt].every(Number.isFinite)&&x.from<=b.openTime&&x.to>=b.closeTime&&x.knownAt<=b.openTime;});
  if(spans.some(function(x){return x.status==='BLOCKED';}))return 'BLOCKED';
  return spans.some(function(x){return x.status==='CLEAR';})?'CLEAR':'UNKNOWN';
}
// Pure reducer; frozen E/SL/TP, costs, metadata and TTL remain unchanged.
function afPaperStep_(original,b){
  var p=JSON.parse(JSON.stringify(original));
  if(!['PENDING','ACTIVE'].includes(p.state))return p;
  if(!b||b.confirmed!==true||![b.openTime,b.closeTime,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.closeTime-b.openTime!==60000||b.openTime%60000!==0||b.openTime!==p.lastBarClose||b.openTime<p.createdAt||b.low<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))return afPaperReview_(p,'MISSING_OR_INVALID_M1_COVERAGE');
  p.lastBarClose=b.closeTime;
  var spread=p.costs.spread,s=p.side,open=b.open+(s===-1?spread:0),low=b.low+(s===-1?spread:0),high=b.high+(s===-1?spread:0);
  var sl=s===1?low<=p.stop:high>=p.stop,tp=s===1?high>=p.target:low<=p.target;
  if(p.state==='PENDING'){
    if(b.openTime>=p.expiresAt){p.state='EXPIRED';p.reason=p.horizon?'PENDING_TTL_60_MINUTES':'PENDING_TTL_12_EXECUTION_BARS';return p;}
    var entry=s===1?b.low+spread<=p.entry:b.high>=p.entry;
    if(p.horizon&&entry&&b.closeTime>p.expiresAt)return afPaperReview_(p,'ENTRY_EXPIRY_SAME_M1_ORDER_UNKNOWN');
    var news=afPaperHistoricalNews_(p,b);
    if(news==='BLOCKED'){p.state='CANCELLED';p.reason='ARCHIVED_NEWS_BLOCKED';return p;}
    if(!entry){
      if(tp){p.state='CANCELLED';p.reason='EXECUTION_TARGET_BEFORE_ENTRY';}
      else if(b.closeTime>=p.expiresAt){p.state='EXPIRED';p.reason=p.horizon?'PENDING_TTL_60_MINUTES':'PENDING_TTL_12_EXECUTION_BARS';}return p;
    }
    if(sl||tp)return afPaperReview_(p,'ENTRY_EXIT_SAME_M1_ORDER_UNKNOWN');
    if(news!=='CLEAR')return afPaperReview_(p,'ENTRY_NEWS_HISTORY_UNKNOWN');
    p.state='ACTIVE';p.reason='MODELED_LIMIT_FILL';p.fillAt=b.closeTime;p.fillBarOpen=b.openTime;p.fillPrice=p.entry;
    if(p.horizon)p.holdUntil=p.fillAt+p.horizon.maxHoldMinutes*60000;return p;
  }
  if(p.horizon&&(!Number.isFinite(p.fillAt)||!Number.isFinite(p.holdUntil)||p.holdUntil!==p.fillAt+p.horizon.maxHoldMinutes*60000))return afPaperReview_(p,'HOLD_DEADLINE_INVALID');
  if(p.horizon&&b.openTime>=p.holdUntil)return afPaperReview_(p,'HOLD_DEADLINE_MISSED');
  var gap=s===1?open<=p.stop:open>=p.stop;
  if(sl&&tp)return afPaperReview_(p,'SL_TP_SAME_M1_ORDER_UNKNOWN');
  if(gap||sl||tp){
    p.state=gap||sl?'SL':'TP';p.exitPrice=gap?open:(sl?p.stop:p.target);p.exitAt=b.closeTime;p.exitBarOpen=b.openTime;
    p.reason=gap?'ADVERSE_STOP_GAP':(sl?'MODELED_STOP':'MODELED_LIMIT_TARGET');
    p.pnlPrice=s*(p.exitPrice-p.fillPrice)-p.costs.exitAllowance;
  }else if(p.horizon&&b.closeTime>=p.holdUntil){
    p.state='TIME_EXIT';p.reason='MAX_HOLD_240_MINUTES';p.exitPrice=b.close+(s===-1?spread:0);
    p.exitAt=b.closeTime;p.exitBarOpen=b.openTime;p.pnlPrice=s*(p.exitPrice-p.fillPrice)-p.costs.exitAllowance;
  }return p;
}
function afPaperSummary_(plans){
  var counts={};AF_PAPER_STATES.forEach(function(s){counts[s]=0;});
  plans.forEach(function(p){if(counts[p.state]!==undefined)counts[p.state]++;});
  var resolved=plans.filter(function(p){return ['TP','SL','TIME_EXIT'].includes(p.state)&&Number.isFinite(p.pnlPrice);});
  counts.Entry=plans.filter(function(p){return p.fillAt!==null;}).length;
  counts.TP1=counts.TP;counts.Review=counts.REVIEW;counts.Pending=counts.PENDING;counts.Active=counts.ACTIVE;counts.Expired=counts.EXPIRED;
  return {mode:'TEST',researchOnly:true,realBroker:false,verifiedBrokerFills:false,total:plans.length,counts:counts,
    stats:{resolved:resolved.length,wins:resolved.filter(function(p){return p.pnlPrice>0;}).length,
      losses:resolved.filter(function(p){return p.pnlPrice<=0;}).length,pnlPrice:resolved.reduce(function(n,p){return n+p.pnlPrice;},0),
      excludedUnresolved:plans.length-resolved.length,units:'price, not money; no position size modeled'}};
}
function afRefreshPaper(user){return afPaperRefresh_(user);}
function afPaperRefresh_(user){afRequireUser_(user);return afResearchLock_(function(){return afPaperRefreshLocked_(user);});}
function afPaperRefreshLocked_(user){
  afRequireUser_(user);var book=afResearchBookLocked_(),owner=afResearchHash_(user),plans=afPaperLatest_(book,owner),now=Date.now();
  var pending=plans.filter(function(p){return ['PENDING','ACTIVE'].includes(p.state);}),bars=[],feed='NOT_REQUESTED';
  if(pending.length){
    try{
      // Closed-bar replay does not require an open-market quote: never invent a missing outcome.
      AF_PROVIDER_RUN.responses={};AF_PROVIDER_RUN.quote=null;AF_PROVIDER_RUN.metadata=null;
      var market=afReadMarket_('1m',3000);
      if(market.symbol!=='XAUUSD'||market.sourceId!=='Eightcap-MT5-Live')throw Error('AF_PAPER_FEED_INVALID');
      bars=market.bars;if(!bars.length)throw Error('AF_PAPER_FEED_EMPTY');
      var previous=null;
      bars.forEach(function(b){
        if(!b||b.confirmed!==true||![b.openTime,b.closeTime,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.closeTime>now||b.closeTime-b.openTime!==60000||b.openTime%60000||b.low<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||previous!==null&&b.openTime<=previous)throw Error('AF_PAPER_FEED_INVALID');previous=b.openTime;
      });feed='VERIFIED_CLOSED_M1';
    }catch(_){feed='UNAVAILABLE_NO_OUTCOMES_INFERRED';bars=[];}
  }
  var changed=0;
  plans=plans.map(function(p){
    if(!['PENDING','ACTIVE'].includes(p.state))return p;
    var before=JSON.stringify(p),from=p.state;
    if(feed==='VERIFIED_CLOSED_M1'){
      var next=bars.filter(function(b){return b.openTime>=p.lastBarClose;});
      var consumed=[];
      for(var i=0;i<next.length&&['PENDING','ACTIVE'].includes(p.state);i++){
        consumed.push(next[i]);p=afPaperStep_(p,next[i]);
      }
      if(consumed.length)p.replayEvidence=afResearchBlob_(book,{schemaVersion:1,kind:'CLOSED_M1_BID_REPLAY',
        sourceId:'Eightcap-MT5-Live',fetchedAt:now,bars:consumed});
      // No newer closed bars can mean a closed session or transient lag. Keep waiting.
      // A proven gap inside subsequent available bars is still REVIEW in afPaperStep_.
    }
    if(JSON.stringify(p)!==before){afPaperCommit_(book,p,'M1_REPLAY',from);changed++;}return p;
  });
  SpreadsheetApp.flush();
  return Object.assign(afPaperSummary_(plans),{changed:changed,feed:feed,asOf:now});
}
function afPaperCancel_(user,key){
  afRequireUser_(user);return afResearchLock_(function(){
    var book=afResearchBookLocked_(),plans=afPaperLatest_(book,afResearchHash_(user)),p=plans.find(function(x){return x.key===key;});
    if(!p)return {success:false,reason:'NOT_FOUND',realBroker:false};
    if(p.state==='PENDING'){p.state='CANCELLED';p.reason='USER_CANCELLED_PENDING';afPaperCommit_(book,p,'CANCELLED','PENDING');}
    return {success:p.state==='CANCELLED',state:p.state,realBroker:false};
  });
}
function afPaperPublic_(p){
  return {id:p.key,planKey:p.key,runId:p.runId,auditRef:p.auditRef,symbol:p.symbol,side:p.side,entry:p.entry,stop:p.stop,target:p.target,netR:p.netR,
    state:p.state,reason:p.reason,createdAt:p.createdAt,activationAt:p.activationAt||p.createdAt,activationModel:p.activationModel||'LEGACY',executionTF:p.executionTF,expiresAt:p.expiresAt,horizon:p.horizon||null,holdUntil:p.holdUntil||null,lastBarClose:p.lastBarClose,
    fillAt:p.fillAt,fillBarOpen:p.fillBarOpen||null,fillPrice:p.fillPrice,exitAt:p.exitAt,exitPrice:p.exitPrice,pnlPrice:p.pnlPrice,
    costs:p.costs,metadata:p.metadata,realBroker:false};
}
// Read-only: no provider calls, no implicit replay/backfill or AI polling.
function afResearchDashboard(user,includeAudits){
  afRequireUser_(user);return afResearchLock_(function(){
    var book=afResearchBookLocked_(),owner=afResearchHash_(user),plans=afPaperLatest_(book,owner),now=Date.now();
    var today=Utilities.formatDate(new Date(now),'Asia/Bangkok','yyyy-MM-dd');
    // Automatic alert/stat requests need plan state, not the large diagnostic audit bodies.
    var rows=includeAudits===false?[]:afResearchRows_(book,'Audit').filter(function(r){return r[2]===owner;}).slice(-10).reverse();
    var audits=rows.map(function(r){var a=afResearchReadBlob_(book,r[5],r[6]),all=Array.isArray(a.candidates)?a.candidates:[];
      // The audit blob keeps full evidence. A dashboard needs only a bounded summary;
      // returning every candidate twice can make the browser process over 100 MB of JSON.
      var preview=all.slice(0,60).map(function(c){
        var gates=Array.isArray(c&&c.gates)?c.gates.slice(0,12).map(function(g){return typeof g==='string'?g:String(g&& (g.code||g.reason||g.name)||'UNKNOWN');}):[];
        return {id:c&&c.id||null,accepted:c&&c.accepted===true,eligible:c&&c.eligible===true,gates:gates};
      });
      return {runId:a.runId,recordedAt:a.recordedAt,status:a.status,reason:a.reason||a.status,auditRef:r[5],versions:a.versions,candidates:preview,candidateCount:all.length,candidatesTruncated:all.length>preview.length,gates:a.gates,evidenceComplete:a.evidenceComplete};
    });
    var fills=plans.filter(function(p){return p.fillAt!==null&&Utilities.formatDate(new Date(p.fillAt),'Asia/Bangkok','yyyy-MM-dd')===today;}).map(afPaperPublic_);
    return Object.assign(afPaperSummary_(plans),{asOf:now,audits:audits,latestRuns:audits,
      recentRuns:audits.map(function(a){return {runId:a.runId,status:a.status,utc:new Date(a.recordedAt).toISOString(),reason:a.reason};}),
      plans:plans.sort(function(a,b){return b.createdAt-a.createdAt;}).map(afPaperPublic_),today:{date:today,entries:fills.length},timeZone:'Asia/Bangkok',todayPaperFills:fills,
      desiredRange:{min:1,max:5,researchOnly:true,enforcedQuota:false},
      note:'Modeled paper evidence only. REVIEW is unresolved; no verified broker fills. Desired range is not a trade quota.'});
  });
}

