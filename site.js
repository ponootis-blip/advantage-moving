"use strict";
var SIZE_TABLE={studio:{crew:2,hours:3,pack:250},one:{crew:2,hours:4,pack:300},two:{crew:3,hours:6,pack:450},three:{crew:4,hours:8,pack:650},four:{crew:5,hours:10,pack:900},office:{crew:4,hours:8,pack:700}};
var CREW_RATE={2:140,3:180,4:220,5:260};
function round10(n){return Math.round(n/10)*10}
function estimateMove(options){var size=SIZE_TABLE[options.size]||SIZE_TABLE.two;var labor=size.hours*CREW_RATE[size.crew];var mileage=options.distance==="state"?150+Math.max(20,Math.min(900,Number(options.miles)||0))*2.5:0;var addons=(options.packing?size.pack:0)+(options.piano?250:0);var total=labor+mileage+addons;return{crew:size.crew,hours:size.hours,low:round10(total*.9),high:round10(total*1.2)}}
if(typeof window!=="undefined"){window.estimateMove=estimateMove}
if(typeof document!=="undefined"){
  var quoteStep1=document.getElementById("quoteStep1"),quoteStep2=document.getElementById("quoteStep2"),quoteNext=document.getElementById("quoteNext"),quoteBack=document.getElementById("quoteBack"),quoteForm=document.getElementById("quoteForm");
  document.getElementById("qDate").min=new Date().toISOString().slice(0,10);
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
    var config=window.ADVANTAGE_FORM||{};
    var reference="ADV-"+Date.now().toString(36).slice(-6).toUpperCase();
    var payload={_subject:"New Advantage Moving quote — "+reference,reference:reference,name:name,phone:phone,email:email,"Moving from":value("qFrom"),"Moving to":value("qTo"),"Move date":value("qDate")||"Flexible / not selected","Move type":value("qType"),message:"Quote "+reference+": "+value("qType")+" move from "+value("qFrom")+" to "+value("qTo")+". Requested date: "+(value("qDate")||"flexible")+".",_gotcha:value("qWebsite")};
    if(config.provider==="web3forms"){payload.access_key=config.accessKey;payload.subject=payload._subject;payload.from_name="Advantage Moving website";payload.botcheck=payload._gotcha}
    submit.disabled=true;submit.textContent="Sending…";
    try{
      if(!config.endpoint||config.endpoint.indexOf("REPLACE_")!==-1||(config.provider==="web3forms"&&(!config.accessKey||config.accessKey.indexOf("REPLACE_")===0))){throw new Error("not-configured")}
      var response=await fetch(config.endpoint,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      var data=await response.json().catch(function(){return{}});
      if(!response.ok||(config.provider==="web3forms"&&!data.success)){throw new Error(data.error||data.message||"Unable to send")}
      status.textContent="Thanks, "+name+". Your request "+reference+" was sent to Advantage Moving. We’ll be in touch during business hours.";
      status.hidden=false;quoteForm.reset();
    }catch(sendError){
      status.classList.add("is-error");
      status.innerHTML=(sendError.message==="not-configured"?"Online quote delivery is being connected. ":"We couldn’t send the form just now. ")+"Please call <a href='tel:+15124436141'>(512) 443-6141</a> or email <a href='mailto:service@advantagemovingaustin.com'>service@advantagemovingaustin.com</a>.";
      status.hidden=false;
    }finally{
      submit.disabled=false;submit.innerHTML="Send my quote request <span aria-hidden='true'>→</span>";
    }
  });
  var dist=document.getElementById("estDist"),milesWrap=document.getElementById("milesWrap"),miles=document.getElementById("estMiles");
  dist.addEventListener("change",function(){milesWrap.hidden=dist.value!=="state"});
  document.getElementById("estBtn").addEventListener("click",function(){var error=document.getElementById("estErr"),result=document.getElementById("estResult");error.textContent="";result.hidden=true;if(dist.value==="state"&&!(Number(miles.value)>=20&&Number(miles.value)<=900)){error.textContent="Enter a distance between 20 and 900 miles.";return}var estimate=estimateMove({size:document.getElementById("estSize").value,distance:dist.value,miles:Number(miles.value),packing:document.getElementById("estPack").checked,piano:document.getElementById("estPiano").checked});result.innerHTML="<strong>$"+estimate.low.toLocaleString()+"–$"+estimate.high.toLocaleString()+"</strong>Planning range for a crew of "+estimate.crew+" and about "+estimate.hours+" hours. This is not a binding quote.";result.hidden=false});
}
