/* Closed OHLC primitives only. No swing, form, zone or source state-machine equivalence claimed. */
function afValidateBars(bars,tfMs,asOf) {
  if(!Array.isArray(bars)||!bars.length||!Number.isFinite(tfMs)||tfMs<=0||!Number.isFinite(asOf)) throw new Error('INVALID_SERIES');
  var prior=null;
  bars.forEach(function(b){
    if(!b||![b.openTime,b.closeTime,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.confirmed!==true||b.closeTime-b.openTime!==tfMs||b.closeTime>asOf||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.low>b.high||prior!==null&&b.openTime!==prior) throw new Error('INVALID_OR_GAPPED_SERIES');
    prior=b.closeTime;
  });
  return true;
}
function afSma(values,length) {
  return values.map(function(_,i){if(i<length-1)return null;var v=values.slice(i-length+1,i+1);return v.every(Number.isFinite)?v.reduce(function(a,b){return a+b;},0)/length:null;});
}
function afRma(values,length) {
  var out=[],seed=[],last=null;
  values.forEach(function(v){
    if(!Number.isFinite(v)){out.push(null);return;}
    if(last===null){seed.push(v);if(seed.length===length)last=seed.reduce(function(a,b){return a+b;},0)/length;}
    else last=(last*(length-1)+v)/length;
    out.push(last);
  });return out;
}
function afMomentum(bars) {
  var gains=[null],losses=[null];
  for(var i=1;i<bars.length;i++){var change=bars[i].close-bars[i-1].close;gains.push(Math.max(change,0));losses.push(Math.max(-change,0));}
  var up=afRma(gains,14),down=afRma(losses,14);
  var rsi=up.map(function(u,i){return u===null||down[i]===null?null:down[i]===0?(u===0?null:100):u===0?0:100-100/(1+u/down[i]);});
  var raw=bars.map(function(b,i){if(i<8)return null;var window=bars.slice(i-8,i+1),hi=Math.max.apply(null,window.map(function(v){return v.high;})),lo=Math.min.apply(null,window.map(function(v){return v.low;}));return hi===lo?null:100*(b.close-lo)/(hi-lo);});
  var k=afSma(raw,3),d=afSma(k,3);
  return bars.map(function(b,i){return {closeTime:b.closeTime,rsi:rsi[i],raw:raw[i],k:k[i],d:d[i]};});
}
function afLatestKnowable(packets,decisionClose) {
  var result=null;
  packets.forEach(function(p){if(Number.isFinite(p.sourceClose)&&Number.isFinite(p.knownAt)&&p.sourceClose<=decisionClose&&p.knownAt<=decisionClose&&p.knownAt>=p.sourceClose&&(!result||p.sourceClose>result.sourceClose))result=p;});
  return result;
}

