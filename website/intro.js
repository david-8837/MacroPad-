(() => {
  'use strict';
  // Scripted decoration over the real page. Scroll stays available at all times.
  const ENABLE_INTRO = true;
  const roles = {
    interface:{label:'Interface',color:'#d26139'},
    content:{label:'Content',color:'#52788f'},
    visual:{label:'Visual',color:'#56867c'},
    details:{label:'Details',color:'#9370a6'}
  };
  // Each trigger builds only its own actual page elements when it comes into view.
  const definitions = [
    {id:'hero',trigger:'.hero',tracks:{
      interface:[
        {s:'.site-header',t:0,d:350,frame:true,label:'Header'},
        {s:'.hero-download-mount > a, .hero-actions > a',t:1100,stagger:450,label:'Action'},
        {s:'.hero-download-note',t:2200,label:'Availability'}
      ],
      content:[
        {s:'.announcement',t:0,d:350,frame:true,label:'Top bar'},
        // Interface draws the header; Content fills its brand.
        {s:'.site-header .brand',t:1200,label:'Brand'},
        {s:'.hero-copy > .eyebrow',t:1700,label:'Introduction'},
        {s:'.hero-copy .intro-heading-line',t:2200,stagger:1000,d:850,type:true,label:'Typing'},
        {s:'.hero-copy > p',t:5400,d:1700,type:true,label:'Typing'},
        {s:'.hero-note',t:9100,label:'Details'}
      ],
      visual:[
        {s:'.hero-art',t:400,d:900,frame:true,label:'Artwork frame'},
        {s:'.hero-art img',t:1500,d:2000,frame:true,label:'Macropad'},
        {s:'.visual-footer > span',t:4300,stagger:550,label:'Caption'}
      ],
      details:[
        // Draw the nav as one frame; its labels still type separately, but
        // real links become usable as soon as the navigation is visible.
        {s:'.desktop-nav',t:350,d:180,label:'Navigation'},
        // Details writes into the artwork frame drawn by Visual.
        {s:'.hero-art .art-label',t:1550,d:750,type:true,label:'Typing'},
        {s:'.hero-art .art-caption',t:2450,d:1000,type:true,label:'Typing'}
      ]
    }},
    {id:'specs',trigger:'.spec-strip',tracks:{
      interface:[{s:'.spec-strip',t:0,d:650,frame:true,label:'Frame'}],
      details:[{s:'.spec-strip > div',t:750,stagger:550,label:'Specifications'}]
    }},
    {id:'studio-title',trigger:'.section-heading',tracks:{
      interface:[{s:'.section-heading .eyebrow',t:0,label:'Introduction'}],
      content:[{s:'.section-heading h2',t:500,d:1650,type:true,label:'Typing'}, {s:'.section-heading > p',t:2400,d:1300,type:true,label:'Typing'}]
    }},
    {id:'editor',trigger:'.studio-showcase',tracks:{
      interface:[
        {s:'.studio-showcase',t:0,d:750,frame:true,label:'Studio frame'},
        {s:'.mock-window',t:850,d:750,frame:true,label:'Editor frame'},
        {s:'.mock-top',t:1700,label:'Toolbar'},
        {s:'.mock-sidebar',t:2150,d:550,frame:true,label:'Sidebar'},
        {s:'.mock-sidebar .mock-label, .mock-rail-line',t:2800,stagger:300,label:'Labels'},
        {s:'.layer-buttons button',t:3700,stagger:420,label:'Layer'},
        {s:'.mock-side-bottom',t:5600,label:'Details'}
      ],
      content:[
        {s:'.studio-copy .small-label',t:900,label:'Editor'},
        {s:'.studio-copy h3',t:1350,d:1300,type:true,label:'Typing'},
        {s:'.studio-copy > p',t:2850,d:1600,type:true,label:'Typing'},
        {s:'.studio-copy .inline-arrow',t:4650,label:'Link'},
        {s:'.studio-index',t:5150,label:'Index'}
      ],
      visual:[
        {s:'.mock-deck-title',t:1800,label:'Deck'},
        {s:'.mock-board',t:2300,d:700,frame:true,label:'Macropad frame'},
        {s:'.mock-display',t:3100,label:'Display'},
        {s:'.mock-knob',t:3550,label:'Knob'},
        {s:'.mock-keys button',t:4100,stagger:380,label:'Key'}
      ],
      details:[{s:'.mock-caption',t:5400,label:'Caption'}]
    }},
    {id:'features',trigger:'.features',tracks:{
      interface:[{s:'.features',t:0,d:450,frame:true,label:'Features frame'}, {s:'.features article',t:500,stagger:550,d:500,frame:true,label:'Feature'}],
      content:[{s:'.features .feature-top',t:650,stagger:550,label:'Label'}, {s:'.features h3',t:2500,stagger:1100,d:900,type:true,label:'Typing'}],
      details:[{s:'.features p',t:3700,stagger:1100,d:900,type:true,label:'Typing'}]
    }},
    {id:'how-background',trigger:'.how-section',tracks:{
      visual:[{s:'.how-backdrop',t:0,d:700,frame:true,label:'Section background'}]
    }},
    {id:'how-heading',trigger:'.how-heading',tracks:{
      content:[{s:'.how-heading .eyebrow',t:800,label:'Introduction'}, {s:'.how-heading h2',t:1250,d:1500,type:true,label:'Typing'}],
      details:[{s:'.how-heading > p',t:1600,d:1100,type:true,label:'Typing'}]
    }},
    {id:'steps',trigger:'.steps',tracks:{
      interface:[{s:'.steps',t:0,d:450,frame:true,label:'Steps frame'}, {s:'.steps article',t:500,stagger:550,d:500,frame:true,label:'Step'}],
      content:[{s:'.step-number',t:650,stagger:550,label:'Number'}, {s:'.steps h3',t:2500,stagger:850,d:700,type:true,label:'Typing'}],
      details:[{s:'.steps p',t:3450,stagger:900,d:1000,type:true,label:'Typing'}, {s:'.how-bottom',t:6700,label:'Details'}]
    }},
    {id:'hardware',trigger:'.hardware-section',tracks:{
      visual:[{s:'.hardware-image',t:0,d:800,frame:true,label:'Artwork frame'}, {s:'.hardware-image img',t:900,d:1600,frame:true,label:'Macropad'}],
      content:[{s:'.hardware-copy .eyebrow',t:300,label:'Introduction'}, {s:'.hardware-copy h2',t:800,d:1500,type:true,label:'Typing'}, {s:'.hardware-copy > p',t:2500,d:1650,type:true,label:'Typing'}],
      details:[{s:'.hardware-tag',t:1900,label:'Caption'}, {s:'.hardware-facts',t:2800,d:550,frame:true,label:'Specifications'}, {s:'.hardware-facts > div',t:3450,stagger:500,label:'Build'}, {s:'.safety-note',t:4800,d:1500,type:true,label:'Typing'}, {s:'.hardware-copy > a',t:6500,label:'Guide'}]
    }},
    {id:'faq-heading',trigger:'.faq-section',tracks:{
      interface:[{s:'.faq-border',t:0,d:450,frame:true,label:'Section divider'}, {s:'.faq-heading .eyebrow',t:500,label:'Introduction'}],
      content:[{s:'.faq-heading h2',t:500,d:1500,type:true,label:'Typing'}, {s:'.faq-heading > p',t:2200,d:950,type:true,label:'Typing'}],
      visual:[{s:'.faq-aside',t:1000,label:'Mark'}]
    }},
    {id:'faq-list',trigger:'.faq-list',tracks:{
      interface:[{s:'.faq-list',t:0,d:450,frame:true,label:'Questions frame'}, {s:'.faq-item',t:500,stagger:500,d:400,frame:true,label:'Question frame'}],
      content:[{s:'.faq-item summary',t:550,stagger:500,label:'Question'}]
    }},
    {id:'feedback-background',trigger:'.feedback-section',tracks:{
      visual:[{s:'.feedback-backdrop',t:0,d:700,frame:true,label:'Section background'}]
    }},
    {id:'feedback-heading',trigger:'.feedback-header',tracks:{
      interface:[{s:'.feedback-header .eyebrow',t:0,label:'Introduction'}],
      content:[{s:'.feedback-header h2',t:500,d:1500,type:true,label:'Typing'}, {s:'.feedback-header > p',t:2200,d:1100,type:true,label:'Typing'}]
    }},
    {id:'feedback-form',trigger:'.feedback-form',tracks:{
      interface:[{s:'.feedback-form',t:0,d:550,frame:true,label:'Form frame'}, {s:'.feedback-field',t:700,stagger:650,d:450,frame:true,label:'Field'}, {s:'.feedback-submit',t:2600,label:'Action'}],
      content:[{s:'.feedback-field label',t:1200,stagger:700,label:'Label'}, {s:'.feedback-bottom > p',t:2650,d:1150,type:true,label:'Typing'}]
    }},
    {id:'support',trigger:'.support-card',tracks:{
      interface:[{s:'.support-card',t:0,d:700,frame:true,label:'Support frame'}, {s:'.support-topline',t:800,label:'Details'}, {s:'.support-actions button',t:4250,stagger:500,label:'Support option'}, {s:'.support-bottomline',t:6000,label:'Details'}],
      visual:[{s:'.support-art',t:700,d:600,frame:true,label:'Artwork frame'}, {s:'.support-mark',t:1450,label:'Mark'}],
      content:[{s:'.support-eyebrow',t:900,label:'Introduction'}, {s:'.support-card h2',t:1450,d:1200,type:true,label:'Typing'}, {s:'.support-copy',t:2800,d:1100,type:true,label:'Typing'}, {s:'.support-availability',t:5000,d:900,type:true,label:'Typing'}]
    }},
    {id:'closing',trigger:'.closing',tracks:{
      interface:[{s:'.closing',t:0,d:750,frame:true,label:'Section frame'}, {s:'.closing-top',t:850,label:'Introduction'}, {s:'.closing-bottom',t:5250,label:'Details'}],
      content:[{s:'.closing h2',t:1100,d:1500,type:true,label:'Typing'}, {s:'.closing-main p',t:2850,d:1300,type:true,label:'Typing'}, {s:'.closing-actions > a',t:4400,stagger:500,label:'Action'}],
      visual:[{s:'.closing-symbol',t:1600,label:'Mark'}]
    }},
    {id:'cases-hero',trigger:'.cases-hero',tracks:{
      interface:[{s:'.site-header',t:0,d:350,frame:true,label:'Header'}, {s:'.case-guide-jump',t:1100,label:'Guide link'}],
      content:[{s:'.announcement',t:0,d:350,frame:true,label:'Top bar'}, {s:'.site-header .brand',t:1200,label:'Brand'}, {s:'.cases-hero .eyebrow',t:1550,label:'Introduction'}, {s:'.cases-hero h1',t:2150,d:1700,type:true,label:'Typing'}, {s:'.cases-hero p',t:4000,d:1150,type:true,label:'Typing'}],
      details:[{s:'.desktop-nav',t:350,d:180,label:'Navigation'}, {s:'.cases-hero-index',t:1800,label:'Index'}]
    }},
    {id:'case-sale-heading',trigger:'.case-sale-heading',tracks:{
      interface:[{s:'.case-sale-heading .eyebrow',t:0,label:'Introduction'}],
      content:[{s:'.case-sale-heading h2',t:500,d:1450,type:true,label:'Typing'}, {s:'.case-sale-heading > p',t:1800,label:'Details'}]
    }},
    {id:'case-sale-cards',trigger:'.case-sale-grid',tracks:{
      interface:[{s:'.case-sale-card',t:0,stagger:550,d:600,frame:true,label:'Case frame'}, {s:'.case-sale-card button',t:3500,stagger:500,label:'Order status'}],
      visual:[{s:'.case-sale-visual',t:750,stagger:550,d:700,frame:true,label:'Case illustration'}],
      content:[{s:'.case-sale-label, .case-sale-card h3',t:1150,stagger:400,label:'Case'}, {s:'.case-sale-price',t:2400,stagger:500,label:'Price'}, {s:'.case-sale-description',t:3200,stagger:700,d:900,type:true,label:'Typing'}, {s:'.case-order-note',t:5000,d:1200,type:true,label:'Details'}]
    }},
    {id:'cases-gallery',trigger:'.cases-gallery',tracks:{
      interface:[{s:'.cases-gallery-heading',t:0,d:550,frame:true,label:'Gallery frame'}, {s:'.case-card, .cases-empty',t:650,stagger:550,d:600,frame:true,label:'Case frame'}, {s:'.cases-future',t:1500,d:600,frame:true,label:'Library frame'}],
      visual:[{s:'.case-card img',t:1350,stagger:700,d:800,frame:true,label:'Model picture'}, {s:'.case-preview-label',t:1400,label:'Label'}],
      content:[{s:'.cases-gallery-heading h2, .cases-gallery-heading p',t:800,stagger:600,label:'Label'}, {s:'.case-card h3, .cases-empty h3',t:2200,stagger:600,label:'Model name'}, {s:'.cases-empty p',t:2900,d:900,type:true,label:'Typing'}, {s:'.case-card a, .case-card button',t:3500,stagger:500,label:'Download'}]
    }},
    {id:'case-guide-intro',trigger:'.case-guide-intro',tracks:{
      interface:[{s:'.case-guide-intro .eyebrow',t:0,label:'Introduction'}],
      content:[{s:'.case-guide-intro h2',t:500,d:1450,type:true,label:'Typing'}, {s:'.case-guide-intro > p',t:2100,d:1200,type:true,label:'Typing'}]
    }},
    {id:'case-guide-steps',trigger:'.guide-steps',tracks:{
      interface:[{s:'.guide-steps',t:0,d:500,frame:true,label:'Steps frame'}, {s:'.guide-step',t:600,stagger:450,d:450,frame:true,label:'Step'}],
      content:[{s:'.guide-step-number',t:1100,stagger:500,label:'Step label'}, {s:'.guide-step h3',t:2500,stagger:700,label:'Heading'}, {s:'.guide-step p',t:3900,stagger:800,d:900,type:true,label:'Typing'}, {s:'.guide-step a',t:7500,stagger:550,label:'Link'}]
    }},
    {id:'case-guide-safety',trigger:'.guide-safety',tracks:{
      details:[{s:'.guide-safety',t:0,d:1400,type:true,label:'Safety note'}]
    }},
    {id:'case-wiring-intro',trigger:'.case-wiring-intro',tracks:{
      interface:[{s:'.case-wiring-intro .eyebrow',t:0,label:'Introduction'}],
      content:[{s:'.case-wiring-intro h2',t:500,d:1450,type:true,label:'Typing'}, {s:'.case-wiring-intro > p',t:2100,d:1200,type:true,label:'Typing'}]
    }},
    {id:'case-diagrams',trigger:'.guide-diagrams',tracks:{
      interface:[{s:'.guide-diagram',t:0,stagger:700,d:600,frame:true,label:'Diagram frame'}, {s:'.guide-diagram a',t:4100,stagger:600,label:'Open diagram'}],
      visual:[{s:'.guide-diagram img',t:800,stagger:700,d:1000,frame:true,label:'Wiring picture'}],
      content:[{s:'.guide-diagram-tag',t:1950,stagger:650,label:'Label'}, {s:'.guide-diagram h3',t:2800,stagger:650,label:'Title'}, {s:'.guide-diagram p',t:3500,stagger:650,d:900,type:true,label:'Typing'}]
    }},
    {id:'case-reference',trigger:'.guide-reference',tracks:{
      interface:[{s:'.guide-reference',t:0,d:500,frame:true,label:'Reference frame'}, {s:'.guide-reference a',t:1900,label:'Guide link'}],
      content:[{s:'.guide-reference p',t:600,d:1100,type:true,label:'Typing'}]
    }},
    {id:'footer',trigger:'footer',tracks:{
      interface:[{s:'footer',t:0,d:600,frame:true,label:'Footer'}, {s:'footer .brand',t:700,label:'Brand'}],
      details:[{s:'footer > p, footer > div',t:900,stagger:500,label:'Details'}]
    }}
  ];
  const content=document.getElementById('site-content'),replay=document.querySelector('.intro-replay');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const clearPreparing=()=>document.documentElement.classList.remove('site-intro-preparing');
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{const x=clamp(n);return x*x*(3-2*x)};
  const lerp=(a,b,n)=>a+(b-a)*smooth(n);
  const save=(el,prop)=>({value:el.style.getPropertyValue(prop),priority:el.style.getPropertyPriority(prop)});
  const restore=(el,prop,old)=>old.value?el.style.setProperty(prop,old.value,old.priority):el.style.removeProperty(prop);
  let stages=[],observer=null,raf=0,skipButton=null,active=new Set(),pending=new Set(),keyHandler=null,resizeHandler=null,interactionHandler=null;
  // Navigation does not replay a visited page; refresh and explicit replay do.
  const pageId=document.documentElement.dataset.introPage || 'home';
  const sessionKey=`zero-scroll-intro-v1:${pageId}`;
  const lastPageKey='zero-scroll-last-page-v1';
  let lastPage='';
  try{lastPage=sessionStorage.getItem(lastPageKey)||'';}catch(_){/* Storage can be unavailable. */}
  let navType;
  try{navType=performance.getEntriesByType?.('navigation')?.[0]?.type;}catch(_){/* No navigation timing. */}
  const refreshed=window.__zeroRefreshHome||navType==='reload'||(!navType&&performance.navigation?.type===1)||
    (window.parent!==window&&navType!=='back_forward'&&lastPage===pageId);
  try{sessionStorage.setItem(lastPageKey,pageId);}catch(_){/* Site stays usable without storage. */}
  let playedHere=false;
  const alreadyPlayed=()=>{try{return playedHere||sessionStorage.getItem(sessionKey)==='played';}catch(_){return playedHere;}};
  const rememberPlayed=()=>{playedHere=true;try{sessionStorage.setItem(sessionKey,'played');}catch(_){/* Site stays usable without storage. */}};


  function textPoints(element,rect){
    const result=[],walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),range=document.createRange();
    while(walker.nextNode()){
      const node=walker.currentNode;if(!node.data.trim())continue;let offset=0;
      for(const character of Array.from(node.data)){
        range.setStart(node,offset);offset+=character.length;range.setEnd(node,offset);
        const r=range.getBoundingClientRect();
        if(r.width>0&&r.height>0&&r.left<rect.right&&r.top<rect.bottom)result.push({x:Math.max(0,Math.min(rect.width,r.right-rect.left)),y:Math.max(0,r.top-rect.top),bottom:Math.min(rect.height,r.bottom-rect.top)});
      }
    }
    range.detach();return result;
  }
  function textMask(target,progress){
    const points=target.points,n=Math.floor(clamp(progress)*points.length);
    if(!n)return 'inset(0 100% 0 0)';
    const p=points[Math.min(points.length,n)-1],top=Math.max(0,p.y-1),bottom=Math.min(target.rect.height,p.bottom+1);
    return `polygon(0 0, 100% 0, 100% ${top}px, ${p.x}px ${top}px, ${p.x}px ${bottom}px, 0 ${bottom}px)`;
  }
  function measure(target){
    const r=target.element.getBoundingClientRect();
    target.rect={left:r.left+scrollX,top:r.top+scrollY,right:r.right+scrollX,bottom:r.bottom+scrollY,width:r.width,height:r.height};
    target.points=target.type?textPoints(target.element,r):[];
  }
  function applyTarget(t,elapsed){
    const raw=clamp((elapsed-t.start)/t.duration),progress=smooth(raw);
    if(raw===t.lastRaw)return;t.lastRaw=raw;
    if(raw>=1){
      for(const prop of ['opacity','clip-path','translate','transition','pointer-events'])restore(t.element,prop,t.original[prop]);
      if(t.inlineText)for(const prop of ['background-image','background-clip','-webkit-background-clip','-webkit-text-fill-color'])t.element.style.removeProperty(prop);
    } else{
      t.element.style.setProperty('opacity',String((t.type?Number(elapsed>=t.start):progress)*t.baseOpacity));
      // As a real element becomes visible it can receive pointer input. Its
      // control is still inert until its own frame and ancestors have begun.
      if(raw>0.05&&!t.inlineText)restore(t.element,'pointer-events',t.original['pointer-events']);
      if(t.inlineText){
        const percent=Math.floor(raw*t.characters)/t.characters*100;
        t.element.style.setProperty('background-image',`linear-gradient(90deg, ${t.textColor} ${percent}%, transparent ${percent}%)`);
        t.element.style.setProperty('background-clip','text');
        t.element.style.setProperty('-webkit-background-clip','text');
        t.element.style.setProperty('-webkit-text-fill-color','transparent');
      } else if(t.type&&t.points.length)t.element.style.setProperty('clip-path',textMask(t,raw));
      else if(t.frame)t.element.style.setProperty('clip-path',`inset(0 ${(1-progress)*100}% 0 0)`);
      else t.element.style.setProperty('translate',`0 ${(1-progress)*7}px`);
    }
  }
  function finishStage(stage){
    for(const track of stage.tracks)for(const t of track.targets)for(const prop of ['opacity','clip-path','translate','transition','pointer-events'])restore(t.element,prop,t.original[prop]);
    // Wrappers contain the original, unchanged text nodes and are only used
    // while this section is being constructed.
    for(const {wrapper,node} of stage.wrappers)if(wrapper.parentNode)wrapper.replaceWith(node);
    stage.controls.forEach((inert,el)=>{el.inert=inert});stage.overlay?.remove();
    active.delete(stage);pending.delete(stage);observer?.unobserve(stage.trigger);stage.done=true;
    if(!pending.size){
      observer?.disconnect();observer=null;
      if(keyHandler)window.removeEventListener('keydown',keyHandler,true);
      if(resizeHandler)window.removeEventListener('resize',resizeHandler);
      if(interactionHandler){document.removeEventListener('pointerdown',interactionHandler,true);document.removeEventListener('click',interactionHandler,true);}
      keyHandler=resizeHandler=interactionHandler=null;skipButton?.remove();skipButton=null;stages=[];
    }
  }
  function finishAll(){
    observer?.disconnect();observer=null;cancelAnimationFrame(raf);raf=0;
    if(keyHandler)window.removeEventListener('keydown',keyHandler,true);
    if(resizeHandler)window.removeEventListener('resize',resizeHandler);
    if(interactionHandler){document.removeEventListener('pointerdown',interactionHandler,true);document.removeEventListener('click',interactionHandler,true);}
    keyHandler=resizeHandler=interactionHandler=null;
    for(const stage of stages)if(!stage.done)finishStage(stage);
    stages=[];active.clear();pending.clear();skipButton?.remove();skipButton=null;clearPreparing();
  }
  function buildOverlay(stage){
    const overlay=document.createElement('div');overlay.className='site-build-overlay';overlay.setAttribute('aria-hidden','true');overlay.dataset.buildStage=stage.id;overlay.dataset.buildDuration=String(stage.endAt);
    overlay.innerHTML=stage.tracks.map(({id})=>{const role=roles[id];return `<div class="site-build-guide" data-guide="${id}" style="color:${role.color}"><span></span><i></i><i></i><i></i><i></i></div><div class="site-build-cursor" data-cursor="${id}" style="color:${role.color}"><svg width="22" height="28" viewBox="0 0 22 28" fill="none"><path d="M2 1.5V22L7.7 16.8L11.7 25.7L15 24.2L11.1 15.6L19 15.3L2 1.5Z" fill="currentColor" stroke="#141414" stroke-width="1.5" stroke-linejoin="round"/></svg><span class="site-build-cursor-label">${role.label}</span></div>`}).join('');
    document.body.appendChild(overlay);stage.overlay=overlay;
    for(const track of stage.tracks){
      track.cursor=overlay.querySelector(`[data-cursor="${track.id}"]`);
      // Carry the very same cursor from the loader into the opening stage.
      // It starts at its on-screen position and joins the normal trajectory.
      if(track.id==='interface' && (stage.id==='hero'||stage.id==='cases-hero')){
        const icon=document.querySelector('.zero-loader.is-leaving .zero-loader-cursor svg');
        if(icon){
          const rect=icon.getBoundingClientRect();
          track.handoff={x:rect.left+scrollX,y:rect.top+scrollY};
          track.cursor.querySelector('svg').replaceWith(icon);
          overlay.dataset.loaderHandoff='';
        }
      }
      track.guide=overlay.querySelector(`[data-guide="${track.id}"]`);
      track.guideLabel=track.guide.querySelector('span');
      track.finishedAt=track.targets[track.targets.length-1].start+track.targets[track.targets.length-1].duration;
      track.nextTarget=0;track.lastGuideTarget=null;
    }
  }
  function measureStage(stage){
    const anchor=stage.trigger.getBoundingClientRect();
    stage.center={x:anchor.left+scrollX+anchor.width/2,y:anchor.top+scrollY+Math.min(anchor.height,innerHeight)/2};
    for(const track of stage.tracks){for(const t of track.targets)measure(t);track.lastGuideTarget=null;}
  }
  function startStage(stage){
    if(stage.started||stage.done)return;
    stage.started=true;stage.startedAt=performance.now();
    measureStage(stage);
    buildOverlay(stage);active.add(stage);
    if(!raf)raf=requestAnimationFrame(tick);
  }
  function tick(now){
    raf=0;
    try{
      for(const stage of [...active]){
        const elapsed=now-stage.startedAt;
        for(const track of stage.tracks){
          const {id,targets,cursor,guide}=track;
          // Targets in a track are sequential. Completed and future targets
          // need no per-frame work; only paint the current one.
          while(track.nextTarget<targets.length){
            const target=targets[track.nextTarget];
            if(elapsed<target.start)break;
            applyTarget(target,elapsed);
            if(elapsed<target.start+target.duration)break;
            track.nextTarget++;
          }
          let index=targets.findIndex(t=>elapsed<t.start+t.duration*(t.type||t.frame?1:.8));if(index<0)index=targets.length-1;
          const t=targets[index],prev=index?targets[index-1].rect:null;
          const point=r=>({x:r.left+r.width*.55,y:r.top+r.height*.52});
          const center=stage.center;
          const from=prev?point(prev):center,to=t.type?{x:t.rect.left,y:t.rect.top+t.rect.height*.5}:point(t.rect);
          const approach=(elapsed-(t.start-380))/420;let x=lerp(from.x,to.x,approach),y=lerp(from.y,to.y,approach),progress=clamp((elapsed-t.start)/t.duration);
          if(t.frame&&progress>0&&progress<1){x=lerp(t.rect.left+4,t.rect.right-4,progress);y=lerp(t.rect.top+4,t.rect.bottom-4,progress);}
          if(t.type&&progress>0&&progress<1&&t.points.length){const p=t.points[Math.max(0,Math.floor(progress*t.points.length)-1)];x=t.rect.left+p.x;y=t.rect.top+(p.y+p.bottom)/2;}
          x+=Math.sin(elapsed*.012+id.length)*1.1;y+=Math.cos(elapsed*.009+id.length)*.7;
          // Keep cursors on screen while their active target is visible, but
          // let off-screen tracks travel with their section as the page scrolls.
          if(t.rect.right>scrollX&&t.rect.left<scrollX+innerWidth&&t.rect.bottom>scrollY&&t.rect.top<scrollY+innerHeight){
            x=Math.max(scrollX+8,Math.min(scrollX+innerWidth-28,x));
            y=Math.max(scrollY+8,Math.min(scrollY+innerHeight-30,y));
          }
          const finished=track.finishedAt,exit=smooth((elapsed-finished-140)/650);
          x=lerp(x,center.x,exit);y=lerp(y,center.y,exit);
          let opacity=smooth((elapsed-Math.max(100,targets[0].start-500))/350)*(1-smooth((elapsed-finished-200)/450));
          if(track.handoff){
            const arrival=smooth(elapsed/500);
            x=lerp(track.handoff.x,x,arrival);y=lerp(track.handoff.y,y,arrival);
            opacity=Math.max(opacity,1-arrival);
            if(elapsed>=500){track.handoff=null;delete stage.overlay.dataset.loaderHandoff;}
          }
          cursor.style.transform=`translate3d(${x}px,${y}px,0)`;cursor.style.opacity=String(opacity);
          if(track.lastGuideTarget!==t){
            guide.style.transform=`translate3d(${t.rect.left}px,${t.rect.top}px,0)`;guide.style.width=`${t.rect.width}px`;guide.style.height=`${t.rect.height}px`;track.guideLabel.textContent=t.label;track.lastGuideTarget=t;
          }
          const age=elapsed-t.start,pulse=age>=-80&&age<t.duration?clamp(1-Math.abs(age-t.duration*.32)/(t.duration*.68)):0;guide.style.opacity=String(pulse*opacity);
        }
        // Release each visible real control as soon as its own elements are
        // present; do not wait for every other cursor in the section.
        for(const [control,wasInert] of stage.controls){
          if(!wasInert&&control.inert&&elapsed>=stage.controlReady.get(control))control.inert=false;
        }
        if(elapsed>=stage.endAt)finishStage(stage);
      }
      if(active.size)raf=requestAnimationFrame(tick);
    }catch(error){console.warn('[website scroll build] Animation failed; opening site.',error);finishAll();}
  }
  function addTextTargets(){
    const owners=new Map();
    for(const stage of stages)for(const track of stage.tracks)for(const target of track.targets)owners.set(target.element,{stage,track,target});
    const textNodes=[],walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())if(walker.currentNode.data.trim())textNodes.push(walker.currentNode);
    const byOwner=new Map(),candidates=[];
    // Gather all layout/style information before adding any wrappers. Mixing
    // reads and writes here forces a full layout for nearly every text node,
    // delaying navigation to a page with many sections.
    for(const node of textNodes){
      let owner=null,typedParent=false;
      for(let parent=node.parentElement;parent&&parent!==content;parent=parent.parentElement){
        const candidate=owners.get(parent);
        if(candidate){if(candidate.target.type)typedParent=true;if(!owner)owner=candidate;}
      }
      if(!owner||typedParent||!node.parentElement)continue;
      const parent=node.parentElement;
      // Closed native mobile menus can still report text ranges even though
      // their contents are not visible; do not schedule those hidden labels.
      if(parent.closest('.mobile-menu:not([open]) .mobile-nav'))continue;
      const style=getComputedStyle(parent);
      if(style.visibility==='hidden'||style.display==='none')continue;
      const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();range.detach();
      if(rect.width<1||rect.height<1)continue;
      candidates.push({node,parent,owner,textColor:style.color});
    }
    // Wrap in one write-only pass; the original text node stays intact.
    for(const {node,parent,owner,textColor} of candidates){
      const wrapper=document.createElement('zero-build-text');wrapper.dataset.buildText='';
      parent.insertBefore(wrapper,node);wrapper.appendChild(node);
      owner.stage.wrappers.push({wrapper,node});
      const characters=Math.max(1,Array.from(node.data.trim()).length);
      const target={element:wrapper,label:'Typing',frame:false,type:true,inlineText:true,textColor,characters,
        start:owner.target.start+owner.target.duration+50,duration:Math.max(150,Math.min(650,characters*35)),baseOpacity:1,original:{},lastRaw:-1,owner:owner.target};
      for(const prop of ['opacity','clip-path','translate','transition','pointer-events'])target.original[prop]=save(wrapper,prop);
      if(!byOwner.has(owner.target))byOwner.set(owner.target,[]);
      byOwner.get(owner.target).push(target);
    }
    for(const stage of stages){
      for(const track of stage.tracks){
        track.targets=track.targets.flatMap(target=>[target,...(byOwner.get(target)||[])]);
        for(const target of track.targets){
          target.baseStart=target.start;
          if(target.owner)target.dependency=target.owner;
          else for(let parent=target.element.parentElement;parent;parent=parent.parentElement){
            const found=owners.get(parent);if(found&&found.stage===stage){target.dependency=found.target;break;}
          }
        }
      }
      // Maintain cursor order and wait for the real parent frame, even where a
      // different cursor hands it off. Starts only move later, so this converges.
      let changed=true,passes=0;
      while(changed&&passes++<300){
        changed=false;
        for(const track of stage.tracks){
          let previous=null;
          for(const target of track.targets){
            const wanted=Math.max(target.baseStart,previous?previous.start+previous.duration+40:0,target.dependency?target.dependency.start+target.dependency.duration+40:0);
            if(wanted>target.start){target.start=wanted;changed=true;}previous=target;
          }
        }
      }
      if(changed)throw new Error('Text timing dependencies did not converge');
      stage.endAt=Math.max(...stage.tracks.flatMap(track=>track.targets.map(t=>t.start+t.duration)))+900;
    }
  }
  function prepare(){
    finishAll();
    if(!ENABLE_INTRO||!content||motion.matches||!('IntersectionObserver'in window)){clearPreparing();return false;}
    try{
      const used=new Set();
      // First collect original styles and controls, then hide targets without moving layout.
      for(const definition of definitions){
        const trigger=content.querySelector(definition.trigger);if(!trigger)continue;
        const stage={id:definition.id,trigger,tracks:[],controls:new Map(),wrappers:[],done:false,started:false,overlay:null};
        for(const [id,steps] of Object.entries(definition.tracks)){
          const targets=[];
          for(const step of steps){let visible=0;
            for(const element of content.querySelectorAll(step.s)){
              if(used.has(element))continue;
              const r=element.getBoundingClientRect(),computed=getComputedStyle(element);
              if(r.width<1||r.height<1||computed.display==='none'||computed.visibility==='hidden')continue;
              const opacity=parseFloat(computed.opacity),t={element,label:step.label,frame:!!step.frame,type:!!step.type,start:step.t+visible++*(step.stagger||0),duration:step.d||360,baseOpacity:Number.isFinite(opacity)?opacity:1,original:{},lastRaw:-1};
              for(const prop of ['opacity','clip-path','translate','transition','pointer-events'])t.original[prop]=save(element,prop);
              used.add(element);targets.push(t);
              if(element.matches('a,button,input,select,textarea,summary'))stage.controls.set(element,element.inert);
              element.querySelectorAll('a,button,input,select,textarea,summary').forEach(el=>{if(!stage.controls.has(el))stage.controls.set(el,el.inert)});
            }
          }
          if(targets.length)stage.tracks.push({id,targets:targets.sort((a,b)=>a.start-b.start)});
        }
        if(stage.tracks.length){stage.endAt=Math.max(...stage.tracks.flatMap(track=>track.targets.map(t=>t.start+t.duration)))+900;stages.push(stage);}
      }
      addTextTargets();
      for(const stage of stages){
        stage.controlReady=new Map();
        const targets=stage.tracks.flatMap(track=>track.targets).filter(target=>!target.inlineText);
        for(const control of stage.controls.keys()){
          const ancestors=targets.filter(target=>target.element===control||target.element.contains(control));
          // The header is clipped while its frame draws, and the navigation
          // moves into place. Wait for both to settle before accepting input,
          // so a first pointer click cannot land outside the restored control.
          stage.controlReady.set(control,Math.max(0,...ancestors.map(target=>target.start+(target.element.matches('.site-header, .desktop-nav')?target.duration:Math.min(90,target.duration*.1)))));
        }
      }
      for(const stage of stages){
        pending.add(stage);stage.controls.forEach((_,el)=>{el.inert=true});
        for(const track of stage.tracks)for(const t of track.targets){t.element.style.setProperty('transition','none');t.element.style.setProperty('pointer-events','none');t.element.style.setProperty('opacity','0');}
      }
      if(!stages.length){clearPreparing();return false;}
      skipButton=document.createElement('button');skipButton.type='button';skipButton.className='site-build-skip';skipButton.innerHTML='Skip effects <span>ESC</span>';skipButton.addEventListener('click',finishAll);document.body.appendChild(skipButton);
      // A real click or keyboard activation finishes only that section before
      // the native event reaches its button. No synthetic actions are sent.
      const finishForControl=element=>{
        if(!(element instanceof Element))return;
        const control=element.closest('a,button,input,select,textarea,summary');
        if(!control||control.inert)return;
        for(const stage of [...active])if(stage.controls.has(control))finishStage(stage);
      };
      interactionHandler=event=>finishForControl(event.target);
      document.addEventListener('pointerdown',interactionHandler,true);
      document.addEventListener('click',interactionHandler,true);
      keyHandler=event=>{
        if(event.key==='Escape'){event.preventDefault();finishAll();}
        // Release every control before the browser advances keyboard focus.
        else if(event.key==='Tab')finishAll();
        else if(event.key==='Enter'||event.key===' ')finishForControl(event.target);
      };
      window.addEventListener('keydown',keyHandler,true);
      resizeHandler=()=>{for(const stage of active)measureStage(stage)};window.addEventListener('resize',resizeHandler);
      observer=new IntersectionObserver(entries=>{try{
        for(const entry of entries){
          const stage=stages.find(item=>item.trigger===entry.target);
          if(!stage)continue;
          if(entry.isIntersecting)startStage(stage);
          // Once a viewed section leaves the viewport, finish it instead of
          // running cursors and layout updates off-screen during long jumps.
          else if(stage.started&&!stage.done)finishStage(stage);
        }
      }catch(error){console.warn('[website scroll build] Could not start section.',error);finishAll();}},{threshold:0,rootMargin:'0px 0px -8% 0px'});
      stages.forEach(stage=>observer.observe(stage.trigger));
      clearPreparing();
      if(document.fonts?.ready)document.fonts.ready.then(()=>{if(resizeHandler)resizeHandler()}).catch(()=>{});
      return true;
    }catch(error){console.warn('[website scroll build] Setup failed; opening site.',error);finishAll();return false;}
  }
  const play=()=>{if(prepare())rememberPlayed();};
  if(replay){
    const updateMotion=()=>{replay.disabled=motion.matches;replay.title=motion.matches?'Effects are disabled while reduced motion is enabled':'';if(motion.matches)finishAll();};
    updateMotion();replay.addEventListener('click',()=>{if(!motion.matches)play()});
    motion.addEventListener?.('change',updateMotion);
  }
  // Back/forward cache must restore a completed page, not paused cursors.
  window.addEventListener('pagehide',finishAll);
  const begin = skipped => {
    if(alreadyPlayed()&&!refreshed)clearPreparing();
    else if(skipped){play();finishAll();}
    else play();
  };
  // Prepare while the loader opens, so its cursor can join the first stage.
  // Skipping either before or during the reveal still releases everything.
  if(document.documentElement.classList.contains('zero-loading')){
    let opened=false;
    window.addEventListener('zero-loader-opening', () => {opened=true;begin(false);}, {once:true});
    window.addEventListener('zero-loader-done', event => {
      if(!opened)begin(!!event.detail?.skipped);
      else if(event.detail?.skipped)finishAll();
    }, {once:true});
  }else begin(!!window.__zeroLoaderOutcome?.skipped);
})();
