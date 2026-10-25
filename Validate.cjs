const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const root=path.resolve(process.argv[2]||__dirname),out=path.resolve('outputs/daytrade-validation');fs.mkdirSync(out,{recursive:true});
const reports={date:new Date().toISOString(),tests:[],syntax:{},deploymentChanged:false,aiCalls:0,pineRuntimeParityVerified:false};
for(const name of ['SharedSignals.test.cjs','SharedAlerts.test.cjs','HourlyAnalysis.test.cjs','Monitoring.test.cjs','ClientStartup.test.cjs']){
 const r=cp.spawnSync(process.execPath,[path.join(root,name)],{cwd:root,encoding:'utf8',timeout:120000});
 fs.writeFileSync(path.join(out,name+'.log'),r.stdout+(r.stderr||''));assert.equal(r.status,0,name+' failed');
 reports.tests.push({name,passed:Number(r.stdout.match(/(?:SharedSignals:|SharedAlerts:|HourlyAnalysis:|Monitoring:|ClientStartup:) (\d+)/)[1]),failed:0});
}
for(const name of ['Planner.test.cjs','ResearchLog.test.cjs']){
 const r=cp.spawnSync(process.execPath,[path.join(root,name)],{cwd:root,encoding:'utf8',timeout:120000});
 fs.writeFileSync(path.join(out,name+'.log'),r.stdout+(r.stderr||''));assert.equal(r.status,0,name+' failed');
 const n=name.startsWith('Planner')?/RESULT (\d+) test groups/:/(\d+) offline ResearchLog tests/;
 const count=Number(r.stdout.match(n)[1]);reports.tests.push({name,passed:count,failed:0});
}
{
 const name='PremiumUi.test.cjs';
 const r=cp.spawnSync(process.execPath,[path.join(root,name)],{cwd:root,encoding:'utf8',timeout:120000});
 fs.writeFileSync(path.join(out,name+'.log'),r.stdout+(r.stderr||''));assert.equal(r.status,0,name+' failed');
 reports.tests.push({name,passed:Number(r.stdout.match(/(\d+) cases passed/)[1]),failed:0});
}
{
 const name='ResearchUi.test.cjs',r=cp.spawnSync(process.execPath,[path.join(root,name)],{cwd:root,encoding:'utf8',timeout:120000});
 fs.writeFileSync(path.join(out,name+'.log'),r.stdout+(r.stderr||''));assert.equal(r.status,0,name+' failed');reports.tests.push({name,passed:1,failed:0});
}
const files=fs.readdirSync(root).filter(n=>n.endsWith('.gs')),symbols=new Map();let bundle='',htmlScripts=0;
for(const name of files){const text=fs.readFileSync(path.join(root,name),'utf8');new vm.Script(text,{filename:name});bundle+='\n;\n'+text;
 for(const m of text.matchAll(/^function\s+([\w$]+)\s*\(/gm)){assert.ok(!symbols.has(m[1]),'Duplicate global function '+m[1]);symbols.set(m[1],name);}
 assert.ok(!/^\s*(?:import\s|export\s|module\.exports\s*=)/m.test(text),name+' contains Node/module-only syntax');
}
new vm.Script(bundle,{filename:'GAS-combined-global-scope.gs'});
const context=vm.createContext({console});vm.runInContext(bundle,context);assert.equal(context.AF_DAYTRADE_RULES.pendingMinutes,60);
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,name),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim()){new vm.Script(m[1].replace(/<\?[\s\S]*?\?>/g,'null'),{filename:name});htmlScripts++;}
}
reports.syntax={gasFiles:files.length,combinedGlobalScope:'passed',duplicateGlobalFunctions:0,htmlScripts,globalsInitialized:'passed',scope:'Local Node V8 parse/evaluation with no service calls; not live GAS execution'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
