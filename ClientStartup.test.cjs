'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/ClientScript.html','utf8').replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');
function boot(saved){
 const values=new Map(saved?[['af.selectedModel',saved]]:[]),events={},model={value:'google/gemini-3.8-flash',options:[{value:'google/gemini-3.8-flash'},{value:'openai/gpt-6.1-sol-pro'}],addEventListener:(name,fn)=>events[name]=fn};
 const node=()=>({value:'65',checked:true,style:{},dataset:{},classList:{add(){},remove(){},contains(){return false;}},addEventListener(){},getAttribute:()=>'',setAttribute(){}});
 const nodes=new Map([['aiModel',model]]),document={readyState:'loading',body:node(),addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 const window={AF_SOLO_WORKSPACE:{username:'owner-test',displayName:'ผู้ทดสอบ'},matchMedia:()=>({matches:true})};
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const context=vm.createContext({document,window,localStorage,console,Date,Number,JSON,Array,String,Math,Object,setTimeout(){},setInterval(){},requestAnimationFrame(){},getComputedStyle:()=>({getPropertyValue:()=>''})});
 vm.runInContext(source,context,{filename:'ClientScript.html'});return {context,values,model,events};
}
const first=boot();assert.equal(first.model.value,'google/gemini-3.8-flash');assert.equal(first.values.get('af.currentUser'),'owner-test');
first.model.value='openai/gpt-6.1-sol-pro';first.events.change.call(first.model);assert.equal(first.values.get('af.selectedModel'),'openai/gpt-6.1-sol-pro');
const restored=boot('openai/gpt-6.1-sol-pro');assert.equal(restored.model.value,'openai/gpt-6.1-sol-pro');
{
 const begin=source.indexOf('var afTriggerLoadRequest=0;'),end=source.indexOf('var afTriggerSnapshot=null',begin),requests=[],applied=[],health=[],table={innerHTML:''},counter={textContent:''};
 assert.ok(begin>=0&&end>begin);let workCalls=0,popups=0;
 const c=vm.createContext({console,document:{querySelector:()=>table,getElementById:()=>counter},localStorage:{getItem:()=> 'owner-test'},
  window:{afResearchSharedStatus:v=>health.push(v),afApplyPaperStatus:v=>applied.push(v)},premiumAcquireWork(){workCalls++;throw Error('read-only load acquired work lock');},
  premiumEscape:s=>s,Swal:{fire(){popups++;}},google:{script:{get run(){let ok,fail;return {withSuccessHandler(fn){ok=fn;return this;},withFailureHandler(fn){fail=fn;return this;},manageTriggers(...args){requests.push({ok,fail,args});}};}}}});
 vm.runInContext(source.slice(begin,end),c);c.loadTriggers();assert.equal(workCalls,0);assert.equal(requests.length,1);assert.equal(requests[0].args[0],'getAll');
 c.loadTriggers();assert.equal(requests.length,2);requests[0].ok({plans:[],sharedStatus:{health:'OLD'}});assert.equal(applied.length,0);
 requests[1].ok({plans:[],sharedStatus:{health:'OK'}});assert.equal(applied.length,1);assert.equal(health[0].health,'OK');
 c.loadTriggers();c.loadTriggers();requests[2].fail({message:'late'});assert.equal(popups,0);requests[3].fail({message:'current'});assert.equal(popups,1);
}
console.log('ClientStartup: 7 cases passed; startup, nonblocking status, and stale responses.');
