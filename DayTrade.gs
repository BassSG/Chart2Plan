/* Shared deterministic policy. No AI/network/clock reads, no daily cutoff.
 * Rolling expiry starts at acceptance; hold starts at modeled fill recognition.
 * Frozen deadlines require observed closed M1 coverage, never wall-clock outcomes. */
var AF_DAYTRADE_RULES=Object.freeze({version:'AF-DAYTRADE-ROLLING-1',maxEntryDistanceATR:6,pendingMinutes:60,maxHoldMinutes:240});
function afDayTradeHorizon_(acceptedAt){
 if(!Number.isFinite(acceptedAt)||acceptedAt<=0)throw Error('AF_DAYTRADE_TIME_INVALID');
 return {version:AF_DAYTRADE_RULES.version,model:'ROLLING',pendingMinutes:AF_DAYTRADE_RULES.pendingMinutes,
  maxHoldMinutes:AF_DAYTRADE_RULES.maxHoldMinutes,pendingDeadline:acceptedAt+AF_DAYTRADE_RULES.pendingMinutes*60000};
}
function afDayTradeDistance_(ctx,c){
 var side=c.side===1||c.side==='BUY'?1:c.side===-1||c.side==='SELL'?-1:0;
 var atr=ctx.frames&&ctx.frames[ctx.executionTF]&&ctx.frames[ctx.executionTF].atr;
 var quote=ctx.quote||{},reference=side===1?quote.ask:quote.bid,entry=c.entry;
 if(!side||![atr,reference,entry].every(function(n){return typeof n==='number'&&Number.isFinite(n);})||atr<=0||reference<=0||entry<=0)return {code:'AF_DAYTRADE_DISTANCE_DATA_INVALID'};
 var distance=side*(reference-entry),limit=atr*AF_DAYTRADE_RULES.maxEntryDistanceATR;
 // One billionth of a tick absorbs floating point arithmetic at the boundary only.
 var tolerance=0.01*1e-9;
 return {code:distance<0?'AF_LIMIT_ALREADY_MARKETABLE':distance>limit+tolerance?'AF_ENTRY_TOO_FAR_FROM_MARKET':null,
  referencePrice:reference,distance:distance,distanceATR:distance/atr,maxDistanceATR:AF_DAYTRADE_RULES.maxEntryDistanceATR};
}
function afRunDayTrade_(ctx,candidates){
 return candidates.map(function(original){
  var c=afPlannerClean_(original),eligible=c.eligible===true&&c.valid!==false;
  c.valid=eligible;c.eligible=eligible;c.evidence=c.evidence||{};c.gateCodes=Array.isArray(c.gateCodes)?c.gateCodes:[];
  // Present the same precomputed geometry for legacy and unified candidates.
  if(!c.geom)c.geom={entry:c.entry,sl:c.stop,tp:c.target,target:c.target};
  c.targets=Object.assign({},c.targets||{},{tp:c.target,netRR:c.netR});
  if(ctx.style==='daytrade'){
   c.evidence.dayTradeRules=afPlannerClean_(AF_DAYTRADE_RULES);
   if(eligible){var distance=afDayTradeDistance_(ctx,c);c.evidence.entryDistance=distance;
    if(distance.code){c.valid=false;c.eligible=false;if(c.gateCodes.indexOf(distance.code)<0)c.gateCodes.push(distance.code);}}
  }
  return c;
 });
}
