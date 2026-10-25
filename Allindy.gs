/* Zone registry and risk rules follow the named All Indy source calculations.
 * The separate legacy Allindy signal-state replay below is still not a complete
 * port of Pine finalBuy/finalSell or its visual cluster-selection engine. */
function afPivotUnique_(bars,i,n,key){var p=i-n;if(p<n)return null;var v=bars[p][key];for(var k=p-n;k<=i;k++)if(k!==p&&(key==='high'?bars[k][key]>=v:bars[k][key]<=v))return null;return {p:v,t:bars[p].openTime,knownAt:bars[i].closeTime};}
var AF_ZONE_FAMILY_={PIVOT:1,SD:2,SWING:4,OB:8,FLIP:16,IMPULSE:32,FVG:64,QML:128,LIQ:256,IDM:512,WAVE:1024};
var AF_ZONE_TAG_={DISP:1,LIQ:2,STRUCT:4,PD:8,CLEAN:16,SOURCE:32,IMBALANCE:64,NESTED:128,EQUAL:256,IDM:512};
function afZoneHas_(mask,bit){return (Number(mask||0)&bit)!==0;}
function afZoneIsDefendCore_(z){var families=Number(z.families||z.familyBit)||0;return z.isDefendCore===true||[AF_ZONE_FAMILY_.SD,AF_ZONE_FAMILY_.OB,AF_ZONE_FAMILY_.QML,AF_ZONE_FAMILY_.FLIP].some(function(bit){return afZoneHas_(families,bit);});}
function afZoneScore_(z,seq,maxAge){
 var quality=Math.max(0,Math.min(1,Number(z.quality)||0))*12;
 var departure=Math.min(1,Math.max(0,Number(z.departureATR||z.departure)||0)/1.5)*20;
 var tags=Number(z.tags)||0,families=Number(z.families||z.familyBit)||0;
 var structure=afZoneHas_(tags,AF_ZONE_TAG_.STRUCT)?16:0,sweep=afZoneHas_(tags,AF_ZONE_TAG_.LIQ)?10:0;
 var fresh=z.historyComplete===false||!z.departed?0:z.tests===0?15:z.tests===1?7:z.tests===2?-8:-20;
 var familyCount=0;for(var bit=1;bit<=AF_ZONE_FAMILY_.WAVE;bit*=2)if(afZoneHas_(families,bit))familyCount++;
 var diversity=Math.min(Math.max(0,familyCount-1),4)*2,location=afZoneHas_(tags,AF_ZONE_TAG_.PD)?4:0;
 var cleanSource=(afZoneHas_(tags,AF_ZONE_TAG_.CLEAN)?6:0)+(afZoneHas_(tags,AF_ZONE_TAG_.SOURCE)?7:0);
 var qmlBonus=afZoneHas_(families,AF_ZONE_FAMILY_.QML)?7:0,nestedBonus=afZoneHas_(tags,AF_ZONE_TAG_.NESTED)?5:0;
 var imbalanceBonus=afZoneHas_(tags,AF_ZONE_TAG_.IMBALANCE)?4:0,baseBars=Number(z.baseBars)||0;
 var spending=baseBars<=2?0:Math.min(12,(baseBars-2)*4),age=Math.min(10,Math.max(0,(seq-Number(z.sourceBornSeq||z.bornSeq||0))*10/(maxAge||800)));
 var weak=families===AF_ZONE_FAMILY_.PIVOT?15:families===AF_ZONE_FAMILY_.IMPULSE?10:families===AF_ZONE_FAMILY_.SWING?6:families===AF_ZONE_FAMILY_.FVG?4:families===AF_ZONE_FAMILY_.WAVE?6:0;
 // Pine defaults to Grouped evidence. MTF breadth and HTF context remain zero in both models.
 var raw=Math.min(35,quality+departure+cleanSource+imbalanceBonus)+Math.min(25,structure+sweep+qmlBonus)+Math.min(25,diversity+location+nestedBonus)+fresh;
 if(z.scoreModel==='Legacy weights')raw=quality+departure+structure+sweep+fresh+0+0+diversity+location+cleanSource+qmlBonus+nestedBonus+imbalanceBonus;
 return Math.max(0,Math.min(100,raw-spending-age-weak));
}
function afZoneRole_(z,score){
 var tags=Number(z.tags)||0,families=Number(z.families||z.familyBit)||0;
 var core=afZoneIsDefendCore_(z);
 var cleanHtf=afZoneHas_(tags,AF_ZONE_TAG_.CLEAN)&&Number(z.departureATR||z.departure||0)>=.75;
 var evidence=afZoneHas_(tags,AF_ZONE_TAG_.SOURCE)||afZoneHas_(tags,AF_ZONE_TAG_.NESTED)||afZoneHas_(families,AF_ZONE_FAMILY_.QML)||cleanHtf||
  afZoneHas_(tags,AF_ZONE_TAG_.STRUCT)&&afZoneHas_(tags,AF_ZONE_TAG_.DISP);
 var liquidity=z.isLiquidityOnly===true||!core&&[AF_ZONE_FAMILY_.SWING,AF_ZONE_FAMILY_.LIQ,AF_ZONE_FAMILY_.IDM].some(function(bit){return afZoneHas_(families,bit);})&&!afZoneHas_(families,AF_ZONE_FAMILY_.FVG);
 return liquidity?'LIQUIDITY':z.tests>=2?'REACTION':core&&score>=76&&evidence?'MAJOR':'REACTION';
}
function afZoneDirectLimitOK_(z){var role=afZoneRole_(z,Number(z.score)||afZoneScore_(z,Number(z.sourceSeq||z.bornSeq||0)));return role==='MAJOR'?z.tests<=1:role==='REACTION'&&Number(z.score)>=70&&z.tests===0;}
function afZoneAdaptiveDepth_(z,anchor,chartATR){var role=afZoneRole_(z,Number(z.score)||afZoneScore_(z,Number(z.sourceSeq||z.bornSeq||0))),score=Number(z.score)||0;
 var depth=z.tests===0?(role==='MAJOR'?(score>=90?.28:.33):(score>=70?.45:.52)):(role==='MAJOR'?.50:.58);
 var distal=z.side===1?z.lo:z.hi,atr=Number(chartATR||z.atr||z.sourceAtr||0),extension=anchor===null||anchor===undefined||!(atr>0)?0:Math.abs(distal-anchor)/atr;
 return Math.min(.65,depth+Math.min(.12,extension*.08));}
function afZoneViewRank_(z,gap,chartATR,tfCount,maxTfSeconds,chartSeconds,drive){var role=['MAJOR','REACTION','LIQUIDITY'].indexOf(z.role)>=0?z.role:afZoneRole_(z,Number(z.score)||0),tfRatio=Number(maxTfSeconds||0)/Math.max(Number(chartSeconds||1),1),relevance=tfRatio>=12?10:tfRatio>=6?8:tfRatio>=3?5:0;
 var bonus=Math.min(8,Math.max(0,(Number(tfCount||1)-1)*3)),distancePenalty=role==='MAJOR'?1.35:role==='REACTION'?3.8:2.2;
 var tags=Number(z.tags)||0,liqBonus=role==='LIQUIDITY'?(afZoneHas_(tags,AF_ZONE_TAG_.EQUAL)?16:afZoneHas_(tags,AF_ZONE_TAG_.IDM)?10:4):0;
 var freshness=role!=='LIQUIDITY'?(z.tests===0?4:z.tests===1?1:-8):0;
 var approach=z.isDefendCore===true&&gap<=Number(chartATR||0)*2?Math.min(6,Math.max(0,Number(drive||0))*3):0;
 return Number(z.score||0)+bonus+relevance-approach+liqBonus+freshness-Number(gap||0)/Math.max(Number(chartATR||0),.01)*distancePenalty;}
function afZoneAuditReplay_(bars,lo,hi,side,origin,end,atr,departedAtOrigin){
 var a={tests:0,touching:false,departed:!!departedAtOrigin,complete:Number.isInteger(origin)&&origin>=0&&end>=origin&&end-origin<=300&&atr>0,broken:false,seq:end,bornSeq:origin};
 if(!a.complete)return a;
 for(var k=origin+1;k<=end;k++){var b=bars[k];if(!b){a.complete=false;continue;}
  if(side===1?b.close<lo-atr*.08:b.close>hi+atr*.08)a.broken=true;
  if(!a.departed){if(side===1?b.close>hi:b.close<lo){a.departed=true;a.touching=false;}}
  else{var hit=b.low<=hi&&b.high>=lo;if(hit&&!a.touching)a.tests++;a.touching=hit;}
 }
 return a;
}
function afZoneReplay_(bars,tfMs,tick,minSnapshotTime,chartLocal){
 var atr=afAtr_(bars,14),zones=[],liquidity=[],highs=[],lows=[],h=null,l=null,snapshots=[],qmlSeen={},zoneSeen={},liquiditySeen={},obSide=0,pendingHigh=null,pendingLow=null,structureSide=0,latestSD={1:null,'-1':null},doChartLocal=chartLocal!==false;
 function addZone(side,lo,hi,source,eventTime,knownAt,family,quality,departure,tags,baseBars,bornSeq,atrValue,audit){
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<lo||!Number.isFinite(atrValue)||atrValue<=0||!Number.isFinite(knownAt))return null;
  if(audit&&audit.broken)return null;
  var id=tfMs+':'+source+':'+eventTime+':'+side;if(zoneSeen[id])return zoneSeen[id];
  var familyBit=AF_ZONE_FAMILY_[family],z={id:id,tfMs:tfMs,side:side,lo:lo,hi:hi,atr:atrValue,sourceAtr:atrValue,
   knownAt:knownAt,sourceClose:knownAt,bornSeq:bornSeq,sourceBornSeq:bornSeq,sourceSeq:audit?audit.seq:bornSeq,tests:audit?audit.tests:0,touching:audit?audit.touching:false,wasTouching:audit?audit.touching:false,
   historyComplete:audit?audit.complete:true,departed:audit?audit.departed:true,quality:quality,departure:departure,departureATR:departure,tags:tags,family:source,families:familyBit,familyBit:familyBit,
   baseBars:baseBars,source:!!(tags&AF_ZONE_TAG_.SOURCE),clean:!!(tags&AF_ZONE_TAG_.CLEAN),structure:!!(tags&AF_ZONE_TAG_.STRUCT),
   sweep:!!(tags&AF_ZONE_TAG_.LIQ),pd:!!(tags&AF_ZONE_TAG_.PD),imbalance:!!(tags&AF_ZONE_TAG_.IMBALANCE),isDefendCore:[AF_ZONE_FAMILY_.SD,AF_ZONE_FAMILY_.OB,AF_ZONE_FAMILY_.QML,AF_ZONE_FAMILY_.FLIP].indexOf(familyBit)>=0};
  z.score=afZoneScore_(z,z.sourceSeq,800);z.role=afZoneRole_(z,z.score);zones.push(z);zoneSeen[id]=z;return z;
 }
 function addLiq(side,price,source,eventTime,knownAt,quality){
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(knownAt))return;
  var id=tfMs+':'+source+':'+eventTime+':'+side;if(liquiditySeen[id])return;
  var family=/(^|-)SW-[HL]$/.test(source)?AF_ZONE_FAMILY_.SWING:source==='IDM-H'||source==='IDM-L'?AF_ZONE_FAMILY_.IDM:AF_ZONE_FAMILY_.LIQ;
  var factor=family===AF_ZONE_FAMILY_.SWING ? 0.55 : family===AF_ZONE_FAMILY_.IDM ? 0.40 : 0.45,band=Math.max(tick*2,(Number(atr[i])||tick)*.06)*factor;
  if(source.indexOf('CHART-')===0)band=Math.max(tick*2,(Number(atr[i])||tick)*.055);
  var tag=family===AF_ZONE_FAMILY_.LIQ?AF_ZONE_TAG_.EQUAL:family===AF_ZONE_FAMILY_.IDM?AF_ZONE_TAG_.IDM:0;
  var row={id:id,side:side,price:price,lo:price-band,hi:price+band,atr:atr[i],knownAt:knownAt,tags:tag,
   source:source,family:source,families:family,familyBit:family,role:'LIQUIDITY',isLiquidityOnly:true,quality:quality||.5,score:afZoneScore_({quality:quality||.5,departure:0,tags:tag,families:family,baseBars:0,tests:0,departed:true,historyComplete:true,bornSeq:i},i,800)};
  liquidity.push(row);liquiditySeen[id]=row;
 }
 function body(b){return Math.abs(b.close-b.open)/Math.max(b.high-b.low,tick);}
 for(var i=0;i<bars.length;i++){var bar=bars[i],av=atr[i];latestSD={1:null,'-1':null};
  zones=zones.filter(function(z){var probe=z.side===1?bar.close:bar.close,broken=z.side===1?probe<z.lo-z.atr*.08:probe>z.hi+z.atr*.08;return i-z.bornSeq<=800&&!broken;});
  zones.forEach(function(z){var hit=bar.low<=z.hi&&bar.high>=z.lo;if(z.departed){if(hit&&!z.touching)z.tests++;z.touching=hit;}else if(z.side===1?bar.close>z.hi:bar.close<z.lo){z.departed=true;z.touching=false;}z.wasTouching=z.touching;z.sourceSeq=i;z.score=afZoneScore_(z,i,800);z.role=afZoneRole_(z,z.score);});
  liquidity=liquidity.filter(function(x){return x.side===1?bar.low>=x.price:bar.high<=x.price;});
  var ph=afPivotUnique_(bars,i,3,'high'),pl=afPivotUnique_(bars,i,3,'low'),chartPH=doChartLocal?afPivotUnique_(bars,i,5,'high'):null,chartPL=doChartLocal?afPivotUnique_(bars,i,5,'low'):null;
  if(ph){h=ph;highs.unshift({p:ph.p,t:ph.t,idx:i-3});addLiq(-1,ph.p,'SW-H',ph.t,bar.closeTime,.38);}
  if(pl){l=pl;lows.unshift({p:pl.p,t:pl.t,idx:i-3});addLiq(1,pl.p,'SW-L',pl.t,bar.closeTime,.38);}
  highs=highs.slice(0,4);lows=lows.slice(0,4);
  var band=Math.max(tick*2,(av||tick)*.055),h0=highs[0],h1=highs[1],l0=lows[0],l1=lows[1],haveRange=h0&&l0&&h0.p>l0.p,eqTol=(av||tick)*.16;
  if(h0&&h1&&h0.t!==h1.t&&Math.abs(h0.p-h1.p)<=eqTol)addLiq(-1,(h0.p+h1.p)/2,'EQH',Math.max(h0.t,h1.t),bar.closeTime,.55);
  if(l0&&l1&&l0.t!==l1.t&&Math.abs(l0.p-l1.p)<=eqTol)addLiq(1,(l0.p+l1.p)/2,'EQL',Math.max(l0.t,l1.t),bar.closeTime,.55);
   if(i>=4&&av>0){
    var d=bars[i],base=bars[i-1],p3=bars[i-2],p4=bars[i-3],p5=bars[i-4];
    var range1=Math.max(d.high-d.low,tick),range2=Math.max(base.high-base.low,tick),range3=Math.max(p3.high-p3.low,tick),range4=Math.max(p4.high-p4.low,tick);
    var body1=body(d),body2=body(base),body3=body(p3),body4=body(p4),compact=body2<=.35;
    var leaveBull=d.close>d.open&&body1>=.52&&d.close>base.high,leaveBear=d.close<d.open&&body1>=.52&&d.close<base.low;
    var rbr=compact&&p3.close>p3.open&&leaveBull,dbr=compact&&p3.close<p3.open&&leaveBull;
    var rbd=compact&&p3.close>p3.open&&leaveBear,dbd=compact&&p3.close<p3.open&&leaveBear;
    var fiveDemand=p5.close>p5.open&&p4.close<p4.open&&p3.close<p3.open&&base.close>base.open&&d.close>d.open;
    var fiveSupply=p5.close<p5.open&&p4.close>p4.open&&p3.close>p3.open&&base.close<base.open&&d.close<d.open;
    var threeDemand=p3.close>p3.open&&(compact||base.close<base.open)&&d.close>d.open&&d.low>base.low&&d.close>base.high;
    var threeSupply=p3.close<p3.open&&(compact||base.close>base.open)&&d.close<d.open&&d.high<base.high&&d.close<base.low;
    var weak4=body4<.30,strongDemand=(p4.close<p4.open||weak4)&&p3.close-p3.open>range3*.60&&base.close>base.open&&base.close>p3.close&&p3.low>p4.low;
    var strongSupply=(p4.close>p4.open||weak4)&&p3.open-p3.close>range3*.60&&base.close<base.open&&base.close<p3.close&&p3.high<p4.high;
    var primaryDemand=rbr||dbr,primarySupply=rbd||dbd;
    var demandLo=primaryDemand||threeDemand?base.low:fiveDemand?Math.min(p4.low,p3.low):strongDemand?p3.low:null;
    var demandHi=primaryDemand||threeDemand?Math.max(base.open,base.close):fiveDemand?Math.max(Math.max(p4.open,p4.close),Math.max(p3.open,p3.close)):strongDemand?p3.open:null;
    var supplyHi=primarySupply||threeSupply?base.high:fiveSupply?Math.max(p4.high,p3.high):strongSupply?p3.high:null;
    var supplyLo=primarySupply||threeSupply?Math.min(base.open,base.close):fiveSupply?Math.min(Math.min(p4.open,p4.close),Math.min(p3.open,p3.close)):strongSupply?p3.open:null;
    var demandBaseBars=demandLo===null?0:fiveDemand&&!primaryDemand&&!threeDemand?2:1;
    var supplyBaseBars=supplyLo===null?0:fiveSupply&&!primarySupply&&!threeSupply?2:1;
    var demandDep=demandHi===null?0:Math.max(0,d.high-demandHi)/av,supplyDep=supplyLo===null?0:Math.max(0,supplyLo-d.low)/av;
    var demandSweep=demandLo!==null&&base.low<Math.min(p3.low,p4.low),supplySweep=supplyHi!==null&&base.high>Math.max(p3.high,p4.high);
    var priorHigh=Math.max(p3.high,p4.high,p5.high),priorLow=Math.min(p3.low,p4.low,p5.low);
    var demandStruct=demandHi!==null&&d.close>priorHigh,supplyStruct=supplyLo!==null&&d.close<priorLow;
    var equilibrium=haveRange?(h0.p+l0.p)/2:null,demandPD=haveRange&&demandHi!==null&&demandHi<=equilibrium,supplyPD=haveRange&&supplyLo!==null&&supplyLo>=equilibrium;
    var demandClean=demandLo!==null&&demandDep>=.75&&demandBaseBars<=2,supplyClean=supplyLo!==null&&supplyDep>=.75&&supplyBaseBars<=2;
    var demandSource=demandClean&&demandStruct&&demandDep>=.90,supplySource=supplyClean&&supplyStruct&&supplyDep>=.90;
    var demandQuality=Math.max(0,Math.min(1,.38+(primaryDemand?1-body2:fiveDemand?1-(body3+body4)*.5:threeDemand?1-body2:strongDemand?1-body4:0)*.38+(demandStruct?0.10:0)+(demandSweep?0.08:0)+(primaryDemand?0.06:0)));
    var supplyQuality=Math.max(0,Math.min(1,.38+(primarySupply?1-body2:fiveSupply?1-(body3+body4)*.5:threeSupply?1-body2:strongSupply?1-body4:0)*.38+(supplyStruct?0.10:0)+(supplySweep?0.08:0)+(primarySupply?0.06:0)));
    var demandTags=(demandDep>=.60?AF_ZONE_TAG_.DISP:0)+(demandSweep?AF_ZONE_TAG_.LIQ:0)+(demandStruct?AF_ZONE_TAG_.STRUCT:0)+(demandPD?AF_ZONE_TAG_.PD:0)+(demandClean?AF_ZONE_TAG_.CLEAN:0)+(demandSource?AF_ZONE_TAG_.SOURCE:0)+(d.low>p3.high?AF_ZONE_TAG_.IMBALANCE:0);
    var supplyTags=(supplyDep>=.60?AF_ZONE_TAG_.DISP:0)+(supplySweep?AF_ZONE_TAG_.LIQ:0)+(supplyStruct?AF_ZONE_TAG_.STRUCT:0)+(supplyPD?AF_ZONE_TAG_.PD:0)+(supplyClean?AF_ZONE_TAG_.CLEAN:0)+(supplySource?AF_ZONE_TAG_.SOURCE:0)+(d.high<p3.low?AF_ZONE_TAG_.IMBALANCE:0);
    [[1,demandLo,demandHi,demandQuality,demandDep,demandTags,demandBaseBars,primaryDemand?(rbr?'RBR':'DBR'):threeDemand?'SD-3':'SD-5'],
     [-1,supplyLo,supplyHi,supplyQuality,supplyDep,supplyTags,supplyBaseBars,primarySupply?(rbd?'RBD':'DBD'):threeSupply?'SD-3':'SD-5']].forEach(function(q){
      var side=q[0],lo=q[1],hi=q[2];if(!Number.isFinite(lo)||!Number.isFinite(hi))return;
      var origin=side===1?(primaryDemand||threeDemand?i-1:fiveDemand?i-3:i-2):(primarySupply||threeSupply?i-1:fiveSupply?i-3:i-2),audit=afZoneAuditReplay_(bars,lo,hi,side,origin,i,av,false);
      var zone=addZone(side,lo,hi,'SD-'+q[7],d.openTime,d.closeTime,'SD',q[3],q[4],q[5],q[6],origin,av,audit);if(zone){zone.pattern=q[7];latestSD[side]=zone;}
     });
   // Three-candle fair-value gap from the two closed candles around the middle bar.
   var older=bars[i-2];
   if(d.low>older.high){var depB=(d.low-older.high)/av;addZone(1,older.high,d.low,'FVG-B',d.openTime,d.closeTime,'FVG',.46,depB,AF_ZONE_TAG_.IMBALANCE+(depB>=.35?AF_ZONE_TAG_.DISP:0),0,i,av);}
   if(d.high<older.low){var depS=(older.low-d.high)/av;addZone(-1,d.high,older.low,'FVG-S',d.openTime,d.closeTime,'FVG',.46,depS,AF_ZONE_TAG_.IMBALANCE+(depS>=.35?AF_ZONE_TAG_.DISP:0),0,i,av);}
   if(base.low<p3.low&&d.close>base.high)addLiq(1,base.low,'IDM-L',d.openTime,bar.closeTime,.5);
   if(base.high>p3.high&&d.close<base.low)addLiq(-1,base.high,'IDM-H',d.openTime,bar.closeTime,.5);
  }
  // Four alternating confirmed pivots form a QML; activate only after the head and break.
  if(h0&&h1&&l0&&l1&&h0.p>h1.p&&l0.p<l1.p){
   var bullShape=l1.t<h1.t&&h1.t<l0.t&&l0.t<h0.t,bearShape=h1.t<l1.t&&l1.t<h0.t&&h0.t<l0.t;
   [[1,bullShape,l1,h1,l0,h0,Math.max(0,h0.p-h1.p)/av],[ -1,bearShape,h1,l1,h0,l0,Math.max(0,l1.p-l0.p)/av]].forEach(function(q){var side=q[0],shape=q[1],shoulder=q[2],level=q[3],head=q[4],stamp=q[5],departure=q[6];if(!shape)return;
    var key=side+':'+stamp.t;if(qmlSeen[key])return;var activation=null;
    for(var qi=head.idx+1;qi<=i;qi++)if(side===1?bars[qi].close>level.p:bars[qi].close<level.p){activation=qi;break;}
    if(activation!==null){qmlSeen[key]=true;var qmlAtr=atr[i]||av,a=Math.max(tick*2,qmlAtr*.06),sd=latestSD[side],nested=!!sd&&shoulder.p>=sd.lo-qmlAtr*.1&&shoulder.p<=sd.hi+qmlAtr*.1;
     var tags=AF_ZONE_TAG_.STRUCT+(departure>=.6?AF_ZONE_TAG_.DISP:0)+(nested?AF_ZONE_TAG_.NESTED:0)+
      (haveRange&&(side===1?shoulder.p<=(h0.p+l0.p)/2:shoulder.p>=(h0.p+l0.p)/2)?AF_ZONE_TAG_.PD:0);
     var qlo=shoulder.p-a,qhi=shoulder.p+a,qmAudit=afZoneAuditReplay_(bars,qlo,qhi,side,activation,i,qmlAtr,true);
     var zone=addZone(side,qlo,qhi,'QML-'+(side===1?'B':'S'),stamp.t,bars[activation].closeTime,'QML',.78,departure,tags,1,activation,qmlAtr,qmAudit);
     if(zone){zone.nested=nested;zone.qmlAudit={shoulderT:shoulder.t,headT:head.t,eventT:stamp.t,breakPrice:level.p,activationT:bars[activation].closeTime,checked:bar.closeTime,tests:qmAudit.tests,broken:qmAudit.broken,complete:qmAudit.complete};}
    }
   });
  }
  // Chart-source volume order blocks, using ten left/right confirmation bars.
  var ob=10,pv=i-ob;
  if(doChartLocal&&pv>=ob&&i>=ob*2){var vol=Number(bars[pv].volume||0),pivotVol=vol>0;
   for(var oi=pv-ob;oi<=pv+ob;oi++)if(oi!==pv&&Number(bars[oi].volume||0)>=vol)pivotVol=false;
   var recentHigh=-Infinity,recentLow=Infinity,closeLow=Infinity,closeHigh=-Infinity;
   for(var oj=i-ob+1;oj<=i;oj++){recentHigh=Math.max(recentHigh,bars[oj].high);recentLow=Math.min(recentLow,bars[oj].low);}
   for(var oj2=i-ob;oj2<=i;oj2++){closeLow=Math.min(closeLow,bars[oj2].close);closeHigh=Math.max(closeHigh,bars[oj2].close);}
   if(bars[pv].high>recentHigh)obSide=-1;else if(bars[pv].low<recentLow)obSide=1;
   if(pivotVol&&obSide===1&&closeLow>=bars[pv].low){var obHigh=(bars[pv].high+bars[pv].low)/2,mid=(bars[pv].low+obHigh)/2,dep=Math.max(0,bar.close-mid)/av,obAtr=atr[pv]||av;addZone(1,bars[pv].low,obHigh,'OB-UP',bars[pv].openTime,bar.closeTime,'OB',.74,dep,(dep>=.6?AF_ZONE_TAG_.DISP:0)+(dep>=.85?AF_ZONE_TAG_.CLEAN:0),1,pv,obAtr,afZoneAuditReplay_(bars,bars[pv].low,obHigh,1,pv,i,obAtr,false));}
   if(pivotVol&&obSide===-1&&closeHigh<=bars[pv].high){var obLow=(bars[pv].high+bars[pv].low)/2,mid2=(obLow+bars[pv].high)/2,dep2=Math.max(0,mid2-bar.close)/av,obAtr2=atr[pv]||av;addZone(-1,obLow,bars[pv].high,'OB-DOWN',bars[pv].openTime,bar.closeTime,'OB',.74,dep2,(dep2>=.6?AF_ZONE_TAG_.DISP:0)+(dep2>=.85?AF_ZONE_TAG_.CLEAN:0),1,pv,obAtr2,afZoneAuditReplay_(bars,obLow,bars[pv].high,-1,pv,i,obAtr2,false));}
  }
  // Pine keeps OB and Flip/Breaker chart-local. Other TFs contribute their source packet registry.
  if(doChartLocal){
   if(pendingHigh&&bar.close>pendingHigh.p){structureSide=1;var depUp=Math.max(0,bar.close-pendingHigh.p)/av,flipLo=pendingHigh.p-av*.18,flipHi=pendingHigh.p+av*.18;addZone(1,flipLo,flipHi,'FLIP-UP',bar.openTime,bar.closeTime,'FLIP',.70,depUp,AF_ZONE_TAG_.STRUCT+(depUp>=.55?AF_ZONE_TAG_.DISP:0)+(depUp>=.75?AF_ZONE_TAG_.CLEAN:0),1,i,av,afZoneAuditReplay_(bars,flipLo,flipHi,1,i,i,av,bar.close>flipHi));pendingHigh=null;}
   if(pendingLow&&bar.close<pendingLow.p){structureSide=-1;var depDn=Math.max(0,pendingLow.p-bar.close)/av,flipLo2=pendingLow.p-av*.18,flipHi2=pendingLow.p+av*.18;addZone(-1,flipLo2,flipHi2,'FLIP-DOWN',bar.openTime,bar.closeTime,'FLIP',.70,depDn,AF_ZONE_TAG_.STRUCT+(depDn>=.55?AF_ZONE_TAG_.DISP:0)+(depDn>=.75?AF_ZONE_TAG_.CLEAN:0),1,i,av,afZoneAuditReplay_(bars,flipLo2,flipHi2,-1,i,i,av,bar.close<flipLo2));pendingLow=null;}
   if(chartPH){pendingHigh=chartPH;addLiq(-1,chartPH.p,'CHART-SW-H',chartPH.t,bar.closeTime,.36);}
   if(chartPL){pendingLow=chartPL;addLiq(1,chartPL.p,'CHART-SW-L',chartPL.t,bar.closeTime,.36);}
  }
  if(zones.length>220)zones=zones.slice(-220);if(liquidity.length>160)liquidity=liquidity.slice(-160);
  var snapshot={sourceClose:bar.closeTime,knownAt:bar.closeTime,zones:afCopy_(zones),liquidity:afCopy_(liquidity)};if(minSnapshotTime&&bar.closeTime<minSnapshotTime)snapshots[0]=snapshot;else snapshots.push(snapshot);
 }
 return snapshots;
}
function afAggregateClosed_(bars,fromMs,toMs){var groups={};bars.forEach(function(b){var t=Math.floor(b.openTime/toMs)*toMs;(groups[t]||(groups[t]=[])).push(b);});var out=[];Object.keys(groups).map(Number).sort(function(a,b){return a-b;}).forEach(function(t){var a=groups[t];if(a.length!==toMs/fromMs||a[0].openTime!==t||a.some(function(b,i){return b.openTime!==t+i*fromMs;}))return;out.push({openTime:t,closeTime:t+toMs,open:a[0].open,close:a[a.length-1].close,high:Math.max.apply(null,a.map(function(b){return b.high;})),low:Math.min.apply(null,a.map(function(b){return b.low;})),volume:a.reduce(function(s,b){return s+(b.volume||0);},0),spread:a[a.length-1].spread,confirmed:true});});return out;}
function afStageTick_(machine,next,terminal,trigger,invalid,i){var fired=false,expired=machine.stage>0&&machine.started!==null&&i-machine.started>=100;if(invalid||expired){machine.stage=0;machine.started=null;}else if(machine.stage===terminal&&trigger){fired=true;machine.stage=0;machine.started=null;}else{if(machine.stage===0&&next>0)machine.started=i;if(next===0)machine.started=null;machine.stage=next;}return fired;}
function afAllindyReplay_(pack,tick){
 var bars=pack['5m'],atr=afAtr_(bars,14),series={},pointers={},zoneSets={},zonePointers={},maFast=afEma_(bars.map(function(b){return b.close;}),20),maSlow=afEma_(bars.map(function(b){return b.close;}),50),htfFast=afEma_(pack['15m'].map(function(b){return b.close;}),20),htfSlow=afEma_(pack['15m'].map(function(b){return b.close;}),50);
 // M3 must come from complete closed M1 buckets, never substitute M5 for L2.
 var momentumPack=Object.assign({},pack,{'3m':afAggregateClosed_(pack['1m'],60000,180000)});
 ['1m','3m','5m','15m','30m','1h','4h'].forEach(function(tf){series[tf]=afMomentum(momentumPack[tf]);pointers[tf]=-1;});
 ['5m','15m','1h','4h'].forEach(function(tf){zoneSets[tf]=afZoneReplay_(pack[tf],{'5m':300000,'15m':900000,'1h':3600000,'4h':14400000}[tf],tick,bars[0].openTime,tf==='5m');zonePointers[tf]=-1;});
 var wtSource=bars.map(function(b){return (b.high+b.low+b.close)/3;}),esa=afEma_(wtSource,9),de=afEma_(wtSource.map(function(v,i){return Math.abs(v-esa[i]);}),9),ci=wtSource.map(function(v,i){return de[i]>0?(v-esa[i])/(.015*de[i]):0;}),wt1=afEma_(ci,12),wt2=afSma(wt1,3),names=['P','L1','L2','D','S1','S2'],machines={},last5=null,last15=null,lastSignal=-999,outputs=[],htfAt=-1;
 names.forEach(function(n){machines[n]={stage:0,started:null};});
 function cross(a,b,ap,bp,up){return [a,b,ap,bp].every(Number.isFinite)&&(up?a>b&&ap<=bp:a<b&&ap>=bp);}
 for(var i=0;i<bars.length;i++){var bar=bars[i],s={},ready=true;
  var mapping={m1:'1m',m3:'3m',m5:'5m',m15:'15m',m30:'30m',m60:'1h',m240:'4h'};
  Object.keys(mapping).forEach(function(k){var tf=mapping[k],limit=['1m','3m','5m'].indexOf(tf)>=0?bar.closeTime:bar.openTime,seq=series[tf],ptr=pointers[tf];while(ptr+1<seq.length&&seq[ptr+1].closeTime<=limit)ptr++;pointers[tf]=ptr;s[k]=ptr>=0?seq[ptr]:{rsi:null,k:null,d:null};if(!Number.isFinite(s[k].rsi)||!Number.isFinite(s[k].k)||!Number.isFinite(s[k].d))ready=false;});
  var p5=pointers['5m'],p15=pointers['15m'],old5=series['5m'][p5-1],old15=series['15m'][p15-1],new5=last5!==s.m5.closeTime,new15=last15!==s.m15.closeTime;
  s.kdDown5=!!old5&&new5&&cross(s.m5.k,s.m5.d,old5.k,old5.d,false);s.kdUp5=!!old5&&new5&&cross(s.m5.k,s.m5.d,old5.k,old5.d,true);s.kUp20_15=!!old15&&new15&&cross(s.m15.k,20,old15.k,20,true);s.kDown80_5=!!old5&&new5&&cross(s.m5.k,80,old5.k,80,false);
  var prev=bars[i-1],bull=!!prev&&prev.close<prev.open&&bar.close>prev.high,bear=!!prev&&prev.close>prev.open&&bar.close<prev.low,invalid={P:!ready||s.m30.k>50||s.m15.k>50,L1:!ready||s.m30.rsi>50||s.m15.rsi>70,L2:!ready||s.m30.rsi>50||s.m15.rsi>70,D:!ready||s.m15.k<40||s.m60.k<50,S1:!ready||s.m5.rsi<30||s.m60.rsi<50,S2:!ready||s.m15.rsi<50||s.m60.rsi<50},term={P:10,L1:12,L2:12,D:10,S1:15,S2:9},nextFns={P:afNextP_,L1:afNextL1_,L2:afNextL2_,D:afNextD_,S1:afNextS1_,S2:afNextS2_},fired={};
  names.forEach(function(n){fired[n]=afStageTick_(machines[n],nextFns[n](machines[n].stage,s),term[n],['P','L1','L2'].indexOf(n)>=0?bull:bear,invalid[n],i);});last5=s.m5.closeTime;last15=s.m15.closeTime;
  while(htfAt+1<pack['15m'].length&&pack['15m'][htfAt+1].closeTime<=bar.openTime)htfAt++;
  var zones=[],liqs=[];Object.keys(zoneSets).forEach(function(tf){var ptr=zonePointers[tf],list=zoneSets[tf],tfMs={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000}[tf];while(ptr+1<list.length&&list[ptr+1].sourceClose<=bar.openTime)ptr++;zonePointers[tf]=ptr;if(ptr>=0){zones=zones.concat(list[ptr].zones.map(function(z){return Object.assign({tf:tf,tfSec:tfMs/1000},z);}));liqs=liqs.concat(list[ptr].liquidity.map(function(q){return Object.assign({tf:tf,tfSec:tfMs/1000},q);}));}});
  var sourceL=fired.P||fired.L1||fired.L2,sourceS=fired.D||fired.S1||fired.S2,raw=series['5m'][i],recentOS=false,recentOB=false;
  for(var j=Math.max(0,i-9);j<=i;j++){var r=series['5m'][j];recentOS=recentOS||r.rsi<25&&r.raw<15;recentOB=recentOB||r.rsi>75&&r.raw>85;}
  if(i>0){sourceL=sourceL||cross(wt1[i],wt2[i],wt1[i-1],wt2[i-1],true)&&wt2[i]<=-75&&recentOS;sourceS=sourceS||cross(wt1[i],wt2[i],wt1[i-1],wt2[i-1],false)&&wt2[i]>=75&&recentOB;sourceL=sourceL||cross(bar.close,maFast[i],prev.close,maFast[i-1],true)&&bar.low<=maFast[i]&&maFast[i]>maSlow[i]&&bar.close>bar.open;sourceS=sourceS||cross(bar.close,maFast[i],prev.close,maFast[i-1],false)&&bar.high>=maFast[i]&&maFast[i]<maSlow[i]&&bar.close<bar.open;}
  var proposals=[],previousATR=atr[i-1],range=Math.max(bar.high-bar.low,tick),tr=prev?Math.max(range,Math.abs(bar.high-prev.close),Math.abs(bar.low-prev.close)):range;
  if(i>=50&&previousATR>0&&htfAt>=50&&i-lastSignal>=3&&tr<=previousATR*2.5&&Math.abs(maFast[i]-maSlow[i])>=previousATR*.10&&Math.abs(bar.close-maFast[i])<=previousATR*1.25){[1,-1].forEach(function(side){var trigger=side===1?sourceL:sourceS,htfOK=side===1?htfFast[htfAt]>htfSlow[htfAt]&&pack['15m'][htfAt].close>htfSlow[htfAt]:htfFast[htfAt]<htfSlow[htfAt]&&pack['15m'][htfAt].close<htfSlow[htfAt];if(!trigger||!htfOK||side*(bar.close-bar.open)<=0||Math.abs(bar.close-bar.open)/range<.30)return;
   var candidates=zones.filter(function(z){var gap=side===1?Math.max(0,bar.close-z.hi):Math.max(0,z.lo-bar.close),rejected=side===1?bar.low<=z.hi&&bar.high>=z.lo&&bar.close>z.hi:bar.high>=z.lo&&bar.low<=z.hi&&bar.close<z.lo;return z.side===side&&z.isDefendCore&&afZoneDirectLimitOK_(z)&&z.hi-z.lo<=z.atr*2.5&&gap<=atr[i]*6&&rejected&&!(side===1?bar.close<z.lo-z.atr*.08:bar.close>z.hi+z.atr*.08);}).map(function(z){
    var peers=zones.filter(function(p){return p!==z&&p.side===z.side&&p.tf!==z.tf&&p.lo<=z.hi&&p.hi>=z.lo;}),tfNames={};tfNames[z.tf]=true;var maxTf=Number(z.tfSec)||300;
    peers.forEach(function(p){tfNames[p.tf]=true;maxTf=Math.max(maxTf,Number(p.tfSec)||0);});var tfCount=Object.keys(tfNames).length,gap=side===1?Math.max(0,bar.close-z.hi):Math.max(0,z.lo-bar.close),prev3=bars[Math.max(0,i-3)],drive=side===1?Math.max(0,prev3.close-bar.close)/Math.max(atr[i],tick):Math.max(0,bar.close-prev3.close)/Math.max(atr[i],tick);
    return {zone:z,rank:afZoneViewRank_(z,gap,atr[i],tfCount,maxTf,300,drive)};
   }).sort(function(a,b){return b.rank-a.rank;});if(!candidates.length)return;var z=candidates[0].zone,distal=side===1?z.lo:z.hi,anchors=liqs.filter(function(q){var gap=(distal-q.price)*side;return q.side===side&&gap>=0&&gap<=atr[i]*1.5;}).sort(function(a,b){return side*(a.price-b.price);}),mapped=anchors.length?anchors[0].price:null,protect=side===1?Math.min(z.lo,mapped===null?z.lo:mapped):Math.max(z.hi,mapped===null?z.hi:mapped),depth=afZoneAdaptiveDepth_(z,mapped,atr[i]),rawEntry=side===1?z.hi-depth*(z.hi-z.lo):z.lo+depth*(z.hi-z.lo),entry=(side===1?Math.floor(rawEntry/tick):Math.ceil(rawEntry/tick))*tick,bufferATR=mapped!==null&&Math.abs(distal-mapped)/atr[i]<=.60?.25:.15,buffer=Math.max(tick*2,atr[i]*bufferATR),stop=side===1?Math.min(protect-buffer,entry-previousATR*.75):Math.max(protect+buffer,entry+previousATR*.75);stop=(side===1?Math.floor(stop/tick):Math.ceil(stop/tick))*tick;var risk=side*(entry-stop);if(risk<previousATR*.75||risk>previousATR*2.5)return;if(side===1?entry>=bar.close:entry<=bar.close)return;
   var obstacles=zones.filter(function(q){var fvg=(Number(q.families||q.familyBit||0)&AF_ZONE_FAMILY_.FVG)!==0;return q.side===-side&&(q.isDefendCore||fvg)&&q.score>=28&&(side===1?q.lo>entry:q.hi<entry);}).map(function(q){return side===1?q.lo:q.hi;}).concat(liqs.filter(function(q){return q.side===-side&&side*(q.price-entry)>0;}).map(function(q){return q.price;}));if(!obstacles.length)return;obstacles.sort(function(a,b){return side*(a-b);});var target=obstacles[0],reward=side*(target-entry),cost=Number(bar.spread||0)+.02,netR=(reward-cost)/(risk+cost);if(reward<previousATR*.75||netR<1.5)return;
   proposals.push({sourceVersion:'All-Indy-1.3.5',adapterVersion:'AF-STRICT-SD-0.1',symbol:'XAUUSD',tfMs:300000,knownAt:bar.closeTime,signalClose:bar.closeTime,confirmed:true,historyComplete:true,zoneValid:true,finalSignal:true,zoneId:z.id,signalId:'AF:'+bar.closeTime+':'+side,side:side,entry:entry,stop:stop,target:target,zone:z});
  });}
  if(proposals.length===1)lastSignal=i;else if(proposals.length>1)proposals=[];
  outputs.push({sourceClose:bar.closeTime,knownAt:bar.closeTime,proposals:proposals,readiness:{ebw:ready},zoneCount:zones.length,diagnostics:{sourceLong:!!sourceL,sourceShort:!!sourceS,actionableZoneCount:zones.filter(function(z){return z.tests<=1&&z.score>=62;}).length,maxZoneScore:zones.reduce(function(v,z){return Math.max(v,z.score);},0),previousATR:previousATR,maGap:Math.abs(maFast[i]-maSlow[i]),htfReady:htfAt>=50},stages:afCopy_(machines)});
 }
 return outputs;
}

