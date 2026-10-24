// Source: production Mt5MarketData.js. GET-only subset, no EA/queue/lifecycle writes.
var AF_MT5_DEFAULT_URL = typeof AF_MT5_DEFAULT_URL !== 'undefined' ? AF_MT5_DEFAULT_URL : "https://anything-mrna-work-voted.trycloudflare.com";
var AF_MT5_RUN = typeof AF_MT5_RUN !== 'undefined' ? AF_MT5_RUN : {responses:{},quote:null,metadata:null};

function afMt5Config_() {
  const p=PropertiesService.getScriptProperties(),base=String(p.getProperty('AF_MT5_API_BASE_URL')||AF_MT5_DEFAULT_URL).replace(/\/+$/,'');
  // Never send credentials or trading data over plain HTTP; no key fallback.
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::443)?$/.test(base))throw Error('MT5_HTTPS_URL_REQUIRED');
  return {base,key:String(p.getProperty('AF_MT5_API_KEY')||'')};
}

function afMt5Json_(path,cacheKey) {
  if(cacheKey && Object.prototype.hasOwnProperty.call(AF_MT5_RUN.responses,cacheKey))return AF_MT5_RUN.responses[cacheKey];
  const cfg=afMt5Config_(),headers={Accept:'application/json'};
  // Request the API response, not ngrok's free-plan browser notice.
  if(/^https:\/\/[^/]+\.ngrok-free\.(?:dev|app)(?::443)?$/i.test(cfg.base))headers['ngrok-skip-browser-warning']='1';
  if(cfg.key)headers['X-API-Key']=cfg.key;
  let result;
  try {
    const r=UrlFetchApp.fetch(cfg.base+path,{method:'get',headers,muteHttpExceptions:true,followRedirects:false});
    if(r.getResponseCode()!==200)throw Error('MT5_HTTP_'+r.getResponseCode());
    result=JSON.parse(r.getContentText());
  } catch(e) {
    // Provider exception/body/URL can contain credentials. Emit only safe codes.
    const code=/^MT5_HTTP_\d+$/.test(String(e.message||''))?e.message:'MT5_FETCH_OR_JSON_FAILED';
    throw Error(code);
  }
  if(cacheKey)AF_MT5_RUN.responses[cacheKey]=result;
  return result;
}

function afMt5Utc_(value) {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:Z)?$/.test(s))return NaN;
  const t=Date.parse(s.replace(' ','T').replace(/Z$/,'')+'Z')/1000;
  return Number.isFinite(t)&&new Date(t*1000).toISOString().slice(0,19)===s.replace(' ','T').replace(/Z$/,'')?t:NaN;
}

function afMt5Metadata_() {
  if(AF_MT5_RUN.metadata)return AF_MT5_RUN.metadata;
  const m=afMt5Json_('/api/metadata','metadata');
  if(m.symbol!=='XAUUSD'||m.source_id!=='Eightcap-MT5-Live'||m.timezone_verified!==true||
     m.session_verified!==true||!Number.isFinite(Number(m.point))||Number(m.point)!==0.01||Number(m.digits)!==2||!/^Bid\b/.test(String(m.price_basis||'')))
    throw Error('MT5_METADATA_UNVERIFIED');
  // The supported schedule is empirical, not a license to skip arbitrary holidays.
  const sessions=m.trading_sessions||[];
  if(!sessions.some(s=>s.day==='Friday'&&s.broker_time==='01:00 - 23:58')||
     !sessions.some(s=>s.day==='Tuesday - Thursday'&&s.broker_time==='01:00 - 23:59')||
     !/US Daylight Saving Time/.test(String(m.dst_rules||'')))throw Error('MT5_SESSION_POLICY_CHANGED');
  AF_MT5_RUN.metadata=m;return m;
}

function afMt5Bars_(input,point,tfSeconds,nowTs,allowAscending=false) {
  if(!Array.isArray(input)||!input.length)throw Error('MT5_EMPTY_BARS');
  if(!Number.isFinite(point)||point<=0)throw Error('MT5_POINT_INVALID');
  const out=[],seen={};let last=null;
  for(const b of input) {
    const t=Number(b.time),s=Number(b.spread)*point;
    if(!Number.isSafeInteger(t)||t<=0||t%60!==0||b.timestamp!==t||afMt5Utc_(b.date)!==t||afMt5Utc_(b.datetime_utc)!==t||
       afMt5Utc_(b.datetime_th)-25200!==t||!['open','high','low','close'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])&&b[k]>0)||
       b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)||
       !Number.isSafeInteger(b.spread)||b.spread<0||!Number.isFinite(s)||s<0||t+tfSeconds>nowTs)
      throw Error('MT5_INVALID_OR_FORMING_BAR');
    if(seen[t])throw Error('MT5_DUPLICATE_BAR');seen[t]=true;
    if(last!==null && (allowAscending ? t<last : t>last))throw Error('MT5_BAR_ORDER_INVALID');
    last=t;out.push({t,o:b.open,h:b.high,l:b.low,c:b.close,s,v:Number(b.volume)||0,tm:b.date});
  }
  return out;
}

function afMt5Quote_() {
  const now=Date.now()/1000;
  if(AF_MT5_RUN.quote && now-AF_MT5_RUN.quote.fetchedAt<15)return AF_MT5_RUN.quote;
  const q=afMt5Json_('/api/quote'),t=Number(q.timestamp),bid=Number(q.bid),ask=Number(q.ask),sp=Number(q.spread_price),point=Number(q.point);
  const isClosed=q.market_status==='closed'||q.is_market_open===false||q.feed_status==='stale';
  if(q.symbol!=='XAUUSD'||q.source_id!=='Eightcap-MT5-Live'||q.connection_status!=='connected'||
     (!isClosed && (q.quote_usable!==true||q.feed_status!=='fresh'||q.market_status!=='open'||now-t<-2||now-t>120))||
     !Number.isSafeInteger(t)||afMt5Utc_(q.date)!==t||afMt5Utc_(q.datetime_utc)!==t||
     ![bid,ask,point,sp].every(Number.isFinite)||!(bid>0&&ask>=bid&&point===0.01)||sp<0||
     !Number.isSafeInteger(q.spread_points)||q.spread_points<0||q.price_basis!=='Bid'||
     afMt5Utc_(q.datetime_th)-25200!==t||Math.abs(ask-bid-sp)>1e-6||Math.abs(sp-q.spread_points*point)>1e-6||
     !Number.isSafeInteger(q.timestamp_msc)||Math.floor(q.timestamp_msc/1000)!==t)
    throw Error('MT5_QUOTE_NOT_FRESH_OR_VALID');
  AF_MT5_RUN.quote={...q,fetchedAt:now,weekend_test_mode:isClosed};return AF_MT5_RUN.quote;
}

function afReadMarket_(tf,limit){
 const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400}[tf];
 if(!seconds||!Number.isInteger(limit)||limit<30||limit>3000)throw Error('AF_MARKET_REQUEST_INVALID');
 const metadata=afMt5Metadata_(),now=Date.now()/1000;
 const raw=afMt5Json_('/api/bars/'+tf+'?limit='+limit+'&order=desc','bars|'+tf+'|'+limit);
 const bars=afMt5Bars_(raw,Number(metadata.point),seconds,now).reverse().map(function(b){return {openTime:b.t*1000,closeTime:(b.t+seconds)*1000,open:b.o,high:b.h,low:b.l,close:b.c,spread:b.s,volume:b.v,confirmed:true};});
 return {tf:tf,tfMs:seconds*1000,symbol:'XAUUSD',point:Number(metadata.point),sourceId:metadata.source_id,bars:bars};
}
