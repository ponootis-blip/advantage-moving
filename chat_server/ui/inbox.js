(function(){
  "use strict";
  var csrf="",selected="",drafts=new Map(),pendingMessages=new Map(),currentMessages=[],stream=null,retry=null;
  var list=document.querySelector("#conversations"),thread=document.querySelector("#messages"),title=document.querySelector("#thread-title"),detail=document.querySelector("#thread-detail"),bodyInput=document.querySelector("#body"),reply=document.querySelector("#reply"),status=document.querySelector("#connection"),error=document.querySelector("#error");
  async function api(path,options){
    options=options||{};
    var headers=Object.assign({"Accept":"application/json"},options.body?{"Content-Type":"application/json","X-CSRF-Token":csrf}:{});
    var response=await fetch(path,Object.assign({cache:"no-store",credentials:"same-origin",headers:headers},options));
    if(response.status===401){location.assign("/admin/chat/login");throw new Error("Session expired")}
    var result=await response.json().catch(function(){return {}});
    if(!response.ok)throw new Error(result.error||"Request failed");return result;
  }
  function label(item){return item.visitor_name||"Visitor "+item.public_id.slice(-4)}
  function when(value){return value?new Date(value).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"New"}
  async function refreshList(){
    var result=await api("/api/admin/chat/conversations");
    list.replaceChildren();var unread=0;
    if(!result.conversations.length){var empty=document.createElement("p");empty.className="empty";empty.textContent="No conversations yet.";list.append(empty)}
    result.conversations.forEach(function(item){
      unread+=item.unread;
      var button=document.createElement("button");button.type="button";button.className="conversation";button.setAttribute("role","option");button.setAttribute("aria-selected",String(item.public_id===selected));
      var top=document.createElement("div");top.className="row";
      var name=document.createElement("b");name.textContent=label(item);top.append(name);
      if(item.unread){var badge=document.createElement("span");badge.className="unread";badge.textContent=String(item.unread);top.append(badge)}
      var time=document.createElement("small");time.textContent=when(item.last_message_at||item.created_at);
      var preview=document.createElement("p");preview.textContent=item.last_body||"Conversation started";
      button.append(top,time,preview);
      if(item.status==="closed"){var closed=document.createElement("span");closed.className="closed";closed.textContent="Closed";button.append(closed)}
      button.addEventListener("click",function(){select(item.public_id)});list.append(button);
    });
    document.querySelector("#count").textContent=unread?String(unread):"";
    document.title=(unread?"("+unread+") ":"")+"Customer messages · Advantage Moving";
  }
  function draw(messages){
    thread.replaceChildren();
    messages.forEach(function(item){
      var bubble=document.createElement("div");bubble.className="message "+item.sender_type;
      var text=document.createElement("span");text.textContent=item.body;
      var stamp=document.createElement("small");stamp.textContent=(item.sender_type==="agent"?"You":"Visitor")+" · "+when(item.created_at);
      bubble.append(text,stamp);thread.append(bubble);
    });
    thread.scrollTop=thread.scrollHeight;
  }
  async function refreshThread(){
    if(!selected)return;
    var id=selected,conversation=await api("/api/admin/chat/conversations/"+encodeURIComponent(id));
    if(id!==selected)return;
    title.textContent=conversation.visitor_name||"Visitor "+id.slice(-4);
    detail.textContent=(conversation.visitor_email?conversation.visitor_email+" · ":"")+(conversation.status==="closed"?"Closed · ":"Open · ")+"Started "+when(conversation.messages[0]&&conversation.messages[0].created_at);
    if(JSON.stringify(currentMessages)!==JSON.stringify(conversation.messages)){currentMessages=conversation.messages;draw(currentMessages)}
    reply.hidden=false;document.querySelector("#close").hidden=conversation.status==="closed";
    if(conversation.messages.some(function(item){return item.sender_type==="visitor"&&!item.read_at}))
      await api("/api/admin/chat/conversations/"+encodeURIComponent(id)+"/read",{method:"POST",body:"{}"});
  }
  async function select(id){
    if(selected)drafts.set(selected,bodyInput.value);
    selected=id;bodyInput.value=drafts.get(id)||"";currentMessages=[];
    await refreshThread();await refreshList();bodyInput.focus();
  }
  bodyInput.addEventListener("input",function(){if(selected)drafts.set(selected,bodyInput.value)});
  bodyInput.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();reply.requestSubmit()}});
  reply.addEventListener("submit",async function(e){
    e.preventDefault();var body=bodyInput.value.trim(),id=selected;if(!id||!body)return;
    var button=reply.querySelector("button");button.disabled=true;error.textContent="";
    try{
      var pending=pendingMessages.get(id);
      if(!pending||pending.body!==body){pending={body:body,client_id:crypto.randomUUID()};pendingMessages.set(id,pending)}
      await api("/api/admin/chat/conversations/"+encodeURIComponent(id)+"/message",{method:"POST",body:JSON.stringify(pending)});
      pendingMessages.delete(id);
      drafts.set(id,"");if(selected===id)bodyInput.value="";
      await refreshThread();await refreshList();
    }catch(err){error.textContent=err.message}
    finally{button.disabled=false}
  });
  document.querySelector("#close").addEventListener("click",async function(){if(!selected)return;await api("/api/admin/chat/conversations/"+encodeURIComponent(selected)+"/close",{method:"POST",body:"{}"});await refreshThread();await refreshList()});
  document.querySelector("#logout").addEventListener("click",async function(){await api("/api/admin/chat/logout",{method:"POST",body:"{}"});location.assign("/admin/chat/login")});
  async function connect(){
    try{
      await refreshList();if(selected)await refreshThread();status.textContent="Live";
      var controller=new AbortController();stream=controller;
      var response=await fetch("/api/admin/chat/events",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
      if(!response.ok||!response.body)throw new Error("Connection lost");
      // Read once after subscribing so a message cannot slip between requests.
      await refreshList();if(selected)await refreshThread();
      var reader=response.body.getReader(),decoder=new TextDecoder(),buffer="";
      while(true){
        var part=await reader.read();if(part.done)break;
        buffer+=decoder.decode(part.value,{stream:true});var split;
        while((split=buffer.indexOf("\n\n"))>=0){var event=buffer.slice(0,split);buffer=buffer.slice(split+2);if(event.includes("event: changed")){await refreshList();if(selected)await refreshThread()}}
      }
    }catch(err){status.textContent="Reconnecting…"}
    status.textContent="Reconnecting…";
    retry=setTimeout(connect,1800);
  }
  async function poll(){
    try{await refreshList();if(selected)await refreshThread();status.textContent="Live"}
    catch(err){status.textContent="Reconnecting…"}
    retry=setTimeout(function(){retry=null;poll()},5000);
  }
  async function init(){
    try{var me=await api("/api/admin/chat/me");csrf=me.csrf;if(me.realtime==="poll")await poll();else await connect()}
    catch(err){error.textContent=err.message}
  }
  init();
})();
