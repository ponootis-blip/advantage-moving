import process from "node:process";

const base=(process.argv[2]||"https://ponootis-blip.github.io/advantage-moving/").replace(/\/?$/,"/");
const cache=`qa=${Date.now()}`;
const get=async path=>{
  const response=await fetch(`${base}${path}${path.includes("?")?"&":"?"}${cache}`,{redirect:"follow"});
  if(!response.ok) throw new Error(`${path||"index.html"} returned HTTP ${response.status}`);
  return response.text();
};

try{
  const [html,config]=await Promise.all([get(""),get("site-config.js")]);
  const checks=[
    [html.includes("id=\"quoteForm\""),"quote form is present"],
    [html.includes("name=\"_gotcha\""),"honeypot is present"],
    [html.includes("texas-accent"),"Texas service accents are present"],
    [!html.includes("Your move.<br>"),"legacy hero copy is absent"],
    [/styles\.css\?v=\d+/.test(html),"stylesheet is cache-versioned"],
    [/provider:\s*"formspree"/.test(config),"Formspree provider is selected"],
    [/https:\/\/formspree\.io\/f\/[a-z0-9]+/i.test(config)&&!config.includes("REPLACE_WITH"),"quote endpoint is configured"]
  ];
  for(const [passed,label] of checks) console.log(`${passed?"PASS":"FAIL"}: ${label}`);
  if(checks.some(([passed])=>!passed)) process.exitCode=1;
}catch(error){
  console.error(`FAIL: ${error.message}`);
  process.exitCode=1;
}
