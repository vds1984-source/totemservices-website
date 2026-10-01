document.addEventListener('DOMContentLoaded',()=>{

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

    // Only standard campaign fields are captured; never forward the full query string.
    const query=new URLSearchParams(window.location.search);
    for(const key of ['source','medium','campaign','term','content']){
      const value=query.get('utm_'+key);
      if(!value) continue;
      const input=document.createElement('input');
      input.type='hidden';
      input.name='UTM_'+key;
      input.value=value.slice(0,200);
      form.appendChild(input);
    }

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

      const fd=new FormData(form);
      const payload=Object.fromEntries(fd.entries());

      const waLines=['New Website Enquiry'];

      for(const [k,v] of Object.entries(payload)){
        if(v && ['Name','Business','Phone','Email','City','Industry','Service','Budget','Challenge'].includes(k)){
          waLines.push(`${k}: ${v}`);
        }
      }

      const waUrl='https://wa.me/918278416000?text='+
        encodeURIComponent(waLines.join('\n'));

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
        try{
          if(typeof gtag==='function'){
            gtag('event','generate_lead',{
              event_category:'Website Enquiry',
              form_type:form.querySelector('[name="FormType"]')?.value || 'contact'
            });
          }
        }catch(trackingError){ /* Enquiry already delivered. */ }

        try{
          if(typeof fbq==='function') fbq('track','Lead');
        }catch(trackingError){ /* Enquiry already delivered. */ }

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
