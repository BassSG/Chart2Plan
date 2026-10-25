'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/ResearchUi.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements={};
const document={readyState:'loading',addEventListener(){},getElementById(id){return elements[id]||(elements[id]={dataset:{},innerHTML:'',textContent:''});}};
const window={};
vm.runInNewContext(script,{document,window,Number,Array,String,JSON,Math});
const candidates=[
 {id:'rejected',side:1,entry:3990,stop:3980,target:4010,netR:1,eligible:false,gateCodes:['AF_ENTRY_TOO_FAR_FROM_MARKET']},
 {id:'chosen',side:-1,entry:4024.8,stop:4035.63,target:3994.07,geom:{entry:4024.8,sl:4035.63},netR:2.75,eligible:true,gateCodes:[]},
 {id:'other',side:-1,entry:4003.63,stop:4008.01,target:3994.07,netR:2,eligible:true,gateCodes:[]}
];
window.afResearchShowResponse({status:'PAPER_SIGNAL_READY',success:true,runId:'AF:test',
 plan:{side:-1,entry:4024.8,stop:4035.63,target:3994.07,netR:2.75,evidence:{dayTradeRules:{pendingMinutes:60,maxHoldMinutes:240}}},
 qcResult:{percentage:79.66,threshold:65},audit:{selectedCandidateId:'chosen',candidates},
 message:'📈 XAU/USD | Allindy + Fibo\nแผนจำลองผ่านเงื่อนไข\nแนวโน้มหลักยังเป็นขาลง\nBUY: ยังไม่ผ่านหลักฐาน\nSELL: พบ Supply 15m\nTypeOrder: Sell Limit\nEntry: 4024.8\nStopLoss: 4035.63\nTP1: 3994.07 (RR 2.75:1)\nModel: test'});
assert.match(elements.afResearchStatus.innerHTML,/พบแผนจำลองที่ผ่านเงื่อนไข/);
assert.doesNotMatch(elements.afResearchStatus.innerHTML,/PAPER_SIGNAL_READY/);
assert.match(elements.afResearchPlan.innerHTML,/4024\.8[\s\S]*4035\.63[\s\S]*3994\.07/);
assert.match(elements.afResearchPlan.innerHTML,/แนวโน้มหลักยังเป็นขาลง/);
assert.match(elements.afResearchPlan.innerHTML,/พบ Supply 15m/);
assert.doesNotMatch(elements.afResearchPlan.innerHTML,/TypeOrder:/);
assert.match(elements.afResearchCandidates.innerHTML,/AI เลือก/);
assert.match(elements.afResearchCandidates.innerHTML,/TP<b>3994\.07<\/b>/);
assert.ok(elements.afResearchCandidates.innerHTML.indexOf('chosen')<elements.afResearchCandidates.innerHTML.indexOf('rejected'));
assert.match(elements.afResearchCandidates.innerHTML,/<details>/);
window.afResearchShowResponse({status:'DIAGNOSTICS_READY',success:true,runId:'DIAG:test',
 diagnostics:{candidateCount:3,eligibleCount:2},audit:{candidates}});
assert.equal(elements.afResearchPlan.innerHTML,'');
assert.match(elements.afResearchStatus.innerHTML,/พบ 2 แผนที่ผ่านกฎ/);
assert.match(elements.afResearchMetrics.innerHTML,/แผนที่ตรวจ[\s\S]*3[\s\S]*ผ่านกฎ[\s\S]*2/);
window.afResearchShowResponse({status:'DATA_BUSY',success:false,message:'AF_ANALYSIS_BUSY',audit:{candidates:[]}});
assert.match(elements.afResearchStatus.innerHTML,/ระบบกำลังตรวจคำขออื่น/);
assert.equal(elements.afResearchMetrics.innerHTML,'');
assert.match(elements.afResearchCandidates.innerHTML,/ยังไม่มีผลตรวจแผนในรอบนี้/);
window.afResearchShowResponse({status:'PAPER_SIGNAL_READY',success:true,plan:{side:1,entry:100,stop:95,target:110,netR:2},
 audit:{candidates:[]},message:'📈 XAU/USD | Allindy + Fibo\nแผนจำลองผ่านเงื่อนไข\nข้อความ <img src=x onerror=alert(1)>'});
assert.match(elements.afResearchPlan.innerHTML,/&lt;img/);
assert.doesNotMatch(elements.afResearchPlan.innerHTML,/<img/);
console.log('Research UI: structured result, prioritized candidate, diagnostics, and HTML escaping passed.');
