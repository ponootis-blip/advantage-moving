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
if(typeof window!=="undefined"){window.estimateMove=estimateMove}
if(typeof module!=="undefined"&&module.exports){module.exports={estimateMove:estimateMove,localDateInputValue:localDateInputValue,normalizeQuoteConfig:normalizeQuoteConfig,quoteReference:quoteReference}}
if(typeof document!=="undefined"){
  var quoteStep1=document.getElementById("quoteStep1"),quoteStep2=document.getElementById("quoteStep2"),quoteNext=document.getElementById("quoteNext"),quoteBack=document.getElementById("quoteBack"),quoteForm=document.getElementById("quoteForm");
  document.getElementById("qDate").min=localDateInputValue(new Date());
  function value(id){return document.getElementById(id).value.trim()}
  function showStep(step){quoteStep1.hidden=step!==1;quoteStep2.hidden=step!==2;(step===2?document.getElementById("qName"):document.getElementById("qFrom")).focus()}
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
    var payload={_subject:"New Advantage Moving quote — "+reference,_replyto:email,_gotcha:honeypot,reference:reference,name:name,phone:phone,email:email,"Moving from":value("qFrom"),"Moving to":value("qTo"),"Move date":value("qDate")||"Flexible / not selected","Move type":value("qType"),"Submitted at":submittedAt,"Source page":location.href.split("#")[0],"Visitor timezone":(Intl.DateTimeFormat().resolvedOptions().timeZone||"Unknown"),"Contact permission":"Quote follow-up only",message:"Quote "+reference+": "+value("qType")+" move from "+value("qFrom")+" to "+value("qTo")+". Requested date: "+(value("qDate")||"flexible")+"."};
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
      status.textContent="Thanks, "+name+". Your request "+reference+" was sent to Advantage Moving. We’ll be in touch during business hours.";
      status.hidden=false;quoteForm.reset();status.focus();
    }catch(sendError){
      status.classList.add("is-error");
      status.innerHTML=(sendError.message==="not-configured"?"Online quote delivery is being connected. ":sendError.name==="AbortError"?"The request timed out. ":"We couldn’t send the form just now. ")+"Please call <a href='tel:+15124436141'>(512) 443-6141</a> or email <a href='mailto:service@advantagemovingaustin.com'>service@advantagemovingaustin.com</a>.";
      status.hidden=false;status.focus();
    }finally{
      submit.disabled=false;submit.innerHTML="Send my quote request <span aria-hidden='true'>→</span>";
    }
  });
  var dist=document.getElementById("estDist"),milesWrap=document.getElementById("milesWrap"),miles=document.getElementById("estMiles");
  dist.addEventListener("change",function(){milesWrap.hidden=dist.value!=="state"});
  document.getElementById("estBtn").addEventListener("click",function(){var error=document.getElementById("estErr"),result=document.getElementById("estResult");error.textContent="";result.hidden=true;if(dist.value==="state"&&!(Number(miles.value)>=20&&Number(miles.value)<=900)){error.textContent="Enter a distance between 20 and 900 miles.";return}var estimate=estimateMove({size:document.getElementById("estSize").value,distance:dist.value,miles:Number(miles.value),packing:document.getElementById("estPack").checked,piano:document.getElementById("estPiano").checked});result.innerHTML="<strong>$"+estimate.low.toLocaleString()+"–$"+estimate.high.toLocaleString()+"</strong>Planning range for a crew of "+estimate.crew+" and about "+estimate.hours+" hours. This is not a binding quote.";result.hidden=false});
}
