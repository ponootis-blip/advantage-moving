"use strict";
var SIZE_TABLE={studio:{crew:2,hours:3,pack:250},one:{crew:2,hours:4,pack:300},two:{crew:3,hours:6,pack:450},three:{crew:4,hours:8,pack:650},four:{crew:5,hours:10,pack:900},office:{crew:4,hours:8,pack:700}};
var CREW_RATE={2:140,3:180,4:220,5:260};
function round10(n){return Math.round(n/10)*10}
function estimateMove(options){var size=SIZE_TABLE[options.size]||SIZE_TABLE.two;var labor=size.hours*CREW_RATE[size.crew];var mileage=options.distance==="state"?150+Math.max(20,Math.min(900,Number(options.miles)||0))*2.5:0;var addons=(options.packing?size.pack:0)+(options.piano?250:0);var total=labor+mileage+addons;return{crew:size.crew,hours:size.hours,low:round10(total*.9),high:round10(total*1.2)}}
function localDateInputValue(date){var pad=function(value){return String(value).padStart(2,"0")};return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())}
function normalizeQuoteConfig(config){
  if(!config||config.provider!=="formspree"||typeof config.endpoint!=="string"||config.endpoint.indexOf("REPLACE_")!==-1){return null}
  try{var url=new URL(config.endpoint);if(url.protocol!=="https:"||url.hostname!=="formspree.io"||!/^\/f\/[a-z0-9]+$/i.test(url.pathname)){return null}return url.href}catch(error){return null}
}
function quoteReference(){var random="";if(typeof crypto!=="undefined"&&crypto.getRandomValues){var bytes=new Uint8Array(3);crypto.getRandomValues(bytes);random=Array.from(bytes,function(byte){return byte.toString(16).padStart(2,"0")}).join("").toUpperCase()}else{random=Math.floor(Math.random()*16777215).toString(16).padStart(6,"0").toUpperCase()}return "ADV-"+Date.now().toString(36).slice(-5).toUpperCase()+"-"+random}
var DAY_NAMES=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
function toMinutes(hhmm){var p=String(hhmm).split(":");return Number(p[0])*60+Number(p[1]||0)}
function formatClock(mins){var h=Math.floor(mins/60)%24,m=mins%60,suffix=h<12?"am":"pm",h12=h%12||12;return h12+(m?":"+String(m).padStart(2,"0"):"")+suffix}
function austinClock(date){var parts={};new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"long",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).forEach(function(p){parts[p.type]=p.value});return{day:parts.weekday,minutes:Number(parts.hour)*60+Number(parts.minute)}}
/* hours: {days:["Monday",…], opens:"08:00", closes:"17:00"}; clock: {day, minutes} in Austin time */
function businessStatus(hours,clock){
  var opens=toMinutes(hours.opens),closes=toMinutes(hours.closes),today=DAY_NAMES.indexOf(clock.day);
  var openToday=hours.days.indexOf(clock.day)!==-1;
  if(openToday&&clock.minutes>=opens&&clock.minutes<closes){return{open:true,closesAt:formatClock(closes),callBy:formatClock(Math.min(clock.minutes+5,closes))}}
  if(openToday&&clock.minutes<opens){return{open:false,next:"today at "+formatClock(opens)}}
  for(var i=1;i<=7;i++){var d=DAY_NAMES[(today+i)%7];if(hours.days.indexOf(d)!==-1){return{open:false,next:(i===1?"tomorrow":d)+" at "+formatClock(opens)}}}
  return{open:false,next:""}
}
if(typeof window!=="undefined"){window.estimateMove=estimateMove}
if(typeof module!=="undefined"&&module.exports){module.exports={businessStatus:businessStatus,formatClock:formatClock,estimateMove:estimateMove,localDateInputValue:localDateInputValue,normalizeQuoteConfig:normalizeQuoteConfig,quoteReference:quoteReference}}
if(typeof document!=="undefined"&&document.getElementById("quoteForm")){
  var quoteStep1=document.getElementById("quoteStep1"),quoteStep2=document.getElementById("quoteStep2"),quoteNext=document.getElementById("quoteNext"),quoteBack=document.getElementById("quoteBack"),quoteForm=document.getElementById("quoteForm");
  document.getElementById("qDate").min=localDateInputValue(new Date());
  function value(id){return document.getElementById(id).value.trim()}
  var HOURS={days:DAY_NAMES.slice(1).concat("Sunday"),opens:"08:00",closes:"17:00"};
  try{var ld=JSON.parse(document.getElementById("ld-business").textContent).openingHoursSpecification[0];HOURS={days:ld.dayOfWeek,opens:ld.opens,closes:ld.closes}}catch(e){}
  function currentStatus(){return businessStatus(HOURS,austinClock(new Date()))}
  function paintStatus(){
    var st=currentStatus();
    document.querySelectorAll("[data-open-status]").forEach(function(el){
      el.classList.toggle("is-open",st.open);
      el.textContent=st.open?"Open now · until "+st.closesAt:"Closed · opens "+st.next;
    });
    var promise=document.getElementById("responsePromise");
    if(promise){promise.textContent=st.open?"We’re open now—calling is the fastest way to a firm quote.":"We’re closed right now. Send your details and we’ll call you "+st.next+"."}
  }
  paintStatus();setInterval(paintStatus,60000);

  /* save & resume: answers stay in this browser only, until sent or cleared */
  var DRAFT_KEY="advantage-quote-draft",DRAFT_FIELDS=["qFrom","qTo","qDate","qType","qName","qPhone","qEmail"],draftTimer;
  function saveDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(function(){var d={savedAt:Date.now(),step:quoteStep2.hidden?1:2};DRAFT_FIELDS.forEach(function(id){d[id]=document.getElementById(id).value});try{if(DRAFT_FIELDS.some(function(id){return d[id]})){localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}}catch(e){}},400)}
  function clearDraft(){try{localStorage.removeItem(DRAFT_KEY)}catch(e){}}
  quoteForm.addEventListener("input",saveDraft);quoteForm.addEventListener("change",saveDraft);
  var restoreNote=document.getElementById("quoteRestore");
  try{
    var draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");
    if(draft&&Date.now()-draft.savedAt<30*864e5&&(draft.qFrom||draft.qTo)){
      DRAFT_FIELDS.forEach(function(id){if(draft[id]){document.getElementById(id).value=draft[id]}});
      if(restoreNote){restoreNote.hidden=false}
      if(draft.step===2&&draft.qFrom&&draft.qTo&&draft.qType){quoteStep1.hidden=true;quoteStep2.hidden=false;document.querySelectorAll(".quote-progress span").forEach(function(b){b.classList.add("is-on")});var k=document.getElementById("quoteKicker");if(k){k.textContent="Step 2 of 2 · Free, no obligation"}}
    }else if(draft){clearDraft()}
  }catch(e){}
  var restart=document.getElementById("quoteRestart");
  if(restart){restart.addEventListener("click",function(){clearDraft();quoteForm.reset();restoreNote.hidden=true;showStep(1)})}
  function escapeHtml(t){return String(t).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

  var quoteKicker=document.getElementById("quoteKicker"),quoteBars=document.querySelectorAll(".quote-progress span");
  function showStep(step){quoteStep1.hidden=step!==1;quoteStep2.hidden=step!==2;if(quoteKicker){quoteKicker.textContent="Step "+step+" of 2 · Free, no obligation"}Array.prototype.forEach.call(quoteBars,function(bar,i){bar.classList.toggle("is-on",i<step)});(step===2?document.getElementById("qName"):document.getElementById("qFrom")).focus()}
  quoteNext.addEventListener("click",function(){var error=document.getElementById("qErr1");error.textContent="";if(!value("qFrom")||!value("qTo")||!value("qType")){error.textContent="Add your starting point, destination and move type.";return}showStep(2)});
  quoteBack.addEventListener("click",function(){showStep(1)});
  quoteForm.addEventListener("submit",async function(event){
    event.preventDefault();
    var error=document.getElementById("qErr2"),status=document.getElementById("qStatus"),submit=document.getElementById("quoteSubmit");
    var name=value("qName"),phone=value("qPhone"),email=value("qEmail");
    error.textContent="";status.hidden=true;status.classList.remove("is-error");
    if(!name||!phone||!email){error.textContent="Add your name, phone and email.";return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){error.textContent="Enter a valid email address.";return}
    if(phone.replace(/\D/g,"").length<10){error.textContent="Enter a 10-digit phone number.";return}
    var endpoint=normalizeQuoteConfig(window.ADVANTAGE_FORM||{});
    var reference=quoteReference(),honeypot=value("qWebsite"),submittedAt=new Date().toISOString();
    var leadStatus=currentStatus();
    var payload={_subject:"New quote "+reference+(leadStatus.open?" — call by "+leadStatus.callBy:" — call "+leadStatus.next),"Call back":leadStatus.open?"Within 5 minutes (by "+leadStatus.callBy+" Austin time)":"First thing "+leadStatus.next,_replyto:email,_gotcha:honeypot,reference:reference,name:name,phone:phone,email:email,"Moving from":value("qFrom"),"Moving to":value("qTo"),"Move date":value("qDate")||"Flexible / not selected","Move type":value("qType"),"Ballpark seen":(window.advantageBallpark&&window.advantageBallpark())||"Not used","Submitted at":submittedAt,"Source page":location.href.split("#")[0],"Visitor timezone":(Intl.DateTimeFormat().resolvedOptions().timeZone||"Unknown"),"Contact permission":"Quote follow-up only",message:"Quote "+reference+": "+value("qType")+" move from "+value("qFrom")+" to "+value("qTo")+". Requested date: "+(value("qDate")||"flexible")+"."};
    submit.disabled=true;submit.textContent="Sending…";
    try{
      if(honeypot){quoteStep1.hidden=true;quoteStep2.hidden=true;status.textContent="Thanks. Your request has been received.";status.hidden=false;quoteForm.reset();status.focus();return}
      if(!endpoint){throw new Error("not-configured")}
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},12000);
      var response;
      try{response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload),signal:controller.signal})}finally{clearTimeout(timer)}
      var data=await response.json().catch(function(){return{}});
      if(!response.ok){throw new Error(data.error||data.message||"Unable to send")}
      quoteStep1.hidden=true;quoteStep2.hidden=true;
      var after=currentStatus();
      status.innerHTML="<strong>Thanks, "+escapeHtml(name)+". Request "+reference+" is on its way.</strong>"+
        "<ol class='next-steps'><li>"+(after.open?"We’re open now and will call you shortly.":"We’re closed right now—we’ll call you "+escapeHtml(after.next)+".")+"</li><li>We confirm stairs, access and anything heavy or fragile.</li><li>You get a written proposal before anything is loaded.</li></ol>"+
        (after.open?"<a class='button button-wide' href='tel:+15124436141'>In a hurry? Call now and mention "+reference+"</a>":"<p>Save our number: <a href='tel:+15124436141'>(512) 443-6141</a></p>");
      status.hidden=false;quoteForm.reset();clearDraft();if(restoreNote){restoreNote.hidden=true}status.focus();
    }catch(sendError){
      status.classList.add("is-error");
      status.innerHTML=(sendError.message==="not-configured"?"Online quote delivery is being connected. ":sendError.name==="AbortError"?"The request timed out. ":"We couldn’t send the form just now. ")+"Please call <a href='tel:+15124436141'>(512) 443-6141</a> or email <a href='mailto:service@advantagemovingaustin.com'>service@advantagemovingaustin.com</a>.";
      status.hidden=false;status.focus();
    }finally{
      submit.disabled=false;submit.innerHTML="Send my free quote request <span aria-hidden='true'>→</span>";
    }
  });
  var dist=document.getElementById("estDist"),milesWrap=document.getElementById("milesWrap"),miles=document.getElementById("estMiles");
  dist.addEventListener("change",function(){milesWrap.hidden=dist.value!=="state"});
  document.getElementById("estBtn").addEventListener("click",function(){var error=document.getElementById("estErr"),result=document.getElementById("estResult");error.textContent="";result.hidden=true;if(dist.value==="state"&&!(Number(miles.value)>=20&&Number(miles.value)<=900)){error.textContent="Enter a distance between 20 and 900 miles.";return}var estimate=estimateMove({size:document.getElementById("estSize").value,distance:dist.value,miles:Number(miles.value),packing:document.getElementById("estPack").checked,piano:document.getElementById("estPiano").checked});result.innerHTML="<strong>$"+estimate.low.toLocaleString()+"–$"+estimate.high.toLocaleString()+"</strong>Planning range for a crew of "+estimate.crew+" and about "+estimate.hours+" hours. This is not a binding quote.";result.hidden=false;
    var sizeSelect=document.getElementById("estSize"),sizeLabel=sizeSelect.options[sizeSelect.selectedIndex].text;
    lastBallpark=sizeLabel+", "+(dist.value==="state"?miles.value+" miles":"local")+(document.getElementById("estPack").checked?", packing":"")+(document.getElementById("estPiano").checked?", piano":"")+": $"+estimate.low+"–$"+estimate.high;
    lastBallparkType=sizeSelect.value==="office"?"Business":document.getElementById("estPiano").checked?"Piano / valuable":(sizeSelect.value==="studio"||sizeSelect.value==="one")?"Apartment":"House";
    toQuote.hidden=false});
  var toQuote=document.getElementById("estToQuote"),lastBallpark="",lastBallparkType="";
  if(toQuote){toQuote.addEventListener("click",function(){var type=document.getElementById("qType");if(!type.value&&lastBallparkType){type.value=lastBallparkType}setTimeout(function(){document.getElementById("qFrom").focus({preventScroll:true})},450)})}
  window.advantageBallpark=function(){return lastBallpark};
}
