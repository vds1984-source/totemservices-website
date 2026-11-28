// Test-only, post-publication GET verification. No forms, analytics or private APIs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';

const ORIGIN='https://totemservices.org';
const URL=ORIGIN+'/book-consultation/';
const WEBP=ORIGIN+'/assets/illustrations/contact-growth-lossless-v1.webp';
const PNG=ORIGIN+'/assets/illustrations/contact-growth.png';
const EXPECTED_HTML='1dc744466c4298cf80047155c06059b91af19eaea37c02d93d7336dc52e11cc0';
const EXPECTED_WEBP='87b7613fa8a325772975a113c4076b7f8d4e592546fb355b16068ed7beb3a7a2';
const failures=[];
const summary={purpose:'Live read-only browser verification after approved PR50; no submission, analytics or private records.',
  merge:'deaf959b319fd9512cb63c9bfa58f1bfa04e07b0',approvedHead:'2314ae98b1d7e07b4b8b8f5d2fbd2b29e2b89292',
  startedAt:new Date().toISOString(),runs:[],failures,
  limits:['Two public page loads; no non-GET, fetch/XHR, beacon, WebSocket or private path may be transmitted.',
    'Only the exact consultation document, static first-party assets and the existing public Google font providers are allowed. Fresh GET responses are fulfilled into the browser; redirects are never followed.',
    'External tracking is blocked before transmission. No form field is filled or submitted.',
    'This checks current browser delivery/selection/navigation, not LCP, field speed, rankings or business outcomes.']};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=(ok,label,details=null)=>{if(!ok)failures.push({label,details});};
let proofDir,browser,created=false;
const json=(name,data)=>writeFile(join(proofDir,name),JSON.stringify(data,null,2)+'\n');
const within=(root,path)=>{const r=relative(root,path);return r!==''&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};

try{
  assert(process.env.RUNNER_TEMP&&isAbsolute(process.env.RUNNER_TEMP));
  assert(process.env.PROOF_DIR&&isAbsolute(process.env.PROOF_DIR));
  const temp=await realpath(process.env.RUNNER_TEMP);
  proofDir=resolve(process.env.PROOF_DIR);
  assert.equal(await realpath(dirname(proofDir)),temp);
  assert(within(temp,proofDir));
  await mkdir(proofDir,{recursive:false});created=true;
  assert(/^[a-f0-9]{64}$/.test(process.env.SCRIPT_SHA256||''));
  summary.scriptSha256=sha(await readFile(new globalThis.URL(import.meta.url)));
  assert.equal(summary.scriptSha256,process.env.SCRIPT_SHA256);
  assert(process.env.PLAYWRIGHT_MODULE&&isAbsolute(process.env.PLAYWRIGHT_MODULE));
  assert(process.env.CHROME_BIN&&isAbsolute(process.env.CHROME_BIN));
  const require=createRequire(import.meta.url),module=resolve(process.env.PLAYWRIGHT_MODULE);
  const {chromium}=require(module);assert.equal(require(join(module,'package.json')).version,'1.62.1');
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,
    args:['--disable-background-networking','--disable-component-update','--disable-extensions','--no-first-run','--no-default-browser-check','--dns-prefetch-disable']});
  summary.browser={version:browser.version(),node:process.version,playwright:'1.62.1'};
  for(const profile of [{id:'desktop',width:1280,height:900,dpr:1},{id:'mobile',width:390,height:844,dpr:3}]){
    const run={profile,startedAt:new Date().toISOString(),requests:[],responses:[],blockedTracking:[],shutdownBlockedAllowed:[],violations:[],pageErrors:[]};
    summary.runs.push(run);
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,
      serviceWorkers:'block',locale:'en-US',timezoneId:'UTC',colorScheme:'light'});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const pending=[],inFlight=new Set();let shuttingDown=false;
    page.on('pageerror',error=>run.pageErrors.push(String(error)));
    context.on('page',popup=>{if(popup!==page){run.violations.push('unexpected-popup');void popup.close();}});
    await context.routeWebSocket('**/*',socket=>{run.violations.push('websocket');socket.close();});
    await context.addInitScript(()=>{
      window.__liveCheckSubmissions=[];window.__liveCheckBeacons=[];
      document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();window.__liveCheckSubmissions.push('submit-event');},true);
      for(const method of ['submit','requestSubmit'])HTMLFormElement.prototype[method]=function(){window.__liveCheckSubmissions.push(method);throw Error('Submission forbidden by live check');};
      navigator.sendBeacon=function(url){window.__liveCheckBeacons.push(String(url));return false;};
    });
    let documents=0;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new globalThis.URL(request.url());
      const row={url:request.url(),method:request.method(),type:request.resourceType()};run.requests.push(row);
      const block=(reason,violation=true)=>{row.outcome=reason;if(violation)run.violations.push(row);return route.abort('blockedbyclient');};
      if(run.requests.length>45)return block('request-cap');
      if(request.method()!=='GET'||['fetch','xhr','eventsource','ping'].includes(request.resourceType()))return block('non-get-or-api');
      if(url.protocol!=='https:'||url.username||url.password||url.port)return block('non-public-scheme-or-credentials');
      if(['www.googletagmanager.com','connect.facebook.net','www.facebook.com','www.google-analytics.com','google-analytics.com'].includes(url.hostname)){
        run.blockedTracking.push(row);return block('tracking-blocked',false);
      }
      let allowed=false;
      if(url.origin===ORIGIN){
        if(request.isNavigationRequest())allowed=request.frame()===page.mainFrame()&&url.href===URL&&documents++===0;
        else{
          const path=decodeURIComponent(url.pathname);
          const query=[...url.searchParams];
          allowed=!path.includes('\\')&&!path.includes('\0')&&!path.split('/').some(x=>x==='.'||x==='..')&&
            (path==='/favicon.ico'||path.startsWith('/assets/'))&&/\.(?:css|js|png|webp|avif|jpe?g|svg|woff2?|ico)$/i.test(path)&&
            query.every(([k,v])=>k==='v'&&/^[a-zA-Z0-9-]{1,80}$/.test(v));
        }
      }else if(!request.isNavigationRequest()&&url.hostname==='fonts.googleapis.com')allowed=url.pathname==='/css2';
      else if(!request.isNavigationRequest()&&url.hostname==='fonts.gstatic.com')allowed=url.pathname.endsWith('.woff2')&&!url.search;
      if(!allowed)return block('not-an-approved-public-document-or-static-resource');
      if(shuttingDown){run.shutdownBlockedAllowed.push(row);return block('shutdown-allowed-public-request-blocked',false);}
      // route.continue may follow redirects beyond the routed URL. Fetch only
      // this approved URL and reject every redirect before browser fulfillment.
      const headers={...request.headers()};
      delete headers.cookie;delete headers.authorization;delete headers['proxy-authorization'];
      const work=Promise.resolve().then(async()=>{try{
        row.outcome='direct-public-get-attempt';
        const response=await route.fetch({maxRedirects:0,timeout:15000,headers});
        row.publicStatus=response.status();
        if(response.status()!==200){record(false,profile.id+': direct public GET returned 200',row);return block('non-200-public-response',false);}
        const body=await response.body();row.publicBytes=body.length;
        if(body.length>1000000){record(false,profile.id+': public response byte cap',row);return block('public-response-byte-cap',false);}
        row.outcome='fresh-public-response-fulfilled';
        return await route.fulfill({response,body});
      }catch(error){record(false,profile.id+': direct public GET succeeded',{url:row.url,error:String(error)});return block('public-get-error',false);}});
      inFlight.add(work);
      void work.finally(()=>inFlight.delete(work)).catch(()=>{});
      return work;
    });
    page.on('response',response=>{
      const row={url:response.url(),status:response.status(),type:response.headers()['content-type']};run.responses.push(row);
      if([URL,WEBP].includes(response.url()))pending.push(response.body().then(bytes=>{
        row.bytes=bytes.length;row.sha256=sha(bytes);
        if(response.url()===URL)record(row.status===200&&row.sha256===EXPECTED_HTML,profile.id+': approved live HTML exact',row);
        else record(row.status===200&&row.type?.split(';')[0]==='image/webp'&&row.bytes===148352&&row.sha256===EXPECTED_WEBP,profile.id+': approved live WebP exact',row);
      }).catch(error=>record(false,profile.id+': response captured',String(error))));
    });
    try{
      await page.goto(URL,{waitUntil:'load',timeout:45000});
      await page.evaluate(async()=>{await document.fonts.ready;await document.querySelector('.supplied-service-art img').decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      run.observation=await page.evaluate(()=>{
        const image=document.querySelector('.supplied-service-art img'),form=document.querySelector('#lead-form');
        return {title:document.title,canonical:document.querySelector('link[rel="canonical"]')?.href,
          image:{currentSrc:image.currentSrc,src:image.getAttribute('src'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,complete:image.complete,
            width:image.getAttribute('width'),height:image.getAttribute('height'),alt:image.alt,pictureSources:[...image.parentElement.querySelectorAll('source')].map(s=>({type:s.type,srcset:s.srcset}))},
          form:{action:form.getAttribute('action'),method:form.getAttribute('method'),required:[...form.elements].filter(n=>n.required).map(n=>n.name)},
          documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,
          fonts:[...document.fonts].map(f=>({family:f.family,status:f.status}))};
      });
      const o=run.observation;
      record(o.canonical===URL,profile.id+': canonical retained',o.canonical);
      record(o.image.currentSrc===WEBP&&o.image.src===new globalThis.URL(PNG).pathname&&o.image.complete&&o.image.naturalWidth===1400&&o.image.naturalHeight===1193,
        profile.id+': live browser selected new WebP and retained PNG',o.image);
      record(o.form.action==='/api/contact.php'&&o.form.method==='post'&&JSON.stringify([...o.form.required].sort())===JSON.stringify(['Business','Name','Phone']),profile.id+': form contract retained',o.form);
      record(o.documentWidth<=o.viewport+1,profile.id+': no horizontal overflow',o);
      record(run.requests.filter(x=>x.url===WEBP).length===1&&run.requests.filter(x=>x.url===PNG).length===0,profile.id+': one initial WebP and no PNG download');
      await page.keyboard.press('Tab');
      record(await page.locator('.enquiry-skip-link').evaluate(n=>n===document.activeElement),profile.id+': Tab reaches skip link');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.activeElement?.id==='lead-form');
      await page.keyboard.press('Tab');
      record(await page.evaluate(()=>document.activeElement?.id==='enquiry-name'),profile.id+': keyboard reaches Name');
      const book=page.locator('.mobilebar a[href="#lead-form"]');
      run.mobileBookVisible=await book.isVisible();
      record(run.mobileBookVisible===(profile.id==='mobile'),profile.id+': expected mobile Book visibility',run.mobileBookVisible);
      if(run.mobileBookVisible){
        await page.evaluate(()=>{document.activeElement?.blur();history.replaceState(null,'','/book-consultation/');scrollTo({top:0,behavior:'instant'});});
        await book.click();await page.waitForFunction(()=>document.activeElement?.id==='lead-form');run.mobileBookFocus=await page.evaluate(()=>document.activeElement.id);
      }
      await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});});
      const screenshot=profile.id+'-live-full.png';const bytes=await page.screenshot({path:join(proofDir,screenshot),fullPage:true,animations:'disabled',caret:'hide',scale:'css'});
      run.screenshot={file:screenshot,sha256:sha(bytes)};
      run.submissions=await page.evaluate(()=>window.__liveCheckSubmissions);run.beacons=await page.evaluate(()=>window.__liveCheckBeacons);
      record(run.submissions.length===0&&run.beacons.length===0,profile.id+': zero submissions or beacons');
      await Promise.all(pending);
      record(run.responses.some(r=>r.url===URL&&r.sha256===EXPECTED_HTML)&&run.responses.some(r=>r.url===WEBP&&r.sha256===EXPECTED_WEBP),profile.id+': expected bodies observed');
      record(run.violations.length===0&&run.pageErrors.length===0,profile.id+': no policy violations or page errors',{violations:run.violations,errors:run.pageErrors});
    }catch(error){run.error=String(error.stack||error);record(false,profile.id+': live case completed',run.error);}
    finally{
      // Stop new allowed traffic while forbidden guards stay installed, then
      // finish pending public fetch/fulfill and response-hash work before close.
      shuttingDown=true;
      for(let pass=0;pass<50;pass++){
        const bodies=[...pending];
        await Promise.allSettled([...inFlight,...bodies]);
        await new Promise(resolve=>setImmediate(resolve));
        if(inFlight.size===0&&pending.length===bodies.length)break;
        if(pass===49)record(false,profile.id+': bounded pending-work drain');
      }
      if(!page.isClosed()){
        try{
          run.submissions=await page.evaluate(()=>window.__liveCheckSubmissions??['missing-guard']);
          run.beacons=await page.evaluate(()=>window.__liveCheckBeacons??['missing-guard']);
          record(run.submissions.length===0&&run.beacons.length===0,profile.id+': zero submissions or beacons through drain');
        }catch(error){record(false,profile.id+': final guard observation',String(error));}
      }
      await context.close();
      await Promise.allSettled([...inFlight,...pending]);
      record(run.violations.length===0&&run.pageErrors.length===0,profile.id+': safe completed teardown',{violations:run.violations,errors:run.pageErrors});
      run.finishedAt=new Date().toISOString();await json(profile.id+'-run.json',run);
    }
  }
  await browser.close();browser=null;
  summary.finishedAt=new Date().toISOString();summary.passed=failures.length===0;
  await json('summary.json',summary);console.log(JSON.stringify({passed:summary.passed,cases:summary.runs.length,failures:failures.length}));
  if(failures.length)process.exitCode=1;
}catch(error){summary.passed=false;failures.push({label:'setup',error:String(error.stack||error)});if(created)await json('summary.json',summary);console.error(JSON.stringify(failures));process.exitCode=1;}
finally{if(browser)await browser.close().catch(()=>{});}
