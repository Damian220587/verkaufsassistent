// ai-create.js – KA Manager v5
// KI-Erstellung: Foto → Claude → Titel/Beschreibung/Preis → Inventar
// Nutzt danach die bestehende Auto-Einstell-Funktion (repostAd) bzw. das
// vorausgefüllte KA-Formular (für brandneue Anzeigen ohne KA-Herkunft).
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULT_LEGAL = 'Privatverkauf: Der Verkauf erfolgt unter Ausschluss jeglicher Gewährleistung, Garantie und Rücknahme.';
  const MAX_PHOTOS = 10;

  let photos = [];   // [{ b64Small, b64Full, url, mime }]
  let lastResult = null;

  // ── Settings ──────────────────────────────────────────────────────────────
  async function getSettings() {
    const d = await chrome.storage.local.get(['ai_key', 'ai_legal', 'ai_plz']);
    return {
      key:   d.ai_key   || '',
      legal: d.ai_legal || DEFAULT_LEGAL,
      plz:   d.ai_plz   || ''
    };
  }
  async function openSettings() {
    const s = await getSettings();
    $('setKey').value   = s.key;
    $('setLegal').value = s.legal;
    $('setPlz').value   = s.plz;
    updateKeyStatus(s.key);
    $('setModalBg').classList.add('on');
  }
  function updateKeyStatus(k) {
    const el = $('setKeyStatus');
    const ok = k && k.length > 10;
    el.textContent = ok ? '✓ Key gespeichert' : 'Kein Key – bitte eintragen';
    el.style.color = ok ? 'var(--grn)' : 'var(--red)';
  }
  async function saveSettings() {
    await chrome.storage.local.set({
      ai_key:   $('setKey').value.trim(),
      ai_legal: $('setLegal').value.trim() || DEFAULT_LEGAL,
      ai_plz:   $('setPlz').value.trim()
    });
    updateKeyStatus($('setKey').value.trim());
    aiAlert('setAlert', '✓ Einstellungen gespeichert', 'ok', 2000);
    setTimeout(() => $('setModalBg').classList.remove('on'), 600);
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  let alertTimer = null;
  function aiAlert(target, msg, type, ms) {
    const el = $(target);
    el.innerHTML = msg;
    el.className = 'ai-alert on ' + (type || 'err');
    if (alertTimer) clearTimeout(alertTimer);
    if (ms) alertTimer = setTimeout(() => { el.className = 'ai-alert'; }, ms);
  }
  function hideAlert(target) { $(target).className = 'ai-alert'; }

  // ── Foto-Upload ───────────────────────────────────────────────────────────
  function downscale(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxPx) { const s = maxPx / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function addPhotos(files) {
    hideAlert('aiAlert');
    for (const f of files) {
      if (photos.length >= MAX_PHOTOS) { aiAlert('aiAlert', 'Maximal ' + MAX_PHOTOS + ' Fotos.', 'err', 2500); break; }
      if (!f.type.startsWith('image/')) continue;
      try {
        const small = await downscale(f, 1024, 0.82);   // für die KI (spart Tokens)
        const full  = await downscale(f, 1600, 0.9);    // fürs Einstellen
        photos.push({ b64Small: small.split(',')[1], b64Full: full.split(',')[1], url: small, mime: 'image/jpeg' });
      } catch (e) { aiAlert('aiAlert', e.message, 'err', 3000); }
    }
    renderThumbs();
  }
  function renderThumbs() {
    const t = $('aiThumbs');
    t.innerHTML = photos.map((p, i) =>
      `<div class="ai-th"><img src="${p.url}" alt="Foto ${i + 1}"><button class="del" data-rm="${i}">✕</button></div>`
    ).join('');
    t.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', () => { photos.splice(+b.dataset.rm, 1); renderThumbs(); }));
  }

  // ── Claude API ────────────────────────────────────────────────────────────
  async function callClaude(key, info) {
    const content = photos.map(p => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.b64Small }
    }));
    const prompt =
      `Du siehst ${photos.length} Foto(s) eines Produkts, das privat verkauft werden soll.\n` +
      'Erstelle eine ehrliche, verkaufsfördernde Anzeige für Kleinanzeigen.de und eBay.de.\n\n' +
      'Angaben des Verkäufers:\n' +
      `- Zustand: ${info.zustand || 'bitte aus Fotos einschätzen'}\n` +
      `- Marke/Modell: ${info.marke || 'bitte erkennen'}\n` +
      `- Kategorie: ${info.kategorie || 'bitte bestimmen'}\n` +
      `- Maße/Größe: ${info.groesse || 'keine Angabe'}\n` +
      `- Besonderheiten/Mängel: ${info.notizen || 'keine Angabe'}\n` +
      `- Versand: ${info.versand}\n\n` +
      'Antworte AUSSCHLIESSLICH mit diesem JSON-Objekt, ohne Markdown, ohne Text davor/danach:\n' +
      '{\n' +
      ' "titel_kleinanzeigen": "max. 65 Zeichen, wichtigste Suchbegriffe",\n' +
      ' "titel_ebay": "max. 80 Zeichen: Marke Modell Merkmal Zustand",\n' +
      ' "beschreibung": "Anzeigentext mit Absätzen (\\n\\n): Was, Zustand ehrlich inkl. Mängel, Details/Lieferumfang, am Ende Versandinfo",\n' +
      ' "kategorie": "passende Kategorie",\n' +
      ' "marke": "erkannte Marke oder null",\n' +
      ' "modell": "erkanntes Modell oder null",\n' +
      ' "zustandseinschaetzung": "kurze ehrliche Einschätzung",\n' +
      ' "preis_von": Zahl in Euro oder null,\n' +
      ' "preis_bis": Zahl in Euro oder null,\n' +
      ' "unsicherheiten": ["was du NICHT sicher erkennen konntest"]\n' +
      '}\n\n' +
      'Regeln: NICHTS erfinden. Unsichere Punkte in "unsicherheiten". Keine Werbefloskeln, kein GROSSSCHREIBEN. ' +
      'KEINEN Rechtshinweis einfügen. Preis = realistischer deutscher Gebrauchtmarkt. Titel-Längen strikt einhalten.';
    content.push({ type: 'text', text: prompt });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: 'Du bist Experte für private Verkaufsanzeigen. Du antwortest NUR mit einem JSON-Objekt, ohne Markdown. Du erfindest niemals Produkteigenschaften.',
        messages: [{ role: 'user', content }]
      })
    });
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const e = await resp.json(); msg = (e.error && e.error.message) || msg; } catch (_) {}
      if (resp.status === 401) throw new Error('Ungültiger API Key – bitte in ⚙ prüfen');
      if (resp.status === 429) throw new Error('Zu viele Anfragen – kurz warten');
      throw new Error('Claude: ' + msg);
    }
    const data = await resp.json();
    let text = ((data.content && data.content[0] && data.content[0].text) || '').trim()
      .replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(text); }
    catch (_) { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('KI-Antwort nicht lesbar – bitte erneut'); }
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  function collectInfo() {
    const ship = [];
    if ($('aiAbholung').checked) ship.push('Abholung');
    if ($('aiVersand').checked)  ship.push('Versand möglich');
    return {
      zustand: $('aiZustand').value, marke: $('aiMarke').value.trim(),
      kategorie: $('aiKategorie').value.trim(), groesse: $('aiGroesse').value.trim(),
      notizen: $('aiNotizen').value.trim(), versand: ship.join(', ') || 'keine Angabe'
    };
  }
  async function generate() {
    hideAlert('aiAlert');
    if (!photos.length) { aiAlert('aiAlert', 'Bitte zuerst mindestens ein Foto auswählen.', 'err', 3000); return; }
    const s = await getSettings();
    if (!s.key) {
      $('aiModalBg').classList.remove('on');
      openSettings();
      aiAlert('setAlert', 'Bitte zuerst einen Claude API Key eintragen.', 'err', 4000);
      return;
    }
    const btn = $('aiGenBtn');
    btn.disabled = true; btn.innerHTML = '⏳ KI erstellt Anzeige…';
    try {
      const r = await callClaude(s.key, collectInfo());
      lastResult = r;
      showResult(r);
      $('aiSaveBtn').style.display = '';
    } catch (e) {
      aiAlert('aiAlert', 'Fehler: ' + (e.message || 'unbekannt'), 'err');
    }
    btn.disabled = false; btn.innerHTML = '🔄 Neu generieren';
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function showResult(r) {
    $('aiRTitelKA').value = (r.titel_kleinanzeigen || '').slice(0, 120);
    $('aiRTitelEB').value = (r.titel_ebay || r.titel_kleinanzeigen || '').slice(0, 120);
    $('aiRDesc').value = r.beschreibung || '';
    // Preis: User-Preis gewinnt, sonst KI-Mittelwert
    if (!$('aiPreis').value && r.preis_von != null) {
      const von = Number(r.preis_von), bis = Number(r.preis_bis != null ? r.preis_bis : r.preis_von);
      $('aiPreis').value = Math.round((von + bis) / 2);
    }
    const pb = $('aiPriceBox');
    if (r.preis_von != null) {
      const range = (r.preis_bis != null && r.preis_bis !== r.preis_von) ? `${r.preis_von}–${r.preis_bis} €` : `${r.preis_von} €`;
      $('aiPriceVal').textContent = range; pb.style.display = '';
    } else pb.style.display = 'none';
    const unc = Array.isArray(r.unsicherheiten) ? r.unsicherheiten.filter(Boolean) : [];
    if (unc.length) { $('aiUncertainList').innerHTML = unc.map(u => `<li>${esc(u)}</li>`).join(''); $('aiUncertain').style.display = ''; }
    else $('aiUncertain').style.display = 'none';
    if (!$('aiKategorie').value && r.kategorie) $('aiKategorie').value = r.kategorie;
    counters();
    $('aiResult').classList.add('on');
  }
  function counters() {
    const ka = $('aiRTitelKA').value.length, eb = $('aiRTitelEB').value.length;
    $('aiCntKA').textContent = `${ka}/65` + (ka > 65 ? ' – zu lang!' : '');
    $('aiCntEB').textContent = `${eb}/80` + (eb > 80 ? ' – zu lang!' : '');
    $('aiCntKA').className = 'ai-cnt' + (ka > 65 ? ' over' : '');
    $('aiCntEB').className = 'ai-cnt' + (eb > 80 ? ' over' : '');
  }

  // ── Ins Inventar speichern (kompatibel mit repostAd) ──────────────────────
  async function saveToInventory() {
    const s = await getSettings();
    let desc = $('aiRDesc').value.trim();
    if ($('aiLegal').checked) desc += '\n\n' + s.legal;
    const price = ($('aiPreis').value || '').toString().trim();
    const vb = $('aiVB').checked;
    const priceRaw = price ? (price + ' €' + (vb ? ' VB' : '')) : '';
    const plz = ($('aiPlz').value || s.plz || '').trim();
    const titleKA = $('aiRTitelKA').value.trim();

    const imageData = photos.map((p, i) => ({ base64: p.b64Full, mimeType: 'image/jpeg', name: `foto_${i + 1}.jpg` }));

    const ad = {
      adId: 'ai_' + Date.now(),
      originalAdId: '',
      isAiDraft: true,                 // Kennzeichen: brandneu, noch nicht bei KA
      title: titleKA,
      titleEbay: $('aiRTitelEB').value.trim(),
      description: desc,
      price: price.replace(',', '.'),
      priceRaw,
      priceEdited: true,               // repostAd rechnet priceAmount aus priceRaw
      vb,
      location: plz,
      categoryPath: $('aiKategorie').value.trim() ? [$('aiKategorie').value.trim()] : [],
      categoryText: $('aiKategorie').value.trim(),
      images: [],
      imageData,
      savedAt: new Date().toISOString()
    };

    const btn = $('aiSaveBtn');
    btn.disabled = true; btn.innerHTML = '⏳ Speichere…';
    await chrome.runtime.sendMessage({ action: 'saveAd', ad });
    btn.disabled = false; btn.innerHTML = '💾 Ins Inventar speichern';
    closeModal();
    if (window.kaReloadInventory) window.kaReloadInventory();
  }

  // ── Brandneue Anzeige über das vorausgefüllte KA-Formular einstellen ──────
  // (Reihenfolge: Foto → KI → hier. Contact-Daten & Kategorie füllt KA/der User.)
  window.kaPublishAiDraft = async function (item) {
    await chrome.storage.local.set({
      ka_new_ad_transfer: {
        title: item.title || '',
        description: item.description || '',
        price: item.price || '',
        vb: !!item.vb,
        plz: item.location || '',
        imageData: item.imageData || []
      }
    });
    window.open('https://www.kleinanzeigen.de/p-anzeige-aufgeben.html', '_blank');
  };

  // ── Modal-Handling ────────────────────────────────────────────────────────
  function openModal() {
    photos = []; lastResult = null;
    renderThumbs();
    ['aiMarke', 'aiKategorie', 'aiGroesse', 'aiPreis', 'aiNotizen'].forEach(id => $(id).value = '');
    $('aiZustand').value = '';
    $('aiVB').checked = true; $('aiAbholung').checked = true; $('aiVersand').checked = false; $('aiLegal').checked = true;
    $('aiResult').classList.remove('on');
    $('aiSaveBtn').style.display = 'none';
    $('aiGenBtn').innerHTML = '✨ Anzeige erstellen';
    hideAlert('aiAlert');
    getSettings().then(s => { if (s.plz) $('aiPlz').value = s.plz; });
    $('aiModalBg').classList.add('on');
  }
  function closeModal() { $('aiModalBg').classList.remove('on'); }

  // ── Wiring ────────────────────────────────────────────────────────────────
  function wire() {
    $('aiCreateBtn').addEventListener('click', openModal);
    $('settingsBtn').addEventListener('click', openSettings);
    $('aiModalClose').addEventListener('click', closeModal);
    $('setModalClose').addEventListener('click', () => $('setModalBg').classList.remove('on'));
    $('setSaveBtn').addEventListener('click', saveSettings);
    $('aiGenBtn').addEventListener('click', generate);
    $('aiSaveBtn').addEventListener('click', saveToInventory);
    $('aiRTitelKA').addEventListener('input', counters);
    $('aiRTitelEB').addEventListener('input', counters);
    $('aiFileInput').addEventListener('change', e => { addPhotos([...e.target.files]); e.target.value = ''; });
    const drop = $('aiDrop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files.length) addPhotos([...e.dataTransfer.files]); });
    [$('aiModalBg'), $('setModalBg')].forEach(bg =>
      bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('on'); }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
