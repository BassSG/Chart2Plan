/* Experimental composition rules. Inputs are confirmed Pine-derived evidence,
 * NOT a replacement implementation of Pine zone/form detection. */
var AF_RULES = Object.freeze({version:'AF-COMPOSE-0.1', minNetR:1.5, maxCostRisk:0.2, maxRiskATR:3, maxChaseATR:0.25, maxAgeBars:1, ttlBars:3});
function afCompose(p) {
  var reasons=[];
  function fail(s) { return {decision:'NO_TRADE',reason:s,ruleVersion:AF_RULES.version}; }
  function num(x) { return typeof x==='number' && isFinite(x); }
  if (!p || p.schemaVersion!==1) return fail('INVALID_SCHEMA');
  var b=p.bar,a=p.allindy,f=p.fibo,g=p.guards;
  if (!b||!a||!f||!g||!p.market) return fail('MISSING_EVIDENCE');
  var m=p.market;
  if (!num(p.asOf)||!num(m.tick)||m.tick<=0||!num(m.cost)||m.cost<0||!num(m.tfMs)||m.tfMs<=0||typeof m.symbol!=='string'||!m.symbol) return fail('INVALID_MARKET');
  if (![b.openTime,b.closeTime,b.open,b.high,b.low,b.close,b.atr].every(num)||b.atr<=0||b.closeTime-b.openTime!==m.tfMs||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.low>b.high) return fail('INVALID_BAR');
  if (b.closeTime>p.asOf || b.confirmed!==true) return fail('OPEN_OR_FUTURE_BAR');
  if (p.asOf-b.closeTime>m.tfMs*AF_RULES.maxAgeBars) return fail('STALE_BAR');
  if (a.symbol!==m.symbol||f.symbol!==m.symbol||a.tfMs!==m.tfMs) return fail('MARKET_MISMATCH');
  if (a.sourceVersion!=='All-Indy-1.3.5'||f.sourceVersion!=='EBW-Fibo-1.10.19') return fail('UNSUPPORTED_SOURCE');
  if (![a.knownAt,a.signalClose,a.entry,a.stop,a.target,f.knownAt,f.born,f.zero,f.span,f.root,f.sourceClose,f.tfMs].every(num)) return fail('INVALID_EVIDENCE');
  if(a.knownAt>b.closeTime||f.knownAt>b.closeTime||f.born>b.closeTime||f.sourceClose>b.closeTime||a.signalClose!==b.closeTime||a.knownAt<a.signalClose||f.knownAt<f.born||f.knownAt<f.sourceClose) return fail('EVIDENCE_NOT_KNOWABLE');
  if(f.tfMs<m.tfMs||m.tfMs<=0||b.closeTime-f.sourceClose>f.tfMs||f.tfMs%m.tfMs!==0) return fail('FIBO_ALIGNMENT');
  if(a.confirmed!==true||a.historyComplete!==true||a.zoneValid!==true||a.finalSignal!==true||!a.zoneId||!a.signalId) return fail('ALLINDY_NOT_CONFIRMED');
  if(![1,-1].includes(a.side)||f.side!==a.side) return fail('DIRECTION_MISMATCH');
  var side=a.side;
  if(f.broken!==true||f.invalidated!==false||f.historyComplete!==true||![1,3].includes(f.method)||side*f.span<=0||!f.id) return fail('FIBO_NOT_ACTIVE');
  if (g.news!=='CLEAR'||g.risk!=='CLEAR'||g.data!=='CLEAR') return fail('GUARD_NOT_CLEAR');
  if (side*(b.low-f.zero)<0&&side===1 || side*(b.high-f.zero)<0&&side===-1) return fail('FIBO_ZERO_BREACHED');
  if (side===1?b.low<f.root:b.high>f.root) return fail('FIBO_ROOT_BREACHED');
  if(Math.abs(a.entry-b.close)>b.atr*AF_RULES.maxChaseATR) return fail('DO_NOT_CHASE');
  if(side*(a.entry-a.stop)<=0||side*(a.target-a.entry)<=0) return fail('INVALID_ALLINDY_PLAN');
  var first=f.method===3?1.618:2.618;
  if(!Array.isArray(f.hitRatios)||!Array.isArray(f.targets)) return fail('MISSING_FIBO_LIFECYCLE');
  // Require source-reported unhit levels; never infer that a missing flag means unhit.
  var targets=f.targets.filter(function(t){return t&&typeof t==='object'&&num(t.ratio)&&num(t.price)&&[1.618,2,2.618,3.5,4.236,5.472].indexOf(t.ratio)>=0&&t.ratio>=first&&t.pending===true&&f.hitRatios.indexOf(t.ratio)<0&&Math.abs(t.price-(f.zero+f.span*t.ratio))<m.tick/10&&side*(t.price-a.entry)>0;});
  targets.sort(function(x,y){return side*(x.price-y.price);});
  if(!targets.length) return fail('NO_PENDING_FIBO_TARGET');
  var raw=side===1?Math.min(a.target,targets[0].price):Math.max(a.target,targets[0].price);
  // Round TP toward entry and SL outward. This never improves modeled RR.
  var stop=(side===1?Math.floor(a.stop/m.tick):Math.ceil(a.stop/m.tick))*m.tick;
  var target=(side===1?Math.floor(raw/m.tick):Math.ceil(raw/m.tick))*m.tick;
  var entry=a.entry,risk=side*(entry-stop),reward=side*(target-entry);
  if(risk<m.tick||risk>b.atr*AF_RULES.maxRiskATR) return fail('STOP_RANGE');
  if(m.cost>risk*AF_RULES.maxCostRisk) return fail('COST_TOO_HIGH');
  var netR=(reward-m.cost)/(risk+m.cost);
  if(netR<AF_RULES.minNetR) return fail('NET_RR_TOO_LOW');
  reasons.push('CONFIRMED_ALLINDY_PLAN','SAME_SIDE_BROKEN_FIBO','NEAREST_PENDING_TARGET','GUARDS_CLEAR');
  return {decision:'PAPER_PLAN',ruleVersion:AF_RULES.version,id:m.symbol+':'+m.tfMs+':'+a.signalId+':'+f.id,symbol:m.symbol,tfMs:m.tfMs,side:side,entry:entry,stop:stop,target:target,netR:netR,createdAt:b.closeTime,expiresAt:b.closeTime+m.tfMs*AF_RULES.ttlBars,status:'PENDING',evidence:{allindy:a.signalId,zone:a.zoneId,fibo:f.id,sourceClose:f.sourceClose,fiboTarget:targets[0]},reasons:reasons};
}
function afAdvance(plan,bar) {
  var p=JSON.parse(JSON.stringify(plan));
  if(['PENDING','ACTIVE'].indexOf(p.status)<0) return p;
  if(!bar||bar.confirmed!==true||!Number.isFinite(bar.openTime)||!Number.isFinite(bar.closeTime)||bar.closeTime<=bar.openTime||![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)) throw new Error('INVALID_LIFECYCLE_BAR');
  if(bar.openTime!==(p.lastBarClose||p.createdAt)||bar.closeTime-bar.openTime!==p.tfMs) throw new Error('NON_CAUSAL_BAR');
  var s=p.side,sl=s===1?bar.low<=p.stop:bar.high>=p.stop,tp=s===1?bar.high>=p.target:bar.low<=p.target;
  if(p.status==='PENDING') {
    if(bar.openTime>=p.expiresAt) {p.status='EXPIRED';return p;}
    if(bar.invalidated===true) {p.status='CANCELLED';p.reason='SOURCE_INVALIDATED';return p;}
    var touches=bar.low<=p.entry&&bar.high>=p.entry;
    var marketable=s===1?bar.open<=p.entry:bar.open>=p.entry;
    if((s===1?bar.open<=p.stop:bar.open>=p.stop)) {p.status='CANCELLED';p.reason='GAPPED_PAST_STOP';return p;}
    if(marketable) {p.status='ACTIVE';p.fill=p.entry;p.fillAssumption='CONSERVATIVE_LIMIT_AT_PLANNED_PRICE';}
    else if(touches) {
      if(sl||tp) {p.status='AMBIGUOUS';p.reason='ENTRY_AND_EXIT_ORDER_UNKNOWN';return p;}
      p.status='ACTIVE';p.fill=p.entry;
    } else if(tp) {p.status='CANCELLED';p.reason='TARGET_BEFORE_ENTRY';return p;}
  }
  if(p.status==='ACTIVE') {
    var gapStop=s===1?bar.open<=p.stop:bar.open>=p.stop;
    if(gapStop) {p.status='SL';p.exit=bar.open;p.reason='GAP_STOP';}
    else if(sl&&tp) {p.status='AMBIGUOUS';p.reason='SL_TP_ORDER_UNKNOWN';}
    else if(sl) {p.status='SL';p.exit=p.stop;}
    else if(tp) {p.status='TP';p.exit=p.target;}
  }
  p.lastBarClose=bar.closeTime;
  return p;
}
