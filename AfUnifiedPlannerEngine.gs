/**
 * AfUnifiedPlannerEngine.gs
 * ผสานตรรกะ All Indy 1.3.5 + EBW-Fibo 1.10.19 สำหรับระบบ Chart2Plan
 * คำนวณสิทธิ์ Direct Limit, Adaptive Entry, Protective SL, Fibo/Liquidity TP และ Net RR ล่วงหน้า
 */

var AF_UNIFIED_CONFIG = {
  // All Indy 1.3.5 Core Parameters (Adjusted for 0-htfContext compensation)
  minActionScore: 62.0,
  majorScore: 72.0,          // ปรับจาก 76 -> 72 เพื่อชดเชย htfContext=0 ใน 1.3.5
  directReactionScore: 65.0, // ปรับจาก 70 -> 65 สำหรับโซน Fresh (tests=0) ที่มี Structure/Clean
  reactionMinScore: 28.0,
  blockingObstacleScore: 62.0, // เฉพาะโซน Actionable (score >= 62) เท่านั้นที่บล็อกเป้า Fibo ได้
  maxActionTests: 1,
  maxWidthATR: 2.5,

  // Risk & Stop Parameters
  minStopATR: 0.75,
  maxStopATR: 2.50,
  baseInvalidBufferATR: 0.15,
  stopBufferATR: 0.18,
  anchorSearchATR: 1.50,
  sweepRiskATR: 0.60,
  sweepBufferATR: 0.25,
  requireAnchorStrict: false, // อนุญาตใช้ Distal POI / Fibo C 0% ได้เมื่อโซนเป็น MAJOR หรือมี Sweep Tag

  // Target & Reward Parameters
  minRoomATR: 0.75,
  minPlanR: 1.0,
  minNetR: 1.50,
  maxTargetCapR: 4.50,        // ขยายเพดานให้รองรับเป้า Fibo 161.8% - 261.8%

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

  // ชดเชยคะแนน HTF Relevance (0-8 คะแนน) หากตัวคำนวณส่ง raw score ที่ตัด htfContext=0 มา
  const tfSec = Number(zone.maxTfSec || zone.tfSec || chartSec || 900);
  const tfRatio = chartSec > 0 ? tfSec / chartSec : 1;
  const htfBonus = zone.htfCompensated ? 0 : (tfRatio >= 12 ? 8.0 : tfRatio >= 4 ? 5.0 : tfRatio >= 2 ? 3.0 : 0.0);
  const mtfBonus = Math.min(6.0, Math.max(0, (Number(zone.tfCount || 1) - 1) * 3.0));
  const effectiveScore = Math.min(100.0, Number(zone.score || 0) + htfBonus + mtfBonus);

  const tags = zone.tags || {};
  const hasSource = Boolean(tags.source || zone.hasSource);
  const hasClean = Boolean(tags.clean || zone.hasClean);
  const hasStruct = Boolean(tags.struct || zone.hasStruct);
  const hasDisp = Boolean(tags.disp || zone.hasDisp);
  const hasSweep = Boolean(tags.liq || zone.hasSweep);
  const hasNested = Boolean(tags.nested || zone.hasNested);
  const isQml = String(zone.family || zone.source || '').toUpperCase().includes('QML');

  const cleanHtf = hasClean && Number(zone.departureATR || 0) >= 0.75;
  const majorEvidence = hasSource || hasNested || isQml || cleanHtf || (hasStruct && hasDisp);

  const tests = Number(zone.tests || 0);
  const width = Math.abs(Number(zone.hi) - Number(zone.lo));
  const sourceAtr = Number(zone.sourceAtr || chartAtr || 1);
  const widthOK = width <= sourceAtr * AF_UNIFIED_CONFIG.maxWidthATR;
  const historyComplete = zone.historyComplete !== false;
  const departed = zone.departed !== false;

  let role = 'REACTION';
  if (isLiquidityOnly) {
    role = 'LIQUIDITY';
  } else if (tests >= 2) {
    role = 'REACTION';
  } else if (isDefendCore && effectiveScore >= AF_UNIFIED_CONFIG.majorScore && majorEvidence) {
    role = 'MAJOR';
  }

  const actionable = historyComplete && departed && widthOK && isDefendCore &&
    tests <= AF_UNIFIED_CONFIG.maxActionTests && effectiveScore >= AF_UNIFIED_CONFIG.minActionScore;

  // สิทธิ์วาง Direct Limit:
  // - MAJOR: tests <= 1
  // - REACTION: tests == 0 และ (effectiveScore >= 65 พร้อม majorEvidence หรือ effectiveScore >= 70)
  const directLimitOK = actionable && (
    (role === 'MAJOR' && tests <= 1) ||
    (role === 'REACTION' && tests === 0 && (
      effectiveScore >= 70.0 ||
      (effectiveScore >= AF_UNIFIED_CONFIG.directReactionScore && (majorEvidence || hasSweep))
    ))
  );

  return {
    role,
    rawScore: Number(zone.score || 0),
    effectiveScore: Number(effectiveScore.toFixed(2)),
    isDefendCore,
    isLiquidityOnly,
    widthOK,
    actionable,
    directLimitOK,
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
  const entry = roundToTick_(rawEntry, mintick, side === 1 ? 'nearest' : 'nearest');

  // ตรวจสอบ Protective Anchor หรือ Fibo C (0%) ที่อยู่ด้านหลังโซน
  let effectiveAnchor = anchor;
  if (effectiveAnchor === null && fiboContext && fiboContext.zeroPrice) {
    const fibZero = Number(fiboContext.zeroPrice);
    const fibGap = side === 1 ? (lo - fibZero) : (fibZero - hi);
    if (fibGap >= 0 && fibGap <= chartAtr * AF_UNIFIED_CONFIG.anchorSearchATR) {
      effectiveAnchor = fibZero;
    }
  }

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
    return { valid: false, reason: 'ENTRY_NOT_LIMIT_SIDE_OF_SPOT', meta, geom };
  }
  if (!meta.directLimitOK) {
    return { valid: false, reason: 'DIRECT_LIMIT_SCORE_OR_ROLE_INSUFFICIENT', meta, geom };
  }
  if (!geom.anchorOK || !geom.stopOK) {
    return { valid: false, reason: !geom.anchorOK ? 'NO_PROTECTIVE_ANCHOR' : 'STOP_GEOMETRY_OUT_OF_BOUNDS', meta, geom };
  }

  // ตรวจหาสิ่งกีดขวางฝั่งตรงข้าม:
  // แยกเป็น (1) Hard Blocking Obstacle (Actionable Defend Zone score >= 62 และ tests <= 1)
  // และ (2) Minor Reaction Obstacle (score 28..61) สำหรับแจ้งเตือน ไม่บล็อก TP หลัก
  let hardObstaclePrice = null;
  let minorObstaclePrice = null;

  for (const z of (allZones || [])) {
    if (Number(z.side) === -side) {
      const oppMeta = evaluateZoneEligibility_(z, chartAtr, market.chartSec || 900);
      const isFvg = String(z.family || z.source || '').toUpperCase().includes('FVG');
      if ((oppMeta.isDefendCore || isFvg) && oppMeta.effectiveScore >= AF_UNIFIED_CONFIG.reactionMinScore) {
        const oppEdge = side === 1 ? Number(z.lo) : Number(z.hi);
        const isAhead = side === 1 ? (oppEdge > geom.entry) : (oppEdge < geom.entry);
        if (isAhead) {
          const isHardBlocker = oppMeta.isDefendCore && Number(z.tests || 0) <= 1 &&
            oppMeta.effectiveScore >= AF_UNIFIED_CONFIG.blockingObstacleScore;
          if (isHardBlocker) {
            if (hardObstaclePrice === null || Math.abs(oppEdge - geom.entry) < Math.abs(hardObstaclePrice - geom.entry)) {
              hardObstaclePrice = oppEdge;
            }
          } else {
            if (minorObstaclePrice === null || Math.abs(oppEdge - geom.entry) < Math.abs(minorObstaclePrice - geom.entry)) {
              minorObstaclePrice = oppEdge;
            }
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
      if (isAhead && Math.abs(candidate - geom.entry) >= chartAtr * AF_UNIFIED_CONFIG.minRoomATR) {
        if (nearestLiquidityTarget === null || Math.abs(candidate - geom.entry) < Math.abs(nearestLiquidityTarget - geom.entry)) {
          nearestLiquidityTarget = candidate;
        }
      }
    }
  }

  // เลือก TP หลักจาก (1) เป้า Fibo ที่สอดคล้อง (2) Nearest Liquidity (3) ขอบหน้า Hard Obstacle
  const fibTarget = fibMatch && fibMatch.nextTarget ? Number(fibMatch.nextTarget) : null;
  let rawTarget = fibTarget || nearestLiquidityTarget || hardObstaclePrice;

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

  // Cap ไม่เกิน maxTargetCapR
  const maxCapPrice = side === 1
    ? geom.entry + geom.risk * AF_UNIFIED_CONFIG.maxTargetCapR
    : geom.entry - geom.risk * AF_UNIFIED_CONFIG.maxTargetCapR;
  const cappedTarget = side === 1 ? Math.min(rawTarget, maxCapPrice) : Math.max(rawTarget, maxCapPrice);
  const tp = roundToTick_(cappedTarget, mintick, side === 1 ? 'down' : 'up');

  const grossReward = (tp - geom.entry) * side;
  const grossRR = geom.risk > 0 ? grossReward / geom.risk : 0;
  const netRR = geom.risk > 0 ? (grossReward - cost) / (geom.risk + cost) : 0;

  const roomOK = grossReward >= chartAtr * AF_UNIFIED_CONFIG.minRoomATR &&
    (hardObstaclePrice === null || Math.abs(hardObstaclePrice - geom.entry) >= chartAtr * AF_UNIFIED_CONFIG.minRoomATR);
  const rrOK = grossRR >= AF_UNIFIED_CONFIG.minPlanR && netRR >= AF_UNIFIED_CONFIG.minNetR;

  return {
    valid: Boolean(fibMatch.matched && roomOK && rrOK),
    reason: !fibMatch.matched ? 'NO_FIBO_SYNERGY_MATCH' : (!roomOK ? 'HARD_OBSTACLE_TOO_CLOSE' : (!rrOK ? 'NET_RR_BELOW_MIN' : 'OK')),
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
      minorObstacleWatch: minorObstaclePrice,
      grossRR: Number(grossRR.toFixed(2)),
      netRR: Number(netRR.toFixed(2)),
      costUsed: cost
    }
  };
}

/**
 * 5) จับคู่ Fibo 3 โหมด (TREND_CONTINUATION / HTF_PULLBACK_SYNC / FORM_PRE_BREAK_SNIPER)
 */
function matchFiboSynergy_(coreZone, side, fibos, chartAtr) {
  const list = Array.isArray(fibos) ? fibos : [];
  const zLo = Number(coreZone.lo);
  const zHi = Number(coreZone.hi);

  // โหมด 1: TREND_CONTINUATION (มี Fibo ฝั่งเดียวกันที่ broken=true, invalidated=false, มี pending target)
  const sameSideActive = list.filter(f =>
    Number(f.side) === side && f.broken === true && !f.invalidated && f.historyComplete !== false && f.nextPendingTarget
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
      note: 'Aligned with active broken Fibo extension'
    };
  }

  // โหมด 2: HTF_PULLBACK_SYNC (มี Fibo ฝั่งสวนของ TF เล็กที่วิ่งมาถึงโซนเป้าระดับ 161.8% - 423.6% ทับกับโซนพอดี)
  const counterExhaustion = list.filter(f => {
    if (Number(f.side) !== -side || !f.broken || f.invalidated) return false;
    const t1618 = Number(f.target1618 || 0);
    const t2618 = Number(f.target2618 || 0);
    const t4236 = Number(f.target4236 || 0);
    const tol = chartAtr * 0.35;
    const hitsZone = [t1618, t2618, t4236].some(t => t > 0 && t >= (zLo - tol) && t <= (zHi + tol));
    return hitsZone;
  });
  if (counterExhaustion.length > 0) {
    const cFib = counterExhaustion[0];
    return {
      matched: true,
      mode: 'HTF_PULLBACK_SYNC',
      fiboId: cFib.id,
      fiboTf: cFib.tf,
      zeroPrice: zLo,
      nextTarget: cFib.zero || null,
      note: 'Counter-leg Fibo exhaustion clusters inside defend POI'
    };
  }

  // โหมด 3: FORM_PRE_BREAK_SNIPER (มี Form ฝั่งเดียวกันที่ยืนยันจุด C แล้ว รอเบรกหัว B)
  const pendingForms = list.filter(f =>
    Number(f.side) === side && f.stage === 1 && !f.invalidated &&
    Number(f.cPrice) <= zHi + chartAtr * 0.25 && Number(f.cPrice) >= zLo - chartAtr * 0.25
  );
  if (pendingForms.length > 0) {
    const pForm = pendingForms[0];
    return {
      matched: true,
      mode: 'FORM_PRE_BREAK_SNIPER',
      fiboId: pForm.id,
      fiboTf: pForm.tf,
      zeroPrice: pForm.cPrice,
      nextTarget: pForm.bPrice || pForm.target1618 || null,
      note: 'Confirmed Form C-anchor rests on defend POI'
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
