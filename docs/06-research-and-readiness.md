# Recherche, Risiken und Startbereitschaft

Recherche am 24.09.2026. Quellen sind offizielle Plattformdokumentation oder Originalprojekte. Aussagen über technische Möglichkeiten sind von den vorgeschlagenen Produktentscheidungen und den noch ausstehenden praktischen Tests getrennt.

## Überprüfte Annahmen aus dem alten Chat

| Annahme | Ergebnis | Konsequenz |
| --- | --- | --- |
| OKF sei Markdown plus YAML | Grundprinzip bestätigt; es gibt konkrete Konventionen | Eigenes exportierbares Profil statt beliebigen YAML als OKF auszugeben |
| Extension könne lokale Dateien lesen | Mit Nutzerwahl technisch vorgesehen | Import ist realistisch; dauerhafter Ordnerzugriff braucht gesonderte Prüfung |
| CORS erzwinge generell ein Backend | Für privilegierte Extension-Aufrufe zu pauschal | Hostrechte gezielt nutzen; Content Script und Extension-Origin unterscheiden |
| Lange Importe könnten einfach im Hintergrund laufen | Manifest-V3-Prozesse können enden | Queue persistieren; erste Version verarbeitet im offenen Verwaltungsfenster |
| Android-Teilen funktioniere mit gemeinsamer Web-UI automatisch | Native Eingangsanbindung erforderlich | Kotlin-Brücke und Cold/Warm-Start-Test |
| Google Drive sei auf allen Geräten derselbe lokale Ordner | So nicht belegt | Erst tatsächlichen Gerätepfad prüfen; API-Adapter als Alternative |
| Offizielle YouTube-API liefere fremde Transkripte | Download verlangt Bearbeitungsrechte am Video | Transkriptadapter getrennt vom Videokatalog |
| PDF-Parser liefere vollständiges sauberes Markdown | Nicht zugesichert | Eigene Layoutheuristik, Referenzkorpus und Warnungen |
| Ein API-Anbieter könne „alles“ eines Kanals liefern | Provider haben dokumentierte Grenzen | Erreichbarkeit und Vollständigkeit offen ausweisen |

Belege: [OKF](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md), [Dateizugriff](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [Extension-Netzwerk](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [Service Worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers), [Android Share](https://developer.android.com/develop/ui/compose/sharing/receive), [Android-Speicher](https://developer.android.com/training/data-storage/shared/documents-files), [Caption-Download](https://developers.google.com/youtube/v3/docs/captions/download), [PDF.js](https://mozilla.github.io/pdf.js/), [Kanalauflistung](https://docs.supadata.ai/youtube/channel-videos).

## Wesentliche Risiken und geplante Nachweise

| Risiko | Gewicht | Behandlung | Nachweis-Ticket |
| --- | --- | --- | --- |
| Gespeicherter Eingang geht bei Android-Prozessende verloren | Hoch | Native Erfassung vor Bestätigung, Journal | P0-03/P0-06 |
| Dateispeicher unterstützt erwartete Schreibsemantik nicht | Hoch | Revision zuerst sichern; Rücklesen; Snapshot reparierbar | P0-02/P0-04 |
| Parser verliert relevante Inhalte | Hoch | Inhaltsanker im Referenzkorpus, partielle Ergebnisse kennzeichnen | P0-05, B01, X01–03 |
| Sync überschreibt parallele Bearbeitung | Hoch | Unveränderliche Revisionen, Elternbezug, Konfliktlösung | S02–S04 |
| Gewählter Syncclient bietet Android-Ordner nicht an | Hoch | Reale Zweigeräteprobe vor Providerzusage | S01 |
| YouTube/Provider ändert Verhalten | Mittel bis hoch | Austauschbarer Adapter, Fehlerzustände, Vertragsproben | B05/X04 |
| Massendownload erzeugt unerwartete Kosten | Mittel bis hoch | Auswahl, Requestlimits, keine stillen Providerwechsel | B06/X05 |
| Geheimnisse landen im Notebook | Hoch | Getrennter SecretStore, Export-/Logprüfung | B02 |
| Sehr große Dateien blockieren die UI | Mittel | Worker, begrenzte Parallelität, sichtbare Größenfehler | P0-05/B01 |

Ein Nachweis-Ticket ist ein geplantes Experiment. Es bescheinigt keine bereits vorhandene Funktion und keinen bestandenen Test.

## Kostenmodell für den Eigengebrauch

Die lokale Kernfunktion benötigt keinen von uns betriebenen Server. Externe Suche und Verarbeitung werden über eigene Anbieterzugänge aktiviert. Laufende Kosten hängen von gewählten Tarifen, Metadatenabrufen, Anzahl der Quellen und Wiederholungen ab; diese Vorbereitung bestellt keinen Tarif.

Die App protokolliert providerbezogen Aufrufe, bekannte Verbrauchseinheiten und gesetzte Limits. Eine lokale Verbrauchsanzeige ist nur eine Schätzung; das Anbieterdashboard bleibt für Abrechnung maßgeblich. Ohne aktuellen bestätigten Tarif wird kein Eurobetrag erfunden. Vor einem Batch zeigt die UI ausgewählte Quellen und die erwarteten Requestarten einschließlich Katalog-/Metadatenabrufen. Monatliche Ausgabenlimits im Providerkonto sind zusätzlich einzurichten, soweit verfügbar.

Initiale Providerwahl und Einstellungen stehen in [Architektur](02-architecture.md). Ihre Nutzung muss vollständig abschaltbar bleiben; gespeicherte Inhalte bleiben dabei lesbar und exportierbar.

## Technischer Iststand dieses Arbeitsverzeichnisses

Read-only ermittelt:

| Komponente | Ergebnis |
| --- | --- |
| Ausgangsordner | Zu Beginn nur leere `outputs/` und `work/`; kein vorhandener Appcode |
| Node | v22.23.1 verfügbar |
| npm | 10.9.8 verfügbar |
| pnpm | 11.19.0 verfügbar, aktuell über die bereitgestellte Runtime |
| Git | 2.50.1 verfügbar; noch kein App-Repository angelegt |
| Java | `/usr/bin/java` vorhanden, aber `java_home -V` meldet keine Java Runtime |
| Android Studio | Nicht im geprüften Standardpfad `/Applications/Android Studio.app` vorhanden |
| Android SDK | Nicht im geprüften Standardpfad vorhanden; `adb` nicht im PATH |
| Android-Testgerät | Modell, Android-Version und Verbindung noch nicht erhoben |
| Provider | Keine Schlüssel abgefragt, keine kostenpflichtigen Testaufrufe ausgeführt |

Die Prüfung schließt eine abweichende manuelle Installation an einem anderen Ort nicht aus. Vor Downloads vorhandene alternative Installationen über bekannte Systemeinstellungen bzw. konfigurierten SDK-Pfad prüfen.

Die aktuelle Capacitor-v8-Dokumentation nennt Node 22+ und Android Studio mindestens 2025.2.1; Android Studio bringt ein passendes JDK mit. Diese Voraussetzungen passen als Setupbasis, die konkreten Paket-/SDK-Versionen werden beim Aufbau reproduzierbar festgeschrieben. [Umgebungsvoraussetzungen](https://capacitorjs.com/docs/getting-started/environment-setup).

## Setupauftrag für den ersten Entwicklungsschritt

1. Eigenen Projektunterordner und Git-Repository innerhalb des vorhandenen Arbeitsbereichs anlegen; Dokumentation übernehmen.
2. pnpm-Version, Node-Anforderung und konkrete Abhängigkeiten binden; TypeScript-Core, Extension und Android-Hülle anlegen.
3. Android Studio samt passendem JDK, SDK, Platform Tools und einem Emulatorziel einrichten. Paketversionen aus der tatsächlich gewählten Capacitor-Version ableiten.
4. Produkt-Testbasis: aktuelles Desktop-Chrome, Android 10+ mit aktualisierter WebView als angestrebter Supportumfang; echte Mindestversion nach P0 und Gerätetest festhalten. Weitere Chromium-Browser separat testen, nicht nur aus dem Namen ableiten.
5. P0-02 bis P0-06 ausführen und Ergebnisse mit Umgebung, erwarteten/erhaltenen Ergebnissen und Fehlern dokumentieren.
6. Erst danach den Funktionsumfang des lokalen Kerns ausbauen. API-Schlüssel sind dafür nicht erforderlich.

## Noch benötigte Angaben, zeitlich eingeordnet

Es gibt aktuell keine blockierende Produktfrage. Vor Geräteabnahme werden Android-Modell/-Version und bevorzugter Desktop-Browser erfasst. Vor Syncabnahme wird der tatsächlich benutzte Dateisynchronisationsweg festgelegt. Vor optionalen Live-Providerchecks werden Schlüssel im dafür vorgesehenen lokalen Einstellungsweg hinterlegt, nicht in einer Projektdokumentation. Vor einer öffentlichen Veröffentlichung werden Name, Lizenz und Vertriebsform entschieden.

Diese späteren Angaben verhindern den Beginn des lokalen Kerns nicht. Sie dürfen aber auch nicht durch erfundene Gerätetests oder Kompatibilitätszusagen ersetzt werden.

## Abschlussstatus der Vorbereitung

- Produktziel und Ausschlüsse festgehalten; ursprüngliche Wünsche den Lieferstufen zugeordnet.
- Nutzung zunächst privat und optionale Provider vom Nutzer bestätigt.
- Architektur, Bibliotheksansätze, Plattformgrenzen und konkrete Alternativen dokumentiert.
- Datenformat, Export, Wiederherstellung und Synchronisationsvertrag ausgearbeitet.
- Bedienabläufe, Fehlerzustände und Gestaltungsrichtung festgelegt.
- Umsetzungstickets, Abhängigkeiten und überprüfbare Abnahmen vorhanden.
- Quellen und wesentliche technische Annahmen überprüft.
- Lokale Voraussetzungen erfasst; Android-Setup und praktische Machbarkeitsnachweise ausdrücklich noch offen.

Damit ist die konzeptionelle Vorbereitung abgeschlossen. Der nächste Abschnitt ist die technische Einrichtung und P0-Implementierung; die App selbst ist noch nicht gebaut und die Android-Buildumgebung noch nicht eingerichtet.
