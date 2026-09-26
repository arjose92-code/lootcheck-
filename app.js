// LOOTCHECK.GG - Epic OAuth2 réel + APIs fortnite-api.com (shop/news/skins) + dashboard
const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
};

let user = store.get('fn_user', null);
let spends = store.get('fn_spends', []);
let locker = store.get('fn_locker', []);
let chart = null;
let lastSearch = [];

const VB_EURO = 8.99/1000;
const RARITY_VB = { legendary:2000, epic:1500, rare:1200, uncommon:800, common:500, marvel:1800, dc:1800, starwars:1800, gaminglegends:2000, icon:1800, default:800 };

// ---------- EPIC REEL + DEMO ----------
let REEL_MODE = false;
async function checkReel(){
  try{
    const r = await fetch('/api/config');
    const j = await r.json();
    REEL_MODE = !!j.reel;
    const banner = $('modeBanner');
    if(banner) banner.innerHTML = REEL_MODE
      ? '🟢 <b>MODE RÉEL</b> — vraie page Epic Games via OAuth2'
      : '🟡 <b>MODE DÉMO</b> — remplis epic_config.json pour activer le RÉEL (voir README)';
  }catch{ REEL_MODE = false; }
  try{
    const r2 = await fetch('/api/me');
    const me = await r2.json();
    if(me.connected){
      user = {
        pseudo: me.display_name || 'Joueur Epic',
        epicId: me.account_id || 'epic_???',
        avatar: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(me.display_name||'epic')}`,
        date: new Date().toLocaleString('fr-FR'),
        reel: true
      };
      renderUser();
    }
  }catch{}
}
function openModal(){
  if(REEL_MODE){ window.location.href = '/auth/login'; return; }
  $('epicModal').classList.remove('hidden');
}
function closeModal(){ $('epicModal').classList.add('hidden'); }

function loginAs(pseudo){
  pseudo = (pseudo||'').trim() || 'Joueur_FN';
  user = { pseudo, epicId: 'epic_' + Math.random().toString(36).slice(2,10),
    avatar: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(pseudo)}`,
    date: new Date().toLocaleString('fr-FR') };
  store.set('fn_user', user);
  renderUser();
}
function logout(){
  user = null; localStorage.removeItem('fn_user');
  fetch('/api/logout').catch(()=>{});
  if(REEL_MODE){ window.location.href = '/api/logout'; return; }
  renderUser();
}
function renderUser(){
  const nav = $('navUser'), prof = $('epicProfile');
  if(!nav || !prof) return;
  if(user){
    nav.innerHTML = `<span style="margin-right:10px">${user.reel?'🟢':'👤'} <b>${escapeHtml(user.pseudo)}</b></span><button id="btnNavOut" class="btn-ghost">Logout</button>`;
    $('btnNavOut').onclick = logout;
    prof.classList.remove('hidden');
    prof.innerHTML = `<img src="${user.avatar}"><div><b>${escapeHtml(user.pseudo)}</b><br><small class="muted">${escapeHtml(user.epicId)} • ${user.reel?'connexion RÉELLE Epic':'démo locale'} • ${user.date||''}</small></div>`;
    $('btnEpicLogin').classList.add('hidden');
    $('btnLogout').classList.remove('hidden');
    $('dashboard').classList.add('unlocked');
    const box = $('epicApiBox');
    if(box){
      box.classList.remove('hidden');
      box.innerHTML = `<b>🔌 API Epic reliée :</b><br>• displayName: <b>${escapeHtml(user.pseudo)}</b><br>• accountId: <code>${escapeHtml(user.epicId)}</code><br>• mode: ${user.reel?'RÉEL OAuth2 (/api/me)':'DÉMO'}<br>• <a href="https://fortnite.gg/stats?player=${encodeURIComponent(user.pseudo)}" target="_blank" style="color:#22d3ee">Voir mes stats publiques ↗</a>`;
    }
    const sp = $('statsPseudo'); if(sp && !sp.value) sp.value = user.pseudo;
  } else {
    nav.innerHTML = `<button id="btnNavLogin2" class="btn-epic">Connecter avec Epic Games</button>`;
    $('btnNavLogin2').onclick = openModal;
    prof.classList.add('hidden');
    $('btnLogout').classList.add('hidden');
    $('btnEpicLogin').classList.remove('hidden');
    $('dashboard').classList.remove('unlocked');
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

// ---------- SHOP LIVE ----------
async function loadShop(){
  const grid = $('shopGrid'); if(!grid) return;
  grid.innerHTML = '⏳ Chargement boutique live…';
  try{
    const r = await fetch('https://fortnite-api.com/v2/shop');
    const j = await r.json();
    const entries = (j.data?.entries || []).filter(e => e.brItems && e.brItems.length > 0).slice(0, 12);
    if(!entries.length){ grid.innerHTML = 'Boutique vide pour le moment.'; return; }
    $('shopDate').textContent = '• ' + new Date().toLocaleDateString('fr-FR');
    grid.innerHTML = '';
    entries.forEach(e=>{
      const item = (e.brItems||[])[0]; if(!item) return;
      const img = item.images?.smallIcon || item.images?.icon;
      const price = e.finalPrice ?? e.regularPrice ?? 0;
      const euro = (price*VB_EURO).toFixed(2);
      const d = document.createElement('div');
      d.className = 'shop-card';
      d.innerHTML = `<img src="${img}" loading="lazy"><b>${escapeHtml(item.name)}</b><small>${price} VB • ~${euro}€</small><button data-id="${item.id}">+ Casier</button>`;
      d.querySelector('button').onclick = ()=> addToLocker({ id: item.id, name: item.name, rarity: item.rarity?.value||'epic', img, vb: price||vbForRarity(item.rarity?.value, item.name) });
      grid.appendChild(d);
    });
    $('apiStatus').textContent = '✅ API shop OK';
  }catch{ grid.innerHTML = '❌ Shop API injoignable. Vérifie ta connexion.'; }
}

// ---------- NEWS LIVE ----------
async function loadNews(){
  const grid = $('newsGrid'); if(!grid) return;
  try{
    const r = await fetch('https://fortnite-api.com/v2/news/br');
    const j = await r.json();
    const motds = (j.data?.motds || []).slice(0, 3);
    if(!motds.length){ grid.innerHTML = 'Pas de news pour le moment.'; return; }
    grid.innerHTML = '';
    motds.forEach(n=>{
      const d = document.createElement('div');
      d.className = 'news-card';
      d.innerHTML = `<img src="${n.image}" loading="lazy" onerror="this.style.display='none'"><div><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body||'')}</p></div>`;
      grid.appendChild(d);
    });
  }catch{ grid.innerHTML = '❌ News API injoignable.'; }
}

// ---------- DEPENSES ----------
function addSpend(){
  const sel = $('packSelect').value;
  let price, vb;
  if(sel === 'custom'){
    price = parseFloat($('customPrice').value);
    if(!price || price<=0) return alert('Mets un montant valide');
    vb = Math.round(price / VB_EURO);
  } else {
    const [p,v] = sel.split('|'); price = parseFloat(p); vb = parseInt(v);
  }
  spends.push({ price, vb, label: $('packSelect').selectedOptions[0]?.text || `${price}€`, date: new Date().toLocaleDateString('fr-FR') });
  store.set('fn_spends', spends);
  renderSpends();
}
function renderSpends(){
  const list = $('spendList'); if(!list) return;
  list.innerHTML = '';
  let total = 0, totalVb = 0;
  spends.forEach((s,i)=>{
    total += s.price; totalVb += s.vb||0;
    const li = document.createElement('li');
    li.innerHTML = `<span>📦 ${escapeHtml(s.label)} <small class="muted">• ${s.date}</small></span><span><b>${s.price.toFixed(2)}€</b> <button>✕</button></span>`;
    li.querySelector('button').onclick = ()=>{ spends.splice(i,1); store.set('fn_spends', spends); renderSpends(); };
    list.appendChild(li);
  });
  $('kpiSpent').textContent = total.toFixed(2).replace('.',',') + ' €';
  $('kpiVbucks').textContent = totalVb.toLocaleString('fr-FR') + ' V-Bucks achetés';
  renderKpis();
  drawChart();
}
function drawChart(){
  const ctx = $('chartSpend'); if(!ctx || typeof Chart==='undefined') return;
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'bar',
    data:{ labels: spends.length?spends.map((_,i)=>`Achat ${i+1}`):['Aucun'], datasets:[{ data: spends.length?spends.map(s=>s.price):[0], backgroundColor:'#8b5cf6', borderRadius:8 }]},
    options:{ plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}} } }
  });
}

// ---------- CASIER ----------
function vbForRarity(rarity, name){
  rarity = (rarity||'common').toLowerCase();
  let base = RARITY_VB[rarity] ?? 800;
  if(/renegade|black knight|skull trooper|ghoul|midas|drift|wildcat|ikonik|galaxy|travis|jordan/i.test(name||'')) base = Math.round(base*1.3);
  return base;
}
async function searchSkins(query){
  const box = $('skinResults'); if(!box) return;
  box.innerHTML = '⏳ Recherche...';
  try{
    const url = !query ? 'https://fortnite-api.com/v2/cosmetics/br/new'
      : `https://fortnite-api.com/v2/cosmetics/br/search/all?name=${encodeURIComponent(query)}`;
    const r = await fetch(url);
    const j = await r.json();
    let items = [];
    if(j.data?.items) items = j.data.items.slice(0,18);
    else if(Array.isArray(j.data)) items = j.data.slice(0,18);
    else if(j.data) items = [j.data];
    const filt = $('rarityFilter')?.value;
    if(filt) items = items.filter(it => (it.rarity?.value||'').toLowerCase() === filt);
    lastSearch = items;
    if(!items.length){ box.innerHTML = '❌ Aucun skin. Essaie “Midas”, “Drift”, “Peely”.'; return; }
    box.innerHTML = '';
    items.forEach(it=>{
      const name = it.name, rarity = it.rarity?.value || 'common';
      const img = it.images?.smallIcon || it.images?.icon;
      const vb = vbForRarity(rarity, name);
      const euro = (vb*VB_EURO).toFixed(2);
      const card = document.createElement('div');
      card.className = 'skin-card';
      card.innerHTML = `<img src="${img}" loading="lazy"><b style="font-size:.8rem">${escapeHtml(name)}</b><small>${rarity.toUpperCase()} • ${vb} VB (~${euro}€)</small><button>+ Ajouter</button>`;
      card.querySelector('button').onclick = ()=> addToLocker({ id: it.id, name, rarity, img, vb });
      box.appendChild(card);
    });
  }catch{ box.innerHTML = '❌ API skins injoignable.'; }
}
async function randomSkin(){
  try{
    const r = await fetch('https://fortnite-api.com/v2/cosmetics/br/random');
    const j = await r.json();
    if(j.data) addToLocker({ id: j.data.id, name: j.data.name, rarity: j.data.rarity?.value||'epic', img: j.data.images?.smallIcon, vb: vbForRarity(j.data.rarity?.value, j.data.name) });
  }catch{ alert('Random API injoignable'); }
}
function addToLocker(skin){
  if(!skin.img) return;
  if(locker.find(x=>x.id===skin.id)) return alert('Déjà dans ton casier !');
  skin.euro = +(skin.vb*VB_EURO).toFixed(2);
  locker.push(skin);
  store.set('fn_locker', locker);
  renderLocker();
}
function renderLocker(){
  const grid = $('lockerGrid'); if(!grid) return;
  grid.innerHTML = '';
  let totalVb = 0;
  locker.forEach((s,i)=>{
    totalVb += s.vb;
    const d = document.createElement('div');
    d.className = 'locker-item';
    d.innerHTML = `<button class="del">✕</button><img src="${s.img}" loading="lazy"><b style="font-size:.75rem">${escapeHtml(s.name)}</b><small>${s.vb} VB • ~${s.euro.toFixed(2)}€</small>`;
    d.querySelector('.del').onclick = ()=>{ locker.splice(i,1); store.set('fn_locker', locker); renderLocker(); };
    grid.appendChild(d);
  });
  $('lockerCount').textContent = locker.length;
  $('kpiLocker').textContent = (totalVb*VB_EURO).toFixed(2).replace('.',',') + ' €';
  $('kpiLockerVb').textContent = totalVb.toLocaleString('fr-FR') + ' V-Bucks de valeur';
  $('kpiSkins').textContent = locker.length + ' skins';
  renderKpis();
}
function renderKpis(){
  const spent = spends.reduce((a,s)=>a+s.price,0);
  const lockerEuro = locker.reduce((a,s)=>a+s.euro,0);
  $('kpiRatio').textContent = (spent>0 && lockerEuro>0) ? 'x' + (lockerEuro/spent).toFixed(2) + (lockerEuro/spent>=1?' 🤑':' 🫠') : '—';
}
function verdict(){
  const spent = spends.reduce((a,s)=>a+s.price,0);
  const val = locker.reduce((a,s)=>a+s.euro,0);
  const el = $('verdict');
  if(!spent && !locker.length){ el.textContent = 'Ajoute des dépenses + skins.'; return; }
  let msg = `💸 Dépensé: ${spent.toFixed(2)}€ • 🎒 Casier: ${val.toFixed(2)}€ (${locker.length} skins). `;
  if(val > spent) msg += '🤑 Ton casier vaut PLUS que dépensé — bon investisseur, surtout si OG !';
  else if(spent > 200) msg += '🐳 Gros investisseur — surveille tes packs Crew.';
  else msg += '🫠 Normal — la valeur boutique dépasse rarement le dépensé sauf OG rares.';
  el.textContent = msg;
}

// ---------- EVENTS ----------
function bind(){
  if($('btnNavLogin')) $('btnNavLogin').onclick = openModal;
  if($('btnHeroLogin')) $('btnHeroLogin').onclick = openModal;
  if($('modalClose')) $('modalClose').onclick = closeModal;
  if($('modalGo')) $('modalGo').onclick = ()=>{ loginAs($('modalPseudo').value); closeModal(); $('dashboard').scrollIntoView({behavior:'smooth'}); };
  if($('btnEpicLogin')) $('btnEpicLogin').onclick = ()=>{ loginAs($('epicPseudo').value); };
  if($('btnLogout')) $('btnLogout').onclick = logout;
  if($('btnDemo')) $('btnDemo').onclick = ()=>{ if(!user) loginAs('Invité_Démo'); $('dashboard').scrollIntoView({behavior:'smooth'}); };
  if($('packSelect')) $('packSelect').onchange = e => $('customPrice').classList.toggle('hidden', e.target.value!=='custom');
  if($('btnAddSpend')) $('btnAddSpend').onclick = addSpend;
  if($('btnResetSpend')) $('btnResetSpend').onclick = ()=>{ if(confirm('Supprimer dépenses ?')){ spends=[]; store.set('fn_spends',spends); renderSpends(); } };
  if($('btnResetLocker')) $('btnResetLocker').onclick = ()=>{ if(confirm('Vider casier ?')){ locker=[]; store.set('fn_locker',locker); renderLocker(); } };
  if($('btnSkinSearch')) $('btnSkinSearch').onclick = ()=> searchSkins($('skinSearch').value.trim());
  if($('skinSearch')) $('skinSearch').addEventListener('keydown', e=>{ if(e.key==='Enter') searchSkins(e.target.value.trim()); });
  if($('rarityFilter')) $('rarityFilter').onchange = ()=> searchSkins($('skinSearch').value.trim());
  if($('btnRandom')) $('btnRandom').onclick = randomSkin;
  if($('btnReloadShop')) $('btnReloadShop').onclick = loadShop;
  if($('btnExport')) $('btnExport').onclick = ()=>{
    const blob = new Blob([JSON.stringify({user, spends, locker}, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lootcheck-export.json'; a.click();
  };
  if($('btnShare')) $('btnShare').onclick = async ()=>{
    const txt = `🎮 Mon casier LOOTCHECK: ${locker.length} skins • valeur ${(locker.reduce((a,s)=>a+s.euro,0)).toFixed(2)}€ • dépensé ${(spends.reduce((a,s)=>a+s.price,0)).toFixed(2)}€`;
    try{ await navigator.clipboard.writeText(txt); alert('Lien copié !'); }catch{ alert(txt); }
  };
  if($('btnStats')) $('btnStats').onclick = ()=>{
    const p = $('statsPseudo').value.trim(); if(!p) return alert('Mets un pseudo');
    window.open('https://fortnite.gg/stats?player=' + encodeURIComponent(p), '_blank');
  };
  if($('btnStatsUse') && $('statsPseudo')) $('btnStatsUse').onclick = ()=>{ if(user) $('statsPseudo').value = user.pseudo; };
  if($('btnConvVb')) $('btnConvVb').onclick = ()=>{ const v = parseFloat($('convVb').value)||0; $('convOut').textContent = `${v} VB ≈ ${(v*VB_EURO).toFixed(2)} €`; };
  if($('btnConvEuro')) $('btnConvEuro').onclick = ()=>{ const e = parseFloat($('convEuro').value)||0; $('convOut').textContent = `${e} € ≈ ${Math.round(e/VB_EURO)} VB`; };
  if($('btnVerdict')) $('btnVerdict').onclick = verdict;
  if($('btnGgImport')) $('btnGgImport').onclick = ()=>{
    const p = ($('ggPseudo').value || $('statsPseudo')?.value || user?.pseudo || '').trim();
    if(!p) return alert('Mets un pseudo pour ouvrir son casier GG');
    window.open('https://fortnite.gg/locker?player=' + encodeURIComponent(p), '_blank');
  };
  let n = 12847; setInterval(()=>{ n+=Math.floor(Math.random()*3); const el=$('statUsers'); if(el) el.textContent = n.toLocaleString('fr-FR'); }, 3000);
}

bind();
renderUser(); renderSpends(); renderLocker();
checkReel(); loadShop(); loadNews(); searchSkins('');
