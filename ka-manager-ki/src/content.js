// content.js – KA Manager v4
(() => {
'use strict';

const KA_BASE = 'https://www.kleinanzeigen.de';

// ── Bilder als Base64 laden (läuft auf KA-Domain, kein CORS) ──────────────
async function fetchImageBase64(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const buf  = await blob.arrayBuffer();
    const arr  = new Uint8Array(buf);
    let b64 = '';
    for (let i = 0; i < arr.length; i += 8192)
      b64 += String.fromCharCode(...arr.subarray(i, i + 8192));
    return { base64: btoa(b64), mimeType: 'image/jpeg', name: `foto_${Date.now()}.jpg` };
  } catch { return null; }
}

// ── Formulardaten (Kategorie/PLZ etc.) der Bearbeiten-Seite robust laden ──
// Kleinanzeigen ändert Seitenstruktur/URL gelegentlich. Wir probieren mehrere
// URLs + Formular-Selektoren und werfen KEINEN Fehler mehr, wenn nichts passt –
// dann wird nur ohne categoryId gespeichert (Titel/Preis/Bilder kommen separat
// von der Detailseite). Rückgabe: { formData, found }.
async function kaFetchFormData(adId) {
  const urls = [
    `${KA_BASE}/p-anzeige-bearbeiten.html?adId=${adId}`,
    `${KA_BASE}/p-anzeige-bearbeiten.html?adId=${adId}&_ready=true`,
    `${KA_BASE}/p-anzeige-bearbeiten/${adId}`
  ];
  const formSel = ['#adForm', 'form[name="adForm"]', 'form[id*="adForm" i]',
                   'form[action*="anzeige-bearbeiten" i]', 'form[action*="postad" i]',
                   'form[action*="p-anzeige" i]'];
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      let form = null;
      for (const s of formSel) { form = doc.querySelector(s); if (form && form.elements && form.elements.length) break; form = null; }
      if (!form) continue;
      const fd = {};
      for (const el of form.elements) {
        if (!el.name || el.disabled) continue;
        if (['submit','reset','button','image','file'].includes(el.type)) continue;
        if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
        fd[el.name] = el.value;
      }
      // Fallback categoryId aus verstecktem Feld/Data-Attribut
      if (!fd.categoryId) {
        const c = doc.querySelector('[name="categoryId"], #postad-category-path-id, [data-category-id]');
        if (c) fd.categoryId = c.value || c.getAttribute('data-category-id') || '';
      }
      return { formData: fd, found: true };
    } catch (e) { /* nächste URL probieren */ }
  }
  return { formData: {}, found: false };
}

// ── Alle Formulardaten der aktuellen Anzeige lesen ─────────────────────────
function scrapeFormData() {
  const form = document.getElementById('adForm');
  if (!form) return null;
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (['submit','reset','button','image','file'].includes(el.type)) continue;
    if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
    data[el.name] = el.value;
  }
  // Bilder
  const imgs = [];
  document.querySelectorAll('ul#j-pictureupload-thumbnails li img, input.ke-uploaded-image').forEach(el => {
    const src = el.src || el.value;
    if (src && src.startsWith('http')) imgs.push(src);
  });
  data.images = imgs;
  return data;
}

// ── Anzeige-Detailseite scrapen ────────────────────────────────────────────
async function scrapeDetailPage(withImages = false) {
  const $ = s => document.querySelector(s);
  const ad = {};

  ad.title = ($('#viewad-title') || $('[data-testid="ad-title"]') || $('h1'))?.innerText?.trim() || '';
  ad.description = ($('#viewad-description-text') || $('[data-testid="ad-description"]'))?.innerText?.trim() || '';

  const priceRaw = ($('#viewad-price') || $('[data-testid="ad-price"]') || $('.priceinfo'))?.innerText?.trim() || '';
  ad.priceRaw = priceRaw;
  ad.price    = priceRaw.replace(/[^0-9,]/g, '').replace(',', '.');

  ad.location = ($('#viewad-locality') || $('[data-testid="ad-location"]'))?.innerText?.trim() || '';

  // Kategorie aus Breadcrumb
  const crumbs = [...document.querySelectorAll(
    '#viewad-breadcrumbs a, nav[aria-label="Breadcrumb"] a, .breadcrumb a'
  )].map(a => a.innerText.trim())
    .filter(t => t && !['Kleinanzeigen','Startseite','Home'].includes(t));
  ad.categoryPath = crumbs;
  ad.categoryText = crumbs.slice(-1)[0] || '';

  // AdId aus URL
  const idMatch = location.pathname.match(/(\d{8,})/);
  ad.originalAdId = idMatch?.[1] || '';
  ad.adId    = ad.originalAdId || Date.now().toString();
  ad.url     = location.href;
  ad.savedAt = new Date().toISOString();

  // Bild-URLs
  const seen = new Set();
  document.querySelectorAll('#viewad-thumbnails img, .galleryimage-element img, [id^="viewad-image"] img').forEach(img => {
    // Größtes Bild aus srcset bevorzugen
    let src = '';
    if (img.srcset) {
      const best = img.srcset.split(',')
        .map(s => { const [u, w] = s.trim().split(/\s+/); return { u, w: parseInt(w) || 0 }; })
        .sort((a, b) => b.w - a.w)[0];
      src = best?.u || '';
    }
    if (!src) src = img.dataset.imgsrc || img.dataset.src || img.dataset.original || img.src || '';
    if (!src || src.startsWith('data:') || src.includes('placeholder')) return;
    // Auf höchste verfügbare Auflösung upgraden
    src = src
      .replace(/\/\w+_\d+(\.\w+)(\?.*)?$/, '/xl$1')  // /thumb_123.jpg -> /xl.jpg
      .replace(/_\d+x\d+(\.\w+)(\?.*)?$/, '$1')       // _400x300.jpg -> .jpg
      .replace(/\/small\//, '/xl/')
      .replace(/\/thumb\//, '/xl/');
    seen.add(src);
  });
  ad.images = [...seen].slice(0, 20);

  // Bilder als Base64 (beim expliziten Speichern)
  if (withImages && ad.images.length) {
    const imgData = [];
    for (const url of ad.images) {
      const d = await fetchImageBase64(url);
      if (d) imgData.push(d);
    }
    ad.imageData = imgData;
    console.log('[KA] Bilder geladen:', imgData.length, '/', ad.images.length);
  } else {
    ad.imageData = [];
  }

  // categoryId + vollständiges formData von der Bearbeitungsseite holen
  // Das ist der Schlüssel für das spätere Wiedereinstellen – auch wenn die Anzeige gelöscht wurde
  if (ad.originalAdId) {
    try {
      const r = await fetch(`${KA_BASE}/p-anzeige-bearbeiten.html?adId=${ad.originalAdId}`);
      if (r.ok) {
        const html = await r.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const form = doc.getElementById('adForm');
        if (form) {
          const fd = {};
          for (const el of form.elements) {
            if (!el.name || el.disabled) continue;
            if (['submit','reset','button','image','file'].includes(el.type)) continue;
            if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
            fd[el.name] = el.value;
          }
          ad.categoryId = fd.categoryId || '';
          ad.formData   = fd;
          console.log('[KA] formData + categoryId geladen:', ad.categoryId);
        }
      }
    } catch(e) {
      console.warn('[KA] formData-Nachladen fehlgeschlagen:', e.message);
    }
  }

  return ad;
}

// ── Toast ─────────────────────────────────────────────────────────────────
function toast(msg, type = 'ok', ms = 5000) {
  document.getElementById('ka-toast')?.remove();
  const colors = { ok: '#059669', warn: '#d97706', err: '#dc2626', info: '#4f46e5' };
  const el = document.createElement('div');
  el.id = 'ka-toast';
  el.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:2147483647;
    background:#111827;color:#fff;padding:12px 16px;border-radius:8px;
    font:500 13px/1.5 system-ui;max-width:320px;border-left:3px solid ${colors[type]};
    box-shadow:0 8px 24px rgba(0,0,0,.3);animation:kaIn .2s ease;pointer-events:none;`;
  el.innerHTML = `<style>@keyframes kaIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}</style>${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), ms);
}

// ── Button-Styles ─────────────────────────────────────────────────────────
const BTN_STYLE = (bg) =>
  `background:${bg};color:#fff;border:none;border-radius:20px;padding:6px 14px;
   font:600 12px system-ui;cursor:pointer;white-space:nowrap;
   transition:opacity .15s;display:inline-flex;align-items:center;gap:5px;`;

// ══════════════════════════════════════════════════════════════════════════
// DETAIL-SEITE: Save-Button
// ══════════════════════════════════════════════════════════════════════════
function injectDetailButtons() {
  if (document.getElementById('ka-save-btn')) return;
  if (!location.pathname.includes('/s-anzeige/')) return;

  const anchor = document.querySelector('#viewad-price, .priceinfo, [data-testid="ad-price"], #viewad-title');
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:10px 0 6px;display:flex;gap:8px;flex-wrap:wrap;';

  const saveBtn = document.createElement('button');
  saveBtn.id = 'ka-save-btn';
  saveBtn.innerHTML = '📥 Speichern';
  saveBtn.style.cssText = BTN_STYLE('#4f46e5');

  const dashBtn = document.createElement('button');
  dashBtn.innerHTML = '📋 Dashboard';
  dashBtn.style.cssText = BTN_STYLE('#374151');

  saveBtn.onmouseenter = () => saveBtn.style.opacity = '.8';
  saveBtn.onmouseleave = () => saveBtn.style.opacity = '1';
  dashBtn.onmouseenter = () => dashBtn.style.opacity = '.8';
  dashBtn.onmouseleave = () => dashBtn.style.opacity = '1';

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Bilder werden gespeichert…';
    const ad = await scrapeDetailPage(true);
    if (!ad.title) {
      toast('⚠️ Kein Titel – Seite noch laden?', 'warn');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '📥 Speichern';
      return;
    }
    const res = await chrome.runtime.sendMessage({ action: 'saveAd', ad });
    toast(`✅ <b>${ad.title.slice(0, 40)}</b> gespeichert! (${res?.count} im Inventar)`);
    saveBtn.innerHTML = '✅ Gespeichert!';
    saveBtn.style.background = '#059669';
    setTimeout(() => {
      saveBtn.innerHTML = '📥 Speichern';
      saveBtn.style.background = '#4f46e5';
      saveBtn.disabled = false;
    }, 3000);
  };

  dashBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openDashboard' });

  wrap.append(saveBtn, dashBtn);
  anchor.closest('section,article,div')?.insertAdjacentElement('afterend', wrap)
    || anchor.insertAdjacentElement('afterend', wrap);
}

// ══════════════════════════════════════════════════════════════════════════
// "MEINE ANZEIGEN" – Buttons neben Bearbeiten/Löschen
// Die Seite zeigt li[data-adid] – wir lesen adId direkt aus dem data-Attribut
// ══════════════════════════════════════════════════════════════════════════
function injectMyAdsButtons() {
  // Container mit data-adid (die eigentliche Anzeigen-Liste)
  const items = document.querySelectorAll('#my-manageitems-adlist li[data-adid], [data-adid]');

  items.forEach(item => {
    const adId = item.dataset.adid;
    if (!adId || item.dataset.kaInjected) return;
    item.dataset.kaInjected = '1';

    // Linklist (wo "Bearbeiten", "Reservieren" etc. drin sind)
    // Optional – neue KA-Version hat keine linklist mehr
    const linklist = item.querySelector('.linklist, [class*="linklist"]');

    const li = document.createElement('li');
    li.className = 'linklist--item';
    li.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;';

    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '📥 Speichern';
    saveBtn.style.cssText = BTN_STYLE('#4f46e5');

    const dashBtn = document.createElement('button');
    dashBtn.innerHTML = '📋 Dashboard';
    dashBtn.style.cssText = BTN_STYLE('#374151');

    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      saveBtn.disabled = true;
      saveBtn.innerHTML = '⏳ Lade…';

      try {
        // Schritt 1: Formulardaten (Kategorie, PLZ etc.) von Edit-Seite holen (robust, kein Abbruch)
        const { formData, found: formFound } = await kaFetchFormData(adId);

        // Schritt 2: Detailseite für XL-Bilder, korrekten Preis & Beschreibung laden
        saveBtn.innerHTML = '⏳ Bilder…';
        const detailR   = await fetch(`${KA_BASE}/s-anzeige/anzeige/${adId}`);
        const detailHtml = await detailR.text();
        const detailDoc  = new DOMParser().parseFromString(detailHtml, 'text/html');

        // Titel
        const title = detailDoc.querySelector('#viewad-title, h1')?.innerText?.trim()
          || formData.title || '';

        // Preis direkt vom Preis-Element lesen (z.B. "20 €") – korrekt, kein Cent-Umrechnen nötig
        const priceText = detailDoc.querySelector('#viewad-price, .priceinfo')?.innerText?.trim() || '';
        const priceRaw  = priceText || (() => {
          const cents = parseInt(formData.priceAmount || '0');
          if (cents <= 0) return '';
          const euros = cents / 100;
          return (Number.isInteger(euros) ? euros : euros.toFixed(2).replace('.', ',')) + ' €';
        })();
        const price = priceRaw.replace(/[^0-9,]/g, '').replace(',', '.');

        // Beschreibung: aus formData nehmen – hat korrekte Zeilenumbrüche (\n)
        // innerText auf geparsten HTML-Dokumenten ohne Layout-Kontext verliert Zeilenumbrüche
        const description = formData.description || detailDoc.querySelector('#viewad-description-text')?.textContent?.trim() || '';

        // Standort
        const location = detailDoc.querySelector('#viewad-locality')?.innerText?.trim()
          || formData.zipCode || '';

        // XL-Bilder von Detailseite (nicht Thumbnails von Edit-Seite!)
        const seen = new Set();
        detailDoc.querySelectorAll('#viewad-thumbnails img, .galleryimage-element img, [id^="viewad-image"] img').forEach(img => {
          let src = '';
          if (img.srcset) {
            const best = img.srcset.split(',')
              .map(s => { const [u, w] = s.trim().split(/\s+/); return { u, w: parseInt(w) || 0 }; })
              .sort((a, b) => b.w - a.w)[0];
            src = best?.u || '';
          }
          if (!src) src = img.dataset.imgsrc || img.dataset.src || img.src || '';
          if (!src || src.startsWith('data:') || src.includes('placeholder')) return;
          src = src
            .replace(/\/\w+_\d+(\.\w+)(\?.*)?$/, '/xl$1')
            .replace(/_\d+x\d+(\.\w+)(\?.*)?$/, '$1')
            .replace(/\/small\//, '/xl/')
            .replace(/\/thumb\//, '/xl/');
          seen.add(src);
        });
        const imgUrls = [...seen].slice(0, 20);
        formData.images = imgUrls;

        // Bilder als Base64 laden
        const imageData = [];
        for (const url of imgUrls) {
          const d = await fetchImageBase64(url);
          if (d) imageData.push(d);
        }

        const ad = {
          adId,
          originalAdId:  adId,
          title,
          description,
          price,
          priceRaw,
          location,
          categoryPath:  [],
          categoryText:  '',
          images:        imgUrls,
          imageData,
          formData,
          url:           `${KA_BASE}/s-anzeige/anzeige/${adId}`,
          savedAt:       new Date().toISOString(),
        };

        if (formData.categoryId) ad.categoryId = formData.categoryId;

        if (!title) throw new Error('Anzeige konnte nicht gelesen werden (evtl. nicht eingeloggt?)');
        await chrome.runtime.sendMessage({ action: 'saveAd', ad });
        toast(formFound
          ? `✅ <b>${ad.title.slice(0, 40)}</b> im Inventar gespeichert!`
          : `✅ <b>${ad.title.slice(0, 40)}</b> gespeichert – aber ohne Kategorie (KA-Bearbeitungsseite nicht lesbar). Für 1-Klick-Neueinstellen bitte Kategorie im Dashboard ergänzen.`, formFound ? 'ok' : 'warn', formFound ? 5000 : 8000);
        saveBtn.innerHTML = '✅';
        saveBtn.style.background = '#059669';
        setTimeout(() => {
          saveBtn.innerHTML = '📥 Speichern';
          saveBtn.style.background = '#4f46e5';
          saveBtn.disabled = false;
        }, 3000);

      } catch (err) {
        toast('❌ Fehler: ' + err.message, 'err');
        saveBtn.innerHTML = '📥 Speichern';
        saveBtn.disabled = false;
      }
    };

    dashBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'openDashboard' });
    };

    li.append(saveBtn, dashBtn);

    if (linklist) {
      // Alte KA-Struktur: linklist vorhanden
      linklist.appendChild(li);
    } else {
      // Neue KA-Struktur: Buttons direkt neben "Bearbeiten" einfügen
      // Suche den Container der "Bearbeiten" enthält
      const editBtn = [...item.querySelectorAll('button, a')].find(el =>
        (el.innerText || el.textContent || '').trim() === 'Bearbeiten'
      );
      const btnContainer = editBtn?.closest('div') || item;
      li.style.display = 'inline-flex';
      li.style.marginLeft = '8px';
      li.style.marginTop = '0';
      li.style.verticalAlign = 'middle';
      if (editBtn && editBtn.parentElement) {
        editBtn.parentElement.appendChild(li);
      } else {
        btnContainer.appendChild(li);
      }
    }
  });
}

// ── BOOT ──────────────────────────────────────────────────────────────────
function boot() {
  const path = location.pathname;
  if (path.includes('/s-anzeige/')) {
    const poll = () => {
      if (document.querySelector('#viewad-price, .priceinfo, #viewad-title')) {
        injectDetailButtons();
      } else {
        setTimeout(poll, 500);
      }
    };
    setTimeout(poll, 400);
  }
  // Meine Anzeigen
  setTimeout(() => { injectMyAdsButtons(); injectDeleteCheckboxes(); }, 1500);
}

// SPA-Erkennung
let lastPath = location.pathname;
new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    setTimeout(boot, 700);
  } else {
    injectMyAdsButtons();
    injectDeleteCheckboxes();
  }
}).observe(document.documentElement, { childList: true, subtree: true });

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300))
  : setTimeout(boot, 300);

// ── MESSAGES ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _, respond) => {
  if (msg.action === 'scrapeAd') scrapeDetailPage(true).then(respond);
  if (msg.action === 'checkPage') respond({ isDetail: location.pathname.includes('/s-anzeige/'), url: location.href });
  return true;
});

// ══════════════════════════════════════════════════════════════════════════
// "MEINE ANZEIGEN" – Mehrfachauswahl + Bei KA löschen
// Löscht NUR bei Kleinanzeigen – Dashboard bleibt unberührt
// ══════════════════════════════════════════════════════════════════════════
const kaChecked = new Set();

function getKACSRF() {
  const meta = document.querySelector('meta[name="_csrf"]');
  if (meta) return meta.getAttribute('content');
  const m = document.cookie.match(/(?:^|;\s*)CSRF_TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function updateDeleteBar() {
  const bar = document.getElementById('ka-del-bar');
  if (!bar) return;
  // Bar immer anzeigen (für "Alle auswählen"), Löschen-Button nur wenn etwas ausgewählt
  bar.style.display = 'flex';
  const cnt = bar.querySelector('#ka-del-cnt');
  if (cnt) cnt.textContent = kaChecked.size > 0 ? `${kaChecked.size} ausgewählt` : 'Auswahl';
  const exec = document.getElementById('ka-del-exec');
  if (exec) exec.style.display = kaChecked.size > 0 ? '' : 'none';
  const saveBtn = document.getElementById('ka-del-save');
  if (saveBtn) saveBtn.style.display = kaChecked.size > 0 ? '' : 'none';
}

function injectDeleteCheckboxes() {
  // NUR auf "Meine Anzeigen" aktiv
  if (!location.href.includes('/s-meine-anzeigen') && !location.href.includes('kleinanzeigen.de/m-') && !document.querySelector('#my-manageitems-adlist, [id*="manageitems"]')) return;
  // Delete-Bar einmalig erstellen
  if (!document.getElementById('ka-del-bar')) {
    const bar = document.createElement('div');
    bar.id = 'ka-del-bar';
    bar.style.cssText = `display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      z-index:2147483647;background:#dc2626;color:#fff;padding:10px 20px;border-radius:30px;
      font:600 13px system-ui;align-items:center;gap:14px;box-shadow:0 4px 20px rgba(0,0,0,.3);white-space:nowrap;`;
    bar.innerHTML = `
      <span id="ka-del-cnt">0 ausgewählt</span>
      <button id="ka-del-all" style="background:rgba(255,255,255,.2);color:#fff;border:none;
        border-radius:20px;padding:6px 12px;font:600 13px system-ui;cursor:pointer;">☑ Alle</button>
      <button id="ka-del-save" style="background:#fff;color:#4f46e5;border:none;border-radius:20px;
        padding:6px 16px;font:700 13px system-ui;cursor:pointer;display:none;">📥 Speichern</button>
      <button id="ka-del-exec" style="background:#fff;color:#dc2626;border:none;border-radius:20px;
        padding:6px 16px;font:700 13px system-ui;cursor:pointer;">🗑 Bei Kleinanzeigen löschen</button>
      <button id="ka-del-cancel" style="background:rgba(255,255,255,.2);color:#fff;border:none;
        border-radius:20px;padding:6px 12px;font:600 13px system-ui;cursor:pointer;">✕</button>`;
    document.body.appendChild(bar);

    document.getElementById('ka-del-cancel').onclick = () => {
      kaChecked.clear();
      document.querySelectorAll('.ka-del-cb').forEach(cb => { cb.checked = false; });
      document.querySelectorAll('[data-ka-outlined]').forEach(el => { el.style.outline = ''; delete el.dataset.kaOutlined; });
      updateDeleteBar();
    };

    document.getElementById('ka-del-all').onclick = () => {
      const allCbs = [...document.querySelectorAll('.ka-del-cb')];
      const allChecked = allCbs.every(cb => cb.checked);
      allCbs.forEach(cb => {
        cb.checked = !allChecked;
        const adId = cb.dataset.delid;
        const item = cb.closest('[data-adid], article, li');
        if (!allChecked) {
          kaChecked.add(adId);
          if (item) { item.style.outline = '2px solid #dc2626'; item.dataset.kaOutlined = '1'; }
        } else {
          kaChecked.delete(adId);
          if (item) { item.style.outline = ''; delete item.dataset.kaOutlined; }
        }
      });
      // Button-Text anpassen
      document.getElementById('ka-del-all').textContent = allChecked ? '☑ Alle' : '☐ Keine';
      updateDeleteBar();
    };

    document.getElementById('ka-del-save').onclick = async () => {
      const ids = [...kaChecked];
      if (!ids.length) return;
      const btn = document.getElementById('ka-del-save');
      btn.textContent = '⏳ Speichere…';
      btn.disabled = true;
      let ok = 0, fail = 0;
      for (const adId of ids) {
        try {
          // Formulardaten von Edit-Seite (robust, kein Abbruch)
          const { formData } = await kaFetchFormData(adId);
          // Detailseite für Preis, Bilder, Beschreibung
          const detailR = await fetch(`${KA_BASE}/s-anzeige/anzeige/${adId}`);
          const detailHtml = await detailR.text();
          const detailDoc = new DOMParser().parseFromString(detailHtml, 'text/html');
          const title = detailDoc.querySelector('#viewad-title, h1')?.innerText?.trim() || formData.title || '';
          const priceText = detailDoc.querySelector('#viewad-price, .priceinfo')?.innerText?.trim() || '';
          const cents = parseInt(formData.priceAmount || '0');
          const priceRaw = priceText || (cents > 0 ? (Number.isInteger(cents/100) ? cents/100 : (cents/100).toFixed(2).replace('.',',')) + ' €' : '');
          const price = priceRaw.replace(/[^0-9,]/g,'').replace(',','.');
          const description = formData.description || '';
          const location = detailDoc.querySelector('#viewad-locality')?.innerText?.trim() || formData.zipCode || '';
          // Bilder
          const seen = new Set();
          detailDoc.querySelectorAll('#viewad-thumbnails img, .galleryimage-element img, [id^="viewad-image"] img').forEach(img => {
            let src = (img.srcset ? img.srcset.split(',').pop().trim().split(' ')[0] : '') || img.dataset.src || img.src || '';
            if (!src || src.startsWith('data:') || src.includes('placeholder')) return;
            src = src.replace(/\/\w+_\d+(\.\w+)(\?.*)?$/,'/xl$1').replace(/_\d+x\d+(\.\w+)(\?.*)?$/,'$1');
            seen.add(src);
          });
          const imgUrls = [...seen].slice(0,20);
          formData.images = imgUrls;
          // Bilder als Base64
          const imageData = [];
          for (const url of imgUrls) {
            try {
              const r = await fetch(url, {cache:'no-store'});
              if (!r.ok) continue;
              const blob = await r.blob();
              const buf = await blob.arrayBuffer();
              const arr = new Uint8Array(buf);
              let b64 = '';
              for (let i=0;i<arr.length;i+=8192) b64 += String.fromCharCode(...arr.subarray(i,i+8192));
              imageData.push({base64: btoa(b64), mimeType:'image/jpeg', name:`foto_${imageData.length+1}.jpg`});
            } catch {}
          }
          const ad = {
            adId, originalAdId: adId, title, description, price, priceRaw,
            location, categoryPath:[], categoryText:'', images: imgUrls, imageData, formData,
            url: `${KA_BASE}/s-anzeige/anzeige/${adId}`, savedAt: new Date().toISOString(),
          };
          if (formData.categoryId) ad.categoryId = formData.categoryId;
          if (!title) throw new Error('Anzeige nicht lesbar');
          await chrome.runtime.sendMessage({action:'saveAd', ad});
          ok++;
        } catch(e) {
          fail++;
          console.warn('[KA] Speichern fehlgeschlagen', adId, e.message);
        }
      }
      btn.textContent = '📥 Speichern';
      btn.disabled = false;
      toast(fail === 0 ? `✅ ${ok} Anzeige(n) im Dashboard gespeichert` : `⚠️ ${ok} gespeichert, ${fail} fehlgeschlagen`, fail === 0 ? 'ok' : 'warn');
    };

    document.getElementById('ka-del-exec').onclick = async () => {
      const ids = [...kaChecked];
      if (!ids.length) return;
      if (!confirm(`${ids.length} Anzeige(n) bei Kleinanzeigen löschen?\n\nDas Dashboard bleibt unverändert.`)) return;
      const btn = document.getElementById('ka-del-exec');
      btn.textContent = '⏳ Wird gelöscht…';
      btn.disabled = true;
      const csrf = getKACSRF();
      let ok = 0, fail = 0;
      for (const adId of ids) {
        try {
          const r = await fetch(`${KA_BASE}/m-anzeigen-loeschen.json?ids=${adId}`, {
            method: 'POST',
            headers: { 'x-csrf-token': csrf || '', 'x-requested-with': 'XMLHttpRequest' },
            credentials: 'include'
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          ok++;
          // Anzeigen-Container aus DOM entfernen
          const cb = document.querySelector(`.ka-del-cb[data-delid="${adId}"]`);
          const container = cb?.closest('[data-adid], article, li');
          if (container) { container.style.opacity = '0'; container.style.transition = 'opacity .3s'; setTimeout(() => container.remove(), 300); }
          kaChecked.delete(adId);
          await new Promise(r => setTimeout(r, 500));
        } catch(e) {
          fail++;
          console.warn('[KA] Löschen fehlgeschlagen', adId, e.message);
        }
      }
      btn.textContent = '🗑 Bei Kleinanzeigen löschen';
      btn.disabled = false;
      kaChecked.clear();
      updateDeleteBar();
      toast(fail === 0 ? `✅ ${ok} Anzeige(n) gelöscht` : `⚠️ ${ok} gelöscht, ${fail} fehlgeschlagen`, fail === 0 ? 'ok' : 'warn');
    };
  }

  // Checkbox zu jedem Anzeigen-Container hinzufügen
  // Funktioniert mit data-adid (alte + neue KA-Struktur)
  document.querySelectorAll('[data-adid]').forEach(item => {
    const adId = item.dataset.adid;
    if (!adId || item.dataset.kaCbDone) return;
    item.dataset.kaCbDone = '1';

    if (getComputedStyle(item).position === 'static') item.style.position = 'relative';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ka-del-cb';
    cb.dataset.delid = adId;
    cb.title = 'Für Löschen auswählen';
    cb.style.cssText = `position:absolute;top:8px;right:8px;z-index:10;
      width:20px;height:20px;cursor:pointer;accent-color:#dc2626;`;
    item.appendChild(cb);

    cb.addEventListener('change', () => {
      if (cb.checked) {
        kaChecked.add(adId);
        item.style.outline = '2px solid #dc2626';
        item.dataset.kaOutlined = '1';
      } else {
        kaChecked.delete(adId);
        item.style.outline = '';
        delete item.dataset.kaOutlined;
      }
      updateDeleteBar();
    });
  });
}

})();

// ══════════════════════════════════════════════════════════════════════════
// KA Manager v5 – "Anzeige aufgeben" mit KI-Entwurf vorausfüllen
// Läuft auf p-anzeige-aufgeben.html. Füllt Titel/Beschreibung/Preis/VB/PLZ und
// hängt die Fotos an. Kategorie + Kontaktdaten wählt/bestätigt der Nutzer selbst,
// Absenden ("Anzeige aufgeben") macht ausdrücklich der Nutzer.
// ══════════════════════════════════════════════════════════════════════════
(() => {
  'use strict';
  if (!location.pathname.includes('p-anzeige-aufgeben')) return;

  // Selektoren für BEIDE KA-Oberflächen: neu (Astro: #ad-*) und alt (#postad-/#pstad-)
  const SEL = {
    title: ['#ad-title', '#postad-title', 'input[name="title"]', 'input[id*="title" i]'],
    desc:  ['#ad-description', '#pstad-descrptn', 'textarea[name="description"]', 'textarea[id*="descr" i]', 'textarea'],
    price: ['#ad-price', '#pstad-price', 'input[name="priceAmount"]', 'input[name*="price" i]', 'input[id*="price" i]'],
    vb:    ['input[name="priceType"][value="NEGOTIABLE"]', 'input[type="radio"][value="NEGOTIABLE"]', '#ad-price-type-negotiable'],
    fixed: ['input[name="priceType"][value="FIXED"]', 'input[type="radio"][value="FIXED"]', '#ad-price-type-fixed'],
    zip:   ['#ad-zip', '#postad-zip', 'input[name="zipCode"]', 'input[id*="zip" i]', 'input[name*="plz" i]'],
    file:  ['input[id^="html5_"][accept*="image/jpeg" i]', 'input[type="file"][accept*="image/jpeg" i]',
            '#pictureupload-pickfiles input[type="file"]', '.pictureupload input[type="file"]',
            'input[type="file"][accept*="image" i]', 'input[type="file"]']
  };
  const q = list => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };

  function setVal(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function attachPhotos(imageData) {
    const input = q(SEL.file);
    if (!input || !imageData || !imageData.length) return false;
    try {
      const dt = new DataTransfer();
      imageData.forEach((im, i) => {
        const bin = atob(im.base64);
        const arr = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
        dt.items.add(new File([arr], im.name || `foto_${i + 1}.jpg`, { type: im.mimeType || 'image/jpeg' }));
      });
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) { console.warn('[KA v5] Foto-Anhang:', e.message); return false; }
  }
  function toast(msg, ok = true) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:20px;right:20px;z-index:2147483647;max-width:340px;
      background:${ok ? '#059669' : '#dc2626'};color:#fff;padding:12px 16px;border-radius:8px;
      font:600 13px system-ui;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.3)`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function waitFor(list, ms = 15000) {
    return new Promise(res => {
      const found = q(list); if (found) return res(found);
      const o = new MutationObserver(() => { const f = q(list); if (f) { o.disconnect(); res(f); } });
      o.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { o.disconnect(); res(q(list)); }, ms);
    });
  }

  async function fill(data) {
    const titleEl = await waitFor(SEL.title);
    if (!titleEl) { toast('KA Manager: Titelfeld nicht gefunden – bitte manuell einfügen.', false); return; }
    setVal(titleEl, (data.title || '').slice(0, 65));

    const descEl = q(SEL.desc);
    if (descEl) setVal(descEl, data.description || '');

    const priceEl = q(SEL.price);
    if (priceEl && data.price) setVal(priceEl, String(data.price).replace('.', ','));

    const vbEl = data.vb ? q(SEL.vb) : q(SEL.fixed);
    if (vbEl) vbEl.click();

    const zipEl = q(SEL.zip);
    if (zipEl && data.plz) setVal(zipEl, data.plz);

    let photoMsg = '';
    if (data.imageData && data.imageData.length) {
      await new Promise(r => setTimeout(r, 800));
      photoMsg = attachPhotos(data.imageData)
        ? ` ${data.imageData.length} Foto(s) angehängt.`
        : ' Fotos bitte manuell hochladen (⬇ im Dashboard gespeichert).';
    }
    toast(`✅ KA Manager: Anzeige vorausgefüllt.${photoMsg} Bitte Kategorie prüfen und selbst „Anzeige aufgeben" klicken.`);
  }

  chrome.storage.local.get('ka_new_ad_transfer', res => {
    const data = res && res.ka_new_ad_transfer;
    if (!data) return;
    chrome.storage.local.remove('ka_new_ad_transfer');
    const start = () => setTimeout(() => fill(data), 1500);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  });
})();
