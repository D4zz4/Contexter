# Contexter: Weg in die Stores

Stand: 30. September 2026. Koordination über den Chat **Contexter: Main**. Keine Store-Einreichung und keine Veröffentlichung ist bisher beauftragt oder erfolgt.

## Arbeitsaufteilung

| Fach-Chat | Ergebnis | Chat-ID |
| --- | --- | --- |
| Chrome Web Store | Store-Paket, Manifest, Berechtigungen, Listing und Review | `01a0f349-e494-76e1-9b53-9052d16b17b0` |
| Google Play | Konto, Tests, AAB, App-Inhalte und Store-Listing | `01a0f34a-07c9-7d52-bb5c-ec13d50a6a30` |
| Release Engineering | Signierung, Versionspfad, CI und Datenerhalt beim Upgrade | `01a0f349-eeec-7e82-8dd7-71a33c6c0d0d` |
| Datenschutz & Store-Review | Tatsächliche Datenflüsse, Offenlegungen, Lizenzen und Richtlinienrisiken | `01a0f349-fcc4-7d63-82ab-71c179e089ec` |

Die Chats sollen ihre Berichte als getrennte Dateien in diesem Ordner ablegen und Rückfragen an Main melden. Ein aktiver Check-in prüft sie alle 30 Minuten und bleibt bei unverändertem Stand still. Ihre ersten Läufe wurden durch ein Codex-Nutzungslimit unterbrochen; die Koordination versucht eine Fortsetzung nach dem gemeldeten Reset, statt neue Chats anzulegen.

## Bereits sichere technische Befunde

- Die derzeitige Android-Datei ist eine **Debug-APK**. Für eine neue Google-Play-App ist ein signiertes **Android App Bundle (AAB)** nötig; Play App Signing gehört zum Uploadpfad. [Android App Bundles](https://developer.android.com/guide/app-bundle), [Upload und Play App Signing](https://developer.android.com/studio/publish/upload-bundle).
- Der Wechsel von einer Debug-Signatur zu einer Store-Signatur ist kein normales Update über dieselbe Installation. Vor einem Wechsel muss der Export/Import der lokalen Bibliothek auf dem echten Gerät geprüft und eine externe Sicherung erstellt werden. Der Release-Engineering-Bericht untersucht den genauen Migrationspfad.
- Das bisherige ZIP für das **lokale Laden** enthält einen übergeordneten Ordner `chrome-mv3/`. Für den Chrome Web Store muss `manifest.json` dagegen direkt im **ZIP-Root** liegen; es braucht ein eigenes Store-Paket. Der aktuelle Manifest-Build enthält außerdem noch keine Icon-Einträge. [Chrome: Erweiterung vorbereiten](https://developer.chrome.com/docs/webstore/prepare), [Manifest-Icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons).
- Chrome verlangt ein registriertes Entwicklerkonto; dessen Eröffnung erfordert laut Google eine einmalige Gebühr. Eine Store-Einreichung braucht außerdem Listing-, Datenschutz- und Distributionsangaben. [Chrome: Konto registrieren](https://developer.chrome.com/docs/webstore/register/), [Veröffentlichen](https://developer.chrome.com/docs/webstore/publish).
- Für persönliche Google-Play-Konten, die nach dem 13. November 2023 eröffnet wurden, ist vor öffentlicher Produktion ein geschlossener Test mit mindestens zwölf fortlaufend angemeldeten Testpersonen über mindestens 14 Tage erforderlich. Ob das hier gilt, hängt vom vorhandenen oder gewählten Konto ab. [Google Play: Testanforderungen](https://support.google.com/googleplay/android-developer/answer/14151465).
- Google Play verlangt auch bei Apps ohne eigene Datensammlung eine Data-Safety-Erklärung und eine verlinkte Datenschutzerklärung; Ausnahmen für ausschließlich interne Testtracks sind zu prüfen. Die konkreten Antworten müssen den tatsächlichen Netzwerk- und Drittanbieterfunktionen von Contexter entsprechen. [Google Play: Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469).

## Vorgesehene Etappen

1. Vier Fachberichte abschließen und ihre Befunde zu einer gemeinsamen Blocker-/Entscheidungsliste zusammenführen.
2. Nutzerentscheidungen zu Entwicklerkonten, öffentlicher oder zunächst begrenzter Freigabe, Name/Marke und Datenschutzerklärungs-URL einholen.
3. Datenerhalt beim Wechsel von Testinstallationen zu Store-Installationen festlegen und auf realen Geräten testen.
4. Technische Store-Lücken beheben; signiertes AAB und Store-ZIP reproduzierbar erzeugen, ohne private Schlüssel im Repository zu speichern.
5. Store-Inhalte, Datenschutzangaben und Review-Testanleitung fertigstellen; erst nach ausdrücklicher Freigabe in die Konten hochladen.
6. Zunächst Store-Testkanäle, dann nach bestandener Prüfung und erneuter Freigabe öffentliche Veröffentlichung.

## Noch nicht vom Nutzer zu entscheiden, bevor die Fachberichte vorliegen

- Existieren bereits ein Chrome-Web-Store-Entwicklerkonto und ein Google-Play-Console-Konto? Falls ja: persönliches oder Organisationskonto und aus welchem Jahr?
- Soll die erste Store-Version öffentlich auffindbar sein oder zunächst nur über begrenzte Testkanäle laufen?
- Welche dauerhaft erreichbare Website/URL soll Datenschutzerklärung und Support-Kontakt tragen?
- Gibt es wichtige Daten in der bisherigen Android-Debug-App oder der entpackten Chrome-Erweiterung, die vor einem Store-Wechsel migriert werden müssen? Standardannahme: **ja**; nie deinstallieren, bevor eine geprüfte Sicherung existiert.

Konten, Zahlungen, Signaturschlüssel, Uploads und öffentliche Freigaben bleiben ausdrücklich beim Nutzer beziehungsweise brauchen eine gesonderte Entscheidung.
