/* DormMetric front-end. Listings, accounts, shortlist, inquiries and analytics now come from the Express API. */
const ROOMS = ["Shared Room", "Private Room", "Bunk Bed", "Studio Type"];
const AMENITIES = ["Wi-Fi", "Furnished", "Laundry", "Utilities included", "CCTV"];

let dorms = [];
let analytics = null;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {query:"", budget:5000, room:"all", availability:"all", amenities:[], sort:"recommended", showAll:false, saved:new Set(), user:null};
const grid = $("#dormGrid"), modalBackdrop = $("#modalBackdrop"), modalContent = $("#modalContent");
const viewedThisSession = new Set();
let toastTimer;

function money(n){return "₱"+Number(n).toLocaleString("en-PH")}
function safe(s){return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtDate(s){const d=new Date(String(s).replace(" ","T")+"Z");return isNaN(d)?"":d.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}

/* ---------------- API ---------------- */
async function api(path, {method="GET", body} = {}){
  const res = await fetch("/api"+path, {method, credentials:"same-origin", headers: body ? {"Content-Type":"application/json"} : {}, body: body ? JSON.stringify(body) : undefined});
  let data = null;
  try { data = await res.json(); } catch {}
  if(!res.ok){
    const err = new Error((data && data.error) || "Something went wrong. Please try again.");
    err.status = res.status; err.details = data && data.details;
    if(res.status === 401 && state.user){ setUser(null); }
    throw err;
  }
  return data;
}
function errorText(err){
  const d = err.details && Object.values(err.details);
  return d && d.length ? d.join(" ") : err.message;
}

async function loadListings(){
  const [d, a] = await Promise.all([api("/dorms"), api("/analytics")]);
  dorms = d.dorms; analytics = a;
}
async function refreshListings(){ await loadListings(); renderDorms(); }

/* ---------------- Listings ---------------- */
function filteredDorms(){
 let arr=dorms.filter(d=>{
  const q=state.query.toLowerCase();
  return (!q || [d.name,d.location,d.room,...d.amenities].join(" ").toLowerCase().includes(q)) &&
   d.price<=state.budget && (state.room==="all"||d.room===state.room) &&
   (state.availability==="all"||(state.availability==="available"&&d.available)||(state.availability==="limited"&&d.available&&d.spaces<=2)) &&
   state.amenities.every(a=>d.amenities.includes(a));
 });
 if(state.sort==="price-low")arr.sort((a,b)=>a.price-b.price);
 if(state.sort==="price-high")arr.sort((a,b)=>b.price-a.price);
 if(state.sort==="rating")arr.sort((a,b)=>(b.rating||0)-(a.rating||0));
 return arr;
}
function renderDorms(){
 const all=filteredDorms(), shown=state.showAll?all:all.slice(0,6);
 $("#resultsCount").textContent=`Showing ${all.length} of ${dorms.length} listings`;
 $("#resultsTitle").textContent=state.query||state.amenities.length||state.room!=="all"||state.budget<5000?"Matching dormitories":"Featured dormitories";
 $("#statDorms").textContent=dorms.length+"";
 grid.innerHTML=shown.map((d,i)=>`<article class="dorm-card" style="animation-delay:${i*45}ms">
  <div class="dorm-image-wrap"><img class="dorm-image" src="${safe(d.image)}" alt="${safe(d.name)} room photo" loading="lazy" onerror="this.style.opacity='.15'"><span class="availability-badge" style="${d.available?'':'background:#fff0e8;color:#a35b24;border-color:#ffdfc7'}">${d.available?(d.spaces<=2?'Limited spaces':'Available now'):'Currently full'}</span></div>
  <div class="dorm-card-body"><h3>${safe(d.name)}</h3><div class="location-line"><span>⌖</span>${safe(d.location)}</div>
  <div class="price-line">${money(d.price)} <small>/ month</small></div><div class="utility-line">Est. total with utilities: ${money(d.price+d.utilities)}</div>
  <div class="card-meta"><span class="meta-pill rating-pill">${d.rating!=null?"★ "+d.rating.toFixed(1):"New"}</span><span class="meta-pill room-pill">${safe(d.room)}</span><span class="meta-pill space-pill">${d.available?d.spaces+" spaces left":"Full"}</span></div>
  <div class="card-actions"><button class="btn btn-primary detail-button" data-id="${d.id}">View details <span>→</span></button><button class="btn save-button ${state.saved.has(d.id)?"saved":""}" data-save="${d.id}" aria-label="Save ${safe(d.name)}">${state.saved.has(d.id)?"♥":"♡"}</button></div></div></article>`).join("");
 $("#emptyState").classList.toggle("hidden",all.length!==0);
 $("#loadMore").classList.toggle("hidden",all.length<=6);
 $("#loadMore").innerHTML=state.showAll?"Show fewer listings ↑":"Explore all listings ↓";
 renderChips();renderAnalytics();
}
function renderChips(){
 const chips=[];
 if(state.query)chips.push(["Search: "+state.query,()=>{state.query="";$("#filterSearch").value="";$("#heroSearch").value="";}]);
 if(state.budget<5000)chips.push(["Up to "+money(state.budget),()=>{state.budget=5000;$("#priceRange").value=5000;}]);
 if(state.room!=="all")chips.push([state.room,()=>{state.room="all";$("#roomType").value="all";}]);
 if(state.availability!=="all")chips.push([state.availability==="available"?"Available now":"Limited spaces",()=>{state.availability="all";$("#availability").value="all";}]);
 state.amenities.forEach(a=>chips.push([a,()=>{$(`.amenity-check[value="${CSS.escape(a)}"]`).checked=false;state.amenities=state.amenities.filter(x=>x!==a)}]));
 $("#activeFilters").innerHTML=chips.map((c,i)=>`<span class="filter-chip">${safe(c[0])}<button data-chip="${i}" aria-label="Remove filter">×</button></span>`).join("");
 $("#activeFilters").querySelectorAll("[data-chip]").forEach(b=>b.addEventListener("click",()=>{chips[+b.dataset.chip][1]();syncControls();renderDorms()}));
}
function syncControls(){
 $("#priceRange").value=state.budget;$("#priceValue").textContent=money(state.budget);
 $("#roomType").value=state.room;$("#availability").value=state.availability;
 $("#sortSelect").value=state.sort;$("#filterSearch").value=state.query;$("#heroSearch").value=state.query;
 $$(".amenity-check").forEach(c=>c.checked=state.amenities.includes(c.value));
}
function renderAnalytics(){
 const a=analytics;if(!a)return;
 const averages=ROOMS.map(t=>{const g=a.rentByRoom.find(r=>r.room===t);return {label:t.replace(" Room",""),value:g?g.average:0}});
 const max=Math.max(...averages.map(x=>x.value),1);
 $("#rentChart").innerHTML=averages.map(x=>`<div class="bar-item"><span class="bar-value">${money(x.value)}</span><div class="bar" style="height:${Math.max(8,x.value/max*72)}%"></div><span class="bar-label">${x.label}</span></div>`).join("");
 const total=Math.max(a.totalListings,1);
 $("#amenityChart").innerHTML=a.amenities.map(x=>`<div class="amenity-row"><span>${safe(x.amenity)}</span><div class="amenity-track"><div class="amenity-fill" style="width:${x.count/total*100}%"></div></div><span class="amenity-count">${x.count}</span></div>`).join("");
 $("#avgRent").textContent=money(a.avgRent);$("#availableCount").textContent=a.availableCount;
 if(a.totalListings){
  $("#statRange").textContent=a.minPrice===a.maxPrice?money(a.minPrice):`${money(a.minPrice)}–${money(a.maxPrice)}`;
  const top=[...a.amenities].sort((x,y)=>y.count-x.count)[0];
  $("#amenityInsight").textContent=`${top.amenity} appears in ${top.count} of ${a.totalListings} published listings. Actual student preference should be measured through survey data, not listing counts alone.`;
 }
}
function applySearch(q){state.query=q.trim();state.showAll=false;syncControls();renderDorms();$("#dorms").scrollIntoView({behavior:"smooth"});}

/* ---------------- Toast & modal ---------------- */
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3500)}
function openModal(html, wide=false){
 modalContent.innerHTML=html;
 modalBackdrop.querySelector(".modal").classList.toggle("modal-wide",wide);
 modalBackdrop.classList.remove("hidden");document.body.style.overflow="hidden";$("#modalClose").focus();
}
function closeModal(){modalBackdrop.classList.add("hidden");document.body.style.overflow=""}

/* ---------------- Accounts ---------------- */
function setUser(user){
 state.user=user;
 if(!user)state.saved=new Set();
 updateNav();renderDorms();
}
function updateNav(){
 const u=state.user;
 const html=u
  ? `<button class="btn btn-quiet" data-auth="dashboard">${u.role==="owner"?"Owner dashboard":"My account"}</button><button class="btn btn-primary" data-auth="logout">Log out <span>↩</span></button>`
  : `<button class="btn btn-quiet" data-auth="login">Log in</button><button class="btn btn-primary" data-auth="signup">Sign up <span>↗</span></button>`;
 $(".nav-actions").innerHTML=html;
 $(".mobile-actions").innerHTML=u?html:`<button class="btn btn-quiet" data-auth="login">Log in</button><button class="btn btn-primary" data-auth="signup">Create account</button>`;
}
async function loadSaved(){
 try{state.saved=new Set((await api("/saved")).ids)}catch{state.saved=new Set()}
}
async function afterLogin(user){
 const guestSaved=[...state.saved];
 state.user=user;
 await Promise.all(guestSaved.map(id=>api("/saved/"+id,{method:"PUT"}).catch(()=>{})));
 await loadSaved();
 setUser(user);
}
async function logout(){
 try{await api("/auth/logout",{method:"POST"})}catch{}
 closeModal();setUser(null);toast("You have been logged out.");
}
function openDashboard(){
 if(!state.user){authModal("login");return}
 state.user.role==="owner"?ownerDashboard():accountModal();
}
function authModal(type){
 if(type==="owner"){
  if(state.user&&state.user.role==="owner"){ownerDashboard();return}
  if(state.user){toast("You're signed in as a student. Log out and create an owner account to list a dorm.");return}
  openModal(`<div class="modal-logo">DORMMETRIC FOR OWNERS</div><h2 id="modalTitle">Understand your listing.</h2><p>Owner tools help you publish your dorm, update vacancies, answer student inquiries and view market summaries.</p><div class="detail-facts"><div class="detail-fact"><small>Listing tools</small><strong>Create and update details</strong></div><div class="detail-fact"><small>Analytics tools</small><strong>Compare rent and amenities</strong></div></div><button class="btn btn-primary" id="ownerLogin" style="width:100%">Continue to owner sign in</button>`);
  $("#ownerLogin").onclick=()=>authModal("login");return
 }
 const signup=type==="signup";
 openModal(`<div class="modal-logo">WELCOME TO DORMMETRIC</div><h2 id="modalTitle">${signup?"Create your account.":"Welcome back."}</h2><p>${signup?"Save your shortlist and make housing comparisons easier.":"Log in to continue exploring student housing."}</p><form class="auth-form" id="authForm">${signup?`<label>Full name<input name="name" required placeholder="Your full name"></label>`:""}<label>Email address<input type="email" name="email" required placeholder="you@example.com"></label><label>Password<input type="password" name="password" required minlength="6" placeholder="At least 6 characters"></label>${signup?`<label>I'm joining as<select name="role"><option value="student">Student</option><option value="owner">Dormitory owner</option></select></label>`:""}<p class="form-error" id="formError" role="alert"></p><button class="btn btn-primary" type="submit">${signup?"Create account":"Log in"} <span>→</span></button></form><div class="form-switch">${signup?"Already have an account?":"New to DormMetric?"} <button id="switchAuth">${signup?"Log in":"Sign up"}</button></div>`);
 $("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=e.target.querySelector("button[type=submit]"),err=$("#formError");
  const body=Object.fromEntries(new FormData(e.target));
  btn.disabled=true;err.textContent="";
  try{
   const {user}=await api(signup?"/auth/signup":"/auth/login",{method:"POST",body});
   await afterLogin(user);closeModal();
   toast(signup?`Welcome to DormMetric, ${user.name.split(" ")[0]}!`:`Welcome back, ${user.name.split(" ")[0]}!`);
   if(user.role==="owner")ownerDashboard();
  }catch(ex){err.textContent=errorText(ex);btn.disabled=false}
 });
 $("#switchAuth").onclick=()=>authModal(signup?"login":"signup");
}

/* ---------------- Listing details & inquiries ---------------- */
function detail(id){
 const d=dorms.find(x=>x.id===Number(id));if(!d)return;
 if(!viewedThisSession.has(d.id)){viewedThisSession.add(d.id);api(`/dorms/${d.id}/view`,{method:"POST"}).catch(()=>{})}
 const adminBtn = state.user && state.user.isAdmin
  ? `<button class="btn btn-outline btn-danger" id="adminDeleteDorm" style="width:100%;margin-top:8px">Delete listing (Admin)</button>`
  : "";
 openModal(`<div class="modal-logo">DORMMETRIC LISTING</div><img class="detail-image" src="${safe(d.image)}" alt="${safe(d.name)}" onerror="this.style.opacity='.2'"><h2 id="modalTitle">${safe(d.name)}</h2><p>⌖ ${safe(d.location)}</p><div class="detail-price">${money(d.price)} <span style="font-size:12px;color:#7d8ea5;font-weight:500">/ month</span></div><p>${safe(d.description)}</p><div class="detail-facts"><div class="detail-fact"><small>Room type</small><strong>${safe(d.room)}</strong></div><div class="detail-fact"><small>Estimated utilities</small><strong>${money(d.utilities)} / month</strong></div><div class="detail-fact"><small>Approx. distance</small><strong>${d.distance} km from campus*</strong></div><div class="detail-fact"><small>Availability</small><strong>${d.available?d.spaces+" spaces listed":"Currently full"}</strong></div></div><strong style="font-size:11px">Listed amenities</strong><div class="detail-amenities">${d.amenities.map(a=>`<span>✓ ${safe(a)}</span>`).join("")}</div><p style="font-size:10px">*Distance and listing details are provided by the dorm owner. Confirm location, price, inclusions, and availability directly with the owner.</p><button class="btn btn-primary" id="contactOwner" style="width:100%" ${d.available?"":"disabled"}>Request owner contact <span>→</span></button>${adminBtn}`);
 $("#contactOwner").addEventListener("click",()=>contactOwner(d));
 if($("#adminDeleteDorm")){
  $("#adminDeleteDorm").addEventListener("click",async()=>{
   if(!confirm(`Delete "${d.name}" permanently from the website?`))return;
   try{
    await api(`/dorms/${d.id}`,{method:"DELETE"});
    closeModal();
    await refreshListings();
    toast("Listing deleted by admin.");
   }catch(ex){toast(ex.message)}
  });
 }
}
function contactOwner(d){
 if(!state.user){toast("Please log in with a student account to contact the owner.");authModal("login");return}
 if(state.user.role!=="student"){toast("Owner accounts can't send inquiries. Please use a student account.");return}
 openModal(`<div class="modal-logo">CONTACT THE OWNER</div><h2 id="modalTitle">${safe(d.name)}</h2><p>Your name and email are shared with the owner so they can reply to you.</p><form class="auth-form" id="inquiryForm"><label>Contact number (optional)<input name="phone" placeholder="09XX XXX XXXX" maxlength="20"></label><label>Message<textarea name="message" required minlength="10" maxlength="800">Hi! I'm interested in a room at ${safe(d.name)}. Is it still available?</textarea></label><p class="form-error" id="formError" role="alert"></p><button class="btn btn-primary" type="submit">Send request <span>→</span></button></form>`);
 $("#inquiryForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=e.target.querySelector("button[type=submit]");btn.disabled=true;$("#formError").textContent="";
  try{
   await api("/inquiries",{method:"POST",body:{...Object.fromEntries(new FormData(e.target)),dormId:d.id}});
   closeModal();toast("Request sent! The owner will reply using your account email.");
  }catch(ex){$("#formError").textContent=errorText(ex);btn.disabled=false}
 });
}
async function toggleSave(id){
 const was=state.saved.has(id);
 if(!state.user){
  was?state.saved.delete(id):state.saved.add(id);
  toast(was?"Removed from your saved shortlist.":"Saved for this session. Log in to keep your shortlist.");
  renderDorms();return;
 }
 try{
  await api("/saved/"+id,{method:was?"DELETE":"PUT"});
  was?state.saved.delete(id):state.saved.add(id);
  toast(was?"Removed from your saved shortlist.":"Saved to your shortlist.");
  renderDorms();
 }catch(ex){toast(ex.message)}
}

/* ---------------- Student account ---------------- */
const STATUS_LABEL={new:"Sent",contacted:"Owner replied",closed:"Closed"};
async function accountModal(){
 openModal(`<div class="modal-logo">MY ACCOUNT</div><h2 id="modalTitle">Hi, ${safe(state.user.name.split(" ")[0])}.</h2><p>Loading your shortlist…</p>`,true);
 try{
  const {inquiries}=await api("/me/inquiries");
  const saved=dorms.filter(d=>state.saved.has(d.id));
  openModal(`<div class="modal-logo">MY ACCOUNT</div><h2 id="modalTitle">Hi, ${safe(state.user.name.split(" ")[0])}.</h2><p>${safe(state.user.email)}</p>
   <h3 class="dash-heading">Saved dorms (${saved.length})</h3>
   ${saved.length?`<div class="dash-list">${saved.map(d=>`<div class="dash-row"><img class="dash-thumb" src="${safe(d.image)}" alt=""><div class="dash-row-main"><strong>${safe(d.name)}</strong><small>${safe(d.room)} · ${money(d.price)} / month · ${d.available?d.spaces+" spaces":"Full"}</small></div><div class="dash-row-actions"><button class="btn btn-outline btn-sm" data-view-dorm="${d.id}">View</button><button class="btn btn-outline btn-sm" data-unsave="${d.id}">Remove</button></div></div>`).join("")}</div>`:`<p class="dash-empty">No saved dorms yet. Tap the ♡ on any listing.</p>`}
   <h3 class="dash-heading">My requests (${inquiries.length})</h3>
   ${inquiries.length?`<div class="dash-list">${inquiries.map(i=>`<div class="dash-row"><div class="dash-row-main"><strong>${safe(i.dormName)}</strong><small>${safe(i.message)}</small><small>${fmtDate(i.createdAt)}</small></div><span class="dash-badge badge-${i.status}">${STATUS_LABEL[i.status]}</span></div>`).join("")}</div>`:`<p class="dash-empty">You haven't contacted any owners yet.</p>`}`,true);
 }catch(ex){toast(ex.message);closeModal()}
}

/* ---------------- Owner dashboard ---------------- */
const TABS=[["overview","Overview"],["listings","My listings"],["form","Add listing"],["inquiries","Inquiries"]];
let pendingImage=null;

function dashShell(tab){
 return `<div class="modal-logo">DORMMETRIC FOR OWNERS</div><h2 id="modalTitle">Hi, ${safe(state.user.name.split(" ")[0])}.</h2><div class="dash-tabs" role="tablist">${TABS.map(([k,l])=>`<button class="dash-tab ${k===tab?"active":""}" data-tab="${k}" role="tab">${l}</button>`).join("")}</div><div id="dashPanel"><p class="dash-empty">Loading…</p></div>`;
}
async function ownerDashboard(tab="overview", editId=null){
 if(!state.user||state.user.role!=="owner"){authModal("login");return}
 openModal(dashShell(tab),true);
 const panel=$("#dashPanel");
 try{
  if(tab==="overview")panel.innerHTML=await overviewHtml();
  else if(tab==="listings")panel.innerHTML=await listingsHtml();
  else if(tab==="inquiries")panel.innerHTML=await inquiriesHtml();
  else if(tab==="form"){
   let d=null;
   if(editId){d=(await api("/owner/dorms")).dorms.find(x=>x.id===Number(editId))||null}
   panel.innerHTML=dormFormHtml(d);bindDormForm(d);
  }
 }catch(ex){panel.innerHTML=`<p class="form-error">${safe(ex.message)}</p>`}
}
async function overviewHtml(){
 const {totals:t,listings}=await api("/owner/analytics");
 if(!t.listings)return `<p class="dash-empty">You haven't posted a dorm yet. Add your first listing to appear on the Find Dorms page.</p><button class="btn btn-primary" data-tab="form">Add your first listing →</button>`;
 const stat=(l,v)=>`<div class="detail-fact"><small>${l}</small><strong class="dash-stat">${v}</strong></div>`;
 return `<div class="dash-stats">${stat("Published listings",`${t.published} / ${t.listings}`)}${stat("Listing views",t.views)}${stat("Inquiries received",t.inquiries)}${stat("New inquiries",t.newInquiries)}</div>
 <h3 class="dash-heading">How your rent compares with the market</h3>
 <div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Listing</th><th>Your rent</th><th>Market avg. (${"same room type"})</th><th>Views</th><th>Inquiries</th></tr></thead><tbody>${listings.map(l=>{
  const diff=l.marketAvg?l.price-l.marketAvg:0;
  const note=!l.marketAvg?"":diff===0?"At market":`${money(Math.abs(diff))} ${diff>0?"above":"below"}`;
  return `<tr><td><strong>${safe(l.name)}</strong><small>${safe(l.room)}${l.isPublished?"":" · hidden"}</small></td><td>${money(l.price)}</td><td>${l.marketAvg?money(l.marketAvg):"—"}<small>${note}</small></td><td>${l.views}</td><td>${l.inquiries}</td></tr>`}).join("")}</tbody></table></div>
 <p class="dash-note">Market average is calculated from all published DormMetric listings with the same room type.</p>`;
}
async function listingsHtml(){
 const {dorms:mine}=await api("/owner/dorms");
 if(!mine.length)return `<p class="dash-empty">No listings yet.</p><button class="btn btn-primary" data-tab="form">Add a listing →</button>`;
 return `<div class="dash-list">${mine.map(d=>`<div class="dash-row"><img class="dash-thumb" src="${safe(d.image)}" alt="" onerror="this.style.opacity='.15'"><div class="dash-row-main"><strong>${safe(d.name)}</strong><small>${safe(d.room)} · ${money(d.price)} / month · ${d.views} views · ${d.inquiryCount} inquiries</small>
  <div class="dash-spaces"><button class="btn btn-outline btn-sm" data-spaces="${d.id}:-1" aria-label="One less space" ${d.spaces<=0?"disabled":""}>−</button><span>${d.spaces} ${d.spaces===1?"space":"spaces"}</span><button class="btn btn-outline btn-sm" data-spaces="${d.id}:1" aria-label="One more space">+</button></div></div>
  <span class="dash-badge ${!d.isPublished?"badge-closed":d.available?"badge-live":"badge-new"}">${!d.isPublished?"Hidden":d.available?"Published":"Full"}</span>
  <div class="dash-row-actions"><button class="btn btn-outline btn-sm" data-edit="${d.id}">Edit</button><button class="btn btn-outline btn-sm" data-publish="${d.id}:${d.isPublished?0:1}">${d.isPublished?"Hide":"Publish"}</button><button class="btn btn-outline btn-sm btn-danger" data-delete="${d.id}">Delete</button></div></div>`).join("")}</div>
  <button class="btn btn-primary" data-tab="form" style="margin-top:14px">+ Add a listing</button>`;
}
async function inquiriesHtml(){
 const {inquiries}=await api("/owner/inquiries");
 if(!inquiries.length)return `<p class="dash-empty">No inquiries yet. Students who tap “Request owner contact” will show up here.</p>`;
 return `<div class="dash-list">${inquiries.map(i=>`<div class="dash-row dash-inq"><div class="dash-row-main"><strong>${safe(i.studentName)} <small>for ${safe(i.dormName)}</small></strong><small>✉ <a href="mailto:${safe(i.studentEmail)}">${safe(i.studentEmail)}</a>${i.phone?` · ☎ ${safe(i.phone)}`:""} · ${fmtDate(i.createdAt)}</small><p>${safe(i.message)}</p></div><label class="dash-status">Status<select data-inq="${i.id}">${["new","contacted","closed"].map(s=>`<option value="${s}" ${s===i.status?"selected":""}>${s[0].toUpperCase()+s.slice(1)}</option>`).join("")}</select></label></div>`).join("")}</div>`;
}
function dormFormHtml(d){
 const v=d||{name:"",location:"Alangilan, Batangas City",price:"",utilities:"",room:"Shared Room",spaces:1,distance:"",description:"",amenities:[],isPublished:true,owner:""};
 return `<form class="dash-form" id="dormForm" novalidate>
  <h3 class="dash-heading" style="margin-top:0">${d?"Edit listing":"Add a new listing"}</h3>
  <div class="dash-grid">
   <label class="span-2">Dorm name<input name="name" required maxlength="80" value="${safe(v.name)}" placeholder="e.g. Maple Residence"></label>
   <label class="span-2">Location<input name="location" required maxlength="160" value="${safe(v.location)}"></label>
   <label>Monthly rent (₱)<input name="price" type="number" min="500" max="5000" step="50" required value="${safe(v.price)}"></label>
   <label>Est. utilities / month (₱)<input name="utilities" type="number" min="0" max="3000" step="50" required value="${safe(v.utilities)}"></label>
   <label>Room type<select name="room">${ROOMS.map(r=>`<option ${r===v.room?"selected":""}>${r}</option>`).join("")}</select></label>
   <label>Available spaces<input name="spaces" type="number" min="0" max="99" required value="${safe(v.spaces)}"></label>
   <label>Distance from campus (km)<input name="distance" type="number" min="0" max="20" step="0.1" required value="${safe(v.distance)}"></label>
   <label>Contact name shown to students<input name="contactName" maxlength="80" value="${safe(v.owner)}" placeholder="${safe(state.user.name)}"></label>
   <label class="span-2">Description<textarea name="description" required minlength="10" maxlength="600" placeholder="Describe the rooms, house rules, and what makes your dorm student-friendly.">${safe(v.description)}</textarea></label>
   <fieldset class="span-2"><legend>Amenities & inclusions</legend><div class="dash-checks">${AMENITIES.map(a=>`<label><input type="checkbox" name="amenities" value="${safe(a)}" ${v.amenities.includes(a)?"checked":""}> ${a}</label>`).join("")}</div></fieldset>
   <div class="span-2 dash-photo"><label>Photo (JPG, PNG or WebP)<input type="file" id="photoFile" accept="image/png,image/jpeg,image/webp"></label>
    <img id="photoPreview" class="dash-preview ${d?"":"hidden"}" src="${d?safe(d.image):""}" alt="Photo preview"></div>
   <label class="span-2">…or paste a photo link (optional)<input name="image" type="url" placeholder="https://"></label>
   <label class="dash-publish span-2"><input type="checkbox" name="isPublished" ${v.isPublished?"checked":""}> Publish this listing on the Find Dorms page</label>
  </div>
  <p class="form-error" id="formError" role="alert"></p>
  <div class="dash-form-actions"><button class="btn btn-primary" type="submit">${d?"Save changes":"Publish listing"} <span>→</span></button><button class="btn btn-outline" type="button" data-tab="listings">Cancel</button></div></form>`;
}
function fileToDataUrl(file){
 return new Promise((resolve,reject)=>{
  const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{const s=Math.min(1,1200/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL("image/jpeg",.85))};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("That file isn't a readable image."))};
  img.src=url;
 });
}
function bindDormForm(d){
 pendingImage=null;
 $("#photoFile").addEventListener("change",async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
   if(f.size>15*1024*1024)throw new Error("Please choose a photo under 15 MB.");
   pendingImage=await fileToDataUrl(f);
   const p=$("#photoPreview");p.src=pendingImage;p.classList.remove("hidden");$("#formError").textContent="";
  }catch(ex){e.target.value="";pendingImage=null;$("#formError").textContent=ex.message}
 });
 $("#dormForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=e.target,btn=f.querySelector("button[type=submit]"),err=$("#formError");
  const fd=new FormData(f);
  const body={name:fd.get("name"),location:fd.get("location"),price:fd.get("price"),utilities:fd.get("utilities"),room:fd.get("room"),spaces:fd.get("spaces"),distance:fd.get("distance"),contactName:fd.get("contactName"),description:fd.get("description"),amenities:fd.getAll("amenities"),isPublished:f.isPublished.checked};
  if(pendingImage)body.imageData=pendingImage;else if(fd.get("image"))body.image=fd.get("image");
  btn.disabled=true;err.textContent="";
  try{
   await api(d?"/owner/dorms/"+d.id:"/owner/dorms",{method:d?"PUT":"POST",body});
   await refreshListings();
   toast(d?"Listing updated.":body.isPublished?"Your dorm is now live on Find Dorms!":"Listing saved as hidden.");
   ownerDashboard("listings");
  }catch(ex){err.textContent=errorText(ex);btn.disabled=false}
 });
}

/* One delegated handler for every button inside the modal (dashboard, account, forms) */
modalContent.addEventListener("click",async e=>{
 const el=e.target.closest("[data-tab],[data-edit],[data-publish],[data-spaces],[data-delete],[data-view-dorm],[data-unsave]");
 if(!el)return;
 try{
  if(el.dataset.tab)return ownerDashboard(el.dataset.tab);
  if(el.dataset.edit)return ownerDashboard("form",el.dataset.edit);
  if(el.dataset.viewDorm)return detail(el.dataset.viewDorm);
  if(el.dataset.unsave){await toggleSave(Number(el.dataset.unsave));return accountModal()}
  if(el.dataset.publish){const [id,v]=el.dataset.publish.split(":");await api("/owner/dorms/"+id,{method:"PATCH",body:{isPublished:v==="1"}});toast(v==="1"?"Listing published.":"Listing hidden from students.")}
  else if(el.dataset.spaces){const [id,delta]=el.dataset.spaces.split(":");const cur=(await api("/owner/dorms")).dorms.find(x=>x.id===Number(id));await api("/owner/dorms/"+id,{method:"PATCH",body:{spaces:Math.max(0,cur.spaces+Number(delta))}})}
  else if(el.dataset.delete){if(!confirm("Delete this listing permanently? Inquiries for it will also be removed."))return;await api("/owner/dorms/"+el.dataset.delete,{method:"DELETE"});toast("Listing deleted.")}
  await refreshListings();ownerDashboard("listings");
 }catch(ex){toast(ex.message)}
});
modalContent.addEventListener("change",async e=>{
 const sel=e.target.closest("[data-inq]");if(!sel)return;
 try{await api("/owner/inquiries/"+sel.dataset.inq,{method:"PATCH",body:{status:sel.value}});toast("Inquiry marked as "+sel.value+".")}catch(ex){toast(ex.message)}
});

/* ---------------- Page wiring (unchanged behaviour) ---------------- */
$("#menuToggle").addEventListener("click",()=>{const open=$("#mobileMenu").classList.toggle("open");$("#menuToggle").setAttribute("aria-expanded",String(open))});
$("#mobileMenu").querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{$("#mobileMenu").classList.remove("open");$("#menuToggle").setAttribute("aria-expanded","false")}));
$("#heroSearchBtn").addEventListener("click",()=>applySearch($("#heroSearch").value));
$("#heroSearch").addEventListener("keydown",e=>{if(e.key==="Enter")applySearch(e.target.value)});
$("#filterSearch").addEventListener("input",e=>{state.query=e.target.value;state.showAll=false;renderDorms()});
$("#priceRange").addEventListener("input",e=>{state.budget=+e.target.value;$("#priceValue").textContent=money(state.budget);state.showAll=false;renderDorms()});
$("#roomType").addEventListener("change",e=>{state.room=e.target.value;state.showAll=false;renderDorms()});
$("#availability").addEventListener("change",e=>{state.availability=e.target.value;state.showAll=false;renderDorms()});
$$(".amenity-check").forEach(c=>c.addEventListener("change",()=>{state.amenities=$$(".amenity-check:checked").map(x=>x.value);state.showAll=false;renderDorms()}));
$("#sortSelect").addEventListener("change",e=>{state.sort=e.target.value;renderDorms()});
function resetFilters(){state.query="";state.budget=5000;state.room="all";state.availability="all";state.amenities=[];state.sort="recommended";state.showAll=false;syncControls();renderDorms()}
$("#resetFilters").addEventListener("click",resetFilters);$("#clearFilters").addEventListener("click",resetFilters);$("#emptyReset").addEventListener("click",resetFilters);
$("#loadMore").addEventListener("click",()=>{state.showAll=!state.showAll;renderDorms()});
$("#mobileFilterButton").addEventListener("click",()=>{$("#filterPanel").classList.toggle("mobile-open");$("#filterPanel").scrollIntoView({behavior:"smooth",block:"start"})});
$("#jumpToDorms").addEventListener("click",()=>$("#dorms").scrollIntoView({behavior:"smooth"}));
grid.addEventListener("click",e=>{const detailBtn=e.target.closest("[data-id]");if(detailBtn){detail(detailBtn.dataset.id);return}const save=e.target.closest("[data-save]");if(save)toggleSave(Number(save.dataset.save))});
// Delegated so the buttons keep working after the nav switches between logged-out / logged-in
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-auth]");if(!b)return;
 const a=b.dataset.auth;
 if(a==="logout")logout();else if(a==="dashboard")openDashboard();else authModal(a);
 $("#mobileMenu").classList.remove("open");$("#menuToggle").setAttribute("aria-expanded","false");
});
$("#modalClose").addEventListener("click",closeModal);modalBackdrop.addEventListener("click",e=>{if(e.target===modalBackdrop)closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$("#announcementClose").addEventListener("click",()=>document.querySelector(".announcement").remove());
const words=["future.","comfort.","next chapter.","student life."];let wordIndex=0;
setInterval(()=>{wordIndex=(wordIndex+1)%words.length;const el=$("#rotatingWord");el.style.animation="none";void el.offsetWidth;el.textContent=words[wordIndex];el.style.animation="wordIn .5s ease"},2600);
const navLinks=$$(".nav-link");const sections=["home","dorms","insights","how-it-works","about"].map(id=>document.getElementById(id));
if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){navLinks.forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+entry.target.id))}}),{rootMargin:"-30% 0px -60% 0px"});sections.forEach(s=>s&&observer.observe(s))}

/* ---------------- Start ---------------- */
async function init(){
 syncControls();
 grid.innerHTML=`<p class="demo-note" style="grid-column:1/-1">Loading dormitories…</p>`;
 try{
  const me=await api("/auth/me").catch(()=>({user:null}));
  if(me.user){state.user=me.user;await loadSaved();updateNav()}
  await loadListings();
  renderDorms();
 }catch(ex){
  grid.innerHTML=`<p class="demo-note" style="grid-column:1/-1">We couldn't load the listings right now. <button class="text-button" id="retryLoad">Try again</button></p>`;
  $("#resultsCount").textContent="Listings unavailable";
  $("#retryLoad").addEventListener("click",init);
 }
}
init();
