/* Source adapter for EBW-Fibo 1.10.19: closed-bar Forms, family role and Book lifecycle. */
function afCopy_(x){return JSON.parse(JSON.stringify(x));}
function afAtr_(bars,n){return afRma(bars.map(function(b,i){return i?Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close)):b.high-b.low;}),n);}
function afEma_(values,n){var last=null,a=2/(n+1);return values.map(function(v){if(!Number.isFinite(v))return null;last=last===null?v:a*v+(1-a)*last;return last;});}
function afCapture_(kind,bar,i,momentum,cycle){return {kind:kind,p:kind===-1?bar.low:bar.high,r:momentum[i].rsi,t:bar.openTime,closeT:bar.closeTime,i:i,cycle:cycle,confirmed:true};}
function afTrackHead_(head,bar,prev,i,osc,rsi){
 var e=null;if(!Number.isFinite(osc))return e;var zone=osc<=20?-1:osc>=80?1:0,opposite=head.kind!==0&&zone===-head.kind;
 if(opposite&&!head.announced)e=Object.assign({},head,{confirmed:true});
 if(head.kind===0||opposite){if(zone!==0)Object.assign(head,{kind:zone,p:zone===-1?bar.low:bar.high,r:rsi,t:bar.openTime,i:i,closeT:bar.closeTime,cycle:bar.openTime,trigger:prev?(zone===-1?prev.high:prev.low):null,announced:false});}
 else{var extreme=head.kind===-1?bar.low<head.p:bar.high>head.p;if(extreme)Object.assign(head,{p:head.kind===-1?bar.low:bar.high,r:rsi,t:bar.openTime,i:i,closeT:bar.closeTime,trigger:prev?(head.kind===-1?prev.high:prev.low):null});var firstExit=!head.announced&&zone===0;if(firstExit||head.announced&&extreme)e=Object.assign({},head,{confirmed:firstExit});if(firstExit)head.announced=true;}
 return e;
}
function afPushPoint_(seq,e){if(!e)return false;var last=seq[seq.length-1];if(last&&last.kind===e.kind){if(e.kind===-1?e.p<last.p:e.p>last.p){seq[seq.length-1]=afCopy_(e);return true;}return false;}seq.push(afCopy_(e));if(seq.length>64)seq.shift();return true;}
function afPickSet_(seq,bars,momentum,i){
 var count=seq.length;if(count<3)return null;var last=seq[count-1],side=-last.kind,slot=count-3,intact=false,tooOld=false;
 for(var hop=0;hop<=Math.floor((count-3)/2);hop++){var k=count-3-hop*2,root=seq[k];if(root.kind===last.kind&&root.i<last.i&&side*(last.p-root.p)>=0){if(i-root.i<1999){slot=k;intact=true;}else tooOld=true;break;}}
 var first=seq[slot],counter=seq[slot+1];if(tooOld||first.i<0||first.i>=last.i||last.i>i||i-first.i>=1999)return null;
 var a=afCopy_(first),b={kind:counter.kind,cycle:counter.cycle,p:null},c={kind:last.kind,cycle:last.cycle,p:null};
 for(var ci=first.i;ci<=last.i;ci++){var bar=bars[ci];if(!bar)return null;var hp=last.kind===1?bar.high:bar.low,cp=counter.kind===1?bar.high:bar.low;
  if(intact&&(last.kind===1?hp>a.p:hp<a.p)){a=afCapture_(a.kind,bar,ci,momentum,a.cycle);b.p=null;c.p=null;}
  if(b.p===null||(counter.kind===1?cp>b.p:cp<b.p)){b=afCapture_(counter.kind,bar,ci,momentum,b.cycle);c=afCapture_(last.kind,bar,ci,momentum,c.cycle);}
  else if(c.p===null||(last.kind===1?hp>c.p:hp<c.p))c=afCapture_(last.kind,bar,ci,momentum,c.cycle);
 }
 if(!(a.kind===c.kind&&b.kind===-c.kind&&a.i<b.i&&b.i<c.i&&a.t<b.t&&b.t<c.t&&side*(b.p-a.p)>0&&side*(b.p-c.p)>0))return null;
 return {a:a,b:b,c:c,side:side};
}
function afBookFamilySame_(family,a,c){return !!family&&family.valid&&family.side===-c.kind&&(c.t===family.id||a.cycle===family.aCycle&&c.cycle===family.cCycle);}
function afBookFamilyRole_(family,a,b,c,neck,known){
 var valid=!!family&&family.valid&&family.side===-c.kind&&Number.isFinite(family.known)&&family.known<=known;
 var next=valid&&!afBookFamilySame_(family,a,c)&&c.cycle>family.cCycle&&c.t>family.id;
 var sequence=next&&a.cycle>=family.cCycle&&a.cycle<b.cycle&&b.cycle<c.cycle&&a.t>=family.id;
 var lo=Math.min(a.p,b.p,c.p),hi=Math.max(a.p,b.p,c.p),inside=valid&&lo>=family.lo&&hi<=family.hi;
 var preBreak=!family||family.breakT===null||family.breakT===undefined||known<=family.breakT;
 var joint=sequence&&inside&&preBreak;
 return neck||!next?0:joint?1:family.breakT!==null&&family.breakT!==undefined&&family.breakT<=known?2:0;
}
function afBookFamilyAdvance_(family,bar,known){
 if(!family||!family.valid||known<=family.known)return;
 var dead=family.side===1?bar.low<family.c||bar.low<family.a:bar.high>family.c||bar.high>family.a;
 if(dead){family.valid=false;return;}
 if(family.breakT===null&&(family.side===1?bar.high>family.b:bar.low<family.b))family.breakT=known;
 var target=family.c+(family.b-family.c)*5.472;
 if(family.breakT!==null&&family.side*((family.side===1?bar.high:bar.low)-target)>=0)family.valid=false;
}
function afFiboReplay_(bars,tfMs){
 var momentum=afMomentum(bars),contexts=afFiboMomentumContext_(bars,momentum),atr=afAtr_(bars,14),head={kind:0},seq=[],forms={1:null,'-1':null},roots={1:null,'-1':null},families={1:null,'-1':null},used={1:null,'-1':null},records=[],snapshots=[],stats={confirmedPoints:0,forms:0,breaks:0};
 for(var i=0;i<bars.length;i++){
  var bar=bars[i],m=momentum[i],ctx=contexts[i];
  [1,-1].forEach(function(side){afBookFamilyAdvance_(families[side],bar,bar.closeTime);});
  [1,-1].forEach(function(side){var root=roots[side];if(root&&(side===1?bar.low<root.origin:bar.high>root.origin))roots[side]=null;var form=forms[side];if(form&&(side===1?bar.low<form.c.p:bar.high>form.c.p)){used[side]=form.c.cycle;forms[side]=null;}});
  records=records.filter(function(r){return !(r.side===1?bar.low<r.zero||bar.low<r.root:bar.high>r.zero||bar.high>r.root);});
  records.forEach(function(r){
   if(afBookActive_(r)){
    r.legLow=Math.min(r.legLow,bar.low);r.legHigh=Math.max(r.legHigh,bar.high);r.asof=bar.closeTime;r.sourceClose=bar.closeTime;
    if(bar.openTime>r.born)afBookAdvance_(r,r.side===1?bar.high:bar.low,bar.closeTime);
   }
   r.status=afBookActive_(r)?2:r.closedKind===1?3:r.closedKind===2?5:4;
  });
  var event=afTrackHead_(head,bar,bars[i-1],i,m.k,m.rsi),changed=afPushPoint_(seq,event);
  if(changed&&event.confirmed){
   stats.confirmedPoints++;var picked=afPickSet_(seq,bars,momentum,i);
   if(picked){
    var side=picked.side,held=side*(picked.c.p-picked.a.p)>=0,root=roots[side];
    var initial=Number.isFinite(picked.a.r)&&(side===1?picked.a.r<=30||ctx.rBias===1||ctx.div===1:picked.a.r>=70||ctx.rBias===-1||ctx.div===-1);
    var rootContext=root&&picked.a.t>=root.id&&side*(picked.c.p-root.origin)>=0,breach=side===1?bar.low<picked.c.p:bar.high>picked.c.p;
    var sameRSI=side===1?ctx.lastROB===null||ctx.lastROB<picked.a.t:ctx.lastROS===null||ctx.lastROS<picked.a.t;
    var neck=!held&&sameRSI&&side*(picked.c.r-picked.a.r)>0;picked.neck=neck;
    if(((held&&(initial||rootContext))||neck)&&!breach){
     var family=families[side],prior=records.filter(function(r){return r.side===side&&r.anchors&&r.anchors.c&&r.anchors.c.t===picked.c.t;})[0],role=prior?Number(prior.role)||0:afBookFamilyRole_(family,picked.a,picked.b,picked.c,neck,bar.closeTime),mainId=prior?prior.mainId:null;
     if(!prior&&!neck){if(!family||!family.valid||(role===0&&(!afBookFamilySame_(family,picked.a,picked.c)||(family.breakT===null||family.breakT===undefined)&&family.id!==picked.c.t))){
       family={valid:true,side:side,id:picked.c.t,aCycle:picked.a.cycle,cCycle:picked.c.cycle,a:picked.a.p,b:picked.b.p,c:picked.c.p,
        lo:Math.min(picked.a.p,picked.b.p,picked.c.p),hi:Math.max(picked.a.p,picked.b.p,picked.c.p),known:bar.closeTime,breakT:null};families[side]=family;}
      mainId=family.id;
     }
     picked.role=role;picked.mainId=mainId;
     if(!rootContext||(root.neck&&!neck))roots[side]={origin:neck?picked.c.p:picked.a.p,id:neck?picked.c.t:picked.a.t,neck:neck};
     if(used[side]!==picked.c.cycle){forms[side]=afCopy_(picked);stats.forms++;}
    }
   }
  }
  var bull=forms[1],bear=forms[-1],bu=bull&&bar.openTime>bull.c.t&&bar.low>=bull.c.p&&bar.high>bull.b.p,be=bear&&bar.openTime>bear.c.t&&bar.high<=bear.c.p&&bar.low<bear.b.p;
  if(bu&&be){used[1]=bull.c.cycle;used[-1]=bear.c.cycle;forms[1]=null;forms[-1]=null;}
  else if(bu||be){
   var side=bu?1:-1,f=forms[side],family=families[side];
   if(f.role===0&&family&&family.valid&&f.mainId===family.id&&(family.breakT===null||family.breakT===undefined))family.breakT=bar.closeTime;
   var root=roots[side],r={sourceVersion:'EBW-Fibo-1.10.19',adapterVersion:'AF-FORM-CONTEXT-0.2',symbol:'XAUUSD',tfMs:tfMs,
    knownAt:bar.closeTime,asof:bar.closeTime,sourceClose:bar.closeTime,born:bar.openTime,zero:f.c.p,zeroT:f.c.t,span:f.b.p-f.c.p,root:root.origin,rootPrice:root.origin,
    side:side,method:f.neck?3:1,neck:!!f.neck,role:Number(f.role)||0,mainId:f.mainId===undefined?null:f.mainId,
    broken:true,invalidated:false,historyComplete:i>=50,id:tfMs+':'+f.c.t,hitRatios:[],hitTimes:{},
    legLow:Math.min(f.a.p,f.b.p,f.c.p,bar.low),legHigh:Math.max(f.a.p,f.b.p,f.c.p,bar.high),sourceATR:atr[i],status:2,
    anchors:{a:f.a,b:f.b,c:f.c}};
   afBookTakeover_(records,f,bar.closeTime);
   records.forEach(function(old){if(old.closedKind===2&&old.side===-side){old.status=5;old.asof=bar.closeTime;old.sourceClose=bar.closeTime;var oldFamily=families[old.side];if(oldFamily&&oldFamily.id===old.mainId)oldFamily.valid=false;}});
   afBookAdvance_(r,side===1?bar.high:bar.low,bar.closeTime);r.status=afBookActive_(r)?2:r.closedKind===1?3:5;
   if(afBookAdd_(records,r))stats.breaks++;used[side]=f.c.cycle;forms[side]=null;
  }
  snapshots.push({sourceClose:bar.closeTime,knownAt:bar.closeTime,momentumContext:afCopy_(ctx),
   records:records.map(function(r){var x=afCopy_(r);x.targets=afBookTargets_(x);return x;}),
   forms:Object.keys(forms).map(function(k){var f=forms[k];if(!f)return null;return {id:tfMs+':FORM:'+f.c.t+':'+f.side,sourceVersion:'EBW-Fibo-1.10.19',adapterVersion:'AF-FORM-CONTEXT-0.2',symbol:'XAUUSD',tfMs:tfMs,side:f.side,stage:1,broken:false,invalidated:false,historyComplete:i>=50,zero:f.c.p,zeroT:f.c.t,cPrice:f.c.p,bPrice:f.b.p,role:Number(f.role)||0,mainId:f.mainId===undefined?null:f.mainId,neck:!!f.neck,held:!f.neck,knownAt:bar.closeTime,asof:bar.closeTime,sourceClose:bar.closeTime,born:f.c.t,anchors:{a:f.a,b:f.b,c:f.c}};}).filter(Boolean)});
 }
 return {snapshots:snapshots,stats:stats};
}

/* EBW-Fibo 1.10.19: f_bookActive/HitTime/Pending/Advance/Add.
 * Source lines 715-746, 848-871. Calculation time is recognition time.
 * This module does not certify the separate Form detector or Pine parity. */
function afBookActive_(r){return !!r && r.side!==0 && (r.closedT===null||r.closedT===undefined);}
function afBookAdvance_(r,extreme,known){
 if(!afBookActive_(r)||!Number.isFinite(extreme)||!Number.isFinite(known))return;
 r.hitRatios=r.hitRatios||[];r.hitTimes=r.hitTimes||{};
 [1.618,2,2.618,3.5,4.236,5.472].forEach(function(ratio){
  if(r.side*(extreme-(r.zero+r.span*ratio))>=0){
   if(r.hitRatios.indexOf(ratio)<0)r.hitRatios.push(ratio);
   if(r.hitTimes[String(ratio)]===undefined)r.hitTimes[String(ratio)]=known;
   if(ratio===5.472){r.closedT=known;r.closedKind=1;}
  }
 });
}
function afBookTakeover_(records,frame,known){
 records.forEach(function(old){
  var first=old.method===3?1.618:2.618;
  var later=frame.a.t>=old.born&&frame.b.t>frame.a.t&&frame.c.t>frame.b.t;
  if(afBookActive_(old)&&old.side===-frame.side&&old.hitRatios.indexOf(first)>=0&&later){old.closedT=known;old.closedKind=2;}
 });
}
function afBookAdd_(records,fresh){
 if(records.some(function(r){return r.side===fresh.side&&r.id===fresh.id;}))return false;
 records.push(fresh);
 if(records.length>3){
  var discard=1,found=false;
  for(var i=0;i<records.length-1;i++)if(!afBookActive_(records[i])){discard=i;found=true;break;}
  if(!found)for(var j=0;j<records.length-1;j++)if((records[j].role||0)!==0){discard=j;break;}
  records.splice(discard,1);
 }
 return true;
}
function afBookTargets_(r){return [1.618,2,2.618,3.5,4.236,5.472].map(function(ratio){return {ratio:ratio,price:r.zero+r.span*ratio,pending:afBookActive_(r)&&r.hitRatios.indexOf(ratio)<0,hitAt:r.hitTimes&&r.hitTimes[String(ratio)]!==undefined?r.hitTimes[String(ratio)]:null};});}

/* Source Episode.step and RSI/divergence state: EBW-Fibo lines 519-543, 955-1035.
 * Context is causal: pivot recognition occurs divLen bars after its price anchor. */
function afFiboMomentumContext_(bars,momentum){
 var episode={kind:0},seq=[],bias=0,lastROS=null,lastROB=null,lowPrice=null,highPrice=null,prevLow=null,prevHigh=null,div=0,divR=null,divRef=null,fromT=null,toT=null,toPrice=null,known=null,out=[];
 bars.forEach(function(bar,i){var rr=momentum[i].rsi,kk=momentum[i].k,zone=Number.isFinite(rr)?rr<=30?-1:rr>=70?1:0:0,event=null;
  function capture(kind){return {kind:kind,p:kind===-1?bar.low:bar.high,r:rr,t:bar.openTime,i:i,closeT:bar.closeTime,trigger:i?kind===-1?bars[i-1].high:bars[i-1].low:null};}
  if(episode.kind){if(episode.kind===-1?bar.low<episode.p:bar.high>episode.p)episode=capture(episode.kind);if(zone!==episode.kind){event=afCopy_(episode);episode={kind:0};}}
  if(!episode.kind&&zone)episode=capture(zone);
  if(event){if(event.kind===-1){lastROS=event.t;lowPrice=event.p;}else{lastROB=event.t;highPrice=event.p;}
   var last=seq[seq.length-1],changed=false;if(last&&last.kind===event.kind){if(event.kind===-1?event.p<last.p:event.p>last.p){seq[seq.length-1]=event;changed=true;}}else{seq.push(event);if(seq.length>6)seq.shift();changed=true;}
   if(changed&&seq.length>=3){var a=seq[seq.length-3],z=seq[seq.length-1];bias=z.kind===-1&&z.p>=a.p?1:z.kind===1&&z.p<=a.p?-1:0;}}
  if(bias===1&&bar.low<lowPrice||bias===-1&&bar.high>highPrice)bias=0;
  [-1,1].forEach(function(side){var at=i-3;if(at<3)return;var price=side===-1?bars[at].low:bars[at].high,valid=true;
   for(var j=at-3;j<=i;j++)if(j!==at){var v=side===-1?bars[j].low:bars[j].high;if(side===-1?(j<at?v<price:v<=price):(j<at?v>price:v>=price))valid=false;}
   if(!valid)return;var prior=side===-1?prevLow:prevHigh,p={p:price,r:momentum[at].rsi,t:bars[at].openTime},opposite=side===-1?lastROB:lastROS,separated=prior&&opposite!==null&&opposite>prior.t;
   if(prior&&!separated&&Number.isFinite(p.r)&&Number.isFinite(prior.r)){
    var regular=side===-1?p.p<prior.p&&p.r>prior.r:p.p>prior.p&&p.r<prior.r,hidden=side===-1?p.p>prior.p&&p.r<prior.r:p.p<prior.p&&p.r>prior.r;
    if(regular||hidden){div=-side*(regular?1:2);divR=p.r;divRef=prior.p;fromT=prior.t;toT=p.t;toPrice=p.p;known=bar.openTime;}}
   if(side===-1)prevLow=p;else prevHigh=p;
  });
  if(div===1&&(Number.isFinite(rr)&&rr<=30&&rr<divR||Number.isFinite(kk)&&kk>=80)||div===-1&&(Number.isFinite(rr)&&rr>=70&&rr>divR||Number.isFinite(kk)&&kk<=20)||div===2&&(bar.low<divRef||Number.isFinite(rr)&&rr>=70)||div===-2&&(bar.high>divRef||Number.isFinite(rr)&&rr<=30))div=0;
  out.push({rBias:bias,lastROS:lastROS,lastROB:lastROB,div:div,divFrom:divRef,divFromT:fromT,divTo:toPrice,divToT:toT,divKnown:known});
 });return out;
}

