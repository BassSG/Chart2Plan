/* Presentation and health only. Never infer an Entry, exit or P&L from wall time. */
function afPaperView_(p,now){
  now=Number.isFinite(now)?now:Date.now();
  var pending=p.state==='PENDING',late=pending&&Number.isFinite(p.expiresAt)&&now>=p.expiresAt;
  var hold=p.state==='ACTIVE'&&Number.isFinite(p.holdUntil)&&now>=p.holdUntil;
  return {paperState:p.state,expiresAt:p.expiresAt,holdUntil:p.holdUntil,state:late?'PENDING_DATA_GAP':hold?'HOLD_DATA_GAP':p.state,
    awaitingData:late||hold,entryAllowed:pending&&!late,
    label:late?'พ้นเวลารอเข้า — รอข้อมูลยืนยันผล':hold?'ครบเวลาถือ — รอข้อมูลยืนยันผล':
      ({PENDING:'อยู่ในเวลารอเข้า',ACTIVE:'เข้าแผนจำลองแล้ว',REVIEW:'ต้องตรวจสอบหลักฐาน',TP:'ถึงเป้า TP',SL:'ถึงจุด SL',EXPIRED:'หมดอายุโดยไม่เข้า',CANCELLED:'ยกเลิก',TIME_EXIT:'ปิดครบเวลาถือ'})[p.state]||p.state,
    verifiedThrough:Number.isFinite(p.lastBarClose)&&p.replayEvidence?p.lastBarClose:null};
}
function afSharedHealth_(props,now){
  var get=function(k){return Number(props.getProperty(k))||null;},requested=get('AF_SHARED_MONITOR_REQUESTED_AT'),completed=get('AF_SHARED_LAST_CHECKED');
  var fresh=function(t){return !!t&&now-t>=0&&now-t<=15*60000;};
  var connected=fresh(requested)&&fresh(completed),feed=props.getProperty('AF_SHARED_LAST_RESULT'),error=props.getProperty('AF_SHARED_LAST_ERROR');
  return {monitorConnected:connected,health:!connected?'STALE':error?'DEGRADED':feed==='UNAVAILABLE_NO_OUTCOMES_INFERRED'?'DATA_UNAVAILABLE':feed==='NO_NEW_CLOSED_M1'?'WAITING_BARS':'OK',
    lastRequestedAt:requested,lastAttemptAt:get('AF_SHARED_MONITOR_LAST_STARTED'),lastCheckedAt:completed,
    lastReadAt:get('AF_SHARED_LAST_READ_AT'),lastVerifiedAt:get('AF_SHARED_LAST_VERIFIED_AT'),lastCandleAt:get('AF_SHARED_LAST_CANDLE_AT')};
}
