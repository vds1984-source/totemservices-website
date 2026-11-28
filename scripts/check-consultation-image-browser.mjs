// Specialized, test-only offline proof for PR50. Never served by the website.
// Required: TARGET, SCRIPT_SHA256, CHROME_BIN, PLAYWRIGHT_MODULE, RUNNER_TEMP,
// PROOF_DIR (a new child of RUNNER_TEMP). Run from the Git repository root.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep, join, dirname, basename } from 'node:path';

const BASE = 'dadadc393eff84abd1025a348557f47364617f8a';
const EXPECTED_TARGET = '2314ae98b1d7e07b4b8b8f5d2fbd2b29e2b89292';
const TARGET = process.env.TARGET;
const ORIGIN = 'https://totemservices.org';
const PAGE = 'book-consultation/index.html';
const VIRTUAL_PATH = '/book-consultation/';
const PNG = 'assets/illustrations/contact-growth.png';
const WEBP = 'assets/illustrations/contact-growth-lossless-v1.webp';
const FIXTURE = 'tests/fixtures/contact-growth-live-20261128.png';
const FONT_DIR = 'assets/fonts/totem-search/';
const FONT_PINS = {
  'inter-latin-v20.woff2': 'd15208de03cd1ad7c5199f0a0ce915fe841e4722',
  'manrope-latin-v20.woff2': '71eb731d558046199aa7f985adbf812890a093a1'
};
const STYLE_PROPS = [
  'display','position','visibility','opacity','color','background-color',
  'font-family','font-size','font-weight','line-height','letter-spacing',
  'text-align','text-decoration-line','box-sizing','width','height',
  'max-width','max-height','padding-top','padding-right','padding-bottom',
  'padding-left','margin-top','margin-right','margin-bottom','margin-left',
  'border-top-width','border-radius','grid-template-columns','object-fit'
];
const profiles = [320,390,650,651,860,861,1280].map(width => ({
  id: width + '-dpr1', width, height: width === 320 ? 568 : width <= 650 ? 844 : 900, dpr: 1
})).concat([{id:'390-dpr3',width:390,height:844,dpr:3}]);
const failures = [];
const summary = {
  purpose:'Offline source/layout/focus/image-selection proof; no intake or production performance test.',
  base:BASE,target:TARGET,generatedAt:new Date().toISOString(),source:{},browser:null,runs:[],failures,
  criteria:{geometryToleranceCSSPixels:0.25,comparedStyleProperties:STYLE_PROPS,
    exactAlpha:true,nativeOpaqueRGBExact:true,maxReconstructed8BitPremultipliedRGBError:1,
    maxOpaqueCompositeRGBError:1,backgrounds:['#000000','#ffffff','#f7f4ed'],
    strictBrowserRGBAEqualityClaimed:false,decoderModelIsDiagnosticOnly:true},
  caveats:[
    'All page requests are fulfilled from pinned Git bytes/test fixtures or aborted. No live HTTP, private endpoint or Google connection is exercised.',
    'The PNG URL uses the exact fresh-live PNG fixture in every variant. Repository PNG bytes remain unchanged; the prior Python raw-RGBA result is separate evidence.',
    'The original style.css?v=20261104-enquiry-accessibility URL remains intact, but its response is immutable BASE Git CSS. This does not establish fresh production delivery for that query.',
    'Google Fonts CSS is a declared local fixture using pinned repository Latin variable fonts. Preconnect links are removed identically in every variant.',
    'Unsupported image type tests format negotiation only. No broken-WebP network/decoder fallback is claimed.',
    'One-code-value bounds apply to reconstructed 8-bit premultiplied RGB and black/white/cream opaque composites at tested sizes in this browser. Continuous alpha-weighted error and raw RGB differences are reported separately.',
    'The native floor-premultiply arithmetic model is diagnostic for this asset; universal decoder behavior, universal pixel identity and perception thresholds are not claimed.',
    'Form fields are never filled, validated or submitted. Only skip-link and mobile Book focus navigation are exercised.',
    'Only the generated hidden SubmissionId value and started_at clock are normalized across fresh contexts; one valid generated UUID is checked separately. No submission reference is sent anywhere.',
    'No browser timing, LCP, field Core Web Vitals, Google indexing, rankings, lead generation or business result is established.'
  ]
};
let proofDir, browser, proofCreated=false;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, {maxBuffer:64*1024*1024});
const show = (ref,path) => git(['show',ref+':'+path]);
const blob = (ref,path) => git(['rev-parse',ref+':'+path]).toString().trim();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = a => [...a].sort();
const record = (condition,label,details=null) => {
  if(!condition) failures.push({label,details});
  return condition;
};
const once = (text,needle,replacement) => {
  assert.equal(text.split(needle).length-1,1,'Expected one source token: '+needle);
  return text.replace(needle,replacement);
};
const within = (root,path) => {
  const rel=relative(root,path);
  return rel!=='' && rel!=='..' && !rel.startsWith('..'+sep) && !isAbsolute(rel);
};
const json = (file,value) => writeFile(join(proofDir,file),JSON.stringify(value,null,2)+'\n');
const fontCSS = [
  "@font-face{font-family:Inter;font-style:normal;font-weight:400 700;font-display:swap;src:url('/__proof_fonts/inter-latin-v20.woff2') format('woff2')}",
  "@font-face{font-family:Manrope;font-style:normal;font-weight:600 800;font-display:swap;src:url('/__proof_fonts/manrope-latin-v20.woff2') format('woff2')}"
].join('\n');
const mime = path => ({
  '.css':'text/css','.js':'application/javascript','.png':'image/png','.webp':'image/webp',
  '.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ico':'image/x-icon'
})[path.slice(path.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream';

function orientation(bytes) {
  if(bytes.subarray(0,6).equals(Buffer.from('Exif\0\0'))) bytes=bytes.subarray(6);
  assert(bytes.length>=8,'Truncated EXIF');
  const endian=bytes.subarray(0,2).toString();
  assert(['II','MM'].includes(endian),'Unsupported EXIF byte order');
  const u16=offset=>endian==='II'?bytes.readUInt16LE(offset):bytes.readUInt16BE(offset);
  const u32=offset=>endian==='II'?bytes.readUInt32LE(offset):bytes.readUInt32BE(offset);
  assert.equal(u16(2),42,'Unsupported TIFF');
  const start=u32(4); assert(start+2<=bytes.length,'Truncated EXIF IFD');
  const count=u16(start); assert(count<=1024 && start+2+count*12+4<=bytes.length,'Invalid EXIF IFD');
  const found=[];
  for(let i=0;i<count;i++){
    const offset=start+2+i*12;
    if(u16(offset)!==0x0112) continue;
    assert.equal(u16(offset+2),3,'Orientation must be SHORT');
    assert.equal(u32(offset+4),1,'Orientation count drift');
    found.push(u16(offset+8));
  }
  assert(found.length<=1,'Duplicate EXIF orientation');
  assert(found.length===0 || found[0]===1,'Rotated/mirrored orientation is outside this proof');
  return found[0]??null;
}
function pngInfo(bytes) {
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid PNG');
  const chunks=[];let at=8,orient=null,dimensions=null,icc=false;
  while(at<bytes.length){
    assert(at+12<=bytes.length,'Truncated PNG chunk');
    const length=bytes.readUInt32BE(at), type=bytes.subarray(at+4,at+8).toString();
    assert(at+12+length<=bytes.length,'Truncated PNG payload');
    const data=bytes.subarray(at+8,at+8+length);chunks.push(type);
    if(type==='IHDR'){assert.equal(length,13);dimensions=[data.readUInt32BE(0),data.readUInt32BE(4)];}
    if(type==='eXIf'){assert.equal(orient,null);orient=orientation(data);}
    if(type==='iCCP')icc=true;
    assert(!['acTL','fcTL','fdAT'].includes(type),'Animated PNG is outside this proof');
    at+=12+length;if(type==='IEND')break;
  }
  assert.equal(at,bytes.length,'Trailing PNG data');
  assert.deepEqual(dimensions,[1400,1193]);assert(!icc,'Unexpected PNG ICC profile');
  return {dimensions,orientation:orient,frames:1,icc,chunks};
}
function webpInfo(bytes) {
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'WebP RIFF length drift');
  const chunks=[];let at=12,dimensions=null,orient=null,icc=false,lossless=false;
  while(at<bytes.length){
    assert(at+8<=bytes.length,'Truncated WebP chunk');
    const type=bytes.subarray(at,at+4).toString(),length=bytes.readUInt32LE(at+4);
    assert(at+8+length<=bytes.length,'Truncated WebP payload');
    const data=bytes.subarray(at+8,at+8+length);chunks.push(type);
    assert(!['ANIM','ANMF'].includes(type),'Animated WebP is outside this proof');
    if(type==='VP8L'){
      assert(length>=5&&data[0]===0x2f,'Invalid lossless WebP');
      const bits=data.readUInt32LE(1);assert.equal(bits>>>29,0);
      dimensions=[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];lossless=true;
    }
    if(type==='EXIF'){assert.equal(orient,null);orient=orientation(data);}
    if(type==='ICCP')icc=true;
    at+=8+length+(length&1);
  }
  assert.equal(at,bytes.length);assert(lossless,'Expected lossless VP8L');assert(!icc,'Unexpected WebP ICC');
  assert.deepEqual(dimensions,[1400,1193]);
  return {dimensions,orientation:orient,frames:1,icc,lossless,chunks};
}

async function main(){
  assert.equal(TARGET,EXPECTED_TARGET,'TARGET must be the reviewed production two-file commit, not test HEAD');
  assert(process.env.RUNNER_TEMP&&isAbsolute(process.env.RUNNER_TEMP),'Explicit RUNNER_TEMP required');
  assert(process.env.PROOF_DIR&&isAbsolute(process.env.PROOF_DIR),'Explicit temporary PROOF_DIR required');
  const tempRoot=await realpath(process.env.RUNNER_TEMP);
  proofDir=resolve(process.env.PROOF_DIR);
  const proofParent=await realpath(dirname(proofDir));
  assert(proofParent===tempRoot||within(tempRoot,proofParent),'Proof parent must resolve inside RUNNER_TEMP');
  proofDir=join(proofParent,basename(proofDir));
  assert(within(tempRoot,proofDir),'PROOF_DIR must be a child of RUNNER_TEMP');
  // Exclusive final directory creation prevents reusing or overwriting earlier evidence.
  await mkdir(proofDir,{recursive:false});proofCreated=true;
  proofDir=await realpath(proofDir);assert(within(tempRoot,proofDir),'Resolved proof path escaped RUNNER_TEMP');
  assert(process.env.CHROME_BIN&&isAbsolute(process.env.CHROME_BIN),'Explicit installed Chrome path required');
  assert(process.env.PLAYWRIGHT_MODULE&&isAbsolute(process.env.PLAYWRIGHT_MODULE),'Explicit playwright-core module path required');
  assert(/^[a-f0-9]{64}$/.test(process.env.SCRIPT_SHA256||''),'Explicit reviewed SCRIPT_SHA256 required');
  summary.scriptSha256=sha(await readFile(new URL(import.meta.url)));
  assert.equal(summary.scriptSha256,process.env.SCRIPT_SHA256,'Proof script hash drift');
  const require=createRequire(import.meta.url),pwPath=resolve(process.env.PLAYWRIGHT_MODULE);
  const {chromium}=require(pwPath);const pwVersion=require(join(pwPath,'package.json')).version;
  assert.equal(pwVersion,'1.62.1','Playwright version drift');
  git(['merge-base','--is-ancestor',BASE,TARGET]);git(['merge-base','--is-ancestor',TARGET,'HEAD']);
  assert.deepEqual(sorted(git(['diff','--name-only',BASE,TARGET]).toString().trim().split('\n')),sorted([PAGE,WEBP]),'Production diff scope drift');
  const oldHTML=show(BASE,PAGE).toString('utf8'),newHTML=show(TARGET,PAGE).toString('utf8');
  assert.equal(sha(Buffer.from(newHTML)),'1dc744466c4298cf80047155c06059b91af19eaea37c02d93d7336dc52e11cc0','Candidate HTML hash drift');
  const img='<img src="/assets/illustrations/contact-growth.png" width="1400" height="1193" alt="Illustration of a person considering different paths for growth" decoding="async" fetchpriority="high">';
  const picture='<picture><source srcset="/assets/illustrations/contact-growth-lossless-v1.webp" type="image/webp">'+img+'</picture>';
  assert.equal(once(oldHTML,img,picture),newHTML,'HTML exceeds exact image-wrapper replacement');
  const unsupported=once(newHTML,'type="image/webp"','type="image/x-proof-unsupported"');
  const livePNG=show('HEAD',FIXTURE),repoPNG=show(BASE,PNG),webp=show(TARGET,WEBP);
  assert.equal(livePNG.length,326039);assert.equal(sha(livePNG),'884fec4853f394295ba40eb4bb1d526c60dcd70ce1c3e2ed6b418fbd6068b61c');
  assert.equal(repoPNG.length,331131);assert.equal(sha(repoPNG),'b7cbc52080ba3c6a8daa6b7c0ecba7379b07b1867fb52f77f4589bcb872d331d');
  assert.equal(blob(BASE,PNG),blob(TARGET,PNG),'Original PNG changed');
  assert.equal(webp.length,148352);assert.equal(sha(webp),'87b7613fa8a325772975a113c4076b7f8d4e592546fb355b16068ed7beb3a7a2');
  const pngMetadata=pngInfo(livePNG);assert.equal(pngMetadata.orientation,1,'Fresh-live orientation changed');
  const repoMetadata=pngInfo(repoPNG),webpMetadata=webpInfo(webp);
  const fontBytes={};
  for(const [name,pin]of Object.entries(FONT_PINS)){
    assert.equal(blob(BASE,FONT_DIR+name),pin);assert.equal(blob(TARGET,FONT_DIR+name),pin);
    fontBytes[name]=show(BASE,FONT_DIR+name);
  }
  const cssPaths=['assets/style.css','assets/service-illustrations-v1.css'];
  const assetPins={};
  for(const path of [...cssPaths,'assets/site.js']){
    assert.equal(blob(BASE,path),blob(TARGET,path),'Unchanged asset drift: '+path);
    assetPins[path]={baseCommit:BASE,blob:blob(BASE,path),sha256:sha(show(BASE,path))};
  }
  const cssURLs=['/assets/style.css?v=20261104-enquiry-accessibility','/assets/service-illustrations-v1.css'];
  for(const href of cssURLs)assert.equal(oldHTML.split('href="'+href+'"').length-1,1,'Stylesheet URL drift');
  const fontLinks=oldHTML.match(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/[^"]+"[^>]*>/g);
  assert.equal(fontLinks?.length,1);assert.equal(newHTML.split(fontLinks[0]).length-1,1);
  assert.equal((oldHTML.match(/<link\b[^>]*rel="preconnect"[^>]*>/g)||[]).length,2);
  const fixtureHTML=html=>once(html,fontLinks[0],'<link rel="stylesheet" href="/__proof_fonts/fonts.css">').replace(/<link\b[^>]*rel="preconnect"[^>]*>/g,'');
  const trees=Object.fromEntries([BASE,TARGET].map(ref=>[ref,new Set(git(['ls-tree','-r','--name-only','-z',ref]).toString().split('\0').filter(Boolean))]));
  const cache=new Map();
  const asset=path=>{if(!cache.has(path))cache.set(path,show(BASE,path));return cache.get(path);};
  summary.source={
    changedFiles:[PAGE,WEBP],htmlExactWrapperOnly:true,baseHtmlBlob:blob(BASE,PAGE),candidateHtmlBlob:blob(TARGET,PAGE),
    candidateHtmlSha256:sha(Buffer.from(newHTML)),fixtureCommit:git(['rev-parse','HEAD']).toString().trim(),
    pngFixture:{path:FIXTURE,bytes:livePNG.length,sha256:sha(livePNG),metadata:pngMetadata},
    unchangedRepoPNG:{path:PNG,blob:blob(BASE,PNG),bytes:repoPNG.length,sha256:sha(repoPNG),metadata:repoMetadata},
    webp:{path:WEBP,blob:blob(TARGET,WEBP),bytes:webp.length,sha256:sha(webp),metadata:webpMetadata},
    unchangedAssetPins:assetPins,stylesheetURLs:cssURLs,
    fonts:Object.fromEntries(Object.entries(fontBytes).map(([name,bytes])=>[name,{blob:FONT_PINS[name],bytes:bytes.length,sha256:sha(bytes)}])),
    fontCSSSha256:sha(Buffer.from(fontCSS)),preconnectHintsRemovedPerVariant:2,
    pngRawRGBAComparison:'Not recomputed by this browser script; separately verified by the prior Python evidence.'
  };
  await json('source-proof.json',summary.source);
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,
    args:['--disable-background-networking','--disable-component-update','--disable-extensions',
      '--no-first-run','--no-default-browser-check','--dns-prefetch-disable','--host-resolver-rules=MAP * ~NOTFOUND']});
  summary.browser={version:browser.version(),playwright:pwVersion,executable:process.env.CHROME_BIN,node:process.version,platform:process.platform};
  for(const profile of profiles){
    const baseline=await runCase(profile,'baseline',fixtureHTML(oldHTML),false);
    const candidate=await runCase(profile,'candidate',fixtureHTML(newHTML),true);
    if(baseline&&candidate)await compareRuns(baseline,candidate);
    if(profile.width===320||profile.width===1280||profile.id==='390-dpr3'){
      const fallback=await runCase(profile,'unsupported-type-fallback',fixtureHTML(unsupported),false);
      if(baseline&&fallback)await compareRuns(baseline,fallback);
    }
  }
  await browser.close();browser=null;
  summary.passed=failures.length===0;
  await json('summary.json',summary);
  console.log(JSON.stringify({passed:summary.passed,cases:summary.runs.length,failures:failures.length,proofDir,scriptSha256:summary.scriptSha256}));
  if(failures.length)process.exitCode=1;


  async function runCase(profile,variant,html,expectsWebP){
    const id=profile.id+'-'+variant;
    const run={id,profile,variant,requests:[],blockedExternal:[],missingUnchangedAssets:[],policyViolations:[],
      pageErrors:[],consoleErrors:[],requestFailures:[],interactions:{},colour:null};
    summary.runs.push(run);
    let phase='initial',documents=0;
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},
      deviceScaleFactor:profile.dpr,locale:'en-US',timezoneId:'UTC',colorScheme:'light',serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    context.on('page',popup=>{if(popup!==page){run.policyViolations.push({kind:'popup'});void popup.close();}});
    page.on('pageerror',e=>run.pageErrors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')run.consoleErrors.push(m.text());});
    page.on('requestfailed',r=>run.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
    await context.routeWebSocket('**/*',socket=>{
      run.policyViolations.push({kind:'websocket',url:socket.url()});socket.close();
    });
    await context.addInitScript(()=>{
      window.__proofSubmissions=[];window.__proofBeacons=[];
      document.addEventListener('submit',event=>{
        event.preventDefault();event.stopImmediatePropagation();window.__proofSubmissions.push('submit-event');
      },true);
      for(const method of ['submit','requestSubmit']){
        HTMLFormElement.prototype[method]=function(){
          window.__proofSubmissions.push(method);throw new Error('Offline proof forbids form submission');
        };
      }
      navigator.sendBeacon=function(url){window.__proofBeacons.push(String(url));return false;};
    });
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      const entry={phase,method:request.method(),url:request.url(),type:request.resourceType()};
      run.requests.push(entry);
      const abort=(reason,violation=true)=>{
        entry.outcome=reason;entry.aborted=true;
        if(violation)run.policyViolations.push({...entry});
        return route.abort('blockedbyclient');
      };
      const fulfill=(body,contentType,outcome)=>{
        entry.outcome=outcome;entry.status=200;entry.bytes=Buffer.byteLength(body);
        return route.fulfill({status:200,body,contentType,headers:{'cache-control':'no-store'}});
      };
      if(run.requests.length>100)return abort('request-count-limit');
      if(request.method()!=='GET'||['fetch','xhr','eventsource','ping'].includes(request.resourceType()))
        return abort('api-or-non-get-forbidden');
      if(url.origin!==ORIGIN){
        run.blockedExternal.push({...entry});
        const expected=['www.googletagmanager.com','connect.facebook.net','www.facebook.com'].includes(url.hostname);
        return abort(expected?'expected-tracking-blocked':'unexpected-external-blocked',!expected);
      }
      if(request.isNavigationRequest()){
        if(url.pathname===VIRTUAL_PATH&&!url.search&&request.frame()===page.mainFrame()&&documents++===0)
          return fulfill(html,'text/html','offline-page');
        return abort('unexpected-document-navigation');
      }
      if(url.pathname==='/__proof_fonts/fonts.css')
        return fulfill(fontCSS,'text/css','pinned-font-css');
      if(url.pathname.startsWith('/__proof_fonts/')){
        const name=url.pathname.slice('/__proof_fonts/'.length);
        if(Object.hasOwn(fontBytes,name))return fulfill(fontBytes[name],'font/woff2','pinned-font');
        return abort('unknown-font-fixture');
      }
      let path;
      try{path=decodeURIComponent(url.pathname).replace(/^\/+/,'');}catch{return abort('malformed-path');}
      if(!path||path.includes('\\')||path.includes('\0')||path.split('/').some(x=>x==='.'||x==='..')||
        !((path.startsWith('assets/')||path==='favicon.ico')&&/\.(?:css|js|png|webp|avif|jpe?g|svg|woff2?|ico)$/i.test(path)))
        return abort('non-static-or-private-path');
      if(path===PNG)return fulfill(livePNG,'image/png','pinned-fresh-live-png');
      if(path===WEBP)return fulfill(webp,'image/webp','pinned-target-webp');
      if(!trees[BASE].has(path)||!trees[TARGET].has(path)){
        entry.outcome='missing-unchanged-repository-asset';entry.aborted=true;
        run.missingUnchangedAssets.push(path);
        if(cssPaths.includes(path)||path==='assets/site.js'||/\.(?:css|js|woff2?)$/i.test(path))
          run.policyViolations.push({...entry,kind:'missing-required-asset'});
        return route.abort('blockedbyclient');
      }
      return fulfill(asset(path),mime(path),'pinned-base-git-asset');
    });
    try{
      await page.goto(ORIGIN+VIRTUAL_PATH,{waitUntil:'load',timeout:30000});
      await page.evaluate(async()=>{
        await Promise.all([400,500,600,700].map(w=>document.fonts.load(w+' 16px Inter')));
        await Promise.all([600,700,800].map(w=>document.fonts.load(w+' 16px Manrope')));
        await document.fonts.ready;
        await document.querySelector('.supplied-service-art img').decode();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      });
      run.fonts=await page.evaluate(()=>({
        inter:[400,500,600,700].every(w=>document.fonts.check(w+' 16px Inter')),
        manrope:[600,700,800].every(w=>document.fonts.check(w+' 16px Manrope')),
        faces:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status}))
      }));
      record(run.fonts.inter&&run.fonts.manrope&&run.fonts.faces.length===2&&run.fonts.faces.every(f=>f.status==='loaded'),
        id+': pinned fonts loaded',run.fonts);
      run.hero=await page.locator('.supplied-service-art img').evaluate(img=>({
        currentSrc:img.currentSrc,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,complete:img.complete,
        widthAttribute:img.getAttribute('width'),heightAttribute:img.getAttribute('height'),
        alt:img.getAttribute('alt'),fetchpriority:img.getAttribute('fetchpriority')
      }));
      // Freeze before reference image loads, screenshots or intentional focus scrolling.
      run.initialHeroRequests=run.requests.filter(r=>r.phase==='initial'&&[ORIGIN+'/'+PNG,ORIGIN+'/'+WEBP].includes(r.url)).map(r=>({...r}));
      run.initialCSS=run.requests.filter(r=>r.phase==='initial'&&new URL(r.url).origin===ORIGIN&&new URL(r.url).pathname.startsWith('/assets/')&&new URL(r.url).pathname.endsWith('.css')).map(r=>({...r}));
      const expected=ORIGIN+'/'+(expectsWebP?WEBP:PNG);
      record(run.initialHeroRequests.length===1&&run.initialHeroRequests[0].url===expected&&run.initialHeroRequests[0].status===200,
        id+': exactly one initial hero request',run.initialHeroRequests);
      record(run.hero.currentSrc===expected&&run.hero.complete&&run.hero.naturalWidth===1400&&run.hero.naturalHeight===1193&&
        run.hero.widthAttribute==='1400'&&run.hero.heightAttribute==='1193'&&run.hero.fetchpriority==='high',
        id+': selected hero and natural dimensions',run.hero);
      record(same(sorted(run.initialCSS.map(r=>r.url)),sorted(cssURLs.map(p=>ORIGIN+p)))&&run.initialCSS.every(r=>r.status===200),
        id+': exact original first-party CSS URLs',run.initialCSS);
      run.dom=await snapshot(page);
      record(run.dom.viewport.documentWidth<=profile.width+1,id+': no horizontal document overflow',run.dom.viewport);
      record(run.dom.forms.length===1&&run.dom.forms[0].attributes.action==='/api/contact.php'&&run.dom.forms[0].attributes.method==='post',
        id+': original form action/method retained',run.dom.forms);
      record(run.dom.startedAtFields.length===1&&/^\d+$/.test(run.dom.startedAtFields[0])&&Number(run.dom.startedAtFields[0])>0,
        id+': unchanged site script initialized anti-spam clock',run.dom.startedAtFields);
      record(run.dom.submissionIds.length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(run.dom.submissionIds[0]),
        id+': unchanged site script initialized one transient UUID',run.dom.submissionIds);
      await json(id+'-dom.json',run.dom);
      run.screenshots={};
      phase='screenshots';
      // Keep export volume bounded: baseline/candidate at seven selected profiles,
      // fallback at three profiles; remaining snapshots/metrics still cover all.
      if([320,390,650,651,860,861,1280].includes(profile.width)){
        for(const [name,locator,scale]of [
          ['full',null,'css'],['hero',page.locator('section.pagehero'),'device'],['form',page.locator('#lead-form'),'css']
        ]){
          const file=id+'-'+name+'.png',options={path:join(proofDir,file),animations:'disabled',caret:'hide',scale};
          const bytes=locator?await locator.screenshot(options):await page.screenshot({...options,fullPage:true});
          run.screenshots[name]={file,sha256:sha(bytes),scale};
        }
      }
      phase='keyboard';
      await page.evaluate(()=>{scrollTo({top:0,behavior:'instant'});document.activeElement?.blur();});
      await page.keyboard.press('Tab');
      run.interactions.skipTab=await page.evaluate(()=>({
        class:document.activeElement?.className,href:document.activeElement?.getAttribute('href')
      }));
      record(run.interactions.skipTab.class==='enquiry-skip-link'&&run.interactions.skipTab.href==='#lead-form',
        id+': physical Tab reaches skip link',run.interactions.skipTab);
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.activeElement?.id==='lead-form'&&location.hash==='#lead-form');
      run.interactions.skipEnter=await page.evaluate(()=>({
        focus:document.activeElement?.id,hash:location.hash,tabindex:document.activeElement?.getAttribute('tabindex'),
        top:document.querySelector('#lead-form').getBoundingClientRect().top
      }));
      record(run.interactions.skipEnter.focus==='lead-form'&&run.interactions.skipEnter.tabindex==='-1',
        id+': skip link focuses existing form without submission',run.interactions.skipEnter);
      await page.keyboard.press('Tab');
      run.interactions.firstControl=await page.evaluate(()=>document.activeElement?.id);
      record(run.interactions.firstControl==='enquiry-name',id+': next Tab reaches first field',run.interactions.firstControl);
      phase='mobile-book';
      const book=page.locator('.mobilebar a[href="#lead-form"]');
      run.interactions.mobileBookVisible=await book.isVisible();
      if(run.interactions.mobileBookVisible){
        await page.evaluate(()=>{document.activeElement?.blur();history.replaceState(null,'','/book-consultation/');scrollTo({top:0,behavior:'instant'});});
        await book.click();
        await page.waitForFunction(()=>document.activeElement?.id==='lead-form'&&location.hash==='#lead-form');
        run.interactions.mobileBook=await page.evaluate(()=>({
          focus:document.activeElement?.id,hash:location.hash,top:document.querySelector('#lead-form').getBoundingClientRect().top
        }));
        record(run.interactions.mobileBook.focus==='lead-form',id+': mobile Book focuses form',run.interactions.mobileBook);
      }
      if(variant==='candidate'){
        phase='reference-colour';
        run.colour=await renderDiagnostic(page);
        const native=run.colour.transparent[0];
        record(run.colour.imageDimensions.every(d=>same(d,[1400,1193])),id+': reference dimensions exact',run.colour.imageDimensions);
        record(run.colour.transparent.every(m=>m.differentAlphaChannels===0&&m.maxAlphaError===0),id+': exact native/scaled alpha',run.colour.transparent);
        record(native.opaqueRGBDifferences===0&&native.zeroAlphaRGBDifferences===0&&native.differentRGBChannels===native.partialAlphaRGBDifferences,
          id+': native RGB differences confined to partial alpha',native);
        record(run.colour.transparent.every(m=>m.maxPremultipliedRGBError8Bit<=1),id+': reconstructed premultiplied RGB bound',run.colour.transparent);
        record(run.colour.composites.every(m=>m.maxRawRGBError<=1&&m.differentAlphaChannels===0&&m.nonOpaqueOutputAlphaChannels===0),
          id+': black white cream composite bound',run.colour.composites);
      }
      run.formSubmissions=await page.evaluate(()=>window.__proofSubmissions);
      run.beacons=await page.evaluate(()=>window.__proofBeacons);
      record(run.formSubmissions.length===0,id+': zero submission attempts',run.formSubmissions);
      record(run.beacons.length===0,id+': zero beacon attempts',run.beacons);
      record(run.policyViolations.length===0,id+': zero forbidden requests/navigation',run.policyViolations);
      record(run.pageErrors.length===0,id+': zero page errors',run.pageErrors);
      record(run.requests.every(r=>r.status===200||r.aborted===true),id+': every request locally fulfilled or aborted');
      run.missingUnchangedAssets=sorted(new Set(run.missingUnchangedAssets));
      await json(id+'-run.json',run);
      return run;
    }catch(error){
      run.error=String(error.stack||error);record(false,id+': case completed',run.error);
      await json(id+'-run.json',run);return null;
    }finally{await context.close();}
  }
}


async function snapshot(page){
  return page.evaluate(props=>{
    const attrs=node=>Object.fromEntries([...node.attributes]
      .filter(a=>!(a.name==='value'&&node.matches('input[type="hidden"][name="started_at"],input[type="hidden"][name="SubmissionId"]')))
      .map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)));
    const forms=[...document.forms].map(form=>({
      attributes:attrs(form),controls:[...form.elements].map(node=>({
        tag:node.tagName,attributes:attrs(node),disabled:node.disabled,required:node.required,
        tabIndex:node.tabIndex,value:node.name==='started_at'?'<volatile-site-clock>':
          node.type==='hidden'&&node.name==='SubmissionId'?'<volatile-browser-submission-id>':node.value
      }))
    }));
    const elements=[document.documentElement,document.body,...document.body.querySelectorAll('*')]
      .filter(n=>n.tagName!=='SCRIPT'&&!n.matches('.supplied-service-art > picture, .supplied-service-art > picture > source'))
      .map(node=>{
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
        return {tag:node.tagName,id:node.id,attributes:attrs(node),
          geometry:[rect.x,rect.y,rect.width,rect.height],
          styles:Object.fromEntries(props.map(p=>[p,style.getPropertyValue(p)]))};
      });
    return {
      textContent:document.body.textContent,innerText:document.body.innerText,
      anchors:[...document.querySelectorAll('a')].map(a=>({attributes:attrs(a),resolved:a.href,text:a.textContent})),
      forms,elements,startedAtFields:[...document.querySelectorAll('input[name="started_at"]')].map(n=>n.value),
      submissionIds:[...document.querySelectorAll('input[type="hidden"][name="SubmissionId"]')].map(n=>n.value),
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight},
      responsive:{formColumns:getComputedStyle(document.querySelector('#lead-form')).gridTemplateColumns,
        heroColumns:getComputedStyle(document.querySelector('.service-illustrated-grid')).gridTemplateColumns,
        mobileBookDisplay:getComputedStyle(document.querySelector('.mobilebar')).display}
    };
  },STYLE_PROPS);
}
async function compareRuns(control,candidate){
  const a=control.dom,b=candidate.dom,id=candidate.id;
  record(a.textContent===b.textContent&&a.innerText===b.innerText,id+': unchanged body text');
  record(same(a.anchors,b.anchors),id+': unchanged links');
  record(same(a.forms,b.forms),id+': unchanged form attributes and untouched controls');
  record(same(a.viewport,b.viewport)&&same(a.responsive,b.responsive),id+': unchanged responsive dimensions',
    {baseline:a.viewport,candidate:b.viewport,baselineResponsive:a.responsive,candidateResponsive:b.responsive});
  const differences=[];
  if(a.elements.length!==b.elements.length)differences.push({kind:'element-count',baseline:a.elements.length,candidate:b.elements.length});
  for(let i=0;i<Math.min(a.elements.length,b.elements.length);i++){
    const left=a.elements[i],right=b.elements[i];
    if(left.tag!==right.tag||left.id!==right.id||!same(left.attributes,right.attributes))
      differences.push({index:i,kind:'retained-element-or-attribute',left,right});
    if(left.geometry.some((v,j)=>Math.abs(v-right.geometry[j])>0.25))
      differences.push({index:i,kind:'geometry',tag:left.tag,id:left.id,left:left.geometry,right:right.geometry});
    for(const property of STYLE_PROPS)if(left.styles[property]!==right.styles[property])
      differences.push({index:i,kind:'style',property,left:left.styles[property],right:right.styles[property]});
  }
  candidate.comparison={baseline:control.id,retainedElements:a.elements.length,styleProperties:STYLE_PROPS.length,
    geometryToleranceCSSPixels:0.25,differences,
    screenshotHashesEqual:Object.fromEntries(Object.keys(candidate.screenshots).map(key=>[
      key,control.screenshots[key]?.sha256===candidate.screenshots[key].sha256
    ]))};
  record(differences.length===0,id+': retained geometry and computed styles match',differences.slice(0,30));
  record(same(control.missingUnchangedAssets,candidate.missingUnchangedAssets),id+': unchanged missing assets',
    {baseline:control.missingUnchangedAssets,candidate:candidate.missingUnchangedAssets});
  record(control.interactions.mobileBookVisible===candidate.interactions.mobileBookVisible,id+': unchanged mobile Book visibility');
  await json(id+'-run.json',candidate);
}

// Same alpha/premultiplication/composite metric conventions as the PR49
// diagnostic. The exact native arithmetic model is reported, not generalized
// into a universal decoder assertion for this different image.
async function renderDiagnostic(page){
  return page.evaluate(async paths=>{
    const images=await Promise.all(paths.map(async path=>{
      const image=new Image();image.src=path;await image.decode();return image;
    }));
    const rect=document.querySelector('.supplied-service-art img').getBoundingClientRect();
    const sizes=[[1400,1193],[Math.max(1,Math.round(rect.width*devicePixelRatio)),Math.max(1,Math.round(rect.height*devicePixelRatio))]];
    const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))]
      .map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const draw=(image,width,height,background)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
      if(background!=='transparent'){context.fillStyle=background;context.fillRect(0,0,width,height);}
      context.drawImage(image,0,0,width,height);
      return context.getImageData(0,0,width,height).data;
    };
    const metrics=async(left,right,width,height,background)=>{
      let differentRGBChannels=0,differentPixels=0,maxRawRGBError=0,totalRGBError=0;
      let differentAlphaChannels=0,maxAlphaError=0,nonOpaqueOutputAlphaChannels=0;
      let partialAlphaRGBDifferences=0,opaqueRGBDifferences=0,zeroAlphaRGBDifferences=0;
      let maxPremultipliedRGBError8Bit=0,differentPremultipliedRGBChannels8Bit=0,maxPremultipliedFloatRGBError=0;
      for(let i=0;i<left.length;i+=4){
        const a=left[i+3],b=right[i+3],alphaError=Math.abs(a-b);
        if(alphaError)differentAlphaChannels++;maxAlphaError=Math.max(maxAlphaError,alphaError);
        if(a!==255)nonOpaqueOutputAlphaChannels++;if(b!==255)nonOpaqueOutputAlphaChannels++;
        let pixelDifferent=alphaError!==0;
        for(let channel=0;channel<3;channel++){
          const x=left[i+channel],y=right[i+channel],error=Math.abs(x-y);
          const premultipliedError=Math.abs(Math.round(x*a/255)-Math.round(y*b/255));
          if(premultipliedError)differentPremultipliedRGBChannels8Bit++;
          maxPremultipliedRGBError8Bit=Math.max(maxPremultipliedRGBError8Bit,premultipliedError);
          maxPremultipliedFloatRGBError=Math.max(maxPremultipliedFloatRGBError,Math.abs(x*a/255-y*b/255));
          if(error){
            differentRGBChannels++;pixelDifferent=true;totalRGBError+=error;
            if(a===0)zeroAlphaRGBDifferences++;else if(a===255)opaqueRGBDifferences++;else partialAlphaRGBDifferences++;
          }
          maxRawRGBError=Math.max(maxRawRGBError,error);
        }
        if(pixelDifferent)differentPixels++;
      }
      return {width,height,background,pngSHA256:await hash(left),webpSHA256:await hash(right),
        rawRGBAExactlyEqual:differentRGBChannels===0&&differentAlphaChannels===0,
        differentRGBChannels,differentPixels,maxRawRGBError,meanAbsoluteRGBError:totalRGBError/(width*height*3),
        differentAlphaChannels,maxAlphaError,nonOpaqueOutputAlphaChannels,
        partialAlphaRGBDifferences,opaqueRGBDifferences,zeroAlphaRGBDifferences,
        maxPremultipliedRGBError8Bit,differentPremultipliedRGBChannels8Bit,maxPremultipliedFloatRGBError};
    };
    const transparent=[],composites=[];let model;
    for(let size=0;size<sizes.length;size++){
      const [width,height]=sizes[size],data=images.map(img=>draw(img,width,height,'transparent'));
      transparent.push(await metrics(data[0],data[1],width,height,'transparent'));
      if(size===0){
        const expected=new Uint8ClampedArray(data[0].length);
        let mismatchedChannels=0,maxChannelError=0,partialAlphaPixels=0;
        for(let i=0;i<expected.length;i+=4){
          const alpha=data[0][i+3];expected[i+3]=alpha;
          if(alpha>0&&alpha<255)partialAlphaPixels++;
          for(let channel=0;channel<3;channel++){
            const premultiplied=Math.floor(data[0][i+channel]*alpha/255);
            expected[i+channel]=alpha===0?0:Math.round(premultiplied*255/alpha);
          }
          for(let channel=0;channel<4;channel++){
            const error=Math.abs(expected[i+channel]-data[1][i+channel]);
            if(error)mismatchedChannels++;maxChannelError=Math.max(maxChannelError,error);
          }
        }
        model={name:'floor(RGB*A/255), then nearest unpremultiply; diagnostic only',
          predictedSHA256:await hash(expected),observedSHA256:await hash(data[1]),mismatchedChannels,maxChannelError,partialAlphaPixels};
      }
      for(const background of ['#000000','#ffffff','#f7f4ed']){
        const opaque=images.map(img=>draw(img,width,height,background));
        composites.push(await metrics(opaque[0],opaque[1],width,height,background));
      }
    }
    return {criteriaVersion:'consultation-render-diagnostic-v1',
      rawRGBAEqualityObserved:transparent.every(m=>m.rawRGBAExactlyEqual),
      imageDimensions:images.map(img=>[img.naturalWidth,img.naturalHeight]),
      premultipliedMetric:'round(readbackRGB*alpha/255), 8-bit; continuous readback-weighted error is reported separately',
      transparent,composites,model};
  },['/'+PNG,'/'+WEBP]);
}

try{await main();}
catch(error){
  failures.push({label:'Fatal source/runner/setup gate',details:String(error.stack||error)});
  summary.passed=false;
  if(proofCreated)await json('summary.json',summary).catch(()=>{});
  console.error(JSON.stringify(failures,null,2));process.exitCode=1;
}finally{if(browser)await browser.close().catch(()=>{});}
