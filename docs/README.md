# Context Builder — Vorbereitung zur Entwicklung

> Historische Planungsbaseline. Der aktuelle Implementierungsstand, die Änderung zum manuellen Datei-Abgleich und offene Testnachweise stehen in [07-implementation-status.md](07-implementation-status.md). Die praktische Testanleitung steht in [08-test-guide.md](08-test-guide.md).

Stand: 24. September 2026 · Planungsbaseline 1.0 · Sprache: Deutsch

Die Produkt- und Architekturvorbereitung ist als umsetzbare Ausgangsbasis dokumentiert. Es wurde noch kein Anwendungscode erstellt. Die technische Machbarkeit ist anhand offizieller Dokumentation geprüft; geräteabhängige Annahmen erhalten kurze, messbare Prototypprüfungen zu Beginn der Implementierung. Diese Prüfungen sind noch nicht durchgeführt.

## Verbindlicher Ausgangspunkt

Context Builder sammelt Quellen, extrahiert ihren verfügbaren Text, bereinigt ihn und exportiert ihn mit nachvollziehbarer Herkunft für beliebige Modelle und Agenten. Vollständigkeit und Portabilität bestimmen das Produkt. Es gibt keine Zusammenfassungen, Antworten, Lernkarten oder eingebauten KI-Chat.

Daryl hat am 24.09.2026 bestätigt: Die erste Version dient zunächst dem eigenen Gebrauch; eine Veröffentlichung bleibt möglich. Externe Dienste mit eigenen API-Schlüsseln und möglichen Kosten sind erlaubt, wenn sie bewusst aktiviert werden. Daraus folgt keine Aktivierung oder Bestellung eines Dienstes durch diese Planung.

Anforderungen stammen aus „App: Context Builder“, Chat-ID `6a97c45b-cd68-83eb-9de6-859e039fad46`, insbesondere den dortigen direkten Nutzerergänzungen. Frühere Assistentenvorschläge wurden als Vorschläge behandelt und technisch überprüft.

## Entscheidungen

| Bereich | Festlegung für den Entwicklungsstart |
| --- | --- |
| Zielplattformen | Android und Chromium-Erweiterung; zunächst Chrome als Desktop-Testplattform |
| Gemeinsame Technik | TypeScript, React, gemeinsame Domänenlogik und UI-Komponenten |
| Plattformhüllen | WXT/Manifest V3 für die Erweiterung; Capacitor plus schmale Kotlin-Brücken für Android |
| Daten | Lokale Markdown-Dateien und versionierte Metadaten; Datenbanken nur für ableitbare Indizes bzw. lokale Auftragsverwaltung |
| Export | Markdown, echter Plain Text, Markdown-Ordner/ZIP mit OKF-v0.2-Profil |
| Android-Einstieg | Teilen-Menü → Notebook oder Inbox → dauerhafte Erfassung → Verarbeitung |
| Web | Geöffnete Seite lokal erfassen; URL-Abruf separat; externe Verarbeitung optional |
| YouTube | Bestehende Untertitel; zunächst optionaler Supadata-Adapter mit ausschließlich `native`-Modus |
| Websuche | Optionaler Brave-Search-Adapter; Ergebnisse wählen und anschließend importieren |
| Synchronisation | Separater Ausbauschritt mit überprüfbarer Konfliktbehandlung; keine pauschale Google-Drive-Kompatibilitätszusage |
| Bereitstellung | Lokale Entwicklungsinstallation und Android-APK für den eigenen Gebrauch |
| Produktname | „Context Builder“ als Arbeitsname; Markenprüfung erst vor Veröffentlichung |

Dies sind Arbeitsentscheidungen für die Umsetzung, keine nachträglich behaupteten Einzelentscheidungen des Nutzers. Technische Auswahl und Begründungen: [Architektur](02-architecture.md). Belege: [Recherche](06-research-and-readiness.md).

## Dokumente

1. [Produktumfang und Anforderungen](01-product.md) — Ziel, Grenzen, Prioritäten, vollständige Anforderungszuordnung.
2. [Architektur und technische Entscheidungen](02-architecture.md) — Plattformen, Verarbeitung, Speicher, Schnittstellen, Provider.
3. [Datenformat, Export und Synchronisation](03-data-and-export.md) — Datenmodell, YAML, Identität, Versionierung und Konflikte.
4. [Bedienkonzept](04-user-experience.md) — Bildschirme, Abläufe, Zustände, Texte und Gestaltung.
5. [Entwicklungsplan und Abnahme](05-delivery-plan.md) — konkrete Arbeitspakete, Abhängigkeiten, Tests und Freigabekriterien.
6. [Recherche, Risiken und Startbereitschaft](06-research-and-readiness.md) — geprüfte Annahmen, Quellen und verbleibende Nachweise.

## Entwicklungsstufen

| Stufe | Nutzbares Ergebnis | Was bewusst danach kommt |
| --- | --- | --- |
| P0 — technische Nachweise | Speicher/Android-Share/Extension/Parser durch kleine Prototypen bestätigt | Noch keine fertige App |
| 0.1 — lokaler Kern | Beide Plattformen; Notebooks, Inbox, Web, TXT/MD/HTML, Bearbeitung, Duplikate, Export und Rückimport | PDF, YouTube, Suche, zusätzliche Dateiformate, Sync |
| 0.2 — persönliche Beta | Zusätzlich PDF, YouTube-Einzelvideo, Suche und externe Webverarbeitung | DOCX/EPUB/CSV, Kanal/Playlist, Sync |
| 0.3 — Quellen komplett | Zusätzlich DOCX/EPUB/CSV und Kanal-/Playlist-Import mit Filtern | Mehrgeräte-Sync |
| 1.0 — vollständiger erster Produktumfang | Zusätzlich mindestens ein dokumentiert getesteter Synchronisationsweg und Konfliktlösung | Weitere Sync-Provider, OCR, MCP/CLI/API und Store-Veröffentlichung |

Android bleibt eine Kernplattform und ist bereits in 0.1 enthalten. Die kurze Desktop-Prototypphase dient dem schnelleren Prüfen des gemeinsamen Kerns, sie verschiebt Android nicht auf unbestimmte Zeit.

## Was vor dem Start noch offen ist

Keine unbeantwortete Produktfrage blockiert den ersten Implementierungsschritt. Nicht erbrachte technische Nachweise sind im Plan als P0-Tickets ausgewiesen. Ein nutzbares Android-JDK/SDK wurde auf diesem Rechner nicht gefunden; seine Einrichtung gehört an den Anfang der Android-Implementierung. API-Schlüssel werden erst beim Einrichten der optionalen Provider benötigt. Ein echtes Android-Testgerät und dessen Version werden vor der Geräteabnahme erfasst.

Nächster konkreter Arbeitsschritt: P0-01 bis P0-03 aus dem Entwicklungsplan, anschließend Grundgerüst und der erste vollständige Ablauf „Quelle hinzufügen → prüfen → speichern → exportieren“. SDK-Installation, Provideraufrufe, externe Konten und Veröffentlichung wurden im Rahmen dieser Vorbereitung nicht vorgenommen.
