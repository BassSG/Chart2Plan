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
console.log('ClientStartup: 3 cases passed; full client initialization and model preference.');

