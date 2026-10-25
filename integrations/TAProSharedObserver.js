/* Install in the existing TAPro project, beside its native Push module.
 * Observes only shared Allindy PAPER rows; it never creates alerts or trade commands. */
function taproIsAllindyPaperRow_(row,headers){
  var source=(headers||[]).indexOf('Plan Source');
  return source>=0&&row[source]==='ALLINDY_FIBO';
}
function taproObserveAllindySharedSafe_(lockAlreadyHeld){
  var lock=lockAlreadyHeld?null:LockService.getScriptLock();
  if(lock&&!lock.tryLock(1))return {skipped:'LOCK_BUSY'};
  try{
    var props=PropertiesService.getScriptProperties();
    if(!props.getProperty(taproNativeProperty_('STARTED')))return {skipped:'PUSH_NOT_CONFIGURED'};
    var sheet=getSignalLogSheet();
    if(sheet.getParent().getId()!=='1jG-yyEs6PrRH1TK8VjQ4setEscwXC0cwAUCVghh3DZk'||sheet.getSheetId()!==42397460)throw Error('SHARED_TARGET_MISMATCH');
    var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],source=headers.indexOf('Plan Source'),key=headers.indexOf('Plan Key'),mode=headers.indexOf('Monitoring Mode'),imported=headers.indexOf('Shared Imported');
    if(source<0||key<0||mode<0||imported<0||sheet.getLastRow()<2)return {observed:0,seeded:0};
    var monitor={deferred:true};
    try{
      var response=UrlFetchApp.fetch('https://script.google.com/macros/s/AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g/exec',
        {method:'post',contentType:'application/json',payload:JSON.stringify({action:'shared_monitor'}),followRedirects:true,muteHttpExceptions:true,validateHttpsCertificates:true});
      if(response.getResponseCode()===200)monitor=JSON.parse(response.getContentText());
    }catch(_){Logger.log('ALLINDY_SHARED_MONITOR_WAIT');}
    var matches=sheet.getRange(2,source+1,sheet.getLastRow()-1,1).createTextFinder('ALLINDY_FIBO').matchEntireCell(true).findAll(),observed=0,seeded=0;
    matches.forEach(function(hit){
      var values=sheet.getRange(hit.getRow(),1,1,headers.length).getValues()[0];
      if(values[mode]!=='PAPER'||!values[key])return;
      var row=taproNativeRow_(headers,values);if(!row['Run ID']||!row.Username||!TAProNativeCore.mask(row)&&TAProNativeCore.status(row)!=='REVIEW')return;
      var hash=taproNativeHash_(row['Run ID']+'|'+row.Username),ledger=taproNativeProperty_('LEDGER_'+hash),revision=taproNativeProperty_('ROW_'+hash);
      if(values[imported]==='YES'&&props.getProperty(ledger)===null){
        var updates={};updates[ledger]=String(TAProNativeCore.mask(row));updates[revision]=taproNativeRevision_(row);props.setProperties(updates,false);seeded++;return;
      }
      taproNativeObserveRowSafe_(headers,values);observed++;
    });
    props.setProperty('TAPRO_ALLINDY_SHARED_LAST_CHECKED',String(Date.now()));
    return {observed:observed,seeded:seeded,intervalMinutes:5,source:'ALLINDY_FIBO',monitor:monitor,brokerCommands:0};
  }catch(error){Logger.log('ALLINDY_SHARED_PUSH_WAIT');return {deferred:true,brokerCommands:0};}
  finally{if(lock)lock.releaseLock();}
}
function taproSyncAllindySharedSignals(){
  var result=taproObserveAllindySharedSafe_(false);taproNativeFlushSafe_();Logger.log(JSON.stringify(result));return result;
}
