/* Operator smoke check: NO AI calls, NO broker orders, safe summaries only. */
function afRuntimeCheck(){
 afAssertSandbox_();
 var identity=afSoloIdentity_(),html=doGet({}).getContent();
 if(html.indexOf('afResearchTitle')<0||html.indexOf('afResearchDiagnostics')<0)throw Error('AF_RESEARCH_UI_MISSING');
 var diag=afResearchDiagnostics('scalping','XAUUSD',null),dash=afResearchDashboard(identity.username),audit=diag.audit||{};
 var report={kind:'RUNTIME_WIRING_CHECK_NOT_PROFITABILITY_TEST',revision:afStatus().revision,uiRendered:true,htmlBytes:html.length,
  aiCalled:false,liveTrading:false,diagnostic:{runId:diag.runId||audit.runId,status:diag.status||audit.reasonCode,stage:audit.stage,
  candidates:(audit.candidates||[]).length,eligible:(audit.candidates||[]).filter(function(c){return c.eligible;}).length,
  reasonCode:audit.reasonCode||null,gateCodes:audit.gateCodes||[]},paper:{mode:dash.mode,realBroker:dash.realBroker,counts:dash.counts,
  auditRuns:(dash.recentRuns||[]).length},sheetUrl:getWorkspaceSheetUrl(),checkedUtc:new Date().toISOString()};
 console.log('AF_RUNTIME_CHECK '+JSON.stringify(report));return report;
}

