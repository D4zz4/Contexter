# Architektur und technische Entscheidungen

## Systemgrenzen

Android und die Erweiterung verwenden gemeinsame Domänenlogik, Parser, Exporter und UI-Komponenten. Plattformzugriff ist über Ports gekapselt. Quellinhalte verlassen das Gerät nur für einen gewählten Originalabruf, einen aktivierten Provider oder einen eingerichteten Synchronisationsweg.

Geplante Verarbeitung: Eingang dauerhaft erfassen → Quelltyp erkennen → Dublettenkandidaten prüfen → Inhalt beziehen → extrahieren → normalisieren → Qualität kennzeichnen → speichern → lokalen Index aktualisieren. Suche und Kanalauflistung liefern zuerst Kandidaten; erst ihre Auswahl erzeugt Importaufträge.

## ADR-001: Gemeinsamer TypeScript-Kern

Entscheidung: pnpm-Workspace mit TypeScript, React und Vite-basiertem Build. WXT erstellt die Erweiterung; Capacitor bettet die Android-Oberfläche ein. React wird als gemeinsame UI-Schicht gewählt, weil derselbe DOM-basierte Editor und dieselben Komponenten auf beiden Zielplattformen verwendbar sind. Das ist eine projektspezifische Abwägung. [WXT](https://wxt.dev/guide/introduction.html), [React-Unterstützung](https://wxt.dev/guide/essentials/frontend-frameworks.html), [Capacitor](https://capacitorjs.com/docs).

Kotlin wird auf Android für Share-Eingang, URI-Zugriff, sichere Schlüsselablage und gegebenenfalls Schreibtransaktionen verwendet. Capacitor erlaubt eigene native Plugins; der dafür nötige Code ist eingeplant und wird nicht einem ungeprüften Community-Plugin zugeschrieben. [Plugin-Schnittstelle](https://capacitorjs.com/docs/plugins/android).

| Alternative | Abwägung für dieses Projekt |
| --- | --- |
| Kotlin/Compose plus eigene Extension-UI | Gute native Android-Kontrolle, aber zwei UI-Implementierungen; Rückfalloption bei nicht erfüllbaren Android-Anforderungen |
| Flutter | Gemeinsame App-UI möglich, Browser-DOM-Extraktion und Extension-Integration bleiben zusätzliche Grenzen; hier kein überzeugender Vorteil |
| Reine Web-App/PWA | Keine verlässliche Grundlage für die gewünschten Extension- und Android-Dateiabläufe ohne Zusatzprüfung |
| Native Desktop-App | Zusätzliche Installation und Plattformpflege; aktuell keine Anforderung |

Die P0-Android-Prüfung entscheidet, ob die schmale native Brücke genügt. Bei Fehlschlag zunächst die konkrete Brücke erweitern; vor einem vollständigen Plattformwechsel die Auswirkungen benennen.

## ADR-002: Plattformhüllen und Hintergrundarbeit

Die Erweiterung bietet eine vollständige Verwaltungsseite in einem eigenen Tab. Das Popup dient nur dem schnellen Erfassen und Öffnen der Library. DOM-Erfassung läuft per Content Script nach einer Nutzeraktion. Service Worker koordinieren Ereignisse; rechenintensive Parser laufen in Workern eines geöffneten Extension-Tabs. Manifest-V3-Service-Worker können beendet werden und besitzen keinen DOM. Deshalb müssen Aufträge und Fortschritt außerhalb ihres Arbeitsspeichers liegen. [Chrome-Lebenszyklus](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers).

Version 0.1 verarbeitet lange Importe im geöffneten Verwaltungsfenster. Schließt es, wird der letzte dauerhaft gespeicherte Schritt beim nächsten Öffnen fortgesetzt. Eine dauerhaft weiterlaufende Hintergrundverarbeitung wird nicht versprochen. Automatische Wiederaufnahme holt keine neuen Berechtigungen ein und startet keine nicht bestätigten externen Aufträge.

Auf Android speichert der native Share-Eingang URI/Text und nötige Dateikopien dauerhaft, bevor „Gespeichert“ erscheint. Temporäre Leserechte dürfen nicht erst später genutzt werden. Die gemeinsame Verarbeitung läuft zunächst bei geöffneter App; Android-Hintergrundarbeit ist eine separate Erweiterung. WorkManager wäre für persistente native Aufgaben geeignet, hält jedoch nicht automatisch die JavaScript-UI am Leben. [Android-Empfang](https://developer.android.com/develop/ui/compose/sharing/receive), [WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent).

## ADR-003: Plattformzugriff

| Port | Vertrag | Browser | Android |
| --- | --- | --- | --- |
| NotebookStore | Lesen, Listen, Revision schreiben, Restore; erwartete Basisrevision prüfen | Gewählter Ordner über File System Access | Lokaler dedizierter Notebook-Ordner über native Dateibrücke/SAF |
| CaptureInbox | Eingang dauerhaft vor UI-Bestätigung speichern | IndexedDB als lokale Eingangsqueue | Native lokale Eingangsdateien und Journal |
| ContentFetcher | Begrenzte Bytes/Streams, Timeout, Abbruch, HTTP-Metadaten | Extension-Origin mit passenden Hostrechten | Kontrollierter nativer HTTP-Adapter |
| SourceAdapter | Erkennen und extrahieren; Ergebnis plus Warnungen | Gemeinsamer Code; DOM-Worker wo nötig | Gemeinsamer Code; Plattformzugriff über Ports |
| DiscoveryProvider | Suchtreffer, Seitencursor, Anbieterkennung | Optionaler API-Aufruf | Optionaler API-Aufruf |
| VideoCatalogProvider | Video-IDs/Metadaten, Cursor oder erkennbare Grenze | Optional | Optional |
| TranscriptProvider | Vorhandene Segmente, Sprache, Zeitbezug | Optional | Optional |
| SecretStore | Schlüssel setzen, lesen, löschen; niemals exportieren | Sitzungsspeicher; optional passwortgeschützter Tresor | Android-Keystore-gestützte Verschlüsselung |
| SyncTransport | Unveränderliche Revisionsdateien auflisten, lesen, hinzufügen | Freigegebener Austauschordner | Nachgewiesener SAF-/lokaler Austauschordner |

Portmethoden liefern strukturierte Fehler und akzeptieren, wo relevant, Abbruchsignal, Größenlimit und Auftrag-ID. Parser kennen keine UI, Geheimnisse, Dateisystempfade oder konkreten Anbieterzugänge. Echte API-Antworten werden am Adapterrand validiert.

## ADR-004: Dateihoheit

Notebooks sind normale Dateien. Der lokale Index ist jederzeit aus den Notebooks rekonstruierbar. Jobzustände, Zugangsdaten, Geräteschlüssel und Cache bleiben gerätespezifisch. Ein Ingestionsjournal darf die einzige Kopie eines noch nicht verarbeiteten Eingangs enthalten; deshalb gehört es in vollständige Backups, aber nicht in Kontext-Exporte.

Desktop: Der Nutzer wählt einen dedizierten lokalen Ordner. Gespeicherte Handles werden vor Nutzung auf Berechtigung geprüft; bei fehlendem Zugriff wartet die Queue. File System Access bietet Ordnerzugriff und Dateischreiben, aber keine pauschale Garantie eines dauerhaft verfügbaren Ordners. [Chrome-Dateizugriff](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

Android: Zunächst einen lokalen, ausdrücklich ausgewählten Unterordner verwenden; SAF-Operationen einschließlich Schreib-/Wiederherstellungssemantik im P0-Prototyp prüfen. Ein app-interner Dateispeicher ist der technische Fallback mit klarer Export-/Backupfunktion; UI erklärt dann, dass eine Deinstallation lokale Appdaten entfernen kann. Cloudanbieter nicht als identisch zum lokalen Dateisystem behandeln. [Android-Dateizugriff](https://developer.android.com/training/data-storage/shared/documents-files).

IndexedDB ist für Browser-Indizes und persistente Queue geeignet. Zugangsdaten und eigentliche Notebookbestände werden nicht in `storage.sync` abgelegt. [Extension-Speicher](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).

## ADR-005: Extraktionsbausteine

| Quelle | Gewählter Ansatz | Qualitätsgrenze |
| --- | --- | --- |
| Aktueller Tab | DOM-Kopie → Mozilla Readability → Turndown mit Tabellenregeln | Nur geladener Inhalt; Artikelerkennung kann ungeeignet für Foren sein |
| Web-URL/HTML | HTML beziehen, ohne Seitenskripte auszuführen; danach gleicher Parser | Dynamischer Inhalt fehlt gegebenenfalls |
| TXT/MD | Encoding erkennen/auswählen, Text erhalten | Unklare Kodierung benötigt Nutzerkorrektur |
| PDF | PDF.js-Textobjekte je Seite → eigene Strukturheuristik | Keine allgemeine Layout- oder Tabellentreue, keine OCR |
| DOCX | Mammoth → bereinigtes HTML → Markdown | Layout wird nicht eins zu eins abgebildet |
| EPUB | ZIP/OPF lesen, XHTML in Spine-Reihenfolge konvertieren | DRM nicht unterstützt; aktiven Inhalt nie ausführen |
| CSV | Standardkonformer CSV-Parser → Markdown-Tabelle | Encoding, Trennzeichen, mehrzeilige Zellen beachten |
| YouTube | Native Untertitel vom gewählten TranscriptProvider | Verfügbarkeit hängt von Quelle und Provider ab |

Quellen zu den Bausteinen: [Readability](https://github.com/mozilla/readability), [Turndown](https://github.com/mixmark-io/turndown), [PDF.js](https://mozilla.github.io/pdf.js/), [Mammoth](https://github.com/mwilliamson/mammoth.js), [EPUB-Spezifikation](https://www.w3.org/TR/epub-33/). Parser und Konverter sind Bausteine; Qualität und Sicherheit werden mit eigenen Referenzfällen geprüft.

Bei mangelhafter Artikelerkennung wählt der Nutzer „Geladenen Seiteninhalt übernehmen“ oder fügt Text ein. Der Fallback bekommt einen sichtbaren Hinweis auf möglichen Seitenballast. Links absolut auflösen; Code-Inhalte, Tabellenzellen und Zahlen nicht durch aggressive Normalisierung verändern. Bilder nur mit vorhandenem Alt-Text/Unterschrift referenzieren; keine KI-generierten Beschreibungen.

## ADR-006: Optionale Provider

| Fähigkeit | Erstes Ziel | Aktivierung und Fallback |
| --- | --- | --- |
| Websuche | Brave Search API | Eigener Schlüssel; ohne Einrichtung bleibt manuelles Hinzufügen verfügbar |
| Schwierige öffentliche Webseite | Jina Reader | URL explizit an den Dienst; lokale Dateien und authentifizierte Seiten werden nicht automatisch hochgeladen |
| YouTube-Transkript | Supadata | Eigener Schlüssel; ausschließlich bestehende Untertitel; manuelles Einfügen vorhandenen Transkripttexts als lokaler Ausweg |
| Kanal/Playlist | Supadata-Katalogadapter; alternativ offizieller YouTube-Katalogadapter | Vollständigkeit/Limit melden; für große Sammlungen paginierbaren Adapter einsetzen |

[Brave-API](https://api-dashboard.search.brave.com/documentation/quickstart), [Jina Reader](https://jina.ai/reader/), [Supadata-Transkripte](https://docs.supadata.ai/get-transcript).

Die Auswahl ist eine konkrete Startempfehlung, keine Zusage zur Qualität jeder Quelle. Zugang, Antwortschema, Netzpfad und Kostenkontrolle werden vor Integration durch einen kleinen echten Test bestätigt. Jina wird nur als Reader genutzt; Zusammenfassungs-/Anreicherungsoptionen werden nicht aktiviert. Supadata-Aufrufe setzen `mode=native`; `auto` und `generate` sind im Adapter nicht auswählbar. Leere oder fehlende Transkripte ergeben keinen erfolgreichen Volltext.

Kanal- und Playlistauflistung von Supadata dokumentieren höchstens 5.000 IDs. Die Oberfläche darf daraus nicht unbegrenzte Vollständigkeit ableiten. Der offizielle YouTube-Weg kann Kanäle/Upload-Playlists und paginierte Playlist-Einträge beziehen, ersetzt aber nicht den fremden Transkriptzugriff. [Kanalgrenze](https://docs.supadata.ai/youtube/channel-videos), [Playlistgrenze](https://docs.supadata.ai/youtube/playlist-videos), [YouTube-Kanäle](https://developers.google.com/youtube/v3/docs/channels/list), [Playlist-Paginierung](https://developers.google.com/youtube/v3/docs/playlistItems/list).

## ADR-007: Netzwerk, Geheimnisse und Ausgabe

Aktuelle Tabs über `activeTab` und `scripting` erfassen. Für eingefügte fremde URLs passende optionale Hostrechte beim Start anfordern; Requests aus der Extension-Origin ausführen. Ein Content Script hat dadurch nicht automatisch CORS-freien Zugriff. [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Cross-Origin-Aufrufe](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

Android verwendet einen kontrollierten nativen Netzwerkadapter; Capacitor bietet eine HTTP-Brücke, deren Größen-/Speicherverhalten im Prototyp zu testen ist. [Capacitor HTTP](https://capacitorjs.com/docs/apis/http).

Projektregeln: API-Schlüssel nie in Repository, Logs, Exporte oder synchronisierte Ordner. Android verschlüsselt gespeicherte Schlüssel mit Keystore-geschütztem Schlüsselmaterial. Im Browser ist Sitzungsspeicherung der Standard; dauerhafte Speicherung nur als verschlüsselter, durch Nutzerpasswort entsperrter Tresor. Ein daneben abgelegter Entschlüsselungsschlüssel wäre keine wirksame Trennung. [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

Importiertes HTML/Markdown gilt als Dateninhalt: Skripte, Ereignishandler, ausführbare URLs, eingebettete Frames und automatische Remote-Bildabrufe werden in der Vorschau blockiert. Keine entfernten Skripte laden. Dateinamen werden aus IDs erzeugt; ZIP-Pfade dürfen nicht aus dem Zielverzeichnis ausbrechen. Netzwerkfreigaben sind je Auftrag und Ziel begrenzt; Webseiten können nicht über beliebige Nachrichten einen privilegierten Fetch auslösen.

## Geplante Repository-Struktur

```text
apps/extension/       WXT-Einstiegspunkte und Plattformadapter
apps/android/         Capacitor-Projekt und Kotlin-Brücken
packages/domain/      Modelle, Regeln, Aufträge, Fehlercodes
packages/extractors/  Lokale Parser, Normalisierung, Qualität
packages/providers/   Suche, Webreader, YouTube-Adapter
packages/storage/     Dateivertrag, Revisionen, Import/Export
packages/ui/          Gemeinsame Screens und Komponenten
packages/test-data/   Eigene/rechtmäßig nutzbare Referenzquellen
docs/                 Produkt, ADRs, Verträge, Prüfergebnisse
```

Versionsnummern der Abhängigkeiten werden beim ersten tatsächlichen Setup anhand der dann kompatiblen Releases festgeschrieben und im Lockfile gebunden. Kein Versionsraten aus der Planung. Tests: gezielte Domänen-/Formatprüfungen, Browser-Abläufe und Android-Instrumentierung für native Grenzen.
