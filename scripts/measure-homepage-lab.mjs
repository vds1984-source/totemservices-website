// One standalone Google Lighthouse mobile diagnostic, outside production code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const TARGET='https://totemservices.org/';
const EXPECTED_HTML='c6d7fada9c81d95753f688243ce927298358213961c925649d48ea7c6fa6e878';
let chrome,folder,timer,created=false;
const status={startedAt:new Date().toISOString(),mode:'standalone mobile Lighthouse on a GitHub runner',
  target:TARGET,attempts:1,apiKeyUsed:false,notGoogleHostedPageSpeed:true,notFieldData:true,
  traffic:'One automated direct navigation; no form interaction/submission. This is not an organic enquiry.',
  baselineLimit:'The saved 23 November Google-hosted lab observation used a different environment. Do not claim a causal before/after gain from this single standalone run.'};
const save=async()=>writeFile(join(folder,'status.json'),JSON.stringify(status,null,2)+'\n');
try{
  assert(process.env.RUNNER_TEMP&&process.env.LAB_DIR&&isAbsolute(process.env.LAB_DIR));
  const temp=await realpath(process.env.RUNNER_TEMP);folder=resolve(process.env.LAB_DIR);
  assert.equal(await realpath(dirname(folder)),temp);
  const rel=relative(temp,folder);assert(rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel));
  await mkdir(folder,{recursive:false});created=true;
  const self=await readFile(new URL(import.meta.url));
  assert.equal(createHash('sha256').update(self).digest('hex'),process.env.SCRIPT_SHA256);
  assert(process.env.LIGHTHOUSE_MODULE&&isAbsolute(process.env.LIGHTHOUSE_MODULE));
  assert(process.env.CHROME_BIN&&isAbsolute(process.env.CHROME_BIN));
  const req=createRequire(join(process.env.LIGHTHOUSE_MODULE,'package.json'));
  assert.equal(req(join(process.env.LIGHTHOUSE_MODULE,'package.json')).version,'13.6.0');
  const lighthouse=(await import(pathToFileURL(req.resolve('lighthouse')).href)).default;
  const launcher=await import(pathToFileURL(req.resolve('chrome-launcher')).href);
  const response=await fetch(TARGET,{redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);const page=Buffer.from(await response.arrayBuffer());assert(page.length<1000000);
  status.sourceHtmlSha256=createHash('sha256').update(page).digest('hex');assert.equal(status.sourceHtmlSha256,EXPECTED_HTML);
  chrome=await launcher.launch({chromePath:process.env.CHROME_BIN,chromeFlags:['--headless=new','--disable-background-networking','--disable-component-update','--disable-extensions','--no-first-run','--no-default-browser-check']});
  const flags={port:chrome.port,logLevel:'error',output:'json',onlyCategories:['performance'],formFactor:'mobile',throttlingMethod:'simulate',maxWaitForLoad:45000,
    blockedUrlPatterns:['*/api/*','*crm.totemservices.org/*','*/totem-crm-test/*']};
  status.requestedFlags={...flags,port:'ephemeral local debugging port'};
  status.analytics='Standard public-page scripts remain enabled for a representative loading diagnostic; no GA4 data is read or setting changed. Verification traffic is separate from qualified organic enquiries.';
  await save();
  const result=await Promise.race([lighthouse(TARGET,flags),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Bounded lab timeout')),150000);})]);
  clearTimeout(timer);timer=undefined;
  assert(result?.lhr,'No Lighthouse result');const lhr=result.lhr;
  const text=JSON.stringify(lhr,null,2)+'\n';assert(Buffer.byteLength(text)<15000000);
  await writeFile(join(folder,'lighthouse-result.json'),text);
  assert.equal(lhr.finalDisplayedUrl,TARGET);
  status.reportFile='lighthouse-result.json';status.lighthouseVersion=lhr.lighthouseVersion;status.fetchTime=lhr.fetchTime;
  status.configSettings=lhr.configSettings;status.environment=lhr.environment;status.runWarnings=lhr.runWarnings;
  status.runtimeError=lhr.runtimeError??null;
  const performance=lhr.categories?.performance?.score;
  status.performanceScore=Number.isFinite(performance)?performance*100:null;
  status.metrics=Object.fromEntries(['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'].map(id=>[id,{value:lhr.audits?.[id]?.numericValue??null,display:lhr.audits?.[id]?.displayValue??null,score:lhr.audits?.[id]?.score??null}]));
  status.missingOrInvalidMetrics=Object.entries(status.metrics).filter(([,metric])=>!Number.isFinite(metric.value)).map(([id])=>id);
  status.reportSha256=createHash('sha256').update(text).digest('hex');status.status=lhr.runtimeError||status.missingOrInvalidMetrics.length||!Number.isFinite(status.performanceScore)?'unavailable':'completed';
  if(status.status!=='completed')process.exitCode=1;
}catch(error){status.status='unavailable';status.error=String(error.stack||error);process.exitCode=1;}
finally{
  if(timer)clearTimeout(timer);
  if(chrome)try{await chrome.kill();}catch(error){status.cleanupError=String(error);process.exitCode=1;}
  status.finishedAt=new Date().toISOString();if(created)await save().catch(()=>{});
  console.log(JSON.stringify({status:status.status,version:status.lighthouseVersion,performanceScore:status.performanceScore,metrics:status.metrics,error:status.error}));
}
