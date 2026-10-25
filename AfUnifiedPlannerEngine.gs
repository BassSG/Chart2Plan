/**
 * AfUnifiedPlannerEngine.gs
 * ผสานตรรกะ All Indy 1.3.5 + EBW-Fibo 1.10.19 สำหรับระบบ Chart2Plan
 * คำนวณสิทธิ์ Direct Limit, Adaptive Entry, Protective SL, Fibo/Liquidity TP และ Net RR ล่วงหน้า
 */

var AF_UNIFIED_CONFIG = {
  // All Indy 1.3.5 source-score and eligibility thresholds.
  minActionScore: 62.0,
  majorScore: 76.0,
  directReactionScore: 70.0,
  reactionMinScore: 28.0,
  blockingObstacleScore: 28.0, // Pine reaction-map floor for an opposing Defend/FVG obstacle.
  maxActionTests: 1,
  maxWidthATR: 2.5,

  // Risk & Stop Parameters
  minStopATR: 0.75,
  maxStopATR: 2.50,
  baseInvalidBufferATR: 0.15,
  stopBufferATR: 0.15,
  anchorSearchATR: 1.50,
  sweepRiskATR: 0.60,
  sweepBufferATR: 0.25,
  requireAnchorStrict: false, // อนุญาตใช้ Distal POI / Fibo C 0% ได้เมื่อโซนเป็น MAJOR หรือมี Sweep Tag

  // Target & Reward Parameters
  minRoomATR: 0.75,
  minPlanR: 1.0,
  minNetR: 1.50,
  maxCostRisk: 0.20,
  maxEntryDistanceATR: 6.0,   // hard limit for a pending entry too far from current quote

  // Stale Quote Tolerance (ระหว่างรอ AI ประมวลผล)
  maxPriceDriftATR: 0.35      // ถ้าราคาขยับไม่เกิน 0.35 ATR และยังไม่ชน Entry/SL ถือว่า Snapshot ยังใช้ได้
};

/**
 * 1) คำนวณบทบาทโซน (MAJOR / REACTION / LIQUIDITY) และสิทธิ์ Direct Limit
 */
function evaluateZoneEligibility_(zone, chartAtr, chartSec) {
  const isLiquidityOnly = Boolean(zone.isLiquidityOnly || zone.role === 'LIQUIDITY' ||
    ['SW-H', 'SW-L', 'EQH', 'EQL', 'IDM-H', 'IDM-L'].includes(zone.source));
  const isDefendCore = Boolean(zone.isDefendCore ||
    ['SD', 'OB', 'QML', 'FLIP'].some(k => String(zone.family || zone.source || '').toUpperCase().includes(k)));

  // Pine's htfContext and breadth are both zero in Source Q. MTF affects rank only.
  const rawScore = Number(zone.rawScore == null ? zone.score || 0 : zone.rawScore);
  const effectiveScore = rawScore;

  const tags = zone.tags || {};
  const hasSource = Boolean(tags.source || zone.hasSource || zone.source===true);
  const hasClean = Boolean(tags.clean || zone.hasClean || zone.clean);
  const hasStruct = Boolean(tags.struct || zone.hasStruct || zone.structure);
  const hasDisp = Boolean(tags.disp || zone.hasDisp || Number(zone.departureATR || zone.departure || 0) >= 0.60);
  const hasSweep = Boolean(tags.liq || zone.hasSweep || zone.sweep);
  const hasNested = Boolean(tags.nested || zone.hasNested || zone.nested);
  const isQml = String(zone.family || zone.source || '').toUpperCase().includes('QML');

  const cleanHtf = hasClean && Number(zone.departureATR || zone.departure || 0) >= 0.75;
  const majorEvidence = hasSource || hasNested || isQml || cleanHtf || (hasStruct && hasDisp);

  const tests = Number(zone.tests || 0);
  const width = Math.abs(Number(zone.hi) - Number(zone.lo));
  const sourceAtr = Number(zone.sourceAtr || chartAtr || 1);
  const widthOK = width <= sourceAtr * AF_UNIFIED_CONFIG.maxWidthATR;
  const historyComplete = zone.historyComplete === true;
  const departed = zone.departed === true;

  let role = 'REACTION';
  if (isLiquidityOnly) {
    role = 'LIQUIDITY';
  } else if (tests >= 2) {
    role = 'REACTION';
  } else if (isDefendCore && rawScore >= AF_UNIFIED_CONFIG.majorScore && majorEvidence) {
    role = 'MAJOR';
  }

  const actionable = historyComplete && departed && widthOK && isDefendCore &&
    tests <= AF_UNIFIED_CONFIG.maxActionTests && effectiveScore >= AF_UNIFIED_CONFIG.minActionScore;

  const directLimitOK = actionable && (role === 'MAJOR' && tests <= 1 || role === 'REACTION' && rawScore >= 70 && tests === 0);

  return {
    role,
    rawScore: rawScore,
    effectiveScore: Number(effectiveScore.toFixed(2)),
    isDefendCore,
    isLiquidityOnly,
    widthOK,
    actionable,
    directLimitOK,
    viewRank:Number.isFinite(zone.viewRank)?zone.viewRank:null,
    majorEvidence,
    hasSweep
  };
}

/**
 * 2) ค้นหา Protective Liquidity Anchor ด้านหลังโซน (ตาม f_r_protectiveAnchor)
 */
function findProtectiveAnchor_(coreZone, allZones, chartAtr) {
  let bestAnchor = null;
  let bestGap = -1;
  const side = Number(coreZone.side); // 1 = BUY, -1 = SELL
  const maxSearch = chartAtr * AF_UNIFIED_CONFIG.anchorSearchATR;

  for (const z of (allZones || [])) {
    const isLiq = Boolean(z.isLiquidityOnly || z.role === 'LIQUIDITY' ||
      ['SW-H', 'SW-L', 'EQH', 'EQL', 'IDM-H', 'IDM-L'].includes(z.source));
    if (Number(z.side) === side && isLiq) {
      const candidate = side === 1 ? Number(z.lo) : Number(z.hi);
      const gap = side === 1 ? (Number(coreZone.lo) - candidate) : (candidate - Number(coreZone.hi));
      if (gap >= 0 && gap <= maxSearch && gap > bestGap) {
        bestAnchor = candidate;
        bestGap = gap;
      }
    }
  }
  return bestAnchor;
}

/**
 * 3) คำนวณ Entry (Adaptive Depth) และ Stop Loss (Sweep-Protected)
 */
function computeEntryAndStop_(coreZone, meta, anchor, fiboContext, chartAtr, mintick) {
  const side = Number(coreZone.side);
  const lo = Number(coreZone.lo);
  const hi = Number(coreZone.hi);
  const tests = Number(coreZone.tests || 0);
  const score = meta.effectiveScore;

  // Adaptive Depth ตาม f_r_adaptiveDepth
  let depth = tests === 0
    ? (meta.role === 'MAJOR' ? (score >= 90 ? 0.28 : 0.33) : (score >= 70 ? 0.45 : 0.52))
    : (meta.role === 'MAJOR' ? 0.50 : 0.58);

  const distal = side === 1 ? lo : hi;
  const extension = (anchor !== null && chartAtr > 0) ? Math.abs(distal - anchor) / chartAtr : 0.0;
  depth = Math.min(0.65, depth + Math.min(0.12, extension * 0.08));

  const rawEntry = side === 1 ? (hi - depth * (hi - lo)) : (lo + depth * (hi - lo));
  const entry = roundToTick_(rawEntry, mintick, side === 1 ? 'down' : 'up');

  // Only mapped same-side liquidity can widen the protected level beyond the POI.
  let effectiveAnchor = anchor;

  const protectLevel = effectiveAnchor === null
    ? distal
    : (side === 1 ? Math.min(lo, effectiveAnchor) : Math.max(hi, effectiveAnchor));

  // Sweep Buffer ตาม f_r_sweepBufferATR
  let bufferATR = Math.max(AF_UNIFIED_CONFIG.baseInvalidBufferATR, AF_UNIFIED_CONFIG.stopBufferATR);
  if (effectiveAnchor !== null && chartAtr > 0) {
    const anchorGapATR = Math.abs(distal - effectiveAnchor) / chartAtr;
    if (anchorGapATR <= AF_UNIFIED_CONFIG.sweepRiskATR) {
      bufferATR = Math.max(bufferATR, AF_UNIFIED_CONFIG.sweepBufferATR);
    }
  }

  const buffer = Math.max(chartAtr * bufferATR, mintick * 2.0);
  const minStopDist = chartAtr * AF_UNIFIED_CONFIG.minStopATR;
  const rawStop = side === 1
    ? Math.min(protectLevel - buffer, entry - minStopDist)
    : Math.max(protectLevel + buffer, entry + minStopDist);

  const sl = roundToTick_(rawStop, mintick, side === 1 ? 'down' : 'up');
  const risk = Math.abs(entry - sl);
  const stopOK = risk >= chartAtr * AF_UNIFIED_CONFIG.minStopATR * 0.95 &&
                 risk <= chartAtr * AF_UNIFIED_CONFIG.maxStopATR;

  // ปลดล็อก Anchor: ผ่านถ้ามี effectiveAnchor หรือโซนเป็น MAJOR หรือโซนทำ Sweep ไปแล้ว (hasSweep)
  const anchorOK = !AF_UNIFIED_CONFIG.requireAnchorStrict ||
    effectiveAnchor !== null || meta.role === 'MAJOR' || meta.hasSweep;

  return {
    entry,
    sl,
    risk: Number(risk.toFixed(4)),
    adaptiveDepth: Number(depth.toFixed(3)),
    protectiveAnchor: effectiveAnchor,
    anchorOK,
    stopOK
  };
}

/**
 * 4) จับคู่ Fibo Synergy (3 โหมด) + คำนวณ First Actionable Obstacle & Net RR
 */
function buildUnifiedCandidatePlan_(coreZone, allZones, fibos, market, chartAtr) {
  const mintick = Number(market.mintick || 0.01);
  const cost = Number(market.totalCost || market.spread || 0.18);
  const side = Number(coreZone.side);
  const bid = Number(market.bid || market.close);
  const ask = Number(market.ask || bid);

  const meta = evaluateZoneEligibility_(coreZone, chartAtr, market.chartSec || 900);
  if (!meta.actionable) {
    return { valid: false, reason: 'ZONE_NOT_ACTIONABLE', meta };
  }

  // เช็กว่าโซนอยู่ในฝั่งที่เป็น Limit ได้จริง (BUY Limit < Ask, SELL Limit > Bid)
  const anchor = findProtectiveAnchor_(coreZone, allZones, chartAtr);

  // จับคู่ Fibo (รองรับ 3 โหมด)
  const fibMatch = matchFiboSynergy_(coreZone, side, fibos, chartAtr);
  const geom = computeEntryAndStop_(coreZone, meta, anchor, fibMatch, chartAtr, mintick);

  const isPendingLimit = side === 1 ? (geom.entry < ask) : (geom.entry > bid);
  if (!isPendingLimit) {
    return { valid: false, reason: 'ENTRY_NOT_LIMIT_SIDE_OF_SPOT', meta, geom, fiboSynergy: fibMatch };
  }
  if (!meta.directLimitOK) {
    return { valid: false, reason: 'DIRECT_LIMIT_SCORE_OR_ROLE_INSUFFICIENT', meta, geom, fiboSynergy: fibMatch };
  }
  if (!geom.anchorOK || !geom.stopOK) {
    return { valid: false, reason: !geom.anchorOK ? 'NO_PROTECTIVE_ANCHOR' : 'STOP_GEOMETRY_OUT_OF_BOUNDS', meta, geom, fiboSynergy: fibMatch };
  }
  const entryReference=side===1?ask:bid;
  const entryDistance=side*(entryReference-geom.entry);
  const distanceLimit=Number(market.maxEntryDistanceATR||AF_UNIFIED_CONFIG.maxEntryDistanceATR);
  const maxEntryDistance=chartAtr*distanceLimit;
  geom.entryDistance={referencePrice:entryReference,distance:entryDistance,distanceATR:Number((entryDistance/chartAtr).toFixed(3)),maxDistanceATR:distanceLimit};
  if(!Number.isFinite(entryDistance)||entryDistance<0||entryDistance>maxEntryDistance+mintick*1e-9)
    return {valid:false,reason:'AF_ENTRY_TOO_FAR_FROM_MARKET',meta,geom,fiboSynergy:fibMatch};

  // First opposing Defend/FVG obstacle with Pine's reaction-map floor (Source Q >= 28).
  let hardObstaclePrice = null;
  let minorObstaclePrice = null;

  for (const z of (allZones || [])) {
    if (Number(z.side) === -side) {
      const oppMeta = evaluateZoneEligibility_(z, chartAtr, market.chartSec || 900);
      const isFvg = String(z.family || z.source || '').toUpperCase().includes('FVG');
      if ((oppMeta.isDefendCore || isFvg) && oppMeta.rawScore >= AF_UNIFIED_CONFIG.blockingObstacleScore) {
        const oppEdge = side === 1 ? Math.max(geom.entry,Number(z.lo)) : Math.min(geom.entry,Number(z.hi));
        const isAhead = side === 1 ? (Number(z.hi) >= geom.entry) : (Number(z.lo) <= geom.entry);
        if (isAhead) {
          if (hardObstaclePrice === null || Math.abs(oppEdge - geom.entry) < Math.abs(hardObstaclePrice - geom.entry)) {
            hardObstaclePrice = oppEdge;
          }
        }
      }
    }
  }

  // ค้นหาเป้า Liquidity ฝั่งตรงข้าม (BSL / SSL)
  let nearestLiquidityTarget = null;
  for (const z of (allZones || [])) {
    const isLiq = Boolean(z.isLiquidityOnly || z.role === 'LIQUIDITY' ||
      ['SW-H', 'SW-L', 'EQH', 'EQL', 'IDM-H', 'IDM-L'].includes(z.source));
    if (Number(z.side) === -side && isLiq) {
      const candidate = side === 1 ? Number(z.lo) : Number(z.hi);
      const isAhead = side === 1 ? (candidate > geom.entry) : (candidate < geom.entry);
      if (isAhead) {
        if (nearestLiquidityTarget === null || Math.abs(candidate - geom.entry) < Math.abs(nearestLiquidityTarget - geom.entry)) {
          nearestLiquidityTarget = candidate;
        }
      }
    }
  }

  // เลือก TP หลักจาก (1) เป้า Fibo ที่สอดคล้อง (2) Nearest Liquidity (3) ขอบหน้า Hard Obstacle
  const pendingTargets=(fibMatch.pendingTargets||[]).filter(t=>side*(Number(t.price)-geom.entry)>0).sort((a,b)=>Math.abs(a.price-geom.entry)-Math.abs(b.price-geom.entry));
  const fibTarget=pendingTargets.length?Number(pendingTargets[0].price):null;
  if(fibMatch.matched&&fibTarget===null)return {valid:false,reason:'AF_NO_NEXT_FIBO_TARGET',meta,geom,fiboSynergy:fibMatch};
  if(fibTarget!==null&&side*((side===1?bid:ask)-fibTarget)>=0)return {valid:false,reason:'AF_FIBO_TARGET_ALREADY_REACHED',meta,geom,fiboSynergy:fibMatch};
  fibMatch.nextTarget=fibTarget;
  // A mapped BSL/SSL is a real target before a farther Fibo projection;
  // it is never crossed just because the Fibo book has a distant extension.
  let rawTarget = fibTarget || nearestLiquidityTarget || hardObstaclePrice;
  if(fibTarget!==null&&nearestLiquidityTarget!==null&&side*(nearestLiquidityTarget-geom.entry)>0&&
     Math.abs(nearestLiquidityTarget-geom.entry)<Math.abs(fibTarget-geom.entry))rawTarget=nearestLiquidityTarget;

  // หากมี Hard Obstacle ขวางอยู่ก่อนถึง rawTarget ต้อง Cap TP ไว้ที่หน้า Hard Obstacle
  if (rawTarget !== null && hardObstaclePrice !== null) {
    const rawDist = Math.abs(rawTarget - geom.entry);
    const hardDist = Math.abs(hardObstaclePrice - geom.entry);
    if (hardDist < rawDist) {
      rawTarget = hardObstaclePrice;
    }
  }

  if (rawTarget === null) {
    return { valid: false, reason: 'NO_MAPPED_STRUCTURAL_OR_FIBO_TARGET', meta, geom, fibMatch };
  }

  const tp = roundToTick_(rawTarget, mintick, side === 1 ? 'down' : 'up');

  const grossReward = (tp - geom.entry) * side;
  const grossRR = geom.risk > 0 ? grossReward / geom.risk : 0;
  const netRR = geom.risk > 0 ? (grossReward - cost) / (geom.risk + cost) : 0;

  const firstObstaclePrice=[hardObstaclePrice,nearestLiquidityTarget].filter(Number.isFinite).sort((a,b)=>Math.abs(a-geom.entry)-Math.abs(b-geom.entry))[0]??null;
  const roomOK = grossReward >= chartAtr * AF_UNIFIED_CONFIG.minRoomATR &&
    (firstObstaclePrice === null || Math.abs(firstObstaclePrice - geom.entry) >= chartAtr * AF_UNIFIED_CONFIG.minRoomATR);
  const costRiskOK = cost <= geom.risk * AF_UNIFIED_CONFIG.maxCostRisk;
  const rrOK = grossRR >= AF_UNIFIED_CONFIG.minPlanR && netRR >= AF_UNIFIED_CONFIG.minNetR && costRiskOK;

  return {
    valid: Boolean(fibMatch.matched && roomOK && rrOK),
    reason: !fibMatch.matched ? 'NO_FIBO_SYNERGY_MATCH' : (!roomOK ? 'HARD_OBSTACLE_TOO_CLOSE' : (!costRiskOK ? 'AF_COST_TOO_HIGH' : (!rrOK ? 'NET_RR_BELOW_MIN' : 'OK'))),
    side: side === 1 ? 'BUY' : 'SELL',
    setupMode: fibMatch.mode,
    zoneId: coreZone.id,
    meta,
    geom,
    fiboSynergy: fibMatch,
    targets: {
      tp,
      fiboTarget: fibTarget,
      liquidityTarget: nearestLiquidityTarget,
      hardObstaclePrice,
      firstObstaclePrice,
      minorObstacleWatch: minorObstaclePrice,
      grossRR: Number(grossRR.toFixed(2)),
      netRR: Number(netRR.toFixed(2)),
      costUsed: cost
    }
  };
}

function afUnifiedZoneFiboRelation_(zone,f,chartAtr){
  const side=Number(zone.side),zeroT=Number(f.zeroT||f.anchors&&f.anchors.c&&f.anchors.c.t),zero=Number(f.zeroPrice||f.zero);
  const a=f.anchors||{},pts=[a.a&&Number(a.a.p),a.b&&Number(a.b.p),a.c&&Number(a.c.p)].filter(Number.isFinite);
  const low=Number.isFinite(f.legLow)?f.legLow:pts.length?Math.min(...pts):NaN;
  const high=Number.isFinite(f.legHigh)?f.legHigh:pts.length?Math.max(...pts):NaN;
  const tol=Math.max(.01,Number(f.sourceATR||chartAtr||0)*.03),same=side===Number(f.side);
  if(!same)return {code:5,related:false,reason:'DIRECTION_ONLY'};
  if(!Number.isFinite(zeroT)||Number(zone.knownAt)<zeroT)return {code:6,related:false,reason:'ZONE_PRECEDES_FIBO_C'};
  if(side===1?Number(zone.lo)<zero:Number(zone.hi)>zero)return {code:4,related:false,reason:'ZONE_CROSSES_FIBO_ZERO'};
  const inside=Number(zone.lo)>=low-tol&&Number(zone.hi)<=high+tol;
  const bookRelated=zone.relatedFiboId===f.id||zone.fiboId===f.id;
  return {code:inside||bookRelated?2:4,related:!!(inside||bookRelated),reason:inside?'SAME_LEG_INSIDE_FROZEN_RANGE':bookRelated?'EXPLICIT_BOOK_LINK':'OUTSIDE_FROZEN_RANGE',
    zeroT,zero,legLow:low,legHigh:high,tolerance:tol};
}

/** Fibo pairing requires a Pine relation (code 1/2) or an explicit book link. */
function matchFiboSynergy_(coreZone, side, fibos, chartAtr) {
  const list = Array.isArray(fibos) ? fibos : [];

  // Same-direction alone (Pine link code 5) is not a match.
  const sameSideActive = list.filter(f =>
    Number(f.side) === side && f.broken === true && !f.invalidated && (f.closedT===null||f.closedT===undefined) &&
    f.historyComplete !== false && f.intrabarSafe!==false && (f.status===undefined||f.status===2) && f.nextPendingTarget && afUnifiedZoneFiboRelation_(coreZone,f,chartAtr).related
  );
  if (sameSideActive.length > 0) {
    sameSideActive.sort((a, b) => Number(b.tfSec || 0) - Number(a.tfSec || 0));
    const best = sameSideActive[0];
    return {
      matched: true,
      mode: 'TREND_CONTINUATION',
      fiboId: best.id,
      fiboTf: best.tf,
      zeroPrice: best.zero,
      nextTarget: best.nextPendingTarget,
       pendingTargets:(best.targets||[]).filter(t=>t.pending===true),
      relation:afUnifiedZoneFiboRelation_(coreZone,best,chartAtr),
      note: 'Same-side child zone is inside the frozen Fibo leg after C'
    };
  }

  return { matched: false, mode: 'NONE', fiboId: null, nextTarget: null };
}

function roundToTick_(price, mintick, mode) {
  const tick = Number(mintick || 0.01);
  if (mode === 'up') return Math.ceil(price / tick) * tick;
  if (mode === 'down') return Math.floor(price / tick) * tick;
  return Math.round(price / tick) * tick;
}


/** Adapt bounded All Indy / EBW-Fibo replay records without manufacturing evidence. */
function afUnifiedMapZone_(z,allZones){
  if(!z||![1,-1].includes(Number(z.side))||![z.lo,z.hi,z.score,z.tests,z.atr,z.knownAt].every(function(x){return typeof x==='number'&&Number.isFinite(x);}))return null;
 var peers=(allZones||[]).filter(function(p){return p&&p!==z&&Number(p.side)===Number(z.side)&&p.tf!==z.tf&&Number(p.lo)<=Number(z.hi)&&Number(p.hi)>=Number(z.lo);});
  var tfSec=Number(z.tfSec||Number(z.tfMs||0)/1000)||900;
   var maxTfSec=peers.reduce(function(v,p){return Math.max(v,Number(p.tfSec)||Number(p.tfMs||0)/1000||tfSec);},tfSec),tfKeys={};tfKeys[z.tf||tfSec]=true;peers.forEach(function(p){tfKeys[p.tf||p.tfMs/1000]=true;});
 var tags=Number(z.tags)||0;
 var tagView={source:!!(tags&AF_ZONE_TAG_.SOURCE)||z.source===true,clean:!!(tags&AF_ZONE_TAG_.CLEAN)||!!z.clean,
  struct:!!(tags&AF_ZONE_TAG_.STRUCT)||!!z.structure,disp:!!(tags&AF_ZONE_TAG_.DISP)||Number(z.departure||0)>=.60,
  liq:!!(tags&AF_ZONE_TAG_.LIQ)||!!z.sweep,nested:!!(tags&AF_ZONE_TAG_.NESTED)||!!z.nested,pd:!!(tags&AF_ZONE_TAG_.PD)||!!z.pd};
 var family=String(z.family||z.source||'SD'),familyBit=Number(z.familyBit||z.families)||0;
 var isCore=z.isDefendCore===true||[AF_ZONE_FAMILY_.SD,AF_ZONE_FAMILY_.OB,AF_ZONE_FAMILY_.QML,AF_ZONE_FAMILY_.FLIP].some(function(bit){return (familyBit&bit)!==0;})||/^(SD|OB|QML|FLIP)/i.test(family);
  var mapped=Object.assign({},z,{family:family,tfSec:tfSec,maxTfSec:maxTfSec,tfCount:Object.keys(tfKeys).length,
     isDefendCore:isCore,isLiquidityOnly:!!z.isLiquidityOnly,historyComplete:z.historyComplete===true,departed:z.departed===true,
    sourceAtr:Number(z.sourceAtr||z.atr),rawScore:Number(z.score),departureATR:Number(z.departureATR||z.departure||0),
    hasSource:tagView.source,hasClean:tagView.clean,hasStruct:tagView.struct,hasDisp:tagView.disp,hasSweep:tagView.liq,
    hasNested:tagView.nested,tags:tagView});
 mapped.role=evaluateZoneEligibility_(mapped,Number(z.atr),tfSec).role;
 return mapped;
}
function afUnifiedMapLiquidity_(l,tf,index){
  if(!l||![1,-1].includes(Number(l.side))||!Number.isFinite(Number(l.price))||!Number.isFinite(Number(l.knownAt)))return null;
  var price=Number(l.price),side=Number(l.side);
  return {id:'LIQ:'+tf+':'+String(l.knownAt)+':'+String(index),tf:tf,tfSec:AF_PLANNER_TF[tf]/1000||900,
    side:side,lo:Number.isFinite(l.lo)?l.lo:price,hi:Number.isFinite(l.hi)?l.hi:price,price:price,score:0,tests:0,knownAt:Number(l.knownAt),atr:Number(l.atr)||0,
    family:'LIQ',role:'LIQUIDITY',isLiquidityOnly:true,isDefendCore:false,historyComplete:true};
}
function afUnifiedMapFibo_(f,tf,spot,ctx){
  if(!f||![1,-1].includes(Number(f.side)))return null;
  var safety=ctx&&typeof afPlannerExecutionSafety_==='function'?afPlannerExecutionSafety_(ctx,f,null,null,Date.now()):null;
  var targets=safety&&!safety.code?safety.targets:Array.isArray(f.targets)?f.targets:[],side=Number(f.side),intrabarSafe=!safety||!safety.code&&safety.status===2;
  var pending=targets.filter(function(t){return t&&t.pending===true&&Number.isFinite(Number(t.ratio))&&Number.isFinite(Number(t.price));})
    .sort(function(a,b){return side*(Number(a.price)-Number(b.price));});
  var byRatio={};targets.forEach(function(t){if(t&&Number.isFinite(Number(t.ratio))&&Number.isFinite(Number(t.price)))byRatio[Number(t.ratio).toFixed(3)]=Number(t.price);});
  return Object.assign({},f,{tf:tf,tfSec:Number(f.tfSec)||Number(f.tfMs||0)/1000||900,zeroPrice:Number(f.zero),
    targets:targets,invalidated:!!f.invalidated,intrabarSafe:intrabarSafe,status:safety&&!safety.code?safety.status:f.status,historyComplete:f.historyComplete!==false,nextPendingTarget:pending.length?Number(pending[0].price):null,
    target1618:byRatio['1.618']||null,target2618:byRatio['2.618']||null,target4236:byRatio['4.236']||null,
    stage:f.stage, cPrice:f.cPrice||f.anchors&&f.anchors.c&&f.anchors.c.p, bPrice:f.bPrice||f.anchors&&f.anchors.b&&f.anchors.b.p});
}
function afUnifiedPrepareContext_(ctx,market){
  var rawZones=Array.isArray(ctx.zones)?ctx.zones:[],mapped=rawZones.map(function(z){return Object.assign({},z,{tfSec:Number(z.tfSec)||Number(z.tfMs||0)/1000||900});});
  var mappedAll=mapped.map(function(z){return afUnifiedMapZone_(z,mapped);}).filter(Boolean),defend=mappedAll.filter(function(z){return z.isDefendCore&&!z.isLiquidityOnly;}),all=mappedAll.slice();
  Object.keys(ctx.frames||{}).forEach(function(tf){var rows=ctx.frames[tf]&&ctx.frames[tf].liquidity||[];rows.forEach(function(l,i){var v=afUnifiedMapLiquidity_(l,tf,i);if(v)all.push(v);});});
  var spot=market&&Number.isFinite(market.bid)?market.bid:ctx.quote&&ctx.quote.bid||0;
  var chart=ctx.frames[ctx.executionTF],chartAtr=chart&&chart.atr||1,chartSec=chart&&chart.tfMs/1000||900,history=chart&&chart.closedOHLC||[],prior3=history.length>=4?history[history.length-4][5]:spot;
  mappedAll.forEach(function(z){var gap=z.side===1?Math.max(0,spot-z.hi):Math.max(0,z.lo-spot),drive=z.side===1?Math.max(0,prior3-spot)/chartAtr:Math.max(0,spot-prior3)/chartAtr;z.viewRank=afZoneViewRank_(z,gap,chartAtr,z.tfCount,z.maxTfSec,chartSec,drive);});
  var fibos=(ctx.fibos||[]).map(function(f){var owner=Object.keys(ctx.frames||{}).find(function(tf){return Number(ctx.frames[tf].tfMs)===Number(f.tfMs);})||f.tf||'15m';return afUnifiedMapFibo_(f,owner,spot,ctx);}).filter(Boolean);
  return {zones:all,fibos:fibos,defendZones:defend};
}
function afUnifiedCandidateList_(ctx,market,chartAtr){
  var p=afUnifiedPrepareContext_(ctx,market),out=[];
  p.defendZones.forEach(function(z){try{
    var plan=buildUnifiedCandidatePlan_(z,p.zones,p.fibos,market,chartAtr);
    if(!plan)return;
    // A lone zone without a compatible Fibo book is not a trade Candidate;
    // source-pair availability and a per-side gate code remain in the audit snapshot.
    if(!plan.fiboSynergy||plan.fiboSynergy.matched!==true)return;
    var zoneId=plan.zoneId||z.id||null,fiboId=plan.fiboSynergy&&plan.fiboSynergy.fiboId||null,mode=plan.setupMode||plan.fiboSynergy&&plan.fiboSynergy.mode||'NONE';
    var id='UNI:'+mode+':'+String(zoneId||'UNKNOWN')+':'+(Number(z.side)===1?'BUY':'SELL');
    var geom=plan.geom||{},targets=plan.targets||{};
    out.push({id:id,stableKey:id,side:Number(z.side),sideStr:Number(z.side)===1?'BUY':'SELL',entry:geom.entry==null?null:geom.entry,
      stop:geom.sl==null?null:geom.sl,sl:geom.sl==null?null:geom.sl,target:targets.tp==null?null:targets.tp,tp:targets.tp==null?null:targets.tp,
      netR:targets.netRR==null?null:targets.netRR,risk:geom.risk==null?null:geom.risk,eligible:!!plan.valid,valid:!!plan.valid,
      evidenceScore:plan.meta&&Number.isFinite(plan.meta.effectiveScore)?plan.meta.effectiveScore:Number(z.score)||0,viewRank:z.viewRank,setupMode:mode,zoneId:zoneId,fiboId:fiboId,
      zoneTF:z.tf||null,fiboTF:plan.fiboSynergy&&plan.fiboSynergy.fiboTf||null,meta:plan.meta||null,geom:geom,targets:targets,
      evidence:{candidateId:id,stableKey:id,zoneId:zoneId,fiboId:fiboId,zoneTF:z.tf||null,fiboTF:plan.fiboSynergy&&plan.fiboSynergy.fiboTf||null,
        policyVersion:'AF-UNIFIED-1.0',qcThreshold:65,cost:targets.costUsed==null?null:targets.costUsed,risk:geom.risk==null?null:geom.risk,spreadBefore:market.totalCost==null?market.spread:market.totalCost,setupMode:mode,meta:plan.meta||null,geom:geom,targets:targets,fibo:plan.fiboSynergy||null},gateCodes:plan.valid?[]:[plan.reason||'AF_UNIFIED_REJECTED']});
  }catch(e){out.push({id:'UNI:ERROR:'+String(z.id||''),side:z.side,zoneId:z.id,eligible:false,gateCodes:['AF_UNIFIED_CANDIDATE_ERROR']});}});
  return out.sort(function(a,b){return (b.viewRank||0)-(a.viewRank||0)||String(a.id).localeCompare(String(b.id));});
}

