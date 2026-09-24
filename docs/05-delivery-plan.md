# Entwicklungsplan und Abnahme

Status: Alle nachfolgenden Implementierungs- und Testtickets sind noch offen. Die Vorbereitung besteht aus ihrer Ausarbeitung, nicht aus bereits erbrachten Testergebnissen. Entwicklung erfolgt in dieser Reihenfolge; Tests werden passend zum jeweiligen Risiko ergänzt.

## P0: Technische Nachweise zu Beginn des Codings

| Ticket | Aufgabe | Konkretes Fertig-Kriterium | Auswirkung eines Fehlschlags |
| --- | --- | --- | --- |
| P0-01 | Repo/Workspace und gemeinsame Toolchain einrichten | Reproduzierbarer minimaler TypeScript-Build mit Lockfile; keine Secrets im Repo | Setup korrigieren, keine Features darauf stapeln |
| P0-02 | Extension-Dateispeicher prüfen | Ordner wählen, Revision schreiben/lesen, Browser neu starten, Rechteentzug und Wiederanbindung testen | Speicheradapter korrigieren; zunächst expliziter Import/Export als begrenzter Fallback |
| P0-03 | Android-JDK/SDK einrichten; Capacitor mit nativer Share-Brücke | APK baut; Cold/Warm-Share von URL, Text und PDF wird dauerhaft genau einmal erfasst | Native Brücke korrigieren; Architekturentscheidung nur bei fundamentaler Grenze neu bewerten |
| P0-04 | Android-Dateispeicher | Lokaler SAF-Unterordner überlebt Neustart; Teil-/Fehlschreiben und große Datei getestet | App-interner Notebookordner plus klarer Backupweg |
| P0-05 | Parser und Extension-Berechtigungen | Ein Artikel mit Code/Tabelle im aktuellen Tab und über URL; PDF mit Textschicht als Versuch | Extraktionsgrenzen dokumentieren, Fallback festlegen |
| P0-06 | Queue-Abbruch/Wiederaufnahme | App/Tab während Abruf und Speicherung beenden; Neustart ohne verlorenen bestätigten Eingang | Persistenz vor UI-Ausbau korrigieren |

P0 ist der Anfang der Implementierung. Ohne Appcode und reales Gerät kann diese Phase nicht ehrlich als bestanden gelten. Für P0-03 ist zunächst ein Emulator möglich; vor Freigabe von 0.1 folgt ein echtes Android-Gerät.

## 0.1: Lokaler vollständiger Ablauf

| Ticket | Umsetzung | Abnahme / Abhängigkeit |
| --- | --- | --- |
| C01 | Schema, Source/Notebook-IDs, Revisionsschreiben, Reader | Roundtrip mit Umlauten, langen Titeln, unbekannten YAML-Feldern und beschädigter Datei; nach P0-Speichernachweisen |
| C02 | Persistente Eingangsqueue, Fehlercodes, Checkpoints | Ein gespeicherter Eingang bleibt nach Prozessende vorhanden; wiederholtes Event nicht doppelt |
| C03 | Library, Inbox, Notebookverwaltung | Erstellen/umbenennen/archivieren/wiederherstellen; Daten nach Neustart korrekt |
| C04 | TXT/MD, Einfügen, HTML, mehrere URLs | Eigener Referenztext bleibt vollständig; einzelne Fehler isoliert |
| C05 | Lokale Weberfassung und URL-Fetch | Struktur erhalten, unpassende Artikelerkennung sichtbar, optionale Hostrechte korrekt |
| C06 | Duplikate und Aktualisierungsregeln | Gleiche Datei/URL erkannt; berechtigte ähnliche Quellen nicht automatisch gelöscht |
| C07 | Quelle ansehen/editieren/deaktivieren/verschieben | Gespeicherte manuelle Fassung bleibt bei erneutem Abruf erhalten |
| C08 | Zeichen/Wörter/Token-Schätzung | Zählmethode angezeigt; Gesamtumfang passt zur gewählten Auswahl |
| C09 | MD/TXT/ZIP/Ordner/Clipboard | Metadaten, Grenzen, Quellzuordnung und schwierige Markdown-Inhalte korrekt |
| C10 | Backup/Restore und Papierkorb | Wiederherstellung in leeren Speicher inklusive deaktivierter und noch ausstehender Quellen |
| C11 | Gemeinsame UI auf Android und Extension | Hauptablauf auf beiden Plattformen bedienbar; echte Share-Eingänge getestet |

Freigabe 0.1: Notebook mit zehn gemischten Text-/Webquellen erstellen, eine Quelle bearbeiten, eine deaktivieren, eine doppelt hinzufügen, App neu starten, alle Exportmodi ausgeben, Backup in leere Umgebung einspielen. Keine Abweichung bei Inhalt/Identität, keine unerklärten Auslassungen. Fehlende Provider sind erwarteter Zustand dieser Stufe.

## 0.2: Persönliche Beta

| Ticket | Umsetzung | Abnahme |
| --- | --- | --- |
| B01 | PDF-Textadapter | Einspaltig, mehrspaltig, Tabelle, Code, gemischte Scan/Textseiten; bekannte Lücken sichtbar |
| B02 | Provider-Einrichtung, SecretStore und Consent | Deaktivierte Provider erhalten null Requests; Schlüssel nicht in Logs/Export/Sync |
| B03 | Brave-Suche | Trefferliste, Auswahl, weitere Ergebnisse; echter Artikel wird nach Auswahl bezogen |
| B04 | Optionaler Jina-Webreader | Ein bewusst gewählter Abruf klappt; keine automatische Übergabe privater Seiten/Dateien |
| B05 | Supadata-Transkriptadapter | Ausschließlich native Untertitel; tatsächliche Sprache/Segmente; Fehler und asynchrone Antworten behandelt |
| B06 | Kosten-/Fehlersteuerung | Limits, abgebrochene Requests, 429/401/Timeout sauber; keine teure blinde Wiederholung |

Provider-Tickets beginnen mit einem autorisierten kleinen Live-Test bei eingerichteten Schlüsseln. Unit-/Contract-Tests verwenden danach gespeicherte synthetische Antworten und echte Edge-Case-Strukturen ohne Geheimnisse. Live-Anbieteraufrufe sind keine Pflicht bei jedem Build.

## 0.3: Zusätzliche Formate und YouTube-Sammlungen

| Ticket | Umsetzung | Abnahme |
| --- | --- | --- |
| X01 | DOCX-Adapter | Überschriften, Listen, Tabellen, Fußnotenfälle; Warnungen bei nicht übertragbarer Struktur |
| X02 | EPUB-Adapter | Spine-Reihenfolge, Kapitel, Links; DRM/defekte ZIP/überdimensionierte Archive kontrolliert |
| X03 | CSV-Adapter | Quotes, Trennzeichen, leere Zellen, Zeilenumbrüche, Encoding; keine Formelausführung |
| X04 | Kanal/Playlist entdecken und filtern | Einzelwahl, letzte X, seit Datum, alle erreichbaren; Providerlimit sichtbar |
| X05 | Batch-Orchestrierung | Persistierte Auswahl/Video-IDs, Pause, selektiver Retry; ein Video = eine Quelle |
| X06 | Große Kataloge | Beim Providerlimit auf Teilmenge hinweisen oder paginierenden offiziellen Katalogadapter anbieten |

Abnahme: Eine Testplaylist mit erreichbaren und nicht verfügbaren Einträgen importieren, nach einem Teil der Quellen pausieren, App beenden und fortsetzen. Bereits gespeicherte Videos werden nicht erneut angelegt. Gesamtzahlen im Abschlussbericht lassen sich aus Einzelzuständen herleiten. Ein simulierter Katalog oberhalb des Adapterlimits erhält keine falsche Vollständigkeitsmeldung.

## 1.0: Geräteübergreifende Nutzung

| Ticket | Umsetzung | Abnahme |
| --- | --- | --- |
| S01 | Konkreten Syncclient-/Ordnerpfad erproben | Android und Desktop können dieselben unveränderlichen Transportdateien lesen/schreiben; Offlinefall geprüft |
| S02 | Revisionsgraph und Transportadapter | Teildateien zurückstellen, Hash prüfen, Nachfahren übernehmen, Konfliktköpfe bewahren |
| S03 | Konflikt-UI und Tombstones | Beide ändern dieselbe Quelle offline; Löschen gegen Editieren; Notebooklöschung gegen neue Quelle |
| S04 | Wiederanbindung und Wiederherstellung | Lange offline, fehlender Ordner, doppelte Lieferung, verkehrte Reihenfolge, Neustart |
| S05 | Backup mit Synczustand | Neue Installation kann aus Backup lesen, danach ohne unerkannte Dubletten synchronisieren |
| S06 | Gesamtabnahme und Dokumentation | F01–F21 erfüllt; mindestens ein getesteter, exakt beschriebener Geräte-/Syncpfad |

S01 kann zur Risikoklärung früher stattfinden, ohne gleich den gesamten Sync zu bauen. Falls Google Drive über den ausgewählten Android-Dateizugriff nicht funktioniert, entscheidet die praktische Anforderung zwischen einem funktionierenden Ordnertransport und einem eigenen Drive-API-Adapter. Die App darf keinen ungetesteten Provider als unterstützt aufführen.

## Referenzkorpus und Prüfstrategie

Eigene oder ausdrücklich nutzbare kleine Fixtures bilden Inhaltstreue ab: Webartikel mit Navigationsballast; Dokumentation mit Code und Tabelle; Forum mit nur teilweise geladenen Beiträgen; HTML mit schädlichen Elementen; TXT/MD mit Umlauten und Code-Fences; PDF mit Text, Scan und Spalten; DOCX mit Fußnoten/Tabelle; EPUB mit abweichender Dateinamens-/Lesereihenfolge; CSV mit mehrzeiligen Feldern; Transkriptsegmente mit Zeitstempeln und Sprachwechsel.

Je Fixture werden erwartete Fakten und Struktur markiert: bestimmte Absätze, Zahlen, Tabellenzellen und Codezeilen müssen erhalten bleiben. Ziel ist keine Bytegleichheit für HTML/PDF-Konverter. TXT/MD ohne aktivierte Normalisierung sollen dagegen bis auf die erklärte Encoding-/Zeilenendenumsetzung texttreu sein. Optional generierte Beschreibungen oder Zusammenfassungen sind ein Fehler.

| Prüfgebiet | Notwendige Fälle |
| --- | --- |
| Format | YAML-Titel mit Doppelpunkt/Zeilenumbruch; unbekannte Felder; fehlende Metadaten; zukünftige Schemaversion |
| Export | Gleiche Quellen in Einzel-/Gesamtdatei; geschlossene Code-Fences; relative Links; TXT-Konvertierung; Snapshot während Import |
| Persistenz | Prozessende zwischen Eingang/Revision/Snapshot/Index; Speicher voll; Rechte entzogen; kaputte Revisionsdatei |
| Identität | YouTube-URL-Varianten; relevante Queryparameter; signierte URL; gleiche Inhalte verschiedener Autoren |
| Netzwerk | Offline, 403, 404, 429 mit Retry-After, 5xx, Redirect, Größenlimit, ungültige Providerantwort |
| Plattform | Android Cold/Warm Share, mehrere Dateien, temporäre URI; Extension-Neustart und Tabwechsel |
| Schutz privater Daten | Deaktivierte Provider; Logs/ZIP ohne Schlüssel; keine automatisch geladenen Trackingbilder |
| Sync | Gleichzeitige Edits, Delete/Edit, verzögerte Eltern, Teilübertragung, Duplikatlieferung, verschiedene Geräteuhren |

Keine Tests, die lediglich Getter/Setter spiegeln. Fokus auf Datenverlust, Inhaltstreue, Plattformgrenzen und konkrete Nutzerabläufe. Format-/Domain-Checks nach Änderungen an Verträgen; End-to-End-Smokes nach betroffenen UI-/Plattformänderungen.

## Anfangsgrenzen für kontrollierte Verarbeitung

Dies sind Produktdefaults, keine behaupteten Grenzen der Bibliotheken:

- Maximal 25 MiB pro ausgewählter Eingabedatei; größere Datei explizit ablehnen, später konfigurierbar.
- Maximal 10 MiB HTML/Extraktionstext je Quelle; Überschreitung liefert einen Größenfehler, keine gekürzte „fertige“ Quelle.
- ZIP-basierte Dokumente: maximal 200 MiB entpackt und 10.000 Einträge; zusätzlich Pfad-/Tiefeprüfung.
- Gleichzeitig höchstens zwei lokale Dateikonvertierungen am Desktop, eine auf Android; initial eine externe Verarbeitung pro Provider.
- Initial 100 neue Videos pro bewusst gestartetem Batchabschnitt. Auflistung und Metadatenabrufe haben ebenfalls dokumentierte Requestlimits.
- Standard-Timeout für einfache Webabrufe 30 Sekunden; Provider können einen eigenen begrenzten Timeout deklarieren.
- Transiente rein lokale/ungefährlich wiederholbare Abrufe höchstens dreimal mit Backoff wiederholen. `Retry-After` beachten. Bei kostenpflichtigem Request mit unklarem Abschluss zuerst gespeicherte Job-ID prüfen, sonst Nutzeraktion verlangen.

Die Limits werden im P0-/Betatest gemessen und nachvollziehbar angepasst. Laufzeit- und Speichergrenzen dürfen eine Quelle stoppen; sie dürfen nicht ihre Vollständigkeit vortäuschen.

## Aufwand und Veröffentlichung

Keine belastbare Kalenderzusage vor P0. Größte Unsicherheiten sind Android-Dateizugriff, Extraktionsqualität schwieriger Dokumente, Providerverhalten und Sync. Die Ticketreihenfolge reduziert diese Risiken früh. Der Nutzer erhält pro Stufe ein nutzbares, überprüfbares Ergebnis.

Eigene Nutzung: Erweiterung lokal laden, APK auf Testgerät installieren, Installations-/Backupanleitung beilegen. Öffentliches Release ist ein separates Paket: Name, Lizenz, Abhängigkeitslizenzen, aktuelle Store-Anforderungen, Signierung/Schlüsselbackup, Datenschutztexte, Updates und Support festlegen. Dafür wurden keine Konten angelegt und keine Einreichungen vorgenommen.
