document.addEventListener('DOMContentLoaded',()=>{

  // Preserve only campaign labels for this tab, for at most 30 minutes.
  // Enquiry contents, personal details and full URLs are never stored here.
  const campaignKeys=['source','medium','campaign','term','content'];
  const campaignStorageKey='totem_campaign_v1';
  const campaignLifetime=30*60*1000;
  const campaignNow=Date.now();
  const campaignQuery=new URLSearchParams(window.location.search);
  let campaignFields={};

  for(const key of campaignKeys){
    const value=campaignQuery.get('utm_'+key);
    if(value){
      const clean=Array.from(value.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,200).join('');
      if(clean) campaignFields[key]=clean;
    }
  }

  if(Object.keys(campaignFields).length){
    // A new campaign replaces the previous campaign; never combine two touches.
    try{
      window.sessionStorage.setItem(campaignStorageKey,JSON.stringify({
        captured_at:campaignNow,
        fields:campaignFields
      }));
    }catch(storageError){ /* Current-page attribution still works. */ }
  }else{
    try{
      const saved=JSON.parse(window.sessionStorage.getItem(campaignStorageKey) || 'null');
      if(saved && Number.isFinite(saved.captured_at) &&
         saved.captured_at<=campaignNow && campaignNow-saved.captured_at<campaignLifetime &&
         saved.fields && typeof saved.fields==='object' && !Array.isArray(saved.fields)){
        for(const key of campaignKeys){
          if(typeof saved.fields[key]==='string'){
            const clean=Array.from(saved.fields[key].replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,200).join('');
            if(clean) campaignFields[key]=clean;
          }
        }
      }else if(saved){
        window.sessionStorage.removeItem(campaignStorageKey);
      }
    }catch(storageError){ /* Storage is optional; forms remain usable. */ }
  }

  const trackContactEvent=(eventName,parameters)=>{
    try{
      if(typeof gtag==='function') gtag('event',eventName,parameters);
    }catch(trackingError){ /* Analytics must not interrupt contact actions. */ }
  };

  // A phone or WhatsApp click is an intent signal, not a delivered enquiry.
  // Delegation also covers the WhatsApp fallback inserted after a failed form.
  document.addEventListener('click',event=>{
    const link=event.target?.closest?.('a[href]');
    if(!link) return;

    let destination;
    try{ destination=new URL(link.href,window.location.href); }
    catch(urlError){ return; }

    let eventName='';
    if(destination.protocol==='tel:' && destination.pathname.replace(/\D/g,'')==='918278416000'){
      eventName='click_phone';
    }else if(destination.protocol==='https:' && destination.hostname==='wa.me' &&
             destination.pathname==='/918278416000'){
      eventName='click_whatsapp';
    }
    if(!eventName) return;

    let placement='content';
    if(link.closest('.form-status')) placement='form_fallback';
    else if(link.closest('.mobilebar')) placement='mobile_bar';
    else if(link.closest('.utility')) placement='utility';
    else if(link.closest('.footer')) placement='footer';
    else if(link.classList.contains('wa')) placement='floating_button';
    else if(link.closest('.header')) placement='header';

    // Do not send link URLs/text: the fallback URL can contain enquiry details.
    trackContactEvent(eventName,{
      event_category:'Website Contact',
      contact_placement:placement
    });
  });

  const menuButton=document.querySelector('.menuBtn');
  const nav=document.querySelector('.nav');

  if(menuButton&&nav){
    menuButton.setAttribute('aria-expanded','false');
    menuButton.addEventListener('click',()=>{
      const open=nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded',String(open));
    });
  }

  // Make the company portal available site-wide without duplicating header markup on every page.
  if(nav && !nav.querySelector('[data-totem-portal]')){
    const portal=document.createElement('a');

    portal.href='https://crm.totemservices.org/login';
    portal.className='portalLink';
    portal.target='_blank';
    portal.rel='noopener noreferrer';
    portal.dataset.totemPortal='1';
    portal.textContent='Portal';

    const book=nav.querySelector('a.btn[href="/book-consultation/"]');

    if(book){
      nav.insertBefore(portal,book);
    }else{
      nav.appendChild(portal);
    }
  }

  // Website enquiry forms
  document.querySelectorAll('.leadform').forEach(form=>{

    const submit=form.querySelector('button[type="submit"]');
    const originalLabel=submit ? submit.textContent : '';
    const started=form.querySelector('[name="started_at"]');
    let submitting=false;

    // Initialise every form, including the visitor's first submission.
    if(started) started.value=Math.floor(Date.now()/1000);

    // Keep campaign labels available when a visitor reaches a form from another page.
    const applyCampaignFields=()=>{
      for(const key of campaignKeys){
        const value=campaignFields[key];
        if(!value) continue;
        let input=form.querySelector(`[name="UTM_${key}"]`);
        if(!input){
          input=document.createElement('input');
          input.type='hidden';
          input.name='UTM_'+key;
          form.appendChild(input);
        }
        input.value=value;
      }
    };
    applyCampaignFields();

    form.addEventListener('submit',async e=>{

      e.preventDefault();

      if(submitting) return;

      if(!form.checkValidity()){
        form.reportValidity();
        return;
      }

      let status=form.querySelector('.form-status');

      if(!status && submit){
        status=document.createElement('div');
        status.className='form-status wide';
        status.setAttribute('role','status');
        status.setAttribute('aria-live','polite');
        submit.insertAdjacentElement('afterend',status);
      }

      applyCampaignFields();
      const fd=new FormData(form);
      const honeypotFilled=Boolean(fd.get('website'));
      const requestedFormType=form.querySelector('[name="FormType"]')?.value;
      const formType=['contact','consultation','proposal'].includes(requestedFormType) ? requestedFormType : 'contact';

      // Outbound-link analytics may record URLs automatically. Keep enquiry
      // details out of this link; the visitor can share them inside WhatsApp.
      const waUrl='https://wa.me/918278416000?text='+
        encodeURIComponent('Hello Totem, I would like help with my website enquiry.');

      const setStatus=(type,message,whatsApp=false)=>{

        if(!status) return;

        if(!type){
          status.className='form-status wide';
          status.textContent='';
          return;
        }

        status.className=`form-status wide show ${type}`;
        status.textContent=message;
        if(whatsApp){
          const link=document.createElement('a');
          link.href=waUrl;
          link.target='_blank';
          link.rel='noopener noreferrer';
          link.textContent='Continue on WhatsApp →';
          status.appendChild(document.createTextNode(' '));
          status.appendChild(link);
        }
      };

      submitting=true;
      form.setAttribute('aria-busy','true');

      if(submit){
        submit.disabled=true;
        submit.textContent='Sending…';
      }

      setStatus('', '');

      try{

        const action=form.getAttribute('action') || '/api/contact.php';

        const response=await fetch(action,{
          method:'POST',
          headers:{
            'Accept':'application/json'
          },
          body:fd
        });

        const data=await response.json().catch(()=>({}));

        if(response.status===422 || response.status===429){
          setStatus('error',typeof data.message==='string' ? data.message : 'Please check your details and try again.');
          return;
        }

        if(!response.ok || data.ok!==true){
          throw new Error('Unable to confirm delivery');
        }

        setStatus(
          'success',
          'Thank you. Your enquiry has been sent to the Totem team. We will contact you shortly.'
        );

        form.reset();

        if(started){
          started.value=Math.floor(Date.now()/1000);
        }

        // Tracking failures must never turn a delivered enquiry into a failure message.
        if(!honeypotFilled){
          trackContactEvent('generate_lead',{
              event_category:'Website Enquiry',
              form_type:formType
          });

          try{
            if(typeof fbq==='function') fbq('track','Lead');
          }catch(trackingError){ /* Enquiry already delivered. */ }
        }

      }catch(err){

        setStatus(
          'error',
          'We could not confirm delivery right now. You can contact us on WhatsApp.',
          true
        );

      }finally{

        submitting=false;
        form.setAttribute('aria-busy','false');

        if(submit){
          submit.disabled=false;
          submit.textContent=originalLabel;
        }
      }

    });

  });


  // Work / portfolio filters
  const workFilter=document.querySelector(
    '.filter[aria-label="Portfolio filters"]'
  );

  const workItems=document.querySelectorAll(
    '.reelcard[data-category]'
  );

  const workEmpty=document.querySelector('.work-empty');

  if(workFilter && workItems.length){

    const pills=workFilter.querySelectorAll('[data-filter]');

    const applyWorkFilter=(filter)=>{

      let visibleCount=0;

      workItems.forEach(item=>{

        const categories=(item.dataset.category || '')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);

        const show=
          filter==='all' ||
          categories.includes(filter);

        item.hidden=!show;

        if(show){

          visibleCount++;

        }else{

          const video=item.querySelector('video');

          if(video){
            video.pause();
          }

        }

      });

      pills.forEach(pill=>{

        const active=pill.dataset.filter===filter;

        pill.classList.toggle('active',active);

        pill.setAttribute(
          'aria-pressed',
          active ? 'true' : 'false'
        );

      });

      if(workEmpty){
        workEmpty.hidden=visibleCount!==0;
      }

    };

    pills.forEach(pill=>{

      pill.addEventListener('click',()=>{

        applyWorkFilter(pill.dataset.filter);

      });

    });

    applyWorkFilter('all');

  }

});
