document.addEventListener('DOMContentLoaded',()=>{

  const menuButton=document.querySelector('.menuBtn');
  const nav=document.querySelector('.nav');

  if(menuButton&&nav){
    menuButton.addEventListener('click',()=>nav.classList.toggle('open'));
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

    form.addEventListener('submit',async e=>{

      e.preventDefault();

      if(!form.checkValidity()){
        form.reportValidity();
        return;
      }

      const submit=form.querySelector('button[type="submit"]');

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
        if(v && !['website','started_at','FormType'].includes(k)){
          waLines.push(`${k}: ${v}`);
        }
      }

      const waUrl='https://wa.me/918278416000?text='+
        encodeURIComponent(waLines.join('\n'));

      const setStatus=(type,html)=>{

        if(!status) return;

        if(!type){
          status.className='form-status wide';
          status.innerHTML='';
          return;
        }

        status.className=`form-status wide show ${type}`;
        status.innerHTML=html;
      };

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

        if(!response.ok || !data.ok){
          throw new Error(data.message||'Unable to send enquiry');
        }

        setStatus(
          'success',
          'Thank you. Your enquiry has been sent to the Totem team. We will contact you shortly.'
        );

        if(typeof gtag==='function'){
          gtag('event','generate_lead',{
            event_category:'Contact Form'
          });
        }

        if(typeof fbq==='function'){
          fbq('track','Lead');
        }

        form.reset();

        const started=form.querySelector('[name="started_at"]');

        if(started){
          started.value=Math.floor(Date.now()/1000);
        }

      }catch(err){

        setStatus(
          'error',
          `We could not deliver the email right now. <a href="${waUrl}" target="_blank" rel="noopener noreferrer"><strong>Continue on WhatsApp →</strong></a>`
        );

      }finally{

        if(submit){
          submit.disabled=false;
          submit.textContent='Send Enquiry';
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