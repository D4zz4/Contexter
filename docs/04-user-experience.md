# Bedienkonzept

## Informationsarchitektur

Die Library zeigt Notebooks, Inbox und laufende Aufträge. Im Notebook liegen Quellenliste, Quellenansicht und Export. Globale Einstellungen enthalten Speicherort, Provider, Datenschutz-/Übertragungsoptionen und später Sync. Websuche ist eine Aktion innerhalb eines Notebooks; die lokale Suche bleibt im Quellenbereich.

Deutsche Oberfläche zuerst, Texte von Beginn an über Übersetzungsschlüssel verwalten. „Notebook“, „Quelle“, „Quellen suchen“, „Importieren“ und „Exportieren“ bleiben konsistente Begriffe. Technische Adapter- und Schemaangaben stehen nur unter Details.

## Bildschirme

| Ansicht | Sichtbarer Inhalt | Primäre Aktion |
| --- | --- | --- |
| Einrichtung | Arbeitsweise, Speicherort, kurzer Hinweis auf Export/Backup | „Speicherort auswählen“ |
| Library | Inbox, Notebookkarten mit Anzahl/Umfang, Suchfeld | „Notebook erstellen“ |
| Notebook | Titel, Quellenliste, aktive Anzahl/Token-Schätzung, Filter | „Quelle hinzufügen“ |
| Quelle | Lesbare Vorschau, Original öffnen, Status/Warnings, Metadaten | „Bearbeiten“ |
| Editor | Markdown und Vorschau; Hinweis auf manuelle Fassung | „Änderungen speichern“ |
| Quelle hinzufügen | URL/mehrere URLs, Datei, Text, YouTube; Notebookziel | „Hinzufügen“ |
| Quellen suchen | Suchbegriff, Dienst, Treffer mit Checkboxen/Domain | „Ausgewählte hinzufügen“ |
| Kanal/Playlist | Auflistung, Filter, Auswahl, erreichte Grenze | „Auswahl importieren“ |
| Aufträge | Fortschritt, Wartegrund, Fehler je Quelle | „Fortsetzen“ bzw. „Wiederholen“ |
| Export | Format, Umfang, Auswahl, unvollständige Quellen, Ziel | „Exportieren“ |
| Konflikt | Lokale und empfangene Fassung, Unterschiede | „Fassung übernehmen“ oder „Zusammenführen“ |
| Einstellungen | Speicher, Provider, Backups, später Sync | Passend zum gewählten Bereich |

## Desktop-Aufbau

```text
┌──────────────────┬─────────────────────────┬─────────────────────────────┐
│ Context Builder  │ PROFIBUS                │ Ausgewählte Quelle          │
│                  │ 18 Quellen · ~42k Token │ Titel · Original öffnen     │
│ Inbox       3    │                         │                             │
│ Notebooks        │ + Quelle   Quellen      │ Extrahierter Inhalt         │
│  PROFIBUS        │ hinzufügen suchen       │ mit Tabellen, Code, Links   │
│  Training        │                         │                             │
│                  │ ☑ Handbuch      Bereit  │                             │
│ Aufträge         │ ☑ Fachartikel   Hinweis │                             │
│ Einstellungen    │ ☐ Video         Wartet  │ Bearbeiten · Details        │
│                  │                         │                             │
│                  │ Exportieren             │                             │
└──────────────────┴─────────────────────────┴─────────────────────────────┘
```

Bei schmalerem Fenster wechselt die Quelle in eine eigene Ansicht. Die Checkbox in der normalen Quellenliste bedeutet „für Kontext aktiv“. Mehrfachaktionen verwenden einen ausdrücklich eingeschalteten Auswahlmodus, damit dieselbe Checkbox nicht gleichzeitig zwei Bedeutungen hat. Treffercheckboxen der Websuche bedeuten ausschließlich Importauswahl.

## Android-Aufbau

Library als Startansicht. Notebookliste und Quellenansicht sind separate, per Zurück-Navigation verbundene Bildschirme. Primäre Aktion im erreichbaren unteren Bereich. Export als Bottom Sheet oder eigener Screen abhängig vom Platzbedarf. Share-Eingang öffnet eine kompakte Zielauswahl: zuletzt verwendetes Notebook zuerst, Inbox als gleichwertige schnelle Option, „Neues Notebook“ verfügbar.

Die UI meldet zuerst die sichere Erfassung. Erst anschließend erscheint der Verarbeitungszustand. Beim Verlassen mit laufendem Import wird angezeigt, dass die Verarbeitung beim nächsten Öffnen weiterläuft. Es gibt keine falsche Hintergrund-Erfolgsmeldung.

## Ablauf A: Schnell sammeln

1. Nutzer teilt Link/Text/Datei an Context Builder.
2. App erkennt URLs im geteilten Text; umgebender Titeltext bleibt als Hinweis erhalten. Mehrere Links werden als Liste angeboten.
3. Notebook oder Inbox wählen; „Hinzufügen“ bestätigen.
4. Eingang dauerhaft speichern. Bei Dateien darf ein Kopiervorgang sichtbar länger dauern.
5. „Quelle gespeichert“ anzeigen; separater Zustand „Verarbeitung läuft“ oder „Verarbeitung beim nächsten Öffnen“.
6. Nach Abschluss kann der Nutzer Ergebnis und Qualitätswarnungen prüfen.

Bei bereits vorhandener Quelle: Name und Aktionen „Öffnen“, „Neue Version abrufen“, „Separat importieren“. Ohne Internet bleibt der Link in der Warteschlange. Bei fehlender Dateiberechtigung wird eine erneute Auswahl angeboten.

## Ablauf B: Quellen recherchieren

Suchbegriff im Notebook eingeben. Wenn kein Provider eingerichtet ist, erklärt die Ansicht kurz den benötigten Dienst und öffnet dessen Einrichtung. Kein automatischer Netzwerkaufruf während des Tippens. Nach „Suchen“ erscheinen Titel, Domain, Such-Snippet, optional Datum und Checkbox. „Weitere Treffer“ lädt die nächste Seite, soweit unterstützt.

„3 Quellen hinzufügen“ startet drei getrennte Importaufträge. Das Snippet bleibt Suchmetadatum und ersetzt nie den Artikeltext. Fehler einer Website werden einzeln angezeigt. Kein zusätzlicher Schritt zur KI-Auswertung.

## Ablauf C: YouTube-Sammlung

Kanal- oder Playlist-URL erkennen. Vor Auflistung zeigen, welcher Dienst die URL erhält. Nach Auflistung Auswahl nach „Letzte X“, „Seit Datum“, Einzelhäkchen oder „Alle erreichbaren“ ermöglichen. Datum und tatsächliche Sortierung müssen durch Metadaten bestätigt sein; unbekannte Datumswerte kommen in einen eigenen Abschnitt und werden nicht still ausgefiltert.

Auswahlansicht zeigt vorhandene Duplikate, Anzahl neuer Videos und gegebenenfalls Listengrenze. Große Listen werden gestaffelt verarbeitet. Ein Batch startet initial höchstens 100 ausgewählte neue Videos; weitere Gruppen benötigen eine bewusste Fortsetzung. „Alle“ markiert die gesamte erreichbare Auswahl, löst aber keinen unbegrenzten Kostenlauf aus.

Abschluss: erfolgreich, ohne Untertitel, nicht erreichbar, Duplikate und sonstige Fehler. Fehlgeschlagene Einträge können selektiv wiederholt werden. Wenn eine gewünschte Transkriptsprache fehlt, wird die verfügbare Sprache zur Übernahme angeboten; es wird nichts übersetzt.

## Ablauf D: Inhalt prüfen und aktualisieren

Vorschau zeigt extrahierten Inhalt; Warnungen sind oben sichtbar, aber nicht im Body versteckt. Bearbeitung macht aus der aktuellen Fassung eine manuell geänderte Quelle. „Erneut abrufen“ speichert ein neues Ergebnis getrennt, wenn manuelle Änderungen vorliegen. Vergleich mit „Neue Extraktion übernehmen“, „Meine Fassung behalten“ und „Bearbeiten“. Beide Versionen bleiben zunächst wiederherstellbar.

## Ablauf E: Export

Format auswählen: „Eine Markdown-Datei“, „Eine Textdatei“, „Markdown-Dateien als ZIP“ oder „In Ordner speichern“, sofern Plattformzugriff besteht. Zwischenablage als zusätzliche Aktion. Anzeige von Quellenanzahl, Schätzung der Ausgabegröße und Warnungen; Metadaten standardmäßig enthalten.

Nicht verfügbare Quellen werden namentlich gelistet. Standardaktion wartet auf Lösung; Nutzer kann ausdrücklich nur verfügbare Inhalte exportieren. Nach erfolgreichem Schreiben: Dateiname, tatsächliche Quellenanzahl, Ziel und „Teilen“ auf Android. Backup ist eine getrennte Aktion unter Library/Einstellungen und heißt nicht Kontext-Export.

## Fehlertexte und Folgeschritt

| Situation | Textentwurf | Aktion |
| --- | --- | --- |
| Offline | „Gespeichert. Der Abruf wartet auf eine Verbindung.“ | Später fortsetzen |
| Ordner nicht erreichbar | „Der Notebook-Ordner ist momentan nicht verfügbar.“ | Ordner erneut verbinden |
| Externer Dienst aus | „Für diesen Abruf ist ein zusätzlicher Dienst nötig.“ | Dienst einrichten / Text einfügen |
| Untertitel fehlen | „Für dieses Video sind keine verfügbaren Untertitel gefunden worden.“ | Andere Sprache prüfen / Text einfügen |
| PDF nur Bild | „Diese PDF enthält auf den betroffenen Seiten keinen auslesbaren Text.“ | Details ansehen / andere Datei wählen |
| Extraktion unvollständig | „Ein Teil des Inhalts konnte nicht übernommen werden.“ | Betroffene Bereiche prüfen |
| Speicher voll | „Der Inhalt konnte noch nicht sicher gespeichert werden.“ | Platz schaffen / anderen Ordner wählen |
| Limit erreicht | „Die Verarbeitung wurde am eingestellten Limit angehalten.“ | Rest auswählen / später fortsetzen |
| Sync-Konflikt | „Diese Quelle wurde auf zwei Geräten geändert.“ | Fassungen vergleichen |
| Schlüssel ungültig | „Der Dienst hat den Zugangsschlüssel nicht akzeptiert.“ | Schlüssel bearbeiten |

## Visuelle Leitlinien

Ruhige Arbeitsoberfläche, helle und dunkle Darstellung, zurückhaltender petrolfarbener Akzent. Notebookkarten für Übersicht, Zeilenlisten für viele Quellen. Typografie mit Systemschrift; Monospace nur für Code. Keine Chatspalte und keine dekorativen KI-Symbole. NotebookLM dient als Orientierung für Sammlung/Quellenverwaltung; Gestaltung, Texte und Assets werden eigenständig erstellt.

Interaktive Flächen auf Android mindestens 48 dp als internes Designziel. Fokus sichtbar, Beschriftungen vor Icons, Status mit Text und Symbol, ausreichend Kontrast, skalierende Schrift. Reduzierte Bewegung respektieren. Lange Titel umbrechen oder mit zugänglicher vollständiger Bezeichnung anzeigen.

Vor Featureausbau wird der 0.1-Ablauf auf Desktop und Android praktisch durchgespielt. Ein reiner Klickprototyp wäre für den kritischen Share-/Dateizugriff kein Ersatz; diese Grenzen werden bereits in P0 technisch geprüft.
