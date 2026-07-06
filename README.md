# Verkaufsassistent 🏷️

KI-gestützter Anzeigen-Generator als Web-App (PWA): Fotos vom Produkt machen,
ein paar Angaben eintragen – Claude erstellt automatisch Titel, Beschreibung
und Preisvorschlag für **Kleinanzeigen.de** und **eBay.de**. Per Kopieren/Teilen
in wenigen Klicks einstellen.

## Funktionen

- 📸 Bis zu 10 Produktfotos (Kamera oder Galerie), automatisch verkleinert für die KI
- 💾 Original-Fotos werden pro Anzeige gespeichert (IndexedDB) – per „Fotos teilen"
  in die Galerie sichern oder direkt an die Kleinanzeigen-App senden
- 🤖 Claude KI erkennt Produkt, Marke, Zustand und erstellt ehrliche Anzeigentexte
- ⚠️ Zeigt an, was die KI **nicht** sicher erkennen konnte – zum Gegenprüfen
- 💶 Unverbindlicher KI-Preisvorschlag
- ✏️ Vorschau mit Bearbeitung, Zeichenzähler (65 Zeichen Kleinanzeigen / 80 eBay)
- ⚖️ Privatverkaufs-Hinweis per Checkbox (Text in den Einstellungen änderbar)
- 📋 Kopieren-Buttons je Feld, 📤 Teilen direkt in die Kleinanzeigen-App
- 🗂 Verlauf aller erstellten Anzeigen mit „eingestellt"-Häkchen
- 📱 Als App aufs Handy installierbar (PWA), Daten bleiben lokal auf dem Gerät

## Einrichtung

### 1. GitHub Pages aktivieren (einmalig)

1. In diesem Repository: **Settings → Pages**
2. Unter „Build and deployment": Source = **Deploy from a branch**, Branch = **main**, Ordner **/ (root)** → **Save**
3. Nach 1–2 Minuten ist die App unter `https://<username>.github.io/verkaufsassistent/` erreichbar

### 2. Aufs Handy holen

1. Die Adresse im Handy-Browser öffnen (Chrome/Safari)
2. Menü → **„Zum Startbildschirm hinzufügen"**

### 3. Claude API Key eintragen

1. Auf [console.anthropic.com](https://console.anthropic.com/settings/keys) anmelden
2. **API Keys → Create Key**, Key kopieren
3. In der App: **⚙ Einstellungen** → Key einfügen → Speichern

Kosten: ca. 1–2 Cent pro erstellter Anzeige. Der Key wird nur lokal auf dem
Gerät gespeichert (localStorage) und direkt an die Anthropic-API gesendet.

## Hinweise

- **Kleinanzeigen & eBay:** Das Einstellen selbst passiert manuell per
  Kopieren/Teilen – Kleinanzeigen bietet keine öffentliche API, und ein
  automatisches Ausfüllen per Skript verstößt gegen deren Nutzungsbedingungen.
  Eine echte eBay-API-Anbindung (automatisches Einstellen) ist als Phase 2 geplant.
- Der KI-Preisvorschlag ist eine grobe Schätzung, kein Marktgutachten.
- Der Privatverkaufs-Standardtext ist gängige Praxis, aber keine Rechtsberatung.
