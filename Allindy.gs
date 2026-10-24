/* New strict entry policy using source canonical S/D, source EMA pullback,
 * six EBW stage machines and WaveTrend math. Not full Pine finalBuy/finalSell:
 * no QML/OB/flip/family merging/edge ranking or visual MTF clusters. */
function afPivotUnique_(bars,i,n,key){var p=i-n;if(p<n)return null;var v=bars[p][key];for(var k=p-n;k<=i;k++)if(k!==p&&(key==='high'?bars[k][key]>=v:bars[k][key]<=v))return null;return {p:v,t:bars[p].openTime,knownAt:bars[i].closeTime};}
function afZoneScore_(z,seq){var q=Math.min(35,z.quality*12+Math.min(1,z.departure/1.5)*20+(z.clean?6:0)+(z.source?7:0)+(z.imbalance?4:0)),st=Math.min(25,(z.structure?16:0)+(z.sweep?10:0)),loc=z.pd?4:0,fresh=z.tests===0?15:z.tests===1?7:z.tests===2?-8:-20;return Math.max(0,Math.min(100,q+st+loc+fresh-Math.min(10,(seq-z.bornSeq)*10/800)));}
function afZoneReplay_(bars,tfMs,tick,minSnapshotTime){
 var atr=afAtr_(bars,14),zones=[],liquidity=[],h=null,l=null,snapshots=[];
 for(var i=0;i<bars.length;i++){var bar=bars[i],av=atr[i];
  zones=zones.filter(function(z){return i-z.bornSeq<=800&&!(z.side===1?bar.close<z.lo-z.atr*.08:bar.close>z.hi+z.atr*.08);});
  zones.forEach(function(z){var hit=bar.low<=z.hi&&bar.high>=z.lo;if(hit&&!z.touching)z.tests++;z.touching=hit;z.score=afZoneScore_(z,i);});
  liquidity=liquidity.filter(function(x){return x.side===1?bar.low>=x.price:bar.high<=x.price;});
  var ph=afPivotUnique_(bars,i,3,'high'),pl=afPivotUnique_(bars,i,3,'low');if(ph){h=ph;liquidity.push({side:-1,price:ph.p,knownAt:bar.closeTime});}if(pl){l=pl;liquidity.push({side:1,price:pl.p,knownAt:bar.closeTime});}if(liquidity.length>80)liquidity=liquidity.slice(-80);
  if(i>=4&&Number.isFinite(av)&&av>0){var base=bars[i-1],approach=bars[i-2],prior=bars[i-3],old=bars[i-4],body=Math.abs(base.close-base.open)/Math.max(base.high-base.low,tick),leave=Math.abs(bar.close-bar.open)/Math.max(bar.high-bar.low,tick),compact=body<=.35;
   [1,-1].forEach(function(side){var departure=side===1?bar.close>bar.open&&leave>=.52&&bar.close>base.high:bar.close<bar.open&&leave>=.52&&bar.close<base.low;
    if(!compact||!departure||approach.close===approach.open)return;
    var lo=side===1?base.low:Math.min(base.open,base.close),hi=side===1?Math.max(base.open,base.close):base.high;
    var dep=side===1?Math.max(0,bar.high-hi)/av:Math.max(0,lo-bar.low)/av,sweep=side===1?base.low<Math.min(approach.low,prior.low):base.high>Math.max(approach.high,prior.high),structure=side===1?bar.close>Math.max(approach.high,prior.high,old.high):bar.close<Math.min(approach.low,prior.low,old.low),pd=h&&l&&h.p>l.p&&(side===1?hi<=(h.p+l.p)/2:lo>=(h.p+l.p)/2),clean=dep>=.75;
    var z={id:tfMs+':SD:'+bar.openTime+':'+side,tfMs:tfMs,side:side,lo:lo,hi:hi,atr:av,knownAt:bar.closeTime,bornSeq:i-1,tests:0,touching:false,quality:Math.min(1,.38+(1-body)*.38+(structure?.10:0)+(sweep?.08:0)+.06),departure:dep,structure:structure,sweep:sweep,pd:!!pd,clean:clean,source:clean&&structure&&dep>=.90,imbalance:side===1?bar.low>approach.high:bar.high<approach.low,pattern:side===1?(approach.close>approach.open?'RBR':'DBR'):(approach.close>approach.open?'RBD':'DBD')};
    z.score=afZoneScore_(z,i);zones.push(z);
   });
  }
  if(zones.length>110)zones=zones.slice(-110);
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
 ['5m','15m','1h','4h'].forEach(function(tf){zoneSets[tf]=afZoneReplay_(pack[tf],{'5m':300000,'15m':900000,'1h':3600000,'4h':14400000}[tf],tick,bars[0].openTime);zonePointers[tf]=-1;});
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
  var zones=[],liqs=[];Object.keys(zoneSets).forEach(function(tf){var ptr=zonePointers[tf],list=zoneSets[tf];while(ptr+1<list.length&&list[ptr+1].sourceClose<=bar.openTime)ptr++;zonePointers[tf]=ptr;if(ptr>=0){zones=zones.concat(list[ptr].zones);liqs=liqs.concat(list[ptr].liquidity);}});
  var sourceL=fired.P||fired.L1||fired.L2,sourceS=fired.D||fired.S1||fired.S2,raw=series['5m'][i],recentOS=false,recentOB=false;
  for(var j=Math.max(0,i-9);j<=i;j++){var r=series['5m'][j];recentOS=recentOS||r.rsi<25&&r.raw<15;recentOB=recentOB||r.rsi>75&&r.raw>85;}
  if(i>0){sourceL=sourceL||cross(wt1[i],wt2[i],wt1[i-1],wt2[i-1],true)&&wt2[i]<=-75&&recentOS;sourceS=sourceS||cross(wt1[i],wt2[i],wt1[i-1],wt2[i-1],false)&&wt2[i]>=75&&recentOB;sourceL=sourceL||cross(bar.close,maFast[i],prev.close,maFast[i-1],true)&&bar.low<=maFast[i]&&maFast[i]>maSlow[i]&&bar.close>bar.open;sourceS=sourceS||cross(bar.close,maFast[i],prev.close,maFast[i-1],false)&&bar.high>=maFast[i]&&maFast[i]<maSlow[i]&&bar.close<bar.open;}
  var proposals=[],previousATR=atr[i-1],range=Math.max(bar.high-bar.low,tick),tr=prev?Math.max(range,Math.abs(bar.high-prev.close),Math.abs(bar.low-prev.close)):range;
  if(i>=50&&previousATR>0&&htfAt>=50&&i-lastSignal>=3&&tr<=previousATR*2.5&&Math.abs(maFast[i]-maSlow[i])>=previousATR*.10&&Math.abs(bar.close-maFast[i])<=previousATR*1.25){[1,-1].forEach(function(side){var trigger=side===1?sourceL:sourceS,htfOK=side===1?htfFast[htfAt]>htfSlow[htfAt]&&pack['15m'][htfAt].close>htfSlow[htfAt]:htfFast[htfAt]<htfSlow[htfAt]&&pack['15m'][htfAt].close<htfSlow[htfAt];if(!trigger||!htfOK||side*(bar.close-bar.open)<=0||Math.abs(bar.close-bar.open)/range<.30)return;
   var candidates=zones.filter(function(z){var gap=side===1?Math.max(0,bar.close-z.hi):Math.max(0,z.lo-bar.close),rejected=side===1?bar.low<=z.hi&&bar.high>=z.lo&&bar.close>z.hi:bar.high>=z.lo&&bar.low<=z.hi&&bar.close<z.lo;return z.side===side&&z.tests<=1&&z.score>=62&&z.hi-z.lo<=z.atr*2.5&&gap<=atr[i]*.35&&rejected&&!(side===1?bar.close<z.lo-z.atr*.08:bar.close>z.hi+z.atr*.08);}).sort(function(a,b){return b.score-a.score;});if(!candidates.length)return;var z=candidates[0],distal=side===1?z.lo:z.hi,anchors=liqs.filter(function(q){var gap=(distal-q.price)*side;return q.side===side&&gap>=0&&gap<=atr[i]*1.5;}).sort(function(a,b){return side*(a.price-b.price);}),mapped=anchors.length?anchors[0].price:null,anchor=side===1?Math.min(z.lo,bar.low,mapped===null?z.lo:mapped):Math.max(z.hi,bar.high,mapped===null?z.hi:mapped),bufferATR=mapped!==null&&Math.abs(distal-mapped)/atr[i]<=.60?.25:.18,entry=Math.round(bar.close/tick)*tick,stop=side===1?Math.min(anchor-Math.max(tick*2,previousATR*bufferATR),entry-previousATR*.75):Math.max(anchor+Math.max(tick*2,previousATR*bufferATR),entry+previousATR*.75);stop=(side===1?Math.floor(stop/tick):Math.ceil(stop/tick))*tick;var risk=side*(entry-stop);if(risk>previousATR*2.5)return;
   var obstacles=zones.filter(function(q){return q.side===-side&&(side===1?q.hi>=entry:q.lo<=entry);}).map(function(q){return side===1?Math.max(entry,q.lo):Math.min(entry,q.hi);}).concat(liqs.filter(function(q){return q.side===-side&&side*(q.price-entry)>0;}).map(function(q){return q.price;}));if(!obstacles.length)return;obstacles.sort(function(a,b){return side*(a-b);});var target=side===1?Math.min(obstacles[0],entry+risk*2):Math.max(obstacles[0],entry-risk*2);if(side*(target-entry)<previousATR*.75)return;
   proposals.push({sourceVersion:'All-Indy-1.3.5',adapterVersion:'AF-STRICT-SD-0.1',symbol:'XAUUSD',tfMs:300000,knownAt:bar.closeTime,signalClose:bar.closeTime,confirmed:true,historyComplete:true,zoneValid:true,finalSignal:true,zoneId:z.id,signalId:'AF:'+bar.closeTime+':'+side,side:side,entry:entry,stop:stop,target:target,zone:z});
  });}
  if(proposals.length===1)lastSignal=i;else if(proposals.length>1)proposals=[];
  outputs.push({sourceClose:bar.closeTime,knownAt:bar.closeTime,proposals:proposals,readiness:{ebw:ready},zoneCount:zones.length,diagnostics:{sourceLong:!!sourceL,sourceShort:!!sourceS,actionableZoneCount:zones.filter(function(z){return z.tests<=1&&z.score>=62;}).length,maxZoneScore:zones.reduce(function(v,z){return Math.max(v,z.score);},0),previousATR:previousATR,maGap:Math.abs(maFast[i]-maSlow[i]),htfReady:htfAt>=50},stages:afCopy_(machines)});
 }
 return outputs;
}
