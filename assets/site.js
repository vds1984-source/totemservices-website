document.addEventListener('DOMContentLoaded',()=>{
  const menuButton=document.querySelector('.menuBtn');
  const nav=document.querySelector('.nav');
  if(menuButton&&nav) menuButton.addEventListener('click',()=>nav.classList.toggle('open'));

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
    if(book) nav.insertBefore(portal,book); else nav.appendChild(portal);
  }

  document.querySelectorAll('.leadform').forEach(form=>{
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const submit=form.querySelector('button[type="submit"]');
      const status=form.querySelector('.form-status');
      const fd=new FormData(form);
      const payload=Object.fromEntries(fd.entries());
      const waLines=['New Website Enquiry'];
      for(const [k,v] of Object.entries(payload)){
        if(v && !['website','started_at'].includes(k)) waLines.push(`${k}: ${v}`);
      }
      const waUrl='https://wa.me/918278416000?text='+encodeURIComponent(waLines.join('\n'));
      const setStatus=(type,html)=>{
        if(!status) return;
        if(!type){ status.className='form-status'; status.innerHTML=''; return; }
        status.className=`form-status show ${type}`;
        status.innerHTML=html;
      };

      if(submit){submit.disabled=true;submit.textContent='Sending…';}
      setStatus('', '');

      try{
        const response=await fetch(form.action||'/api/contact.php',{
          method:'POST',
          headers:{'Accept':'application/json'},
          body:fd
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok || !data.ok) throw new Error(data.message||'Unable to send enquiry');
        setStatus('success','Thank you. Your enquiry has been sent to the Totem team. We will contact you shortly.');
        if(typeof gtag==='function') gtag('event','generate_lead',{event_category:'Contact Form'});
        if(typeof fbq==='function') fbq('track','Lead');
        form.reset();
        const started=form.querySelector('[name="started_at"]');
        if(started) started.value=Math.floor(Date.now()/1000);
      }catch(err){
        setStatus('error',`We could not deliver the email right now. <a href="${waUrl}" target="_blank" rel="noopener noreferrer"><strong>Continue on WhatsApp →</strong></a>`);
      }finally{
        if(submit){submit.disabled=false;submit.textContent='Send Enquiry';}
      }
    });
  });
});
