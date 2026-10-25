/* TAProAlerts compatibility: fixed A:L positions match saveAlert() in the reference.
 * A plan has Entry/SL/TP1 rows, joined by its original Run ID and Plan Key.
 * State comes only from our PAPER ledger; no legacy TTL, analytics or EA publication. */
var AF_SHARED_ALERT_CACHE=null;
var AF_SHARED_ALERT_HEADERS=['Plan Source','Plan Key','Monitoring Mode','Source Revision','Pending ExpiresAt','Hold Until'];
function afSharedAlertsUrl_(row){return 'https://docs.google.com/spreadsheets/d/'+AF_SHARED_CONFIG.spreadsheetId+'/edit#gid=0'+(row?'&range=A'+row:'');}
function afSharedPrepareAlerts_(){AF_SHARED_ALERT_CACHE=null;return afSharedAlertSchema_(true);}
function afSharedAlertSchema_(prepare){
  if(AF_SHARED_ALERT_CACHE)return AF_SHARED_ALERT_CACHE;
  var book=SpreadsheetApp.openById(AF_SHARED_CONFIG.spreadsheetId),sheet=book.getSheetByName('TAProAlerts');
  if(!sheet||sheet.getSheetId()!==0)throw Error('AF_SHARED_ALERT_SHEET_MISMATCH');
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();});
  // The existing first 12 header labels are shifted. Do not rename them or move data.
  ['ActivatedAt','EventAt','Status Reason','Lifecycle JSON'].forEach(function(h){if(headers.indexOf(h)<12||headers.indexOf(h)!==headers.lastIndexOf(h))throw Error('AF_SHARED_ALERT_HEADER_MISMATCH');});
  var missing=AF_SHARED_ALERT_HEADERS.filter(function(h){return headers.indexOf(h)<0;});
  if(missing.length){
    if(!prepare)throw Error('AF_SHARED_ALERT_NOT_INITIALIZED');
    var start=headers.length+1,need=headers.length+missing.length;
    if(sheet.getMaxColumns()<need)sheet.insertColumnsAfter(sheet.getMaxColumns(),need-sheet.getMaxColumns());
    sheet.getRange(1,headers.length,1,1).copyFormatToRange(sheet,start,need,1,1);
    sheet.getRange(1,start,1,missing.length).setValues([missing]);missing.forEach(function(_,i){sheet.setColumnWidth(start+i,160);});headers=headers.concat(missing);
  }
  var map={};headers.forEach(function(h,i){if(h){if(map[h]!==undefined)throw Error('AF_SHARED_ALERT_DUPLICATE_HEADER');map[h]=i;}});
  AF_SHARED_ALERT_CACHE={book:book,sheet:sheet,headers:headers,map:map};return AF_SHARED_ALERT_CACHE;
}
function afSharedFindAlerts_(schema,p){
  var sheet=schema.sheet,last=sheet.getLastRow(),found={};if(last<2)return found;
  var hits=sheet.getRange(2,schema.map['Plan Key']+1,last-1,1).createTextFinder(p.key).matchEntireCell(true).findAll();
  hits.forEach(function(hit){var index=hit.getRow(),row=sheet.getRange(index,1,1,schema.headers.length).getValues()[0],type=String(row[8]);
    if(row[schema.map['Plan Source']]!==AF_SHARED_CONFIG.source||row[schema.map['Monitoring Mode']]!=='PAPER'||String(row[7])!==p.runId||!['Entry','SL','TP1'].includes(type))throw Error('AF_SHARED_ALERT_IDENTITY_CONFLICT');
    if(found[type])throw Error('AF_SHARED_ALERT_DUPLICATE_PLAN');found[type]={index:index,row:row};
  });return found;
}
function afSharedAlertLifecycle_(p){
  return {version:'AF-SHARED-PAPER-1',source:AF_SHARED_CONFIG.source,mode:'PAPER',realBroker:false,synced:true,
    phase:p.state==='PENDING'?'WAITING':p.state==='ACTIVE'?'OPEN':p.state==='REVIEW'?'REVIEW':'CLOSED',paperState:p.state,
    publishedTs:p.createdAt/1000,expiresTs:p.expiresAt/1000,holdUntil:Number.isFinite(p.holdUntil)?p.holdUntil/1000:null,
    cursorTs:p.lastBarClose/1000,entryKnown:Number.isFinite(p.fillAt),entryTs:Number.isFinite(p.fillAt)?p.fillAt/1000:null,
    exitTs:Number.isFinite(p.exitAt)?p.exitAt/1000:null,exitType:p.state==='TP'?'TP1':['SL','TIME_EXIT','EXPIRED','CANCELLED'].includes(p.state)?p.state:null,
    reason:p.reason,signature:[p.entry,p.stop,p.target].join('|'),horizon:p.horizon||null,
    plan:{side:p.side===1?'buy':'sell',entry:p.entry,sl:p.stop,tp1:p.target,tradeType:p.style||'daytrade'}};
}
function afSharedAlertStatus_(p,type){
  if(type==='Entry'&&Number.isFinite(p.fillAt))return 'Triggered';
  if(p.state==='PENDING')return type==='Entry'?'Active':'Pending';
  if(p.state==='ACTIVE')return ['SL','TP1'].includes(type)?'Active':'Triggered';
  if(p.state==='REVIEW')return 'Review';
  if(p.state==='TP'&&type==='TP1'||p.state==='SL'&&type==='SL')return 'Triggered';
  return 'Cancelled';
}
function afSharedAlertRow_(schema,p,meta,type,old){
  var row=old?old.slice():new Array(schema.headers.length).fill(''),m=schema.map,buy=p.side===1;
  var price=type==='Entry'?p.entry:type==='SL'?p.stop:p.target;
  if(![p.entry,p.stop,p.target,p.expiresAt].every(Number.isFinite)||!(price>0))throw Error('AF_SHARED_ALERT_PLAN_INVALID');
  if(old&&(String(old[7])!==p.runId||Number(old[3])!==price||String(old[8])!==type))throw Error('AF_SHARED_ALERT_LEVELS_CHANGED');
  row[0]=old?old[0]:'AFALERT:'+afResearchHash_(p.key+'|'+type).replace(/[^A-Za-z0-9_-]/g,'');
  row[1]=buy?'Buy Limit':'Sell Limit';row[2]=p.symbol==='XAUUSD'?'XAU/USD':p.symbol;row[3]=price;
  row[4]=(type==='SL'?'StopLoss':type)+' '+row[2]+' | Allindy + Fibo · PAPER';
  row[5]=type==='TP1'?(buy?'greater':'less'):(buy?'less':'greater');row[6]=afSharedAlertStatus_(p,type);
  row[7]=p.runId;row[8]=type;row[9]='Allindy + Fibo · '+String(meta.model||'unknown');row[10]=new Date(p.createdAt);row[11]=meta.model||'unknown';
  row[m.ActivatedAt]=type!=='Entry'&&Number.isFinite(p.fillAt)?new Date(p.fillAt):'';
  var event=type==='Entry'?p.fillAt:type==='TP1'&&p.state==='TP'||type==='SL'&&p.state==='SL'?p.exitAt:null;
  row[m.EventAt]=Number.isFinite(event)?new Date(event):'';row[m['Status Reason']]=p.reason;
  row[m['Lifecycle JSON']]=JSON.stringify(afSharedAlertLifecycle_(p));row[m['Plan Source']]=AF_SHARED_CONFIG.source;
  row[m['Plan Key']]=p.key;row[m['Monitoring Mode']]='PAPER';row[m['Source Revision']]=p.revision;
  row[m['Pending ExpiresAt']]=new Date(p.expiresAt);row[m['Hold Until']]=Number.isFinite(p.holdUntil)?new Date(p.holdUntil):'';
  return row.map(afResearchCell_);
}
function afSharedSyncAlerts_(book,p){
  afSharedState_(p);
  if(![1,-1].includes(p.side)||![p.entry,p.stop,p.target,p.expiresAt].every(Number.isFinite)||!(p.entry>0&&p.stop>0&&p.target>0&&p.side*(p.entry-p.stop)>0&&p.side*(p.target-p.entry)>0))throw Error('AF_SHARED_ALERT_PLAN_INVALID');
  var schema=afSharedAlertSchema_(false),sheet=schema.sheet,m=schema.map,found=afSharedFindAlerts_(schema,p),meta=afSharedLegacyMetadata_(book,p),changed=[];
  ['Entry','SL','TP1'].forEach(function(type){
    var prior=found[type],row=afSharedAlertRow_(schema,p,meta,type,prior&&prior.row);
    if(prior&&Number(prior.row[m['Source Revision']])>p.revision)throw Error('AF_SHARED_ALERT_REVISION_CONFLICT');
    if(prior&&Number(prior.row[m['Source Revision']])===p.revision&&prior.row[6]===row[6]&&prior.row[m['Status Reason']]===p.reason)return;
    if(prior)sheet.getRange(prior.index,1,1,row.length).setValues([row]);else sheet.appendRow(row);changed.push(type);
  });
  if(changed.length)found=afSharedFindAlerts_(schema,p);
  var rows=['Entry','SL','TP1'].map(function(type){var item=found[type];if(!item)throw Error('AF_SHARED_ALERT_SAVE_UNCONFIRMED');
    if(changed.indexOf(type)>=0){sheet.getRange(item.index,1,1,schema.headers.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('middle');sheet.setRowHeightsForced(item.index,1,36);
      sheet.getRange(item.index,4).setNumberFormat('0.00');sheet.getRange(item.index,11).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      ['ActivatedAt','EventAt','Pending ExpiresAt','Hold Until'].forEach(function(h){sheet.getRange(item.index,m[h]+1).setNumberFormat('yyyy-mm-dd hh:mm:ss');});}
    return item.index;
  });return {success:true,rows:rows,url:afSharedAlertsUrl_(rows[0])};
}
function afSharedAlertCancellationRequested_(p){
  if(p.state!=='PENDING')return false;
  var found=afSharedFindAlerts_(afSharedAlertSchema_(false),p);
  return !!(found.Entry&&found.Entry.row[6]==='Cancelled'&&Number(found.Entry.row[afSharedAlertSchema_(false).map['Source Revision']])===p.revision);
}
