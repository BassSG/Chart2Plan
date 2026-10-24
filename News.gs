// GET-only source NewsGuard.js subset. No cancellation/outbox functions cloned.
const AF_NEWS_GUARD_ENABLED = true;
const AF_NEWS_BEFORE_MINUTES = 15;
const AF_NEWS_AFTER_MINUTES = 15;
const AF_NEWS_MIN_IMPACT = 'High';
const AF_NEWS_CANCEL_PENDING_ENABLED = true;
const AF_NEWS_API_BASE_URL = 'https://anything-mrna-work-voted.trycloudflare.com';
const AF_NEWS_MAX_DATA_AGE_MINUTES = 45;
const AF_NEWS_CACHE={calendar:null,atMs:0,signature:''};

function afNewsPolicy_(){
  const p={enabled:AF_NEWS_GUARD_ENABLED,beforeMinutes:AF_NEWS_BEFORE_MINUTES,afterMinutes:AF_NEWS_AFTER_MINUTES,
    minImpact:AF_NEWS_MIN_IMPACT,cancelPending:AF_NEWS_CANCEL_PENDING_ENABLED,
    apiBase:String(AF_NEWS_API_BASE_URL||'').replace(/\/+$/,''),maxAgeMinutes:AF_NEWS_MAX_DATA_AGE_MINUTES};
  if(typeof p.enabled!=='boolean'||typeof p.cancelPending!=='boolean'||
    ![p.beforeMinutes,p.afterMinutes].every(n=>Number.isInteger(n)&&n>=0&&n<=1440)||
    !['High','Medium','Low'].includes(p.minImpact)||!Number.isFinite(p.maxAgeMinutes)||p.maxAgeMinutes<=0||p.maxAgeMinutes>1440||
    !/^https:\/\/[^\s/?#@]+$/.test(p.apiBase))throw Error('AF_NEWS_CONFIG_INVALID');
  return p;
}

function afNewsUtc_(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}Z?$/.test(v))throw Error('AF_NEWS_UTC_INVALID');
  const normalized=v.replace(' ','T').replace(/Z?$/,'Z'),ms=Date.parse(normalized);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==normalized.slice(0,19))throw Error('AF_NEWS_UTC_INVALID');
  return ms/1000;
}

function afNewsCurrencies_(symbol){
  const s=String(symbol||'').trim().toUpperCase().replace('/','');
  if(!/^[A-Z]{6}$/.test(s))throw Error('AF_NEWS_SYMBOL_UNSUPPORTED');
  const known=['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNY','HKD','SGD','ZAR','NOK','SEK'];
  const a=s.slice(0,3),b=s.slice(3),list=[a,b].filter(c=>!['XAU','XAG'].includes(c));
  if(!list.length||list.some(c=>!known.includes(c)))throw Error('AF_NEWS_SYMBOL_UNSUPPORTED');
  return {symbol:s,currencies:Array.from(new Set(list))};
}

function afNewsFetch_(url){
  const r=UrlFetchApp.fetch(url,{method:'get',headers:{Accept:'application/json'},muteHttpExceptions:true,
    followRedirects:false,validateHttpsCertificates:true});
  if(r.getResponseCode()!==200)throw Error('AF_NEWS_HTTP_UNAVAILABLE');
  const raw=r.getContentText();if(typeof raw!=='string'||raw.length>600000)throw Error('AF_NEWS_RESPONSE_INVALID');
  let x;try{x=JSON.parse(raw);}catch(_){throw Error('AF_NEWS_JSON_INVALID');}
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error('AF_NEWS_RESPONSE_INVALID');return x;
}

function afNewsCalendar_(p,force){
  const now=Date.now()/1000,signature=[p.apiBase,p.maxAgeMinutes].join('|');
  if(!force&&AF_NEWS_CACHE.calendar&&AF_NEWS_CACHE.signature===signature&&Date.now()-AF_NEWS_CACHE.atMs<30000)
    return AF_NEWS_CACHE.calendar;
  const body=afNewsFetch_(p.apiBase+'/api/news/calendar?min_impact=Low&upcoming_only=false&limit=500');
  if(body.status!=='success'||!Array.isArray(body.events)||!Number.isInteger(body.total_events)||
    body.total_events!==body.events.length||body.returned_events!==body.events.length)throw Error('AF_NEWS_CALENDAR_INCOMPLETE');
  const seen=new Set(),events=body.events.map(e=>{
    if(!e||typeof e.id!=='string'||!e.id||e.id.length>300||seen.has(e.id)||typeof e.title!=='string'||
      !['High','Medium','Low','Holiday'].includes(e.impact)||!Number.isSafeInteger(e.timestamp_utc)||e.timestamp_utc<=0)
      throw Error('AF_NEWS_EVENT_INVALID');
    seen.add(e.id);const currency=String(e.currency||e.country||'').toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency))throw Error('AF_NEWS_EVENT_CURRENCY_INVALID');
    // raw_date is optional display metadata: the provider also emits an
    // unqualified US-style string. Never parse that using the GAS local zone.
    const rawHasOffset=typeof e.raw_date==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(e.raw_date);
    if(afNewsUtc_(e.date_utc)!==e.timestamp_utc||
      (rawHasOffset&&Date.parse(e.raw_date)/1000!==e.timestamp_utc)||
      afNewsUtc_(e.date_th)-e.timestamp_utc!==7*3600)throw Error('AF_NEWS_EVENT_TIME_MISMATCH');
    const updatedTs=afNewsUtc_(e.updated_at_utc);
    if(updatedTs>now+120||now-updatedTs>p.maxAgeMinutes*60)throw Error('AF_NEWS_CALENDAR_STALE');
    // A freshly re-stamped copy of a previous week's calendar is not current coverage.
    if(e.timestamp_utc<now-9*86400||e.timestamp_utc>now+9*86400)throw Error('AF_NEWS_CALENDAR_RANGE_INVALID');
    return {id:e.id,title:e.title.replace(/[\x00-\x1f]/g,' ').slice(0,160),currency,impact:e.impact,
      timestamp:e.timestamp_utc,updatedTs};
  });
  // Current API has no snapshot freshness metadata. Per-event updated_at_utc is
  // a bounded compatibility fallback; an empty unqualified calendar fails closed.
  if(!events.length)throw Error('AF_NEWS_EMPTY_CALENDAR_UNVERIFIED');
  const calendar={events,updatedTs:Math.min(...events.map(e=>e.updatedTs)),freshnessBasis:'PER_EVENT_UPDATED_AT_UTC'};
  AF_NEWS_CACHE.calendar=calendar;AF_NEWS_CACHE.atMs=Date.now();AF_NEWS_CACHE.signature=signature;
  return calendar;
}

function afNewsCheck_(symbol,force=false){
  try{
    const p=afNewsPolicy_();
    if(!p.enabled)return {ok:true,canTrade:true,blocked:false,code:'AF_NEWS_DISABLED',events:[],pendingDeadlineTs:null};
    const mapping=afNewsCurrencies_(symbol),calendar=afNewsCalendar_(p,force);
    const levels={Low:1,Medium:2,High:3,Holiday:0};
    const events=calendar.events.filter(e=>(mapping.currencies.includes(e.currency)||e.currency==='ALL')&&levels[e.impact]>=levels[p.minImpact])
      .sort((a,b)=>a.timestamp-b.timestamp);
    const query='?symbol='+encodeURIComponent(mapping.symbol)+'&min_impact='+encodeURIComponent(p.minImpact)+
      '&before_minutes='+p.beforeMinutes+'&after_minutes='+p.afterMinutes;
    const x=afNewsFetch_(p.apiBase+'/api/news/check'+query),f=x.filter_rules;
    const serverTs=afNewsUtc_(x.server_time_utc),now=Date.now()/1000;
    if(Math.abs(serverTs-now)>120||afNewsUtc_(x.server_time_th)-serverTs!==7*3600)throw Error('AF_NEWS_SERVER_CLOCK_INVALID');
    if(typeof x.can_trade!=='boolean'||typeof x.is_in_news_window!=='boolean'||x.can_trade===x.is_in_news_window||
      x.action!==(x.can_trade?'ALLOW_TRADE':'BLOCK_TRADE')||!Array.isArray(x.active_news)||
      x.active_news_count!==x.active_news.length||!f||f.symbol!==mapping.symbol||f.before_minutes!==p.beforeMinutes||
      f.after_minutes!==p.afterMinutes||f.min_impact!==p.minImpact||!Array.isArray(f.checked_currencies)||
      [...f.checked_currencies].sort().join('|')!==[...mapping.currencies].sort().join('|'))throw Error('AF_NEWS_CHECK_CONTRACT_INVALID');
    const activeAt=t=>events.filter(e=>t>=e.timestamp-p.beforeMinutes*60&&t<=e.timestamp+p.afterMinutes*60);
    const expected=activeAt(serverTs),ids=x.active_news.map(e=>e?.id).sort().join('|');
    if((expected.length===0)!==x.can_trade||ids!==expected.map(e=>e.id).sort().join('|'))throw Error('AF_NEWS_CHECK_CALENDAR_MISMATCH');
    const active=activeAt(now),blocked=active.length>0||!x.can_trade,next=events.find(e=>e.timestamp>now)||null;
    return {ok:true,canTrade:!blocked,blocked,code:blocked?'AF_NEWS_WINDOW':'AF_NEWS_CLEAR',
      beforeMinutes:p.beforeMinutes,afterMinutes:p.afterMinutes,minImpact:p.minImpact,
      event:active[0]||expected[0]||next,events,nextNews:next,
      pendingDeadlineTs:p.cancelPending&&next?next.timestamp-p.beforeMinutes*60:null,
      sourceAgeMinutes:Math.max(0,(now-calendar.updatedTs)/60),freshnessBasis:calendar.freshnessBasis};
  }catch(e){
    const code=/^AF_NEWS_[A-Z_]+$/.test(String(e.message))?String(e.message):'AF_NEWS_DATA_UNAVAILABLE';
    Logger.log('AF_NEWS_GUARD_WAIT '+code);
    return {ok:false,canTrade:false,blocked:false,code,events:[],pendingDeadlineTs:null};
  }
}
