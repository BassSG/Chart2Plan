const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const srcDir = path.join(__dirname, 'chart2plan-source');
const ctx = vm.createContext({
  console,
  Math,
  Number,
  Boolean,
  String,
  Array,
  Object,
  Date
});

for (const m of ['AfUnifiedPlannerEngine.gs', 'Market.gs', 'Allindy.gs', 'Fibo.gs', 'Planner.gs', 'Workflow.gs']) {
  vm.runInContext(fs.readFileSync(path.join(srcDir, m), 'utf8'), ctx);
}

// Verify that afPlannerDecision accepts UNI candidate
const uniCand = {
  id: 'UNI:TREND_CONTINUATION:z-buy-15m:BUY',
  side: 1,
  entry: 3982.40,
  stop: 3974.19,
  target: 4015.00,
  netR: 3.83,
  eligible: true
};

const aiDecision = {
  decision: 'PLAN',
  candidateId: 'UNI:TREND_CONTINUATION:z-buy-15m:BUY',
  analysis: 'โครงสร้างแนวรับ Demand สวยงาม สอดคล้องกับ Fibo ขาขึ้น 1h',
  buyAssessment: 'แนวรับแข็งแรง',
  sellAssessment: 'ยังไม่พบสัญญาณกลับตัว'
};

const result = ctx.afPlannerDecision_(aiDecision, [uniCand]);
console.log('afPlannerDecision result:', result);
assert.equal(result.accepted, true);
assert.equal(result.plan.entry, 3982.40);
assert.equal(result.plan.stop, 3974.19);
assert.equal(result.plan.target, 4015.00);

console.log('PASS: afPlannerDecision seamlessly accepted unified candidate!');
