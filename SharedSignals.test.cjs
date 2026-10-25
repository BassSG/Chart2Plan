'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const headers=['Run ID','Username','CreatedAt','Symbol','Trade Type','Model','Code Version','Entry','SL','TP1','TPMost','Risk Distance','Reward Distance','Planned RR','ATR','ATR Multiple','Spread','Current Price','Trend','Trend Strength','Pullback Ready','QC Score','QC Threshold','QC Version','QC Reasons','QC Notes','QC Trend Score','QC ATR Score','QC TP1 Score','QC Entry Score','QC Sanity Score','QC Breakdown JSON','Bangkok Hour','Weekday','Entry Status','Exit Status','Outcome','Realized R','Entry TriggeredAt','Exit TriggeredAt','Trigger Source','UpdatedAt','New Order NotifiedAt','Final NotifiedAt','Push Last Error','Entry Assessment','SL Assessment','TP Assessment','Plan Review JSON'];
class Range{
 constructor(sheet,r,c,n=1,w=1){Object.assign(this,{sheet,r,c,n,w});}
 getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.w},(_,j)=>this.sheet.rows[this.r+i-1]?.[this.c+j-1]??''));}
 setValues(rows){assert.equal(rows.length,this.n);rows.forEach((r,i)=>{assert.equal(r.length,this.w);this.sheet.rows[this.r+i-1]??=[];r.forEach((v,j)=>this.sheet.rows[this.r+i-1][this.c+j-1]=v);});return this;}
 setValue(v){return this.setValues([[v]]);}getValue(){return this.getValues()[0][0];}getRow(){return this.r;}
 setNumberFormat(){return this;}copyTo(){return this;}copyFormatToRange(){return this;}setWrapStrategy(){return this;}setVerticalAlignment(){return this;}
 createTextFinder(text){const self=this;return {matchEntireCell(){return this;},findAll(){const found=[];self.getValues().forEach((row,i)=>row.forEach((v,j)=>{if(String(v)===text)found.push(new Range(self.sheet,self.r+i,self.c+j));}));return found;}};}
}
class Sheet{
 constructor(rows){this.rows=rows;this.maxCols=49;this.heights={};}getSheetId(){return 42397460;}getLastColumn(){return Math.max(...this.rows.map(r=>r.length));}getRowHeight(r){return this.heights[r]||180;}setRowHeightsForced(r,n,h){assert.equal(n,1);this.heights[r]=h;}
 getLastRow(){return this.rows.length;}getMaxColumns(){return this.maxCols;}insertColumnsAfter(_,n){this.maxCols+=n;}setColumnWidth(){}getParent(){return target;}
 getRange(...args){return new Range(this,...args);}appendRow(row){this.rows.push(row.slice());}
}
const production=new Array(49).fill('');production[0]='RUN-original';production[1]='existing-profile';production[7]=4000;production[42]='keep-notification-marker';
const sheet=new Sheet([headers.slice(),production.slice()]);
const target={getId:()=> '1jG-yyEs6PrRH1TK8VjQ4setEscwXC0cwAUCVghh3DZk',getSheetByName:()=>sheet};
const data=new Map(),properties={getProperty:k=>data.has(k)?data.get(k):null,setProperty(k,v){data.set(k,String(v));return this;},deleteProperty:k=>data.delete(k),getProperties:()=>Object.fromEntries(data),setProperties(o){Object.entries(o).forEach(([k,v])=>data.set(k,String(v)));}};
const lock={tryLock:()=>true,releaseLock(){}};let triggers=[],plans=[],aiCalls=0,refreshOptions=null;
const ctx=vm.createContext({console,Date,Number,JSON,Math,Array,String,Object,
 PropertiesService:{getScriptProperties:()=>properties},SpreadsheetApp:{openById:()=>target,WrapStrategy:{CLIP:1},CopyPasteType:{PASTE_FORMAT:1},flush(){}},
 Utilities:{formatDate:(d,tz,f)=>f==='H'?'12':'Sun'},LockService:{getScriptLock:()=>lock},
 ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},newTrigger:handler=>({timeBased(){return this;},everyMinutes(n){assert.equal(n,1);return this;},create(){triggers.push({getHandlerFunction:()=>handler});}})},
 afResearchHash_:s=>'H:'+crypto.createHash('sha256').update(s).digest('hex'),afResearchCell_:v=>typeof v==='string'&&/^[\s]*[=+\-@]/.test(v)?"'"+v:v,
 afSoloIdentity_:()=>({username:'owner-test'}),afRequireUser_(){},afResearchLock_:fn=>fn(),afResearchBookLocked_:()=>({}),afPaperLatest_:()=>plans,
 afSharedPrepareAlerts_(){},afSharedSyncAlerts_:()=>({rows:[1,2,3],url:'https://docs.google.com/spreadsheets/d/1jG-yyEs6PrRH1TK8VjQ4setEscwXC0cwAUCVghh3DZk/edit#gid=0'}),afSharedAlertsUrl_:()=> 'https://docs.google.com/spreadsheets/d/1jG-yyEs6PrRH1TK8VjQ4setEscwXC0cwAUCVghh3DZk/edit#gid=0',afSharedAlertCancellationRequested_:()=>false,
 AF_RESEARCH_VERSION:'AF-RESEARCH-3',afJson_:x=>x,afPaperSummary_:p=>({counts:{PENDING:p.filter(x=>x.state==='PENDING').length,ACTIVE:p.filter(x=>x.state==='ACTIVE').length}}),
 afPaperRefreshLocked_:(user,opts)=>{refreshOptions=opts;return {counts:{PENDING:0,ACTIVE:0},changed:1,feed:'VERIFIED_CLOSED_M1',replayedBars:1,latestClosedAt:Date.now()-60000};},
 afCallAnalyst_(){aiCalls++;throw Error('Unexpected paid AI call');}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'Monitoring.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'SharedSignals.gs'),'utf8'),ctx);
let groups=0;function group(name,fn){fn();groups++;console.log('PASS '+name);}
const start=Date.now();
function paper(id='one'){return {key:'P:H:'+id,runId:'AF:'+id,side:1,entry:100,stop:95,target:110,netR:1.996,symbol:'XAUUSD',style:'daytrade',createdAt:start,activationAt:start,expiresAt:start+3600000,holdUntil:null,
 revision:1,state:'PENDING',reason:'AWAITING_CLOSED_M1',lastBarClose:start,fillAt:null,fillPrice:null,exitAt:null,exitPrice:null,pnlPrice:null,
 horizon:{pendingMinutes:60,maxHoldMinutes:240,pendingDeadline:start+3600000},executionTF:'5m',costs:{spread:.2,exitAllowance:.02,realBroker:false},metadata:{evidence:{zoneId:'SD:1',fiboId:'FB:1'}},
 sharedSignal:{model:'google/gemini-3.8-flash',score:90,threshold:65,atr:2,spot:102,message:'แผนจากหลักฐานเดิม'}};}
let schema,p=paper();
const read=(h,row=3)=>sheet.rows[row-1][schema.map[h]];
group('extend only the missing columns and retain existing rows',()=>{schema=ctx.afSharedSchema_(true);assert.equal(sheet.maxCols,63);assert.deepEqual(sheet.rows[1],production);assert.equal(schema.map['Plan Source'],49);});
properties.setProperty('AF_SHARED_ENABLED','1');
group('a whole plan occupies one row with fixed deadlines and numeric prices',()=>{const r=ctx.afSharedObservePaper_({},p);assert.equal(r.success,true);assert.equal(r.row,3);assert.equal(sheet.rows.length,3);assert.equal(read('Pending ExpiresAt').getTime(),p.expiresAt);assert.equal(read('Hold Until'),'');assert.equal(read('Entry'),100);assert.equal(read('Monitoring Mode'),'PAPER');assert.equal(read('Planned RR'),2);assert.equal(read('Net Planned RR'),1.996);assert.equal(read('Entry Status'),'Active');});
group('repeat save does not duplicate a plan and keeps its row compact',()=>{ctx.afSharedObservePaper_({},p);assert.equal(sheet.rows.length,3);assert.equal(sheet.getRowHeight(3),36);assert.equal(sheet.getRowHeight(2),180);assert.deepEqual(sheet.rows[1],production);});
group('entry updates the same row and preserves notification columns',()=>{sheet.rows[2][schema.map['New Order NotifiedAt']]='already-sent';p={...p,revision:2,state:'ACTIVE',reason:'MODELED_LIMIT_FILL',fillAt:start+120000,fillPrice:100,holdUntil:start+120000+14400000};ctx.afSharedObservePaper_({},p);assert.equal(read('Entry Status'),'Triggered');assert.equal(read('Hold Until').getTime(),p.holdUntil);assert.equal(read('New Order NotifiedAt'),'already-sent');assert.equal(sheet.rows.length,3);});
group('TP uses the modeled net result and never creates another row',()=>{p={...p,revision:3,state:'TP',reason:'MODELED_LIMIT_TARGET',exitAt:start+300000,exitPrice:110,pnlPrice:9.98};ctx.afSharedObservePaper_({},p);assert.equal(read('Outcome'),'WIN');assert.equal(read('Exit Status'),'TP1');assert.equal(read('Realized R'),1.996);assert.equal(sheet.rows.length,3);});
group('expired and time exits retain their distinct meanings',()=>{const expired={...paper('expired'),state:'EXPIRED',reason:'PENDING_TTL_60_MINUTES'};ctx.afSharedObservePaper_({},expired);assert.equal(read('Entry Status',4),'Not Filled');assert.equal(read('Exit Status',4),'Expired');assert.equal(read('Realized R',4),'');const timed={...paper('time'),state:'TIME_EXIT',fillAt:start+60000,fillPrice:100,holdUntil:start+14460000,exitAt:start+14460000,exitPrice:101,pnlPrice:.98};ctx.afSharedObservePaper_({},timed);assert.equal(read('Outcome',5),'TIME_EXIT');assert.equal(read('Exit Status',5),'TIME_EXIT');assert.equal(read('Realized R',5),.196);});
group('save failure is queued for retry without changing local prices or outcomes',()=>{const broken=paper('retry'),original=JSON.stringify(broken),api=ctx.SpreadsheetApp.openById;ctx.AF_SHARED_CACHE=null;ctx.SpreadsheetApp.openById=()=>{throw Error('temporary service failure');};const fail=ctx.afSharedObservePaper_({},broken);assert.equal(fail.state,'RETRY_PENDING');assert.equal(JSON.stringify(broken),original);assert.ok([...data.keys()].some(k=>k.startsWith('AF_SHARED_DIRTY_')));ctx.SpreadsheetApp.openById=api;const ok=ctx.afSharedObservePaper_({},broken);assert.equal(ok.success,true);assert.equal(sheet.rows.filter(r=>r[schema.map['Plan Key']]===broken.key).length,1);});
group('altered shared prices are detected rather than changing the frozen plan',()=>{const column=schema.map.Entry;sheet.rows[2][column]=101;const r=ctx.afSharedObservePaper_({},p);assert.equal(r.code,'AF_SHARED_LEVELS_CHANGED');assert.equal(sheet.rows[2][column],101);sheet.rows[2][column]=100;ctx.afSharedObservePaper_({},p);});
group('spreadsheet formula input is escaped while prices remain numbers',()=>{const f=paper('formula');f.sharedSignal.message='=IMPORTDATA("https://invalid.example")';ctx.afSharedObservePaper_({},f);assert.ok(read('Signal Text',7).startsWith("'="));assert.equal(typeof read('Entry',7),'number');});
group('setup is idempotent and reuses the reference scheduler without extra triggers',()=>{plans=[paper('import')];const a=ctx.afInitializeSharedSignals(),b=ctx.afInitializeSharedSignals();assert.equal(a.enabled,true);assert.equal(b.enabled,true);assert.equal(a.intervalMinutes,5);assert.equal(triggers.length,0);const row=sheet.rows.find(r=>r[schema.map['Plan Key']]===plans[0].key);assert.equal(row[schema.map['Shared Imported']],'YES');assert.equal(row[schema.map['New Order NotifiedAt']],'AF_IMPORT_NO_BACKFILL');assert.equal(row[schema.map['Final NotifiedAt']],'');assert.equal(aiCalls,0);});
group('legacy PWA markers mute imported terminal history but allow future final events',()=>{const old={...paper('old-tp'),state:'TP',fillAt:start+60000,fillPrice:100,exitAt:start+120000,exitPrice:110,pnlPrice:9.98};const row=ctx.afSharedRow_(schema,old,old.sharedSignal,null,true,start);assert.equal(row[schema.map['New Order NotifiedAt']],'AF_IMPORT_NO_BACKFILL');assert.equal(row[schema.map['Final NotifiedAt']],'AF_IMPORT_NO_BACKFILL');const recent={...old,key:'P:recent',runId:'AF:recent'};const next=ctx.afSharedRow_(schema,recent,recent.sharedSignal,null,false,start);assert.equal(next[schema.map['Final NotifiedAt']],'');assert.equal(next[schema.map['New Order NotifiedAt']],'AF_ENDED_OR_REVIEW_NO_NEW_ORDER');});
group('monitor replays only the missing M1 window and makes no AI call',()=>{properties.setProperty('AF_SHARED_ACTIVE_COUNT','1');properties.setProperty('AF_SHARED_NEEDS_SCAN','1');const r=ctx.afSharedMonitor();assert.equal(r.success,true);assert.ok(refreshOptions.limit>=30&&refreshOptions.limit<=3000);assert.equal(aiCalls,0);assert.equal(properties.getProperty('AF_SHARED_ACTIVE_COUNT'),'0');});
group('an idle monitor does no Sheet or market work',()=>{properties.deleteProperty('AF_SHARED_NEEDS_SCAN');const count=sheet.rows.length;const r=ctx.afSharedMonitor();assert.equal(r.skipped,'NO_OPEN_PLANS');assert.equal(sheet.rows.length,count);assert.equal(aiCalls,0);});
group('external monitor accepts no prices, model names or signal creation',()=>{const good=ctx.afSharedMonitorRequest_({postData:{contents:'{"action":"shared_monitor"}'}});assert.equal(good.accepted,true);for(const value of ['{"action":"create_plan"}','{"action":"shared_monitor","entry":123}','{"action":"shared_monitor","model":"bad"}','invalid'])assert.equal(ctx.afSharedMonitorRequest_({postData:{contents:value}}).accepted,false);assert.equal(aiCalls,0);});
group('the existing Push bridge seeds imports and never enters an order path',()=>{
 const seen=[],pushProps=new Map([['native:STARTED','1']]);const pushStore={getProperty:k=>pushProps.has(k)?pushProps.get(k):null,setProperty:(k,v)=>pushProps.set(k,String(v)),setProperties:o=>Object.entries(o).forEach(([k,v])=>pushProps.set(k,String(v)))};
 const rowObject=(heads,values)=>Object.fromEntries(heads.map((h,i)=>[h,values[i]]));
 const context=vm.createContext({console,Date,JSON,Number,String,PropertiesService:{getScriptProperties:()=>pushStore},LockService:{getScriptLock:()=>lock},Logger:{log(){}},getSignalLogSheet:()=>sheet,
 taproNativeProperty_:s=>'native:'+s,taproNativeHash_:s=>crypto.createHash('sha256').update(s).digest('hex'),taproNativeRevision_:r=>JSON.stringify(r),taproNativeRow_:rowObject,
 TAProNativeCore:{mask:r=>r['Entry Status']==='Active'?1:r['Entry Status']==='Triggered'?3:0,status:r=>r.Outcome==='OPEN'?'WAIT':'REVIEW'},
 taproNativeObserveRowSafe_:(heads,values)=>seen.push(rowObject(heads,values)),taproNativeFlushSafe_(){},UrlFetchApp:{fetch:(url,opts)=>{assert.ok(url.includes('AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g'));assert.equal(opts.payload,'{"action":"shared_monitor"}');return {getResponseCode:()=>200,getContentText:()=>'{"accepted":true,"aiCalls":0}'};}},taproCommandObserveSafe_(){throw Error('Broker command path reached');},saveAlert(){throw Error('Legacy alert path reached');}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'integrations','TAProSharedObserver.js'),'utf8'),context);
 const first=context.taproObserveAllindySharedSafe_(false);assert.equal(first.seeded,1);assert.ok(seen.every(r=>r['Plan Source']==='ALLINDY_FIBO'));assert.ok(!seen.some(r=>r['Shared Imported']==='YES'));
 seen.length=0;const next=context.taproObserveAllindySharedSafe_(false);assert.equal(next.seeded,0);assert.ok(seen.some(r=>r['Shared Imported']==='YES'));assert.equal(next.brokerCommands,0);
 pushProps.delete('native:STARTED');seen.length=0;let polls=0;const fetch=context.UrlFetchApp.fetch;context.UrlFetchApp.fetch=(...args)=>{polls++;return fetch(...args);};
 const noPush=context.taproObserveAllindySharedSafe_(false);assert.equal(polls,1);assert.equal(noPush.push,'NOT_CONFIGURED');assert.equal(seen.length,0);assert.equal(noPush.brokerCommands,0);
});
group('failed reads cannot advance the last verified candle or its timestamp',()=>{
 const refresh=ctx.afPaperRefreshLocked_,old=properties.getProperty('AF_SHARED_LAST_VERIFIED_AT');
 plans=[paper('data-failure')];properties.deleteProperty('AF_SHARED_MONITOR_LAST_STARTED');properties.setProperty('AF_SHARED_ACTIVE_COUNT','1');
 ctx.afPaperRefreshLocked_=()=>({counts:{PENDING:1,ACTIVE:0},changed:0,feed:'UNAVAILABLE_NO_OUTCOMES_INFERRED',replayedBars:0,latestClosedAt:null});
 ctx.afSharedMonitor();assert.equal(properties.getProperty('AF_SHARED_LAST_VERIFIED_AT'),old);
 properties.setProperty('AF_SHARED_MONITOR_REQUESTED_AT',String(Date.now()));assert.equal(ctx.afSharedStatus().health,'DATA_UNAVAILABLE');
 properties.deleteProperty('AF_SHARED_MONITOR_LAST_STARTED');ctx.afPaperRefreshLocked_=()=>({counts:{PENDING:1,ACTIVE:0},feed:'VERIFIED_CLOSED_M1',replayedBars:0,latestClosedAt:start-86400000});
 ctx.afSharedMonitor();assert.equal(properties.getProperty('AF_SHARED_LAST_VERIFIED_AT'),old);assert.equal(ctx.afSharedStatus().health,'WAITING_BARS');
 assert.equal(ctx.afSharedStatus().lastCandleAt,start-86400000);ctx.afPaperRefreshLocked_=refresh;
});
console.log('SharedSignals: '+groups+' groups passed; AI calls '+aiCalls+'; no external writes.');
