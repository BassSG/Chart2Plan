/* Experimental paper-only planner. Adapter evidence, NOT verified Pine parity.
 * Policy below is admission policy, not source strategy or win probability.
 * Entry midpoint; structural stop + source-TF ATR buffer; risk uses execution ATR.
 * No bar-index comparisons across TF. All recognition/source times are UTC ms. */
var AF_PLANNER_POLICY = Object.freeze({version:'AF-PLANNER-1.3-PINE-BOOK-LATCH',tick:0.01,minNetR:1.5,minRoomATR:0.75,
 minRiskATR:0.75,maxRiskATR:2.5,bufferZoneATR:0.15,anchorSearchATR:1.5,sweepBandATR:0.6,sweepBufferATR:0.25,maxWidthZoneATR:2.5,
 maxCostRisk:0.2,extraCost:0.02,maxSnapshotMs:120000,maxQuoteMs:120000,maxEntryDistanceATR:6.0});
var AF_PLANNER_TF = {'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
function afPlannerNum_(x){return typeof x==='number'&&Number.isFinite(x);}
function afPlannerClean_(v){
 if(v===null||v===undefined)return null;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(Array.isArray(v))return v.map(afPlannerClean_);
 if(typeof v==='object'){var o={};Object.keys(v).forEach(function(k){o[k]=afPlannerClean_(v[k]);});return o;}
 return typeof v==='string'||typeof v==='boolean'?v:null;
}
function afPlannerQc_(v){
 if(v===null||v===undefined||typeof v==='string'&&/^auto$/i.test(v.trim()))return {mode:'AUTO',threshold:null};
 if(!afPlannerNum_(v)||v<0||v>100)throw Error('AF_QC_INVALID');
 return {mode:'FIXED',threshold:v};
}
/* Evidence is a detached, bounded whitelist, never a JSON clone of provider/context.
 * Strings <=160 chars; exactly 3 anchor slots and <=6 target/lifecycle slots.
 * Null preserves absent/malformed fields; truncated flags disclose lost detail.
 * Pre-AI evidence is captured by value; post-AI facts live only in audit.postChecks. */
function afPlannerPick_(row,keys){
 var out={truncated:false};row=row||{};keys.forEach(function(k){var v=row[k];
  if(typeof v==='string'){out[k]=v.slice(0,160);if(v.length>160)out.truncated=true;}
  else out[k]=typeof v==='boolean'||afPlannerNum_(v)?v:null;
 });return out;
}
function afPlannerProvenance_(ctx){
 return {source:afPlannerPick_(ctx,['sourceId','symbol']),
  canonicalSD:{sourceVersion:'All-Indy-1.3.5',adapter:'afZoneReplay_',adapterFile:'Allindy.gs',adapterVersion:'AF-ZONE-1.3.5-PORT-0.2'},
  normalFibo:{sourceVersion:'EBW-Fibo-1.10.19',adapter:'afFiboReplay_',adapterFile:'Fibo.gs',adapterVersion:'AF-FORM-CONTEXT-0.2'},
  policy:afPlannerPick_(AF_PLANNER_POLICY,['version','tick','minNetR','minRiskATR','maxRiskATR','bufferZoneATR',
   'anchorSearchATR','sweepBandATR','sweepBufferATR','maxWidthZoneATR','maxCostRisk','extraCost','maxSnapshotMs','maxQuoteMs']),
  pineParityVerified:false};
}
function afPlannerZoneEvidence_(z){return afPlannerPick_(z,['id','tf','tfMs','side','lo','hi','atr','score','tests',
 'knownAt','sourceClose','bornSeq','touching','quality','departure','structure','sweep','pd','clean','source','imbalance',
 'pattern','sourceVersion','adapter','adapterVersion','family','families','familyBit','role','isDefendCore','isLiquidityOnly','tags','historyComplete','departed','sourceSeq','sourceBornSeq']);}
function afPlannerFiboEvidence_(f){
 var out=afPlannerPick_(f,['id','tf','tfMs','side','symbol','sourceVersion','adapter','adapterVersion','root','rootPrice','sourceATR','zero','span','zeroT','legLow','legHigh','asof','status',
  'knownAt','sourceClose','born','method','neck','broken','invalidated','historyComplete','closedT','closedKind','role']);
 out.anchors={};['a','b','c'].forEach(function(k){out.anchors[k]=afPlannerPick_(f.anchors&&f.anchors[k],
  ['p','t','closeT','i','kind','r','k','cycle','knownAt','confirmed','trigger']);});
 out.targetCount=Array.isArray(f.targets)?f.targets.length:null;
 out.targets=Array.isArray(f.targets)?f.targets.slice(0,6).map(function(t){return afPlannerPick_(t,['ratio','price','pending','hitAt']);}):null;
 out.hitRatioCount=Array.isArray(f.hitRatios)?f.hitRatios.length:null;
 out.hitRatios=Array.isArray(f.hitRatios)?f.hitRatios.slice(0,6).map(function(r){return afPlannerNum_(r)?r:null;}):null;
 out.hitTimes=afPlannerPick_(f.hitTimes,['1.618','2','2.618','3.5','4.236','5.472']);
 out.truncated=out.truncated||out.targetCount>6||out.hitRatioCount>6||Object.keys(out.anchors).some(function(k){return out.anchors[k].truncated;})||
  !!(out.targets&&out.targets.some(function(t){return t.truncated;}))||out.hitTimes.truncated;
 return out;
}
function afPlannerModules_(ctx){var modules={};['canonicalSD','normalFibo','OB_QML_Flip','NeckDivergence'].forEach(function(k){
 modules[k]=ctx.coverage&&ctx.coverage[k]==='computed'?'computed':'unavailable';});return modules;}
function afPlannerEvidenceCounts_(ctx){
 function count(rows){var n={total:0,BUY:0,SELL:0,other:0};if(Array.isArray(rows))rows.forEach(function(r){
  n.total++;n[r&&r.side===1?'BUY':r&&r.side===-1?'SELL':'other']++;});return n;}
 var z=count(ctx.zones),f=count(ctx.fibos),m=afPlannerModules_(ctx),out={zones:z,fibos:f,
  sameSidePairs:{BUY:z.BUY*f.BUY,SELL:z.SELL*f.SELL,total:z.BUY*f.BUY+z.SELL*f.SELL},availability:{},gateCodes:[]};
 ['BUY','SELL'].forEach(function(side){var gates=[];
  if(!z[side])gates.push('AF_'+side+'_ZONE_MISSING');if(!f[side])gates.push('AF_'+side+'_FIBO_MISSING');
  if(!z[side]||!f[side])gates.push('AF_'+side+'_SAME_SIDE_PAIR_MISSING');
  out.availability[side]={zones:z[side]>0,fibos:f[side]>0,sameSidePair:out.sameSidePairs[side]>0,
   modules:afPlannerModules_(ctx),gateCodes:gates};out.gateCodes=out.gateCodes.concat(gates);
 });
 if(m.canonicalSD!=='computed'||m.normalFibo!=='computed')out.gateCodes.unshift('AF_MODULE_UNAVAILABLE');
 // Counts describe source rows/potential pairs, not validity or eligibility.
 out.reasonCode=out.sameSidePairs.total?'AF_SOURCE_PAIRS_PRESENT':
  !z.total&&!f.total?'AF_NO_ZONE_OR_FIBO_EVIDENCE':!z.total?'AF_NO_ZONE_EVIDENCE':!f.total?'AF_NO_FIBO_EVIDENCE':'AF_NO_SAME_SIDE_PAIR';
 return out;
}
function afPlannerNoCandidateReason_(snapshot,candidates){return candidates.length?'AF_NO_ELIGIBLE_CANDIDATE':
 snapshot.evidenceCounts.gateCodes.indexOf('AF_MODULE_UNAVAILABLE')>=0?'AF_MODULE_UNAVAILABLE':snapshot.evidenceCounts.reasonCode;}
function afPlannerAudit_(runId){return {schemaVersion:'af.audit.v1',sourceVersion:AF_PLANNER_POLICY.version,
 versions:{planner:AF_PLANNER_POLICY.version,allindy:'All-Indy-1.3.5',fibo:'EBW-Fibo-1.10.19',fiboAdapter:'AF-FORM-CONTEXT-0.2',pineParityVerified:false},
 runId:runId,evaluatedAt:new Date().toISOString(),stage:'INPUT',reasonCode:'STARTED',gateCodes:[],gates:[],reason:'STARTED',
 snapshot:{symbol:null,executionTF:null,contextTF:null,quote:null,frames:{},modules:{},qc:null,
  evidenceCounts:null,provenance:afPlannerProvenance_({})},candidates:[],selectedCandidateId:null,postChecks:afPlannerPostChecks_()};}
function afPlannerPostChecks_(){return {startedAt:null,attemptedCandidateId:null,gateCodes:[],
 quote:{state:'NOT_RUN',code:null,checkedAt:null,latest:null,ageMs:null},
 news:{state:'NOT_RUN',code:null,checkedAt:null,ok:null,canTrade:null},
 snapshot:{state:'NOT_RUN',code:null,checkedAt:null,ageMs:null,maxAgeMs:AF_PLANNER_POLICY.maxSnapshotMs},
 movement:{state:'NOT_RUN',code:null,checkedAt:null,bidDelta:null,absoluteBidDelta:null,limit:null},
 candidate:{state:'NOT_RUN',code:null,checkedAt:null,rebuilt:null}};}
// Numeric-only quote whitelist: malformed fields are unknown, never stringified payloads.
function afPlannerPostQuote_(q){var out={};['bid','ask','spread_price','timestamp'].forEach(function(k){
 out[k==='spread_price'?'spread':k]=q&&afPlannerNum_(q[k])?q[k]:null;});if(q){out.market_status=q.market_status;out.weekend_test_mode=q.weekend_test_mode;}return out;}
function afPlannerSnapshot_(ctx,qc){
 var frames={};Object.keys(AF_PLANNER_TF).forEach(function(tf){var f=ctx.frames&&ctx.frames[tf];if(!f)return;
  frames[tf]=afPlannerPick_(f,['tfMs','lastClosedUtc','atr','ema20','ema50']);
  frames[tf].liquidityCount=Array.isArray(f.liquidity)?f.liquidity.length:0;});
 return {symbol:afPlannerPick_(ctx,['symbol']).symbol,asOf:afPlannerPick_(ctx,['asOf']).asOf,
  executionTF:afPlannerPick_(ctx,['executionTF']).executionTF,contextTF:afPlannerPick_(ctx,['contextTF']).contextTF,
  quote:ctx.quote?afPlannerPick_(ctx.quote,['bid','ask','spread','timestamp','market_status','weekend_test_mode']):null,
  frames:frames,modules:afPlannerModules_(ctx),qc:afPlannerPick_(qc,['mode','threshold']),
  evidenceCounts:afPlannerEvidenceCounts_(ctx),provenance:afPlannerProvenance_(ctx)};
}
function afPlannerContextGate_(ctx,now){
 if(!ctx||ctx.symbol!=='XAUUSD'||!AF_PLANNER_TF[ctx.executionTF]||!AF_PLANNER_TF[ctx.contextTF])return 'AF_CONTEXT_INVALID';
 if(!afPlannerNum_(ctx.asOf)||now<ctx.asOf||now-ctx.asOf>AF_PLANNER_POLICY.maxSnapshotMs)return 'AF_SNAPSHOT_STALE';
 var q=ctx.quote;
 var isClosed=q&&(q.market_status==='closed'||q.weekend_test_mode===true||q.is_market_open===false);
 if(!q||![q.bid,q.ask,q.spread,q.timestamp].every(afPlannerNum_)||q.bid<=0||q.ask<q.bid||q.spread<0||
  Math.abs(q.ask-q.bid-q.spread)>1e-6||(!isClosed&&(now-q.timestamp*1000>120000||q.timestamp*1000-now>2000)))return 'AF_QUOTE_INVALID_OR_STALE';
 if(!ctx.frames||!ctx.frames[ctx.executionTF]||!ctx.frames[ctx.contextTF]||!Array.isArray(ctx.zones)||!Array.isArray(ctx.fibos))return 'AF_CONTEXT_INVALID';
 var invalid=null;Object.keys(ctx.frames).forEach(function(tf){var f=ctx.frames[tf],ms=AF_PLANNER_TF[tf],t=Date.parse(f.lastClosedUtc);
  if(!ms||f.tfMs!==ms||!afPlannerNum_(f.atr)||f.atr<=0||!afPlannerNum_(f.ema20)||!afPlannerNum_(f.ema50)||!Number.isFinite(t)||t>ctx.asOf||(!isClosed&&ctx.asOf-t>ms+120000))invalid='AF_FRAME_INVALID_OR_STALE';
 });return invalid;
}
function afPlannerRound_(x,up){return Number(((up?Math.ceil(x/0.01-1e-8):Math.floor(x/0.01+1e-8))*0.01).toFixed(2));}
function afPlannerNearer_(a,b,entry){return !afPlannerNum_(a)?b:!afPlannerNum_(b)?a:Math.abs(a-entry)<=Math.abs(b-entry)?a:b;}
function afPlannerLiquidityPrice_(l,side){return side===1&&afPlannerNum_(l.lo)?l.lo:side===-1&&afPlannerNum_(l.hi)?l.hi:l.price;}
function afPlannerIdentity_(ctx,z,f){
 // Full identity rather than a lossy hash: duplicates cannot hide hash collisions.
 return JSON.stringify([AF_PLANNER_POLICY.version,ctx.sourceId,ctx.symbol,'All-Indy-1.3.5',ctx.executionTF,ctx.contextTF,
  z.tf,z.id,z.side,f.sourceVersion,f.adapterVersion,f.tf,f.id,f.side]);
}
/* P1 1933-1956: deepest same-side mapped liquidity, not arbitrary Fibo A/B/C.
 * Experimental cross-TF policy: source-frame ATR buffers; execution ATR risk floor/cap.
 * Fibo anchor schema (p,t,closeT,i,kind,cycle,confirmed) is retained as evidence only. */
function afPlannerProtectiveAnchor_(ctx,z){
 var found=[],invalid=false,s=z.side,distal=s===1?z.lo:z.hi,em=AF_PLANNER_TF[ctx.executionTF],chartAtr=Number(ctx.frames[ctx.executionTF].atr);
 Object.keys(ctx.frames).sort().forEach(function(tf){var fr=ctx.frames[tf],ms=AF_PLANNER_TF[tf];
  if(ms<em||ms%em)return;
  if(!Array.isArray(fr.liquidity)){invalid=true;return;}
  fr.liquidity.forEach(function(l){
   if(!l||![1,-1].includes(l.side)||![l.price,l.knownAt].every(afPlannerNum_)||l.price<=0||l.knownAt<=0||l.knownAt>Date.parse(fr.lastClosedUtc)){invalid=true;return;}
   var level=afPlannerLiquidityPrice_(l,s),gap=s*(distal-level);
   if(l.side===s&&gap>=0&&gap<=chartAtr*AF_PLANNER_POLICY.anchorSearchATR)found.push({kind:'MAPPED_LIQUIDITY',tf:tf,
    price:level,knownAt:l.knownAt,sourceATR:fr.atr,gap:gap,source:afPlannerPick_(l,['side','price','lo','hi','knownAt'])});
  });
 });
 found.sort(function(a,b){return b.gap-a.gap||b.sourceATR-a.sourceATR||a.tf.localeCompare(b.tf)||a.knownAt-b.knownAt;});
 // If no separate liquidity anchor is mapped behind the zone, fall back to the zone's distal edge (P1 lines 2099, 2216).
 var fallback={kind:'ZONE_DISTAL_FALLBACK',tf:z.tf,price:distal,knownAt:z.knownAt,sourceATR:chartAtr,gap:0,source:afPlannerPick_(z,['lo','hi','atr','id'])};
 return {code:invalid?'AF_PROTECTIVE_ANCHOR_DATA_INVALID':null,anchor:found[0]||fallback};
}
/* EBW relation: equal direction alone is code 5 and is never a pair. A zone must
 * be knowable after C, stay on the safe side of zero, and sit inside the frozen leg. */
function afPlannerZoneFiboRelation_(ctx,z,f){
 var side=Number(z.side),zeroT=Number(f.zeroT||f.anchors&&f.anchors.c&&f.anchors.c.t),zero=Number(f.zero),a=f.anchors||{},prices=[a.a&&Number(a.a.p),a.b&&Number(a.b.p),a.c&&Number(a.c.p)].filter(Number.isFinite);
 var lo=afPlannerNum_(f.legLow)?f.legLow:prices.length?Math.min.apply(null,prices):NaN;
 var hi=afPlannerNum_(f.legHigh)?f.legHigh:prices.length?Math.max.apply(null,prices):NaN;
 var tf=ctx.frames&&ctx.frames[f.tf],tol=Math.max(.01,(tf&&Number(tf.atr)||0)*.03),same=side===Number(f.side);
 if(!same)return {code:5,related:false,reason:'DIRECTION_ONLY'};
 var zeroHeld=side===1?Number(z.lo)>=zero:Number(z.hi)<=zero;
 if(!Number.isFinite(zeroT)||Number(z.knownAt)<zeroT)return {code:6,related:false,reason:'ZONE_PRECEDES_FIBO_C'};
 if(!zeroHeld)return {code:4,related:false,reason:'ZONE_CROSSES_FIBO_ZERO'};
 var inside=Number(z.lo)>=lo-tol&&Number(z.hi)<=hi+tol;
 var bookRelated=z.relatedFiboId===f.id||z.fiboId===f.id;
 return {code:inside||bookRelated?2:4,related:!!(inside||bookRelated),reason:inside?'SAME_LEG_INSIDE_FROZEN_RANGE':bookRelated?'EXPLICIT_BOOK_LINK':'OUTSIDE_FROZEN_RANGE',
  zeroT:zeroT,zero:zero,legLow:lo,legHigh:hi,tolerance:tol};
}
/* Pine's higher-TF source state remains usable while knowable and un-killed.
 * Recheck lower-TF closed highs/lows since source asof; this latches zero/root/
 * 5.472 invalidation and carries already-hit extensions into the pending target list. */
function afPlannerExecutionSafety_(ctx,f,nextTarget,anchor,now){
 var fr=ctx.frames[ctx.executionTF],ms=AF_PLANNER_TF[ctx.executionTF],rows=fr.closedOHLC;
 var sourceAsOf=Number(f.asof||f.sourceClose),out={policy:'PINE_INTRABAR_KILL_LATCH_CLOSED_BARS_V1',from:sourceAsOf,to:null,barCount:0,
  coverage:'UNKNOWN',openCandleCovered:false,status:2,code:null,targets:[],hitRatios:[],hitTimes:{}};
 function fail(code){out.code=code;return out;}
 if(!Array.isArray(rows)||!rows.length)return fail('AF_EXECUTION_COVERAGE_MISSING');
 if(rows.length>3000)return fail('AF_EXECUTION_COVERAGE_INVALID');
 if(!afPlannerNum_(sourceAsOf)||sourceAsOf<=0||sourceAsOf>ctx.asOf)return fail('AF_FIBO_NOT_KNOWABLE_OR_STALE');
 var prevStart=0,bad=false;
 rows.forEach(function(b){if(!Array.isArray(b)||b.length<6||!b.slice(0,6).every(afPlannerNum_)||b[0]<=0||b[1]-b[0]!==ms||
  b[1]>ctx.asOf||b[4]<=0||b[3]<Math.max(b[2],b[4],b[5])||b[4]>Math.min(b[2],b[3],b[5])||b[0]<=prevStart)bad=true;
  if(Array.isArray(b))prevStart=b[0];});
 if(bad)return fail('AF_EXECUTION_COVERAGE_INVALID');
 var last=rows[rows.length-1][1];out.to=last;
 var marketClosed=ctx.quote&&(ctx.quote.market_status==='closed'||ctx.quote.weekend_test_mode===true||ctx.quote.is_market_open===false);
 if(last!==Date.parse(fr.lastClosedUtc)||!marketClosed&&now-last>ms+120000||now<last)return fail('AF_EXECUTION_COVERAGE_STALE');
 if(last<sourceAsOf)return fail('AF_EXECUTION_COVERAGE_INCOMPLETE');
 var firstAfter=rows.findIndex(function(b){return b[0]>=sourceAsOf;});
 if(last>sourceAsOf&&(firstAfter<0||rows[firstAfter][0]>sourceAsOf+ms))return fail('AF_EXECUTION_COVERAGE_INCOMPLETE');
 var bars=rows.filter(function(b){return b[0]>=sourceAsOf;});out.barCount=bars.length;out.coverage='CLOSED_BARS_SINCE_SOURCE_ASOF';
 if(bars.some(function(b){return f.side===1?b[4]<f.zero||b[4]<Number(f.rootPrice||f.root):b[3]>f.zero||b[3]>Number(f.rootPrice||f.root);}))return fail('AF_EXECUTION_FIBO_BREACHED');
 if(!Array.isArray(f.targets)||!Array.isArray(f.hitRatios))return fail('AF_FIBO_TARGETS_INVALID');
 var ratios=[1.618,2,2.618,3.5,4.236,5.472],hits=f.hitRatios.slice(),times=Object.assign({},f.hitTimes||{});
 var seenTargets={};if(f.targets.length!==6||hits.some(function(r){return !afPlannerNum_(r)||ratios.indexOf(r)<0;})||f.targets.some(function(t){
  if(!t||!afPlannerNum_(t.ratio)||!afPlannerNum_(t.price)||ratios.indexOf(t.ratio)<0||seenTargets[t.ratio]||Math.abs(t.price-(f.zero+f.span*t.ratio))>.001)return true;seenTargets[t.ratio]=true;return typeof t.pending!=='boolean'||t.pending===(hits.indexOf(t.ratio)>=0);
 }))return fail('AF_FIBO_TARGETS_INVALID');
 f.targets.forEach(function(t){var hit=hits.indexOf(t.ratio)>=0,hitAt=t.hitAt;
  bars.forEach(function(b){var reached=f.side===1?b[3]>=t.price:b[4]<=t.price;if(reached&&!hit){hit=true;hitAt=b[1];if(hits.indexOf(t.ratio)<0)hits.push(t.ratio);times[String(t.ratio)]=b[1];}});
  out.targets.push({ratio:t.ratio,price:t.price,pending:!hit,hitAt:hitAt===null||hitAt===undefined?(times[String(t.ratio)]||null):hitAt});
 });
 if(out.targets.length!==ratios.length||out.targets.some(function(t){return ratios.indexOf(t.ratio)<0;}))return fail('AF_FIBO_TARGETS_INVALID');
 if(hits.indexOf(5.472)>=0){out.status=3;return fail('AF_FIBO_BOOK_CLOSED_INTRABAR');}
 out.hitRatios=hits;out.hitTimes=times;out.status=2;
 // The current registry anchor also participates in the kill latch.
 if(anchor){
  if(anchor.knownAt>last)return fail('AF_PROTECTIVE_ANCHOR_COVERAGE_INCOMPLETE');
  if(bars.some(function(b){return b[0]>=Math.max(sourceAsOf,anchor.knownAt)&&(f.side===1?b[4]<anchor.price:b[3]>anchor.price);}))return fail('AF_PROTECTIVE_ANCHOR_SWEPT');
 }
 return out;
}
function afPlannerCandidate_(ctx,z,f,qc,now){
 var key=afPlannerIdentity_(ctx,z,f),s=z.side,c={id:'C:'+key,stableKey:key,side:s===1?'BUY':'SELL',zoneId:z.id,
 fiboId:f.id,zoneTF:z.tf,fiboTF:f.tf,entry:null,stop:null,target:null,netR:null,evidenceScore:null,
 eligible:false,gateCodes:[],evidence:{policyVersion:AF_PLANNER_POLICY.version,pineParityVerified:false,scoreIsWinProbability:false,
  provenance:afPlannerProvenance_(ctx),zone:afPlannerZoneEvidence_(z),fibo:afPlannerFiboEvidence_(f)}};
 var fail=function(code){if(c.gateCodes.indexOf(code)<0)c.gateCodes.push(code);return afPlannerClean_(c);};
 var base=afPlannerContextGate_(ctx,now);if(base)return fail(base);
 if(ctx.sourceId!=='Eightcap-MT5-Live')return fail('AF_SOURCE_UNVERIFIED');
 if(!ctx.coverage||ctx.coverage.canonicalSD!=='computed'||ctx.coverage.normalFibo!=='computed')return fail('AF_MODULE_UNAVAILABLE');
 if(![1,-1].includes(s)||f.side!==s||typeof z.id!=='string'||!z.id||typeof f.id!=='string'||!f.id)return fail('AF_SOURCE_ID_INVALID');
 var exec=ctx.frames[ctx.executionTF],zf=ctx.frames[z.tf],ff=ctx.frames[f.tf],zm=AF_PLANNER_TF[z.tf],fm=AF_PLANNER_TF[f.tf],em=AF_PLANNER_TF[ctx.executionTF];
 if(!zf||!ff||zm<em||fm<em||zm%em||fm%em||z.tfMs!==zm||f.tfMs!==fm)return fail('AF_TF_INCOMPARABLE');
 if(![z.lo,z.hi,z.atr,z.score,z.knownAt,z.tests].every(afPlannerNum_)||z.lo<=0||z.hi<z.lo||z.atr<=0||z.score<0||z.score>100||!Number.isInteger(z.tests)||z.tests<0)return fail('AF_ZONE_INVALID');
 if(z.knownAt<=0||z.knownAt>ctx.asOf||z.knownAt>Date.parse(zf.lastClosedUtc))return fail('AF_ZONE_NOT_KNOWABLE');
 if(!afZoneIsDefendCore_(z))return fail('AF_ZONE_NOT_DEFEND_CORE');
 if(z.historyComplete!==true||z.departed!==true)return fail('AF_ZONE_HISTORY_OR_DEPARTURE_UNCONFIRMED');
 var zoneRole=afZoneRole_(z,z.score);c.evidence.zoneRole=zoneRole;
 if(z.tests>1||z.hi-z.lo>z.atr*AF_PLANNER_POLICY.maxWidthZoneATR)return fail('AF_ZONE_EXHAUSTED_OR_WIDE');
 if(z.score<28)return fail('AF_ZONE_SCORE_LOW');
 if(!afZoneDirectLimitOK_(z))return fail('AF_ZONE_DIRECT_LIMIT_NOT_ALLOWED');
 if(f.sourceVersion!=='EBW-Fibo-1.10.19'||f.adapterVersion!=='AF-FORM-CONTEXT-0.2'||f.symbol!==ctx.symbol)return fail('AF_FIBO_SOURCE_UNVERIFIED');
 if(![f.zero,f.span,f.root,f.knownAt,f.sourceClose,f.born].every(afPlannerNum_)||f.zero<=0||f.root<=0||s*f.span<=0||
 f.broken!==true||f.invalidated!==false||f.historyComplete!==true||![1,3].includes(f.method)||!afBookActive_(f))return fail('AF_FIBO_INVALID');
 if(f.status!==undefined&&f.status!==2)return fail('AF_FIBO_INVALID');
 if(f.method===3&&ctx.coverage.NeckDivergence!=='computed')return fail('AF_MODULE_UNAVAILABLE');
 var executionClose=Date.parse(exec.lastClosedUtc),sourceAsOf=Number(f.asof||f.sourceClose);
 if(f.born<=0||f.born>f.knownAt||f.knownAt>f.sourceClose||f.sourceClose>ctx.asOf||f.sourceClose>Date.parse(ff.lastClosedUtc)||
  !afPlannerNum_(sourceAsOf)||sourceAsOf<f.knownAt||sourceAsOf>f.sourceClose||sourceAsOf>executionClose||sourceAsOf>ctx.asOf)return fail('AF_FIBO_NOT_KNOWABLE_OR_STALE');
 var relation=afPlannerZoneFiboRelation_(ctx,z,f);c.evidence.fiboRelation=relation;
 if(!relation.related||![1,2].includes(relation.code))return fail(relation.code===5?'AF_FIBO_DIRECTION_ONLY_NOT_RELATED':'AF_FIBO_RELATION_INVALID');
 if(s===1?ctx.quote.bid<f.zero||ctx.quote.bid<f.root:ctx.quote.ask>f.zero||ctx.quote.ask>f.root)return fail('AF_FIBO_BREACHED');
 var protection=afPlannerProtectiveAnchor_(ctx,z);c.evidence.protectiveAnchor=protection.anchor;
 if(protection.code)return fail(protection.code);
 var anchor=protection.anchor,sourceATR=exec.atr,near=anchor.kind==='MAPPED_LIQUIDITY'&&anchor.gap<=exec.atr*AF_PLANNER_POLICY.sweepBandATR;
 var buffer=Math.max(2*AF_PLANNER_POLICY.tick,exec.atr*AF_PLANNER_POLICY.bufferZoneATR,near?exec.atr*AF_PLANNER_POLICY.sweepBufferATR:0);
 var protect=s===1?Math.min(z.lo,anchor.price):Math.max(z.hi,anchor.price),floor=exec.atr*AF_PLANNER_POLICY.minRiskATR;
 var depth=afZoneAdaptiveDepth_(z,anchor.price,exec.atr),entryRaw=s===1?z.hi-depth*(z.hi-z.lo):z.lo+depth*(z.hi-z.lo);
 c.entry=afPlannerRound_(entryRaw,s===-1);c.evidence.adaptiveDepth=depth;
 // Widen outward to the floor only. Never squeeze an anchored stop to meet max risk/RR.
 c.stop=afPlannerRound_(s===1?Math.min(protect-buffer,c.entry-floor):Math.max(protect+buffer,c.entry+floor),s===-1);
 c.evidence.stopBuffer=buffer;c.evidence.zoneATR=z.atr;c.evidence.executionATR=exec.atr;
 c.evidence.stopPolicy={sourceATR:sourceATR,sweepBand:near,protect:protect,minRisk:floor,maxRisk:exec.atr*AF_PLANNER_POLICY.maxRiskATR};
 if(c.entry<z.lo||c.entry>z.hi||c.stop<=0)return fail('AF_TICK_OUTSIDE_ZONE');
 if(s===1?c.entry>=ctx.quote.ask:c.entry<=ctx.quote.bid)return fail('AF_LIMIT_ALREADY_MARKETABLE');
 if(s===1?ctx.quote.bid<z.lo:ctx.quote.ask>z.hi)return fail('AF_ZONE_BREACHED');
 var risk=s*(c.entry-c.stop),cost=ctx.quote.spread+AF_PLANNER_POLICY.extraCost;
 c.evidence.risk=risk;c.evidence.cost=cost;
 if(risk<.01||risk<exec.atr*AF_PLANNER_POLICY.minRiskATR-1e-8||risk>exec.atr*AF_PLANNER_POLICY.maxRiskATR+1e-8)return fail('AF_STOP_ATR_RANGE');
 var entryReference=s===1?ctx.quote.ask:ctx.quote.bid,entryDistance=s*(entryReference-c.entry),entryDistanceATR=entryDistance/exec.atr;
 c.evidence.entryDistance={referencePrice:entryReference,distance:entryDistance,distanceATR:entryDistanceATR,maxDistanceATR:AF_PLANNER_POLICY.maxEntryDistanceATR};
 if(!afPlannerNum_(entryDistanceATR)||entryDistanceATR<0||entryDistance>exec.atr*AF_PLANNER_POLICY.maxEntryDistanceATR+AF_PLANNER_POLICY.tick*1e-9)return fail('AF_ENTRY_TOO_FAR_FROM_MARKET');
 if(cost>risk*AF_PLANNER_POLICY.maxCostRisk+1e-8)return fail('AF_COST_TOO_HIGH');
 if(!Array.isArray(f.targets)||!Array.isArray(f.hitRatios))return fail('AF_FIBO_TARGETS_INVALID');
 var ratios=[1.618,2,2.618,3.5,4.236,5.472],seen={},bad=f.hitRatios.some(function(r){return !afPlannerNum_(r)||ratios.indexOf(r)<0;});
 f.targets.forEach(function(t){if(!t||![t.ratio,t.price].every(afPlannerNum_)||ratios.indexOf(t.ratio)<0||seen[t.ratio]||t.price<=0||
  typeof t.pending!=='boolean'||Math.abs(t.price-(f.zero+f.span*t.ratio))>.001||t.pending===(f.hitRatios.indexOf(t.ratio)>=0))bad=true;else seen[t.ratio]=true;});
 if(bad||f.targets.length!==ratios.length)return fail('AF_FIBO_TARGETS_INVALID');
 // First still-pending extension. The first opposing All Indy obstacle caps the TP.
 c.evidence.executionSafety=afPlannerExecutionSafety_(ctx,f,null,anchor,now);
 if(c.evidence.executionSafety.code)return fail(c.evidence.executionSafety.code);
 c.evidence.fiboIntrabarState={status:c.evidence.executionSafety.status,hitRatios:c.evidence.executionSafety.hitRatios,asof:c.evidence.executionSafety.from};
 var pending=c.evidence.executionSafety.targets.filter(function(t){return t.pending&&t.ratio>1&&s*(t.price-c.entry)>0;}).sort(function(a,b){return Math.abs(a.price-c.entry)-Math.abs(b.price-c.entry)||a.ratio-b.ratio;});
 if(!pending.length)return fail('AF_NO_NEXT_FIBO_TARGET');
 var fibTarget=pending[0].price;c.evidence.nextFibo={ratio:pending[0].ratio,price:fibTarget};
 if(s*((s===1?ctx.quote.bid:ctx.quote.ask)-fibTarget)>=0)return fail('AF_FIBO_TARGET_ALREADY_REACHED');
 var obstacles=[],badObstacle=false;
 ctx.zones.forEach(function(o){if(o.side!==-s)return;var of=ctx.frames[o.tf];
  if(!of||o.tfMs!==AF_PLANNER_TF[o.tf]||![o.lo,o.hi,o.knownAt].every(afPlannerNum_)||o.lo<=0||o.lo>o.hi||o.knownAt>Date.parse(of.lastClosedUtc)){badObstacle=true;return;}
  var families=Number(o.families||o.familyBit)||0,isDefend=o.isDefendCore===true||[AF_ZONE_FAMILY_.SD,AF_ZONE_FAMILY_.OB,AF_ZONE_FAMILY_.QML,AF_ZONE_FAMILY_.FLIP].some(function(bit){return afZoneHas_(families,bit);});
  var isFvg=afZoneHas_(families,AF_ZONE_FAMILY_.FVG)||String(o.family||o.source||'').toUpperCase().indexOf('FVG')>=0;
  if((isDefend||isFvg)&&Number(o.score)>=28&&(s===1?o.hi>=c.entry:o.lo<=c.entry))obstacles.push({kind:isFvg?'FVG':'DEFEND_ZONE',tf:o.tf,id:o.id,price:s===1?Math.max(c.entry,o.lo):Math.min(c.entry,o.hi),
   source:afPlannerZoneEvidence_(o),frameClose:afPlannerPick_(of,['lastClosedUtc']).lastClosedUtc});
 });
 Object.keys(ctx.frames).forEach(function(tf){var fr=ctx.frames[tf];if(!Array.isArray(fr.liquidity)){badObstacle=true;return;}
  fr.liquidity.forEach(function(l){if(!l||![1,-1].includes(l.side)||![l.price,l.knownAt].every(afPlannerNum_)||l.price<=0||l.knownAt>Date.parse(fr.lastClosedUtc)){badObstacle=true;return;}
   var level=afPlannerLiquidityPrice_(l,s);if(l.side===-s&&s*(level-c.entry)>=0)obstacles.push({kind:'LIQUIDITY',tf:tf,price:level,
    source:afPlannerPick_(l,['side','price','lo','hi','knownAt']),frameClose:afPlannerPick_(fr,['lastClosedUtc']).lastClosedUtc});});
 });
 if(badObstacle)return fail('AF_OBSTACLE_DATA_INVALID');
 obstacles.sort(function(a,b){var d=s*(a.price-b.price),x=JSON.stringify(a),y=JSON.stringify(b);return d||(x<y?-1:x>y?1:0);});
 var firstObstacle=obstacles.filter(function(o){return s*(o.price-c.entry)>=0;}).sort(function(a,b){return Math.abs(a.price-c.entry)-Math.abs(b.price-c.entry);})[0]||null;
 var minRoom=exec.atr*AF_PLANNER_POLICY.minRoomATR;c.evidence.firstObstacle=firstObstacle;
 if(firstObstacle&&Math.abs(firstObstacle.price-c.entry)<minRoom)return fail('AF_FIRST_OBSTACLE_TOO_CLOSE');
 var nearest=firstObstacle?afPlannerNearer_(fibTarget,firstObstacle.price,c.entry):fibTarget;
 c.target=afPlannerRound_(nearest,s===-1);
 var reward=s*(c.target-c.entry);c.netR=(reward-cost)/(risk+cost);
 if(reward<=0||c.target<=0)return fail('AF_OBSTACLE_BLOCKS_TARGET');
 if(reward<minRoom)return fail('AF_TARGET_ROOM_BELOW_MINIMUM');
 if(!afPlannerNum_(c.netR)||c.netR<AF_PLANNER_POLICY.minNetR)return fail('AF_NET_RR_LOW');
 var htf=ctx.frames[ctx.contextTF],trend=s*(htf.ema20-htf.ema50)>0;
 c.evidenceScore=Math.min(100,Math.min(30,z.score*.3)+(z.tests===0?15:7)+20+(trend?15:0)+(c.netR>=2?20:15));
 var threshold=qc.threshold===null?(cost/risk>.15?75:65):qc.threshold;c.evidence.qcThreshold=threshold;
 if(c.evidenceScore<threshold)return fail('AF_QC_REJECTED');
 c.eligible=true;return afPlannerClean_(c);
}
function afPlannerBuild_(ctx,qc,now){
 var list=[],seenZ={},seenF={},duplicates={};
 function collect(rows,seen){rows.forEach(function(r){var k=JSON.stringify([r.tf,r.id,r.side]);if(seen[k])duplicates[k]=true;seen[k]=true;});}
 collect(ctx.zones,seenZ);collect(ctx.fibos,seenF);
 ctx.zones.forEach(function(z){ctx.fibos.forEach(function(f){if(z.side!==f.side)return;
  var c=afPlannerCandidate_(ctx,z,f,qc,now),zk=JSON.stringify([z.tf,z.id,z.side]),fk=JSON.stringify([f.tf,f.id,f.side]);
  if(duplicates[zk]||duplicates[fk]){c.eligible=false;c.gateCodes.push('AF_DUPLICATE_SOURCE_KEY');}list.push(c);
 });});
 // Conflicting duplicate evidence is rejected, then collapsed deterministically to one identity.
 var grouped={};list.forEach(function(c){(grouped[c.stableKey]||(grouped[c.stableKey]=[])).push(c);});
 return Object.keys(grouped).sort().map(function(k){var group=grouped[k].sort(function(a,b){var x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;}),c=group[0];
  if(group.length>1){c.eligible=false;if(c.gateCodes.indexOf('AF_DUPLICATE_SOURCE_KEY')<0)c.gateCodes.push('AF_DUPLICATE_SOURCE_KEY');}return c;});
}
function afPlannerDecision_(d,candidates){
 var fail=function(code){return {accepted:false,reasonCode:code,reason:code,score:0,threshold:65};};
 if(!d||typeof d!=='object'||Array.isArray(d))return fail('AF_AI_SCHEMA_INVALID');
 var allowed=['decision','candidateId','analysis','buyAssessment','sellAssessment','entryAssessment','stopAssessment','targetAssessment','invalidation','missingEvidence'];
 if(Object.keys(d).some(function(k){return allowed.indexOf(k)<0;})||!['PLAN','NO_TRADE'].includes(d.decision)||
  !['analysis','buyAssessment','sellAssessment'].every(function(k){return typeof d[k]==='string'&&d[k].length>0&&d[k].length<=6000;})||
  ['entryAssessment','stopAssessment','targetAssessment','invalidation'].some(function(k){return d[k]!==undefined&&(typeof d[k]!=='string'||d[k].length>6000);})||
  d.missingEvidence!==undefined&&(!Array.isArray(d.missingEvidence)||d.missingEvidence.length>20||d.missingEvidence.some(function(x){return typeof x!=='string'||x.length>1000;})))return fail('AF_AI_SCHEMA_INVALID');
 if(d.decision==='NO_TRADE')return d.candidateId===null?fail('AF_AI_NO_TRADE'):fail('AF_AI_SCHEMA_INVALID');
 if(typeof d.candidateId!=='string'||!d.candidateId)return fail('AF_AI_SCHEMA_INVALID');
 if(d.missingEvidence&&d.missingEvidence.length)return fail('AF_AI_MISSING_EVIDENCE');
 var found=candidates.filter(function(c){return c.id===d.candidateId;});
 if(found.length!==1)return fail('AF_AI_UNKNOWN_CANDIDATE');
 var c=found[0];if(!c.eligible)return fail('AF_AI_INELIGIBLE_CANDIDATE');
 var s=typeof c.side==='number'?c.side:(c.side==='BUY'?1:-1);
 var score=c.evidenceScore||(c.meta&&c.meta.effectiveScore)||75;
 var thresh=(c.evidence&&c.evidence.qcThreshold)||65;
 var ev=Object.assign({},c.evidence||{},{candidateId:c.id,stableKey:c.stableKey||c.id,zoneId:c.zoneId,fiboId:c.fiboId});
 return {accepted:true,reasonCode:'AF_CANDIDATE_SELECTED',score:score,threshold:thresh,candidate:c,
 plan:{side:s,sideStr:s===1?'BUY':'SELL',entry:c.entry,stop:c.stop||c.sl,target:c.target||c.tp,netR:c.netR,invalidation:d.invalidation||'',
 evidence:ev,mode:'TEST',liveTrading:false}};
}

