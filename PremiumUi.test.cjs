const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'PremiumUi.html'), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const context = vm.createContext({
  document: {addEventListener() {}},
  console,
  Date,
  Intl,
  setInterval() {},
});
vm.runInContext(source, context, {filename: 'PremiumUi.html'});

const raw = [
  '📈 XAU/USD | Allindy + Fibo',
  'แผนจำลองผ่านเงื่อนไข',
  'แนวโน้มภาพรวมเป็นขาลง',
  'BUY: รอให้ผ่าน EMA ทุกกรอบเวลา',
  'SELL: โซน Supply 15m ให้ความน่าเชื่อถือมากกว่า',
  'TypeOrder: Sell Limit',
  'Entry: 4024.8',
  'StopLoss: 4035.63',
  'TP1: 3994.07 (RR 2.75:1)',
  '',
  'คะแนนหลักฐานไม่ใช่ win probability',
  'Model: google/gemini-3.8-flash',
  'Run ID: AF-123',
  '<script>alert("unsafe")</script>',
].join('\n');

const html = vm.runInContext('premiumRenderOriginalDetails('+JSON.stringify(raw)+')', context);
const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
for (const heading of ['ผลและมุมมองตลาด','ประเมินฝั่ง BUY','ประเมินฝั่ง SELL','ประเภทคำสั่งและระดับราคา','สถานะและข้อมูลระบบ']) {
  assert.ok(html.includes(heading), `missing heading: ${heading}`);
}
for (const text of raw.split('\n').filter(Boolean)) {
  const escaped = escape(text);
  assert.ok(html.includes(escaped) || html.includes(text.split(': ').at(-1)), `missing original text: ${text}`);
}
assert.ok(html.includes('<pre>'+escape(raw)+'</pre>'), 'raw copy must be byte-for-byte equal after HTML escaping');
assert.ok(!html.includes('<script>alert'), 'system text must be escaped');
assert.ok(html.indexOf('มุมมอง BUY') < html.indexOf('มุมมอง SELL'), 'original order must be retained');

const empty = vm.runInContext('premiumRenderOriginalDetails("")', context);
assert.ok(empty.includes('ไม่มีข้อความต้นฉบับ'));
const noTrade = vm.runInContext('premiumRenderOriginalDetails("⏸️ ไม่มีแผน\\nเหตุผล: ข้อมูลไม่ครบ")', context);
assert.ok(noTrade.includes('เหตุผล: ข้อมูลไม่ครบ'));
const busyOutcome=context.premiumOutcome({status:'DATA_BUSY',message:'AF_ANALYSIS_BUSY'});
assert.equal(busyOutcome.title,'มีงานกำลังประมวลผลอยู่');assert.notEqual(busyOutcome.label,'SAFETY CHECK');assert.match(busyOutcome.description,/ยังไม่ได้เริ่มเรียก AI/);
const oldBusy=context.premiumRenderRecord({raw:'AF_ANALYSIS_BUSY',status:'DATA_BUSY',options:{symbol:'XAUUSD'},outcome:{kind:'neutral',title:'หยุดรอบเพื่อความปลอดภัย',label:'SAFETY CHECK'}});
assert.match(oldBusy,/มีงานกำลังประมวลผลอยู่/);assert.doesNotMatch(oldBusy,/SAFETY CHECK|หยุดรอบเพื่อความปลอดภัย/);assert.match(oldBusy,/<pre>AF_ANALYSIS_BUSY<\/pre>/);

const controls={},researchButtons=[{disabled:false},{disabled:false}];
context.document.getElementById=id=>controls[id]||(controls[id]={disabled:false,title:'',textContent:'',innerHTML:'',value:id==='tradeType'?'daytrade':id==='symbol'?'XAUUSD':id==='aiModel'?'model':'65',checked:true,querySelector:()=>({textContent:''})});
context.document.querySelectorAll=()=>researchButtons;
context.document.querySelector=()=>controls.table||(controls.table={innerHTML:''});
assert.equal(context.premiumAcquireWork('research','ตรวจเงื่อนไข'),true);assert.equal(controls.analyzeBtn.disabled,true);assert.ok(researchButtons.every(b=>b.disabled));
assert.equal(context.premiumAcquireWork('analysis','วิเคราะห์ตลาด'),false);context.premiumReleaseWork('analysis');assert.equal(controls.analyzeBtn.disabled,true);
context.premiumReleaseWork('research');assert.equal(controls.analyzeBtn.disabled,false);assert.ok(researchButtons.every(b=>!b.disabled));

const client=fs.readFileSync(path.join(__dirname,'ClientScript.html'),'utf8');
context.window={AF_SOLO_WORKSPACE:{username:'owner-test'}};context.showNotification=()=>{};
let rpcCalls=0;context.google={script:{get run(){rpcCalls++;throw Error('unexpected AI RPC');}}};
vm.runInContext(client.slice(client.indexOf('function performAnalysis ()'),client.indexOf('function showPreviousResult()')),context);
context.premiumAcquireWork('research','ตรวจเงื่อนไข');context.performAnalysis();assert.equal(rpcCalls,0);context.premiumReleaseWork('research');

let alertsDone;context.localStorage={getItem:()=> 'owner-test'};
context.google={script:{run:{withSuccessHandler(fn){alertsDone=fn;return this;},withFailureHandler(){return this;},manageTriggers(){rpcCalls++;}}}};
vm.runInContext(client.slice(client.indexOf('function loadTriggers()'),client.indexOf('function confirmDeleteAllTriggers()')),context);
context.loadTriggers();assert.equal(rpcCalls,1);assert.equal(controls.analyzeBtn.disabled,true);context.loadTriggers();assert.equal(rpcCalls,1);
alertsDone({success:true,triggers:[]});assert.equal(controls.analyzeBtn.disabled,false);
// AI provenance must distinguish a rule check, a completed model response, and uncertainty.
assert.equal(context.premiumRunFacts({status:'DIAGNOSTICS_READY',success:true,aiCalled:false,audit:{stage:'PLANNER',candidates:[{eligible:true}]}}).aiState,'not_called');
assert.equal(context.premiumRunFacts({status:'NO_TRADE',audit:{stage:'PLANNER',candidates:[]}}).aiState,'not_called');
assert.equal(context.premiumRunFacts({status:'NO_TRADE',audit:{stage:'MODEL_DECISION',postChecks:{startedAt:'2026-10-25'},candidates:[{eligible:true}]}}).aiState,'completed');
assert.equal(context.premiumRunFacts({status:'MODEL_UNAVAILABLE',audit:{stage:'MODEL'}}).aiState,'unknown');
assert.equal(context.premiumAiState({status:'NO_TRADE',cost:0.01}),'completed');
assert.equal(context.premiumAiState({status:'NO_TRADE'}),'unknown');
assert.equal(context.premiumAiState({status:'DATA_BUSY',cost:0.01}),'not_called');
const completed=context.premiumRenderRecord({raw,status:'PAPER_SIGNAL_READY',outcome:{kind:'pass'},model:'test',cost:0.01,options:{symbol:'XAU/USD'},qcResult:{percentage:93.7,threshold:65},runFacts:{aiState:'completed',candidateCount:100,eligibleCount:9}});
assert.match(completed,/AI เลือกแผนนี้แล้ว/);assert.match(completed,/AI วิเคราะห์แล้ว/);assert.match(completed,/จุดเข้า · Entry[\s\S]*4024.8[\s\S]*จุดตัดขาดทุน · SL[\s\S]*4035.63[\s\S]*จุดทำกำไร · TP[\s\S]*3994.07/);
assert.match(completed,/93.7 <small>\/ 100/);assert.doesNotMatch(completed.replace(/<[^>]*>/g,""),/93.7%/);assert.match(completed,/<pre>/);
const skipped=context.premiumRenderRecord({raw:'NO_TRADE — ไม่มี candidate ผ่าน hard gates; ไม่เรียก AI',status:'NO_TRADE',outcome:{kind:'neutral',title:'ไม่มีแผน'},runFacts:{aiState:'not_called',candidateCount:10,eligibleCount:0}});
assert.match(skipped,/ยังไม่เรียก AI/);assert.doesNotMatch(skipped,/AI วิเคราะห์แล้ว|AI เลือกแผนนี้แล้ว/);
const template=fs.readFileSync(path.join(__dirname,'Index-template.html'),'utf8');
assert.doesNotMatch(template,/id="(?:dashboardContainer|sndIframeContainer)"|>Dashboard<|>SnD Forex</);
assert.match(template,/id="analysisResult"/);assert.match(template,/id="c2pResearchHost"/);
const research=fs.readFileSync(path.join(__dirname,'ResearchUi.html'),'utf8');assert.match(research,/createElement\('details'\)/);assert.match(research,/ส่วนนี้ไม่เรียก AI/);
assert.doesNotMatch(context.premiumPlainReason('เหตุผลหลัก\nEntryAssessment: รายละเอียด\nCost (USD): 0.1'),/EntryAssessment|Cost/);
const partial=context.premiumRenderRecord({status:'SAVE_FAILED_OR_PARTIAL',raw:'AF_STORE_FAILED_OR_PARTIAL',outcome:{kind:'error'},runFacts:{aiState:'completed'}});assert.match(partial,/ยังยืนยันการบันทึกไม่ได้/);assert.doesNotMatch(partial,/>ยังไม่มีแผนใหม่</);
const waiting=context.premiumRenderRecord({raw,runId:'AF:late',status:'PAPER_SIGNAL_READY',outcome:{kind:'pass'},runFacts:{aiState:'completed',paperView:{paperState:'PENDING',expiresAt:1,entryAllowed:true}}});
assert.match(waiting,/พ้นเวลารอเข้า — รอข้อมูลยืนยันผล/);assert.match(waiting,/หยุดรอเข้าใหม่แล้ว/);assert.match(waiting,/ราคาแผนเดิม · ไม่ใช่จุดเข้าใหม่/);assert.doesNotMatch(waiting,/>แผนพร้อมศึกษา</);
context.premiumUpdatePaperViews([{runId:'AF:late',view:{paperState:'TP',label:'ถึงเป้า TP',entryAllowed:false,awaitingData:false}}]);
const resolved=context.premiumRenderRecord({raw,runId:'AF:late',status:'PAPER_SIGNAL_READY',outcome:{kind:'pass'},runFacts:{aiState:'completed'}});
assert.match(resolved,/ถึงเป้า TP/);assert.doesNotMatch(resolved,/พ้นเวลารอเข้า/);
console.log('PremiumUi original details, busy coordination, AI provenance and deadline views: 22 cases passed');
