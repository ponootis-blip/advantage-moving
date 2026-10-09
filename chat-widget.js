/* Visitor chat UI. Shadow DOM keeps website styles away from the widget. */
(function(){
  "use strict";
  var script=document.currentScript;
  var api=(window.ADVANTAGE_CHAT_API||"").replace(/\/$/,"")||location.origin;
  var key="advantage-chat-session-v1";
  var data=null, open=false, busy=false, stopped=false, retry=null, stream=null, connecting=false, unread=0,pending=null,realtime="sse";
  var host=document.createElement("div"), root=host.attachShadow({mode:"open"});
  var css=document.createElement("link"); css.rel="stylesheet"; css.href=new URL("chat-widget.css?v=1",script.src).href;
  root.append(css);
  var template=document.createElement("template");
  template.innerHTML='<button class="launcher" type="button" aria-expanded="false" aria-controls="adv-chat-panel">✦ Chat with us <span class="badge" hidden></span></button><section class="panel" id="adv-chat-panel" role="dialog" aria-label="Chat with Advantage Moving" hidden><div class="head"><div><strong>Advantage Moving</strong><small>Questions about your move? We’re here to help.</small></div><button class="close" type="button" aria-label="Close chat">×</button></div><div class="messages" role="log" aria-live="polite"><p class="empty">Send us a message to get started.</p></div><div class="status" role="status">Connecting…</div><form><textarea aria-label="Your message" maxlength="2000" rows="2" placeholder="Type a message…" required></textarea><button class="send" type="submit">Send</button></form></section>';
  root.append(template.content.cloneNode(true));
  var launcher=root.querySelector(".launcher"),badge=root.querySelector(".badge"),panel=root.querySelector(".panel"),messages=root.querySelector(".messages"),status=root.querySelector(".status"),form=root.querySelector("form"),input=root.querySelector("textarea"),send=root.querySelector(".send");
  function say(value,error){status.textContent=value;status.classList.toggle("error",!!error)}
  function save(){try{localStorage.setItem(key,JSON.stringify({public_id:data.public_id,token:data.token,last_agent_id:data.last_agent_id||0,pending:pending}))}catch(e){}}
  function stored(){try{var v=JSON.parse(localStorage.getItem(key));return v&&typeof v.public_id==="string"&&typeof v.token==="string"?v:null}catch(e){return null}}
  function drop(){try{localStorage.removeItem(key)}catch(e){} data=null;pending=null}
  async function request(path,options){
    options=options||{};
    var headers=Object.assign({"Accept":"application/json"},options.body?{"Content-Type":"application/json"}:{},data?{"X-Chat-Token":data.token}:{});
    var response=await fetch(api+path,Object.assign({mode:"cors",cache:"no-store",headers:headers},options));
    var body=await response.json().catch(function(){return {}});
    if(!response.ok)throw Object.assign(new Error(body.error||"Chat is unavailable"),{status:response.status});
    return body;
  }
  async function ensure(){
    if(data)return;
    var result=await request("/api/chat/session",{method:"POST",body:"{}"});
    data={public_id:result.public_id,token:result.token,messages:[],last_agent_id:0};save();
  }
  function draw(){
    if(!data)return;
    messages.replaceChildren();
    if(!data.messages.length){var empty=document.createElement("p");empty.className="empty";empty.textContent="Send us a message to get started.";messages.append(empty)}
    data.messages.forEach(function(item){
      var bubble=document.createElement("div");bubble.className="bubble"+(item.sender_type==="visitor"?" mine":"");
      var body=document.createElement("span");body.textContent=item.body;bubble.append(body);
      var date=document.createElement("small");date.textContent=(item.sender_type==="visitor"?"You":"Advantage")+" · "+new Date(item.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});bubble.append(date);messages.append(bubble);
    });
    messages.scrollTop=messages.scrollHeight;
  }
  function showBadge(){badge.hidden=!unread;badge.textContent=unread>9?"9+":String(unread)}
  async function refresh(){
    if(!data)return;
    try{
      var item=await request("/api/chat/conversation/"+encodeURIComponent(data.public_id));
      var latest=Math.max(data.last_agent_id||0,...item.messages.filter(function(m){return m.sender_type==="agent"}).map(function(m){return m.id}));
      if(open){data.last_agent_id=latest;unread=0;save()}
      else unread=item.messages.filter(function(m){return m.sender_type==="agent"&&m.id>(data.last_agent_id||0)}).length;
      data.messages=item.messages;draw();showBadge();say(item.status==="closed"?"Conversation closed. Send a message to reopen it.":"Connected");
    }catch(e){if(e.status===404){drop();say("Start a new conversation") }else say("Reconnecting…",true)}
  }
  async function connect(){
    if(stopped||!data||connecting||retry)return;
    if(realtime==="poll"){
      connecting=true;
      await refresh();
      connecting=false;
      retry=setTimeout(function(){retry=null;connect()},7000);
      return;
    }
    connecting=true;
    await refresh();
    if(!data||stopped){connecting=false;return}
    var controller=new AbortController();stream=controller;
    try{
      var response=await fetch(api+"/api/chat/events?public_id="+encodeURIComponent(data.public_id),{headers:{"X-Chat-Token":data.token},mode:"cors",cache:"no-store",signal:controller.signal});
      if(!response.ok||!response.body)throw new Error("Stream unavailable");
      // Close the gap between the first history fetch and stream subscription.
      await refresh();
      if(!data)throw new Error("Session replaced");
      say("Connected");
      var reader=response.body.getReader(),decoder=new TextDecoder(),buffer="";
      while(!stopped){
        var part=await reader.read();if(part.done)break;
        buffer+=decoder.decode(part.value,{stream:true});
        var split;
        while((split=buffer.indexOf("\n\n"))>=0){var event=buffer.slice(0,split);buffer=buffer.slice(split+2);if(event.includes("event: changed"))await refresh()}
      }
    }catch(e){if(e.name!=="AbortError")say("Reconnecting…",true)}
    if(stream===controller)stream=null;
    connecting=false;
    if(!stopped){say("Reconnecting…",true);retry=setTimeout(connect,1800)}
  }
  async function start(){
    if(data||busy)return;
    busy=true;
    try{await ensure();await refresh();connect()}
    catch(e){say("Couldn’t connect. Try again in a moment.",true)}
    finally{busy=false}
  }
  launcher.addEventListener("click",function(){open=!open;panel.hidden=!open;launcher.setAttribute("aria-expanded",String(open));if(open){unread=0;showBadge();input.focus();if(data)refresh();else start()}else launcher.focus()});
  root.querySelector(".close").addEventListener("click",function(){open=false;panel.hidden=true;launcher.setAttribute("aria-expanded","false");launcher.focus()});
  root.addEventListener("keydown",function(e){if(e.key==="Escape"&&open){open=false;panel.hidden=true;launcher.setAttribute("aria-expanded","false");launcher.focus()}});
  input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  form.addEventListener("submit",async function(e){
    e.preventDefault();var body=input.value.trim();if(!body||busy)return;
    busy=true;send.disabled=true;
    try{
      await ensure();
      pending=pending&&pending.body===body?pending:{body:body,client_id:crypto.randomUUID()};save();
      var id=pending.client_id;
      var result=await request("/api/chat/message",{method:"POST",body:JSON.stringify({public_id:data.public_id,body:body,client_id:id})});
      pending=null;save();
      input.value="";if(!data.messages.some(function(m){return m.id===result.message.id}))data.messages.push(result.message);
      draw();say("Sent");if(!stream)connect();
    }catch(err){say("Message not sent. Try again.",true)}
    finally{busy=false;send.disabled=false;input.focus()}
  });
  async function mount(){
    try{var r=await fetch(api+"/api/chat/health",{mode:"cors",cache:"no-store"});if(!r.ok)return;var health=await r.json();realtime=health.realtime==="poll"?"poll":"sse"}
    catch(e){return}
    document.body.append(host);
    // Keep the chat entry point clear of the homepage's primary quote card.
    // Calculate against its normal right-hand position so moving left cannot
    // cause the launcher to oscillate between sides while scrolling.
    function placeLauncher(){
      var card=document.querySelector(".quote-card");
      host.classList.remove("avoid-quote-top","avoid-quote-left");
      if(!card||window.innerWidth<=720)return;
      var box=card.getBoundingClientRect(),width=launcher.offsetWidth,height=launcher.offsetHeight;
      var left=window.innerWidth-20-width,top=window.innerHeight-20-height;
      if(box.left>=window.innerWidth-20||box.right<=left||box.top>=window.innerHeight-20||box.bottom<=top)return;
      var header=document.querySelector(".sitehead"),minimum=(header?header.getBoundingClientRect().bottom:0)+12;
      // Leave room for late font/image layout shifts as the hero settles.
      var above=box.top-height-48;
      if(above>=minimum){host.style.setProperty("--chat-top",above+"px");host.classList.add("avoid-quote-top")}
      else host.classList.add("avoid-quote-left");
    }
    placeLauncher();window.addEventListener("scroll",placeLauncher,{passive:true});window.addEventListener("resize",placeLauncher);window.addEventListener("load",placeLauncher);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(placeLauncher);
    if(window.ResizeObserver){var observer=new ResizeObserver(placeLauncher);var section=document.querySelector(".intro");if(section)observer.observe(section)}
    var old=stored();if(old){data={public_id:old.public_id,token:old.token,messages:[],last_agent_id:Number(old.last_agent_id)||0};pending=old.pending||null;if(pending)input.value=pending.body;connect()}
    else say("Ready to chat");
  }
  mount();
})();
