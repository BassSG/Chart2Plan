var AF_CONFIG = Object.freeze({namespace:'ALLINDY_FIBO_SANDBOX_V1',mode:'TEST',liveTrading:false,sourceDetectorsReady:true});
function afStatus(){return {system:'ALLINDY_FIBO',revision:'2026-10-25-hourly-market-open',mode:'TEST',workflow:'ORIGINAL_CHART2PLAN',singleUser:true,appLoginRequired:false,strategy:'ALLINDY_FIBO_AI',manualAiCallsEnabled:true,liveTrading:false,pineRuntimeParityVerified:false,marketFeedConfigured:true,newsFeedConfigured:true,sharedSignalsEnabled:typeof afSharedEnabled_==='function'&&afSharedEnabled_(),serverUtc:new Date().toISOString()};}

function doGet(e) {
  if(e&&e.parameter&&e.parameter.format==='json') return afJson_(afStatus());
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Allindy + Fibo | Chart2Plan').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) { return afSharedMonitorRequest_(e); }
function afJson_(v) {return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function afEvaluate() {return {decision:'NO_TRADE',reason:'USE_MANUAL_PAPER_ANALYSIS',mode:'TEST'};}
function afEvaluateEvidence(p) {
  if(JSON.stringify(p).length>100000) throw new Error('PAYLOAD_TOO_LARGE');
  return {mode:'TEST',inputTrust:'USER_SUPPLIED_UNVERIFIED_EVIDENCE',result:afCompose(p),liveTrading:false};
}
function afDemo() {
  return {synthetic:true,note:'Generated test fixture. Not a market signal.',evaluation:afEvaluateEvidence(AF_DEMO)};
}

function include(name){if(['PremiumStyles','PremiumUi','ClientScript','ResearchUi'].indexOf(name)<0)throw Error('AF_INCLUDE_DENIED');return HtmlService.createHtmlOutputFromFile(name).getContent();}
