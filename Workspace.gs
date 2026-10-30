/* Original client RPC contract, independent workspace state. */
var AF_WORKSPACE_CACHE=null;
// The Google deployment is MYSELF-only. This identity labels test data; it is not a password or access token.
function afSoloIdentity_(){afAssertSandbox_();return {username:'owner-test',displayName:'ผู้ทดสอบส่วนตัว',singleUser:true};}
function afEnsureWorkspace_(){afAssertSandbox_();if(AF_WORKSPACE_CACHE)return AF_WORKSPACE_CACHE;var p=PropertiesService.getScriptProperties(),id=p.getProperty('AF_SHEET_ID'),book;
 if(id){book=SpreadsheetApp.openById(id);if(!book.getName().startsWith('Allindy + Fibo'))throw Error('AF_WORKSPACE_ID_MISMATCH');}
 else{var lock=LockService.getScriptLock();lock.waitLock(30000);try{id=p.getProperty('AF_SHEET_ID');if(id)book=SpreadsheetApp.openById(id);else{book=SpreadsheetApp.create('Allindy + Fibo — Independent Workspace');book.getSheets()[0].setName('Analysis');book.getSheetByName('Analysis').appendRow(['UTC','Run ID','User','Symbol','Style','Model','Status','QC','AI Cost USD','Result']);book.insertSheet('Plans').appendRow(['Run ID','User','Symbol','Type','Entry','SL','TP','State','UTC','Evidence']);p.setProperty('AF_SHEET_ID',book.getId());}}finally{lock.releaseLock();}}
 AF_WORKSPACE_CACHE=book;return book;}
function afSheetPreviewUrl_(){return typeof afSharedEnabled_==='function'&&afSharedEnabled_()?'https://docs.google.com/spreadsheets/d/'+AF_SHARED_CONFIG.spreadsheetId+'/preview?gid='+AF_SHARED_CONFIG.alertsSheetId:'https://docs.google.com/spreadsheets/d/'+afEnsureWorkspace_().getId()+'/preview';}
function getWorkspaceSheetUrl(){return typeof afSharedEnabled_==='function'&&afSharedEnabled_()?afSharedAlertsUrl_():afEnsureWorkspace_().getUrl();}
function afUserKey_(user){return 'AF_USER_'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(user))).replace(/=+$/,'');}
function afPassword_(password,salt){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+password));}
function registerUser(){afAssertSandbox_();return {success:false,message:'ระบบทดสอบส่วนตัวไม่ต้องสมัครหรือใส่รหัสผ่าน'};}
function loginUser(){afAssertSandbox_();return {success:false,message:'ระบบทดสอบส่วนตัวไม่ต้องสมัครหรือใส่รหัสผ่าน'};}
function changePassword(){afAssertSandbox_();return {success:false,message:'ระบบทดสอบส่วนตัวไม่ต้องสมัครหรือใส่รหัสผ่าน'};}
function afRequireUser_(username){if(username!==afSoloIdentity_().username)throw Error('AF_OWNER_CONTEXT_REQUIRED');}
function getCurrentPrices(){afAssertSandbox_();try{AF_PROVIDER_RUN.quote=null;var q=afMt5Quote_();return {XAUUSD:Number(q.bid)};}catch(_){return {};}}
function manageTriggers(action,user){
 afRequireUser_(user);if(action==='deleteAll')return afCancelPaperMany_(user,null);
 if(action!=='getAll')return {success:false,message:'ไม่รองรับคำสั่งนี้'};
 return afPaperStatus(user);
}
function afCancelPaperMany_(user,ids){
 afRequireUser_(user);return afResearchLock_(function(){var book=afResearchBookLocked_(),plans=afPaperLatest_(book,afResearchHash_(user)),cancelled=0,kept=0;
 plans.forEach(function(p){if(ids&&ids.indexOf(p.key)<0)return;if(p.state==='PENDING'){p.state='CANCELLED';p.reason='USER_CANCELLED_PENDING';afPaperCommit_(book,p,'CANCELLED','PENDING');cancelled++;}else if(['ACTIVE','REVIEW'].includes(p.state))kept++;});
 SpreadsheetApp.flush();return {success:true,cancelled:cancelled,kept:kept,message:'ยกเลิก Pending จำลอง '+cancelled+' แผน; คงแผนที่เข้าแล้ว/รอตรวจทาน '+kept+' แผน เพื่อไม่ลบผลหรือหลักฐานย้อนหลัง',realBroker:false};});
}
function deleteAlert(id){return afCancelPaperMany_(afSoloIdentity_().username,[id]);}
function deleteMultipleAlerts(ids,user){if(!Array.isArray(ids))return {success:false,message:'รายการแผนไม่ถูกต้อง'};return afCancelPaperMany_(user,ids);}
function getTriggeredCount(user){afRequireUser_(user);var d=afResearchDashboard(user,false);return Object.assign({},d.counts,{mode:'TEST',realBroker:false,note:'ผลจำลองจากแท่งราคา ไม่ใช่ Fill โบรกเกอร์; กดอัปเดตผลแผนจำลองเพื่อประมวลผลแท่งใหม่',resolved:d.resolved||null});}
function afLogAnalysis_(response,request){
 var saved=afAuditRecord_(response,request);response.auditRecord=saved;
 if(saved.sharedSave){response.sharedSave=saved.sharedSave;if(response.success)response.message+='\n'+(saved.sharedSave.success?'บันทึก AllindyAlerts ครบ Entry / SL / TP และ AllindySignalLog แถวสรุปแล้ว':'บันทึกภายในแล้ว · ชีตแยกยังไม่ยืนยัน ระบบจะซิงก์ซ้ำอัตโนมัติ');}
 var book=afEnsureWorkspace_();
 afResearchAppend_(book.getSheetByName('Analysis'),[new Date().toISOString(),response.runId,request.user,request.symbol,request.tradeType,request.model,response.status,response.qcResult?response.qcResult.percentage:'',response.cost==null?'':response.cost,String(response.message).slice(0,40000)]);
 if(response.success&&response.plan&&!saved.deduplicated){var p=response.plan;afResearchAppend_(book.getSheetByName('Plans'),[response.runId,request.user,request.symbol,p.side===1?'Buy Limit':'Sell Limit',p.entry,p.stop,p.target,saved.state==='REVIEW'?'Review':'Active',new Date().toISOString(),JSON.stringify(p.evidence)]);}
 if(saved.deduplicated){response.deduplicated=true;response.message+='\nแผนเดิมถูกบันทึกไว้แล้ว ไม่สร้างไม้จำลองซ้ำ';}
 SpreadsheetApp.flush();
}
function afStoreResponse_(response,request){try{afLogAnalysis_(response,request);return response;}catch(_){return Object.assign({},response,{success:false,status:'SAVE_FAILED_OR_PARTIAL',plan:null,message:'ยังยืนยันการบันทึกใน Sheet ไม่ได้ อาจบันทึกได้บางส่วน กรุณาตรวจ Run ID ก่อนวิเคราะห์ซ้ำ\n'+response.message});}}
function afDeleteOwnData(user,confirmation){afRequireUser_(user);if(confirmation!=='DELETE_MY_TEST_DATA')return {success:false,message:'กรุณายืนยันการล้างข้อมูลทดสอบ'};['Analysis','Plans'].forEach(function(name){var s=afEnsureWorkspace_().getSheetByName(name),rows=s.getDataRange().getValues(),col=name==='Analysis'?2:1;for(var i=rows.length-1;i>0;i--)if(rows[i][col]===user)s.deleteRow(i+1);});return {success:true,message:'ล้างข้อมูลทดสอบเฉพาะโปรเจกต์ใหม่แล้ว'};}

