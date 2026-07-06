'use strict';
chrome.storage.local.get(['va_listings', 'va_synced'], function(data) {
  var el = document.getElementById('status');
  var listings = data.va_listings || [];
  if (!listings.length) {
    el.innerHTML = '<span class="mu">Noch keine Entwürfe synchronisiert.<br>' +
      'Öffne die App in diesem Chrome – deine Anzeigen werden dann automatisch übernommen.<br><br>' +
      'Hinweis: Am Handy erstellte Anzeigen bleiben auf dem Handy – am PC bitte in der App am PC erstellen.</span>';
  } else {
    var d = data.va_synced ? new Date(data.va_synced).toLocaleString('de-DE') : '–';
    el.innerHTML = '<span class="ok">✓ ' + listings.length + ' Entwurf/Entwürfe bereit</span><br>' +
      '<span class="mu">Letzter Abgleich: ' + d + '</span>';
  }
});
