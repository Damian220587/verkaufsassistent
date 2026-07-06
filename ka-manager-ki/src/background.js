// background.js – KA Manager v4
// Postet direkt über KA's eigene API – kein Kategorie-Klicken nötig

const INV_KEY  = 'ka_inventory';
const DASH_URL = chrome.runtime.getURL('dashboard.html');
const KA_BASE  = 'https://www.kleinanzeigen.de';
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ── Dashboard öffnen ──────────────────────────────────────────────────────
chrome.action.onClicked.addListener(async () => {
  const [ex] = await chrome.tabs.query({ url: DASH_URL });
  if (ex) { chrome.tabs.update(ex.id, { active: true }); chrome.windows.update(ex.windowId, { focused: true }); }
  else chrome.tabs.create({ url: DASH_URL });
});

// ── Storage ───────────────────────────────────────────────────────────────
async function getInv() { return (await chrome.storage.local.get(INV_KEY))[INV_KEY] || []; }
async function setInv(v) { return chrome.storage.local.set({ [INV_KEY]: v }); }

// ── KA-Tab finden (brauchen Session-Cookies) ───────────────────────────────
async function getKATab() {
  const tabs = await chrome.tabs.query({ url: 'https://*.kleinanzeigen.de/*' });
  if (tabs.length) return tabs[0].id;
  // Keinen KA-Tab offen → neuen im Hintergrund öffnen
  const tab = await chrome.tabs.create({ url: KA_BASE, active: false });
  await new Promise(res => {
    const fn = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(fn); res(); } };
    chrome.tabs.onUpdated.addListener(fn);
  });
  return tab.id;
}

// ── Alle API-Calls laufen im Kontext eines KA-Tabs (für Session-Cookies) ──
async function execInKATab(fn, ...args) {
  const tabId = await getKATab();
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: fn,
    args
  });
  return results?.[0]?.result;
}

// ── CSRF-Token holen ──────────────────────────────────────────────────────
async function getCSRF() {
  // Gecacht?
  const cache = await chrome.storage.local.get(['csrf', 'csrfTime']);
  if (cache.csrf && cache.csrfTime && Date.now() - cache.csrfTime < 270000) {
    return cache.csrf;
  }
  const token = await execInKATab(async () => {
    try {
      const r = await fetch('https://www.kleinanzeigen.de/m-mein-profil.json');
      if (!r.ok) return null;
      const d = await r.json();
      return d?.csrfToken || null;
    } catch { return null; }
  });
  if (token) {
    await chrome.storage.local.set({ csrf: token, csrfTime: Date.now() });
  }
  return token;
}

// ── Anzeige-Formular-Daten holen (komplettes Formular von Bearbeitungs-Seite) ──
async function fetchAdFormData(adId) {
  return execInKATab(async (adId, base) => {
    try {
      const r = await fetch(`${base}/p-anzeige-bearbeiten.html?adId=${adId}`);
      if (!r.ok) return null;
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const form = doc.getElementById('adForm');
      if (!form) return null;

      // Formular serialisieren (wie die Konkurrenz)
      const data = {};
      for (const el of form.elements) {
        if (!el.name || el.disabled) continue;
        if (['submit','reset','button','image','file'].includes(el.type)) continue;
        if (el.type === 'radio' || el.type === 'checkbox') {
          if (!el.checked) continue;
        }
        if (el.type === 'select-multiple') {
          data[el.name] = Array.from(el.selectedOptions).map(o => o.value);
        } else {
          data[el.name] = el.value;
        }
      }

      // Bilder-URLs aus Thumbnails
      const imgs = [];
      doc.querySelectorAll('ul#j-pictureupload-thumbnails li img, input.ke-uploaded-image').forEach(el => {
        const src = el.src || el.value;
        if (src && src.startsWith('http')) imgs.push(src);
      });
      data.images = imgs;

      return data;
    } catch (e) {
      console.error('[KA] fetchAdFormData:', e);
      return null;
    }
  }, adId, KA_BASE);
}

// ── Bild hochladen via KA's Upload-Endpoint ─────────────────────────────
async function uploadImageBlob(blobBase64, mimeType, csrf) {
  return execInKATab(async (b64, mime, csrf, base) => {
    try {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${base}/p-bild-hochladen.html`, {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': csrf, 'X-XSRF-TOKEN': csrf },
        body: fd
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.yamsAdImage?.thumbnailUrl || null;
    } catch (e) {
      console.error('[KA] uploadImageBlob:', e);
      return null;
    }
  }, blobBase64, mimeType, csrf, KA_BASE);
}

// ── Anzeige abschicken ────────────────────────────────────────────────────
async function submitAd(formData, imageUrls, csrf) {
  return execInKATab(async (fd, imgs, csrf, base) => {
    try {
      fd._csrf = csrf;
      fd.adId = ''; // Neue Anzeige
      fd.flow = 'true';

      // Felder bereinigen
      delete fd.postAdWenkseSessionId;
      delete fd.trackingId;
      delete fd._marketingOptIn;
      delete fd.images;

      // Standard-Versand wenn nicht vorhanden
      const hasShipping = Object.keys(fd).some(k => k.startsWith('shippingOptions'));
      if (!hasShipping) {
        fd['shippingOptions[0].id'] = 'HERMES_003';
        fd['shippingOptions[1].id'] = 'DHL_002';
      }

      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(fd)) {
        if (Array.isArray(v)) v.forEach(val => params.append(k, val));
        else params.append(k, v);
      }

      // Bilder anhängen
      imgs.forEach((url, i) => {
        if (url && (url.includes('i.ebayimg.com') || url.includes('img.kleinanzeigen'))) {
          params.append(`adImages[${i}].url`, url);
        }
      });

      const r = await fetch(`${base}/p-anzeige-abschicken.html`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        credentials: 'include'
      });

      const text = await r.text();
      const url  = r.url;

      if (url.includes('p-anzeige-aufgeben-bestaetigung') || url.includes('adId=')) {
        return { ok: true, message: 'Erfolgreich veröffentlicht!' };
      }
      if (text.toLowerCase().includes('recaptcha')) {
        return { ok: false, message: 'reCAPTCHA – bitte kurz warten und erneut versuchen' };
      }
      if (url.includes('p-anzeige-abschicken') || text.includes('formerror')) {
        // Fehlermeldungen extrahieren
        const errs = [...text.matchAll(/class="formerror[^"]*">([^<]+)</g)].map(m => m[1].trim());
        return { ok: false, message: errs.length ? errs.join(' | ') : 'Formular-Fehler' };
      }
      return { ok: true, message: 'Veröffentlicht (bitte prüfen)' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }, formData, imageUrls, csrf, KA_BASE);
}

// ══════════════════════════════════════════════════════════════════════════
// HAUPT-FUNKTION: Anzeige neu einstellen
// Kein Browser-Tab-Navigation! Alles via direkte API-Calls.
// ══════════════════════════════════════════════════════════════════════════
async function repostAd(inventoryItem) {
  try {
    console.log('[KA] repostAd:', inventoryItem.title);

    // 1. CSRF-Token
    const csrf = await getCSRF();
    if (!csrf) return { ok: false, message: 'Nicht eingeloggt bei Kleinanzeigen' };

    // 2. Formulardaten holen – drei Fallbacks:
    let formData = inventoryItem.formData;

    // Fallback 1: Wenn kein formData gespeichert → von KA nachladen (Originalanzeige noch online)
    if (!formData && inventoryItem.originalAdId) {
      console.log('[KA] Kein formData – lade von KA nach:', inventoryItem.originalAdId);
      formData = await fetchAdFormData(inventoryItem.originalAdId);
    }

    // Fallback 2: Anzeige bei KA schon gelöscht → formData aus gespeicherten Inventar-Feldern rekonstruieren
    if (!formData) {
      console.log('[KA] Rekonstruiere formData aus Inventar-Feldern');
      formData = {
        title:       inventoryItem.title       || '',
        description: inventoryItem.description || '',
        priceAmount: inventoryItem.price ? Math.round(parseFloat(inventoryItem.price) * 100).toString() : '0',
        zipCode:     (inventoryItem.location || '').match(/\d{5}/)?.[0] || '',
        categoryId:  inventoryItem.categoryId  || '',
        images:      inventoryItem.images      || [],
      };
      // Ohne categoryId können Pflichtfelder fehlen – warnen aber weitermachen
      if (!formData.categoryId) {
        console.warn('[KA] Keine categoryId – Einstellung könnte fehlschlagen');
      }
    }

    // 3. Gespeicherte Änderungen aus dem Edit-Panel übernehmen
    if (inventoryItem.title)       formData.title       = inventoryItem.title;
    if (inventoryItem.description) formData.description = inventoryItem.description;
    // priceEdited=true nur wenn User Preis im Panel manuell geaendert hat
    if (inventoryItem.priceEdited && inventoryItem.priceRaw) {
      // "1.299,99" -> Cent: Tausenderpunkt entfernen, Komma -> Punkt
      const raw = inventoryItem.priceRaw.replace(/[^0-9,.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
      const n = parseFloat(raw);
      if (!isNaN(n) && n >= 0) {
        formData.priceAmount = Math.round(n * 100).toString();
        console.log('[KA] Preis Panel:', inventoryItem.priceRaw, '->', formData.priceAmount, 'Cent');
      }
    }
    // Sonst bleibt formData.priceAmount aus gespeicherter Bearbeitungsseite (bereits Cent)

    // 4. Bilder hochladen (falls als Base64 gespeichert)
    const finalImageUrls = [];
    if (inventoryItem.imageData?.length) {
      console.log('[KA] Lade', inventoryItem.imageData.length, 'Bilder hoch…');
      for (const imgItem of inventoryItem.imageData) {
        const url = await uploadImageBlob(imgItem.base64, imgItem.mimeType || 'image/jpeg', csrf);
        if (url) finalImageUrls.push(url);
        await sleep(300); // Nicht zu schnell
      }
      console.log('[KA] Bilder hochgeladen:', finalImageUrls.length);
    } else if (formData.images?.length) {
      // Original-Bild-URLs aus dem Formular verwenden
      finalImageUrls.push(...formData.images);
    }

    // 5. Anzeige abschicken
    console.log('[KA] Sende Anzeige ab…');
    const result = await submitAd(formData, finalImageUrls, csrf);
    console.log('[KA] Ergebnis:', result);

    return result;

  } catch (e) {
    console.error('[KA] repostAd Fehler:', e);
    return { ok: false, message: e.message };
  }
}

// ── MESSAGE HANDLER ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _, respond) => {
  (async () => {
    switch (msg.action) {
      case 'openDashboard': {
        const [ex] = await chrome.tabs.query({ url: DASH_URL });
        if (ex) { chrome.tabs.update(ex.id, { active: true }); chrome.windows.update(ex.windowId, { focused: true }); }
        else chrome.tabs.create({ url: DASH_URL });
        respond({ ok: true }); break;
      }
      case 'getInventory': respond(await getInv()); break;
      case 'saveAd': {
        const inv = await getInv();
        const i = inv.findIndex(a => a.adId === msg.ad.adId);
        if (i >= 0) inv[i] = msg.ad; else inv.unshift(msg.ad);
        await setInv(inv);
        respond({ ok: true, count: inv.length }); break;
      }
      case 'updateAd': {
        const inv = await getInv();
        const i = inv.findIndex(a => a.adId === msg.ad.adId);
        if (i >= 0) { inv[i] = { ...inv[i], ...msg.ad }; await setInv(inv); respond({ ok: true }); }
        else respond({ ok: false }); break;
      }
      case 'deleteAds': {
        await setInv((await getInv()).filter(a => !msg.ids.includes(a.adId)));
        respond({ ok: true }); break;
      }
      case 'clearInventory': {
        await chrome.storage.local.remove(INV_KEY);
        respond({ ok: true }); break;
      }
      case 'repostAd': respond(await repostAd(msg.item)); break;
      default: respond({ error: 'unknown' });
    }
  })();
  return true;
});
