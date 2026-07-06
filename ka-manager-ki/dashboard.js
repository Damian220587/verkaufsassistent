// dashboard.js – KA Manager v4

let inventory=[], filtered=[], selected=new Set();
let search='', sort='newest', openId=null, qStop=false;
let activeFolder = null; // null = alle Anzeigen

const bg    = (action,data={}) => new Promise(r=>chrome.runtime.sendMessage({action,...data},r));
const $     = id => document.getElementById(id);
const esc   = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// ── Load ──────────────────────────────────────────────────────────────────
async function load() {
  inventory = await bg('getInventory') || [];
  applyFilter();
}

function applyFilter() {
  const q = search.toLowerCase();
  filtered = inventory.filter(a => {
    // Ordner-Filter
    if (activeFolder !== null) {
      // Ordner-Ansicht: nur Anzeigen in diesem Ordner
      if (a.folderId !== activeFolder) return false;
    } else {
      // "Anzeigen"-Ansicht: nur Anzeigen OHNE Ordner-Zugehörigkeit
      if (a.folderId) return false;
    }
    if (!q) return true;
    return (a.title||'').toLowerCase().includes(q)
        || (a.description||'').toLowerCase().includes(q)
        || (a.categoryText||'').toLowerCase().includes(q);
  });
  filtered.sort((a,b) => {
    if (sort==='newest')     return new Date(b.savedAt)-new Date(a.savedAt);
    if (sort==='oldest')     return new Date(a.savedAt)-new Date(b.savedAt);
    if (sort==='price-desc') return (parseFloat(b.price)||0)-(parseFloat(a.price)||0);
    if (sort==='price-asc')  return (parseFloat(a.price)||0)-(parseFloat(b.price)||0);
    if (sort==='az')         return (a.title||'').localeCompare(b.title||'','de');
    return 0;
  });
  renderGrid();
  $('sTotal').textContent = inventory.length;
  $('sSel').textContent   = selected.size;
  $('sImg').textContent   = inventory.filter(a => a.imageData?.length || a.images?.length).length;
  $('selbar').classList.toggle('on', selected.size > 0);
  $('selCount').textContent = `${selected.size} ausgewählt`;
}

// ── Thumbnail ─────────────────────────────────────────────────────────────
function getThumb(ad) {
  if (ad.imageData?.[0]) return `data:${ad.imageData[0].mimeType||'image/jpeg'};base64,${ad.imageData[0].base64}`;
  return ad.images?.[0] || null;
}

// ── Grid ──────────────────────────────────────────────────────────────────
function renderGrid() {
  const g = $('grid');
  if (!inventory.length) {
    g.innerHTML = `<div class="empty">
      <div class="empty-ico">📭</div>
      <div class="empty-ttl">Inventar ist leer</div>
      <div class="empty-sub">Öffne eine Anzeige auf <b>kleinanzeigen.de</b><br>und klicke auf <b>„📥 Im KA Manager speichern"</b></div>
    </div>`; return;
  }
  if (!filtered.length) {
    g.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-ttl">Keine Treffer</div></div>`; return;
  }
  g.innerHTML = filtered.map(cardHTML).join('');
  g.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.ckb').addEventListener('click', e => { e.stopPropagation(); toggleSel(id); });
    card.addEventListener('click', () => openPanel(id));
    card.querySelector('[data-repost]')?.addEventListener('click', e => { e.stopPropagation(); runPost([id]); });
    card.querySelector('[data-del]')?.addEventListener('click', e => { e.stopPropagation(); confirmDelete([id]); });
    card.querySelector('[data-movetrigger]')?.addEventListener('click', e => { e.stopPropagation(); openMoveMenu(id); });
    card.querySelector('[data-vinted]')?.addEventListener('click', e => { e.stopPropagation(); transferToVinted(id); });
    card.querySelector('[data-ebay]')?.addEventListener('click', e => { e.stopPropagation(); transferToEbay(id); });
  });
}

function cardHTML(ad) {
  const sel   = selected.has(ad.adId), active = openId===ad.adId;
  const thumb = getThumb(ad);
  const price = ad.priceRaw || (ad.price ? ad.price+' €' : '–');
  const cat   = ad.categoryPath?.slice(-1)[0] || ad.categoryText || '';
  const date  = ad.savedAt ? new Date(ad.savedAt).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
  const imgCnt= ad.imageData?.length || ad.images?.length || 0;
  return `
  <div class="card${sel?' sel':''}${active?' active':''}" data-id="${ad.adId}">
    <div class="ckb"></div>
    ${thumb
      ? `<div class="card-img"><img src="${esc(thumb)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-no-img>🛒</div>'">
          ${imgCnt>1?`<div class="img-cnt">📸 ${imgCnt}</div>`:''}</div>`
      : `<div class="card-no-img">🛒</div>`}
    <div class="card-body">
      <div class="card-title" title="${esc(ad.title)}">${esc(ad.title)||'(kein Titel)'}</div>
      <div class="card-price">${esc(price)}</div>
      <div class="card-meta">
        ${cat ? `<span class="chip cat">${esc(cat)}</span>` : ''}
        ${ad.location ? `<span class="chip">📍 ${esc(ad.location.slice(0,18))}</span>` : ''}
      </div>
    </div>
    <div class="card-foot">
      <span class="card-date">${date}</span>
      <button class="btn bo bsm" data-movetrigger="${ad.adId}" title="In Ordner verschieben" style="padding:5px 7px">📁</button>
      <button class="btn bo bsm" data-vinted="${ad.adId}" title="Zu Vinted" style="padding:5px 7px;background:#09b1ba;color:#fff;border:none">V</button>
      <button class="btn bo bsm" data-ebay="${ad.adId}" title="Zu eBay" style="padding:5px 7px;background:#e53238;color:#fff;border:none">e</button>
      <button class="btn br bsm" data-del="${ad.adId}" title="Löschen">✕</button>
      <button class="btn bp bsm" data-repost="${ad.adId}" title="Neu einstellen">⚡</button>
    </div>
    <div class="cso" id="cs-${ad.adId}">
      <div id="csi-${ad.adId}"></div>
      <div class="cst" id="cst-${ad.adId}"></div>
    </div>
  </div>`;
}

// ── Selection ─────────────────────────────────────────────────────────────
function toggleSel(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  document.querySelector(`.card[data-id="${id}"]`)?.classList.toggle('sel', selected.has(id));
  applyFilter();
}
function selAll() {
  const all = filtered.every(a => selected.has(a.adId));
  filtered.forEach(a => all ? selected.delete(a.adId) : selected.add(a.adId));
  renderGrid(); applyFilter();
}
function clearSel() { selected.clear(); renderGrid(); applyFilter(); }

// ── Panel ──────────────────────────────────────────────────────────────────
function openPanel(id) {
  const ad = inventory.find(a => a.adId === id);
  if (!ad) return;
  openId = id;

  $('panelTitle').textContent = ad.title || 'Anzeige';
  $('eTitle').value = ad.title || '';
  $('ePrice').value = ad.priceRaw || ad.price || '';
  $('ePrice').dataset.original = $('ePrice').value; // merken fuer priceEdited
  $('eDesc').value  = ad.description || '';
  $('eLoc').value   = ad.location || '';
  $('eCatInput').value = (ad.categoryPath || []).join(', ');
  $('eUrl').href    = ad.url || '#';
  updateCatDisplay();

  // Bilder
  const imgs = $('panelImgs');
  const all = [];
  (ad.imageData||[]).forEach(d => all.push(`data:${d.mimeType||'image/jpeg'};base64,${d.base64}`));
  if (!all.length) (ad.images||[]).forEach(u => all.push(u));
  imgs.innerHTML = all.slice(0,10).map(src =>
    `<img class="pimg" src="${src}" loading="lazy" onclick="window.open('${src}','_blank')" onerror="this.style.display='none'">`
  ).join('');

  $('panel').classList.remove('hidden');
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
}

function closePanel() {
  $('panel').classList.add('hidden');
  openId = null;
  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
}

function updateCatDisplay() {
  const parts = $('eCatInput').value.split(',').map(s => s.trim()).filter(Boolean);
  $('eCatDisplay').innerHTML = parts.length
    ? parts.map((c,i) => `<span class="cat-s">${esc(c)}</span>${i<parts.length-1?'<span class="cat-sep">›</span>':''}`).join('')
    : '<span style="color:var(--mut);font-size:11px">Keine Kategorie</span>';
}

function getPanelAd() {
  const ad = inventory.find(a => a.adId === openId);
  if (!ad) return null;
  const cats    = $('eCatInput').value.split(',').map(s => s.trim()).filter(Boolean);
  const priceRaw = $('ePrice').value.trim();
  const priceEdited = priceRaw !== ($('ePrice').dataset.original || '');
  return {
    ...ad,
    title:        $('eTitle').value.trim(),
    description:  $('eDesc').value.trim(),
    priceRaw,
    priceEdited,
    price:        priceRaw.replace(/[^0-9,]/g,'').replace(',','.'),
    location:     $('eLoc').value.trim(),
    categoryPath: cats,
    categoryText: cats.slice(-1)[0] || '',
  };
}

// Reload-Hook für ai-create.js
window.kaReloadInventory = load;

// ── Auto-Post ─────────────────────────────────────────────────────────────
async function runPost(ids) {
  const items = ids.map(id => id===openId ? getPanelAd() : inventory.find(a => a.adId===id)).filter(Boolean);
  if (!items.length) return;

  // Brandneue KI-Anzeigen (noch nie bei KA) → über vorausgefülltes KA-Formular
  // einstellen (Kategorie + Kontaktdaten übernimmt KA/der Nutzer beim Absenden).
  const aiDrafts = items.filter(a => a.isAiDraft && window.kaPublishAiDraft);
  if (aiDrafts.length) {
    for (const d of aiDrafts) { await window.kaPublishAiDraft(d); await sleep(400); }
  }
  const apiItems = items.filter(a => !(a.isAiDraft && window.kaPublishAiDraft));
  if (!apiItems.length) { clearSel(); return; }
  return runApiPost(apiItems);
}

async function runApiPost(items) {
  if (items.length > 1) {
    if (!confirm(`${items.length} Anzeigen automatisch einstellen?\n\n`
      + items.slice(0,5).map(a=>`• ${a.title.slice(0,50)}`).join('\n')
      + (items.length>5 ? `\n… +${items.length-5} weitere` : ''))) return;
  }

  qStop = false;
  if (items.length > 1) { $('qbar').classList.add('on'); $('qFill').style.width='0%'; }

  const results = { ok:0, fail:0, errors:[] };

  for (let i=0; i<items.length; i++) {
    if (qStop) break;
    const item = items[i];
    setCS(item.adId, 'loading');
    if (items.length>1) {
      $('qLabel').textContent = `⚡ ${i+1}/${items.length}: ${item.title.slice(0,35)}`;
      $('qFill').style.width = ((i/items.length)*100)+'%';
    }

    const result = await bg('repostAd', { item });

    if (result?.ok) {
      results.ok++;
      setCS(item.adId, 'ok', '✅', 'Eingestellt!');
      setTimeout(() => clearCS(item.adId), 4000);
    } else {
      results.fail++;
      results.errors.push({ title: item.title, msg: result?.message || 'Fehler' });
      setCS(item.adId, 'err', '❌', result?.message?.slice(0,55) || 'Fehler');
      setTimeout(() => clearCS(item.adId), 7000);
    }
    if (i < items.length-1) await sleep(1500);
  }

  if (items.length>1) {
    $('qFill').style.width='100%';
    $('qLabel').textContent = `✅ ${results.ok} eingestellt, ${results.fail} Fehler`;
    setTimeout(() => $('qbar').classList.remove('on'), 4000);
  }
  showModal(results, items.length);
  clearSel();
}

function setCS(id, type, icon='', text='') {
  const cs = $('cs-'+id); if (!cs) return;
  $('cst-'+id).textContent = text;
  const ico = $('csi-'+id);
  ico.innerHTML = type==='loading'
    ? '<div class="spin"></div>'
    : `<span style="font-size:26px">${icon}</span>`;
  cs.classList.add('on');
}
function clearCS(id) { $('cs-'+id)?.classList.remove('on'); }

function showModal(results, total) {
  const ok = results.fail === 0;
  $('mIco').textContent = ok ? '✅' : results.ok>0 ? '⚠️' : '❌';
  $('mTtl').textContent = ok
    ? (total===1 ? 'Erfolgreich eingestellt!' : `Alle ${total} eingestellt!`)
    : results.ok>0 ? `${results.ok} von ${total}` : 'Fehlgeschlagen';
  $('mMsg').innerHTML = ok
    ? `Deine Anzeige${total>1?'n sind':' ist'} jetzt online auf Kleinanzeigen.de.`
    : results.errors.map(e=>`<b>${esc(e.title.slice(0,40))}</b><br><small>${esc(e.msg)}</small>`).join('<br><br>');
  $('modalBg').classList.add('on');
}

// ── Delete ────────────────────────────────────────────────────────────────
async function confirmDelete(ids) {
  const n = ids.length;
  if (!confirm(n===1
    ? 'Anzeige wirklich löschen?\n\nLokal gespeicherte Bilder werden ebenfalls gelöscht.'
    : `${n} Anzeigen wirklich löschen?\n\nAlle lokal gespeicherten Bilder werden gelöscht.`)) return;
  await bg('deleteAds', { ids });
  ids.forEach(id => selected.delete(id));
  if (openId && ids.includes(openId)) closePanel();
  await load();
}

// ── Save panel edits ───────────────────────────────────────────────────────
async function savePanelEdits() {
  const ad = getPanelAd(); if (!ad) return;
  const btn = $('panelSave');
  btn.disabled = true; btn.textContent = '✓';
  await bg('updateAd', { ad });
  inventory = await bg('getInventory');
  applyFilter();
  $('panelTitle').textContent = ad.title || 'Anzeige';
  setTimeout(() => { btn.disabled = false; btn.innerHTML = '💾 Speichern'; }, 1500);
}

// ── Events ────────────────────────────────────────────────────────────────
$('search').oninput   = e => { search = e.target.value.trim(); applyFilter(); };
$('sortSel').onchange = e => { sort = e.target.value; applyFilter(); };
$('selAllBtn').onclick  = selAll;
$('clearSelBtn').onclick= clearSel;
$('repostSelBtn').onclick = () => runPost([...selected]);
$('delSelBtn').onclick    = () => confirmDelete([...selected]);
$('moveModalClose').onclick = () => $('moveModalBg').classList.remove('on');
$('moveSelBtn').onclick   = () => openMoveMenuMulti([...selected]);
$('refreshBtn').onclick   = load;
$('clearAllBtn').onclick  = async () => {
  if (!confirm(`Alle ${inventory.length} Anzeigen und gespeicherten Bilder löschen?\n\nNicht rückgängig zu machen!`)) return;
  await bg('clearInventory'); selected.clear(); closePanel(); await load();
};
$('panelClose').onclick  = closePanel;
$('panelRepost').onclick = () => { if (openId) runPost([openId]); };
$('panelSave').onclick   = savePanelEdits;
$('panelDel').onclick    = () => { if (openId) confirmDelete([openId]); };
$('eCatInput').oninput   = updateCatDisplay;
$('mClose').onclick      = () => $('modalBg').classList.remove('on');
$('modalBg').onclick     = e => { if (e.target===$('modalBg')) $('modalBg').classList.remove('on'); };
$('qStop').onclick       = () => { qStop=true; $('qbar').classList.remove('on'); };
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closePanel(); $('modalBg').classList.remove('on'); $('moveModalBg').classList.remove('on'); }
  if ((e.metaKey||e.ctrlKey) && e.key==='a') { e.preventDefault(); selAll(); }
});
document.addEventListener('click', () => {});
chrome.storage.onChanged.addListener(c => { if (c.ka_inventory) load(); });

// ═══════════════════════════════════════════════════════════
// ORDNER-LOGIK
// ═══════════════════════════════════════════════════════════

const FOLDER_KEY = 'ka_folders';

async function getFolders() {
  return (await chrome.storage.local.get(FOLDER_KEY))[FOLDER_KEY] || [];
}
async function setFolders(folders) {
  await chrome.storage.local.set({ [FOLDER_KEY]: folders });
}

async function renderFolders() {
  const folders = await getFolders();
  const list = $('folderList');

  // Fix 4: "Anzeigen" statt "Alle Anzeigen"
  // Fix 3: Anzahl nur Anzeigen OHNE Ordner-Zugehörigkeit
  const noFolderCount = inventory.filter(a => !a.folderId).length;
  let html = `<div class="folder-item${activeFolder===null?' active':''}" data-fid="__all__">
    <span class="folder-icon">📋</span>
    <span class="folder-name">Anzeigen</span>
    <span class="folder-count">${noFolderCount}</span>
  </div>`;

  for (const f of folders) {
    const count = inventory.filter(a => a.folderId === f.id).length;
    html += `<div class="folder-item${activeFolder===f.id?' active':''}" data-fid="${f.id}">
      <span class="folder-icon">📁</span>
      <span class="folder-name" data-rename="${f.id}" title="Doppelklick zum Umbenennen">${esc(f.name)}</span>
      <span class="folder-count">${count}</span>
      <button class="folder-del" data-fdel="${f.id}" title="Ordner löschen">✕</button>
    </div>`;
  }

  list.innerHTML = html;

  list.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-fdel]')) return;
      // data-rename: single click öffnet Ordner (dblclick benennt um)
      const fid = item.dataset.fid;
      activeFolder = fid === '__all__' ? null : fid;
      applyFilter();
      renderFolders();
    });
  });

  // Doppelklick auf Ordnernamen → Umbenennen
  list.querySelectorAll('[data-rename]').forEach(nameEl => {
    nameEl.addEventListener('dblclick', async e => {
      e.stopPropagation();
      const fid = nameEl.dataset.rename;
      const folders2 = await getFolders();
      const folder = folders2.find(f => f.id === fid);
      if (!folder) return;

      // Inline-Edit
      const input = document.createElement('input');
      input.value = folder.name;
      input.style.cssText = 'width:100%;font:inherit;font-size:13px;font-weight:500;border:none;border-bottom:2px solid var(--acc);background:transparent;outline:none;padding:0;color:inherit;';
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      const save = async () => {
        const newName = input.value.trim();
        if (newName && newName !== folder.name) {
          folder.name = newName;
          await setFolders(folders2);
        }
        renderFolders();
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); input.blur(); }
        if (e2.key === 'Escape') { input.value = folder.name; input.blur(); }
      });
    });
  });

  list.querySelectorAll('[data-fdel]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const fid = btn.dataset.fdel;
      const folder = (await getFolders()).find(f => f.id === fid);
      if (!folder) return;
      const inFolder = inventory.filter(a => a.folderId === fid).length;
      const msg = inFolder > 0
        ? `Ordner „${folder.name}" löschen?\n\n${inFolder} Anzeige(n) werden in „Anzeigen" verschoben.`
        : `Ordner „${folder.name}" löschen?`;
      if (!confirm(msg)) return;
      const inv = await bg('getInventory');
      for (const a of inv) { if (a.folderId === fid) delete a.folderId; }
      await chrome.storage.local.set({ ka_inventory: inv });
      inventory = inv;
      const folders2 = (await getFolders()).filter(f => f.id !== fid);
      await setFolders(folders2);
      if (activeFolder === fid) activeFolder = null;
      applyFilter();
      renderFolders();
    });
  });
}

// Fix 3: applyFilter zeigt bei "Anzeigen" (activeFolder=null) nur Anzeigen OHNE Ordner
// Überschreibe den Filter-Teil hier (die Funktion oben bleibt, wir patchen nur den Aufruf)
const _origApplyFilter = applyFilter;
// Wir haben applyFilter bereits oben definiert mit dem Folder-Filter - das reicht

// Ordner erstellen
$('addFolderBtn').onclick = () => {
  $('fmodalInput').value = '';
  $('fmodalBg').classList.add('on');
  setTimeout(() => $('fmodalInput').focus(), 50);
};
$('fmodalCancel').onclick = () => $('fmodalBg').classList.remove('on');
$('fmodalBg').onclick = e => { if (e.target === $('fmodalBg')) $('fmodalBg').classList.remove('on'); };
$('fmodalOk').onclick = async () => {
  const name = $('fmodalInput').value.trim();
  if (!name) return;
  const folders = await getFolders();
  folders.push({ id: 'f_' + Date.now(), name });
  await setFolders(folders);
  $('fmodalBg').classList.remove('on');
  renderFolders();
};
$('fmodalInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('fmodalOk').click();
  if (e.key === 'Escape') $('fmodalBg').classList.remove('on');
});

// ── Verschieben – Zentrales Modal (Fix 2) ────────────────────
// Statt Dropdown: ein echtes zentriertes Modal

function openMoveModal(adIds) {
  if (!adIds.length) return;
  // Speichere IDs für den Callback
  $('moveModalBg').dataset.adIds = JSON.stringify(adIds);
  buildMoveModalContent(adIds);
  $('moveModalBg').classList.add('on');
}

async function buildMoveModalContent(adIds) {
  const folders = await getFolders();
  const list = $('moveModalList');
  list.innerHTML = '';

  // "Anzeigen" (kein Ordner)
  const inItem = document.createElement('div');
  inItem.className = 'move-modal-item';
  inItem.innerHTML = '<span>📋</span><span>Anzeigen</span>';
  inItem.onclick = () => { moveToFolder(adIds, null); $('moveModalBg').classList.remove('on'); };
  list.appendChild(inItem);

  for (const f of folders) {
    const item = document.createElement('div');
    item.className = 'move-modal-item';
    const isActive = adIds.length===1 && inventory.find(a=>a.adId===adIds[0])?.folderId === f.id;
    if (isActive) item.classList.add('active-folder');
    item.innerHTML = `<span>📁</span><span>${esc(f.name)}</span>`;
    item.onclick = () => { moveToFolder(adIds, f.id); $('moveModalBg').classList.remove('on'); };
    list.appendChild(item);
  }

  if (!folders.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--mut);font-size:13px">Noch keine Ordner.<br>Erstelle zuerst einen Ordner in der Sidebar.</div>';
  }
}

function openMoveMenu(adId) {
  openMoveModal([adId]);
}

function openMoveMenuMulti(ids) {
  if (!ids.length) return;
  openMoveModal(ids);
}

// Fix 1: moveToFolder direkt mit storage schreiben
async function moveToFolder(adIds, folderId) {
  const inv = await bg('getInventory');
  for (const a of inv) {
    if (adIds.includes(a.adId)) {
      if (folderId) a.folderId = folderId;
      else delete a.folderId;
    }
  }
  await chrome.storage.local.set({ ka_inventory: inv });
  inventory = inv;
  clearSel();
  applyFilter();
  renderFolders();
}

$('moveModalBg').onclick = e => { if (e.target === $('moveModalBg')) $('moveModalBg').classList.remove('on'); };

// ── Initialisierung ───────────────────────────────────────────
async function init() {
  await load();
  renderFolders();
}

init();

// ── Sidebar Resize (Fix 3) ─────────────────────────────────────────────────
(function() {
  const handle = document.getElementById('sidebarResize');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.min(400, Math.max(140, startW + (e.clientX - startX)));
    sidebar.style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

// ── Vinted Transfer ────────────────────────────────────────────────────────
async function transferToVinted(adId) {
  const ad = adId === openId ? getPanelAd() : inventory.find(a => a.adId === adId);
  if (!ad) return;

  // Daten in Storage schreiben – vinted.js liest sie auf der Vinted-Seite
  await chrome.storage.local.set({ ka_vinted_transfer: {
    title:       ad.title       || '',
    description: ad.description || '',
    price:       ad.price       || '',
    priceRaw:    ad.priceRaw    || '',
    location:    ad.location    || '',
    imageData:   ad.imageData   || [],
    images:      ad.images      || [],
  }});

  // Vinted-Tab öffnen
  window.open('https://www.vinted.de/items/new', '_blank');
}

// ── eBay Transfer ──────────────────────────────────────────────────────────
async function transferToEbay(adId) {
  const ad = adId === openId ? getPanelAd() : inventory.find(a => a.adId === adId);
  if (!ad) return;
  await chrome.storage.local.set({ ka_ebay_transfer: {
    title:       ad.title       || '',
    description: ad.description || '',
    price:       ad.price       || '',
    priceRaw:    ad.priceRaw    || '',
    location:    ad.location    || '',
    imageData:   ad.imageData   || [],
    images:      ad.images      || [],
  }});
  window.open('https://www.ebay.de/lstng?mode=AddItem', '_blank');
}
