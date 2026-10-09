document.querySelector("#login").addEventListener("submit",async function(e){
  e.preventDefault();
  var button=this.querySelector("button"),error=document.querySelector("#error");button.disabled=true;error.textContent="";
  try{
    var response=await fetch("/api/admin/chat/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({password:document.querySelector("#password").value})});
    var body=await response.json();if(!response.ok)throw new Error(body.error||"Sign in failed");
    location.assign("/admin/chat");
  }catch(err){error.textContent=err.message;button.disabled=false}
});
