# KA Manager v5 – mit KI-Anzeigenerstellung

Deine bestehende KA-Manager-Extension, erweitert um **KI-Erstellung aus Fotos**.
Alles passiert an einem Ort – kein Kopieren/Einfügen, keine separate Handy-App,
kein Server.

## Neuer Ablauf

1. Dashboard öffnen → **⚙ Einstellungen** → Claude API Key eintragen (einmalig)
2. **✨ Neue Anzeige aus Foto** klicken
3. Fotos reinziehen (bis zu 10) + ein paar Angaben (Zustand, Mängel, Preis optional)
4. **✨ Anzeige erstellen** → Claude macht Titel, Beschreibung, Preisvorschlag
5. Vorschau prüfen (besonders die gelbe „nicht sicher erkannt"-Box!) → **💾 Ins Inventar speichern**
6. Die Anzeige liegt jetzt als Karte im Inventar → **⚡** stellt sie bei Kleinanzeigen ein

## Was v5 neu kann (alles andere bleibt wie gewohnt)

- **✨ Neue Anzeige aus Foto**: Claude erzeugt aus Fotos Titel (65/80 Zeichen für
  KA/eBay), Beschreibung, Kategorie-Vorschlag und einen unverbindlichen Preisvorschlag
- **Unsicherheiten-Anzeige**: zeigt, was die KI nicht sicher erkennen konnte – zum Gegenprüfen
- **Privatverkaufs-Hinweis** per Checkbox (Text in ⚙ Einstellungen änderbar)
- **⚙ Einstellungen**: Claude API Key, Rechtstext, Standard-PLZ
- Deine bewährten Funktionen (Anzeigen von KA speichern, ⚡ 1-Klick neu einstellen,
  Ordner, Massen-Löschen, eBay/Vinted-Transfer) sind unverändert

## Wichtig: zwei Arten von Anzeigen, zwei Einstell-Wege

- **Aus KA gespeicherte Anzeigen** (📥) → ⚡ stellt sie **vollautomatisch** über die
  KA-API neu ein (wie bisher, unverändert).
- **Brandneue KI-Anzeigen** (✨) → ⚡ öffnet die **„Anzeige aufgeben"-Seite
  vorausgefüllt** (Titel, Beschreibung, Preis, VB, PLZ, Fotos). Du wählst nur noch die
  **Kategorie**, prüfst die Kontaktdaten und klickst selbst auf **„Anzeige aufgeben"**.

  Warum nicht auch hier voll automatisch? Für eine komplett neue Anzeige braucht KA
  die Kategorie und deine Kontaktdaten – die füllt KA erst auf der Aufgeben-Seite
  ein. Ein Klick von dir bleibt (das ist auch sicherer: kein blindes Massen-Einstellen).

## API Key

Auf [console.anthropic.com](https://console.anthropic.com/settings/keys) → „Create Key".
Kosten ca. 1–2 Cent pro erstellter Anzeige. Der Key bleibt nur lokal auf deinem Gerät.

## Installation / Update

1. Ordner `ka-manager-ki/` herunterladen (bzw. Repo als ZIP, dann entpacken)
2. Chrome → `chrome://extensions` → **Entwicklermodus** an
3. Falls schon installiert: bei „KA Manager" auf **↻ Aktualisieren**, sonst
   **„Entpackte Erweiterung laden"** → den Ordner auswählen

## Bitte selbst testen (kann ich nicht für dich)

Das echte Einstellen läuft nur mit deinem eingeloggten Kleinanzeigen-Konto – das
konnte ich nicht testen. Bitte einmal durchspielen:
- KI-Anzeige erstellen → ⚡ → wird die Aufgeben-Seite korrekt vorausgefüllt? Fotos dran?
- Deine bestehenden „aus KA gespeicherten" Anzeigen: ⚡ stellt weiterhin voll automatisch ein?

Falls ein Feld leergeblieben ist, sag mir welches – die Feld-Erkennung (Selektoren)
steht oben in `src/content.js` und lässt sich schnell nachziehen.

## Hinweis

Vollautomatisches Einstellen bei Kleinanzeigen bewegt sich in deren ToS-Grauzone
(das galt schon für v4). Sparsam und nur für eigene, geprüfte Anzeigen nutzen.
