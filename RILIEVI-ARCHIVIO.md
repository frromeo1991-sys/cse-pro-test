# CSE PRO - rilievi indipendenti e archivio

Aggiornamento del 13 ottobre 2026. Integra le fasi precedenti, senza ricostruire l'app.

## File interessati

- `index.html`: metadata e foto nel singolo rilievo; finestre per selezione, assegnazione delle vecchie foto ed eliminazione.
- `finding-ui.js` (nuovo): selettori grandi, valori riutilizzabili, gallerie per rilievo e conferma di cancellazione.
- `script.js`: apertura/salvataggio dei rilievi, ordinamento e presentazione archivio, eliminazione, impaginazione PDF e firma finale.
- `report-model.js`: compatibilita' con i dati precedenti, associazioni fotografiche e modello PDF.
- `storage.js`: eliminazione transazionale, valori dei selettori e contatori persistenti della numerazione.
- `style2.css`: controlli touch, dialog, card separate e layout responsive.
- Documentazione aggiornata in questo file, `AGGIORNAMENTO-CSE-PRO.md` e `ARCHIVIO-INDEXEDDB.md`.

`media.js`, libreria jsPDF, immagini, branding, endpoint e richiesta AI non sono stati sostituiti.

## Analisi e storage

Il vecchio errore di quota era causato dagli archivi JSON localStorage contenenti immagini Base64, anche negli snapshot. Il PDF completo non era archiviato: veniva generato al momento.

Nella versione di partenza di questa fase il trasferimento a IndexedDB era gia' implementato. E' stato conservato e nuovamente verificato. Database `CSEProArchive`, versione 1:

| Store | Dati |
| --- | --- |
| `sites` | Cantieri e configurazioni |
| `inspections` | Sopralluoghi, snapshot e rilievi annidati |
| `media` | Fotografie Blob, deduplicate tramite SHA-256 |
| `meta` | Migrazione verificata, valori aggiunti ai selettori, massimo numero report assegnato per cantiere |

localStorage riceve solamente il cantiere attivo, non archivi, immagini o PDF. I nuovi file passano dalla compressione esistente: orientamento EXIF, lato lungo massimo 1600 pixel e compressione ragionevole intorno a 700 KB. La conversione in Base64 e' temporanea per jsPDF.

## Struttura dei rilievi

Ogni elemento di `inspection.findings[]` contiene ID, numero, `executingCompany`, `building`, `floor`, `activitySuspended`, le tre sezioni, appunto, disposizioni, priorita', eventuale impresa interessata e `photos[]`.

L'impresa interessata preesistente rimane distinta dall'impresa esecutrice. La sospensione predefinita e' NO per ogni nuovo rilievo. Nessun nuovo rilievo prende automaticamente la sospensione di un altro.

Le foto vengono selezionate e visualizzate nella galleria del relativo rilievo. Prima del commit si comprimono i nuovi File; `photos[]` contiene poi riferimenti `media:img_...` ai Blob. Non si concatenano piu' le foto generali del sopralluogo a quelle del primo rilievo.

I selettori impresa/fabbricato/piano aprono una finestra grande con valori gia' usati, valori disponibili e aggiunta di un nuovo valore. I valori aggiunti vengono conservati in IndexedDB anche prima del salvataggio del sopralluogo.

## Dati esistenti

La migrazione localStorage -> IndexedDB continua ad essere automatica e una tantum. Scrive record, Blob e marker nella stessa transazione; verifica hash e dimensioni prima di rimuovere soltanto le tre chiavi pesanti originali. Nessuna cancellazione generale del browser.

Il nuovo adattatore legge i vecchi metadata generali come valori iniziali dei rilievi quando mancano i rispettivi campi specifici. I nuovi valori espliciti, anche vuoti, non vengono sostituiti. I campi aggiuntivi, gli ID, i numeri e gli snapshot rimangono conservati.

Per le fotografie storiche:

- Foto gia' sotto `finding.photos[]`: mantengono l'associazione originale.
- Foto generali con un solo rilievo: appartenenza non ambigua, rese disponibili in quel rilievo.
- Foto generali con piu' rilievi: l'archivio precedente non contiene l'informazione necessaria. Rimangono visibili in "Foto precedenti da assegnare". Ogni immagine puo' essere assegnata esplicitamente al rilievo corretto in modifica, poi salvata.

Fino all'assegnazione, il PDF conserva queste ultime foto come allegati precedenti chiaramente identificati. Questa eccezione riguarda soltanto dati storici ambigui: non attribuisce le foto al primo rilievo e non nasconde o elimina allegati. I nuovi report hanno le fotografie esclusivamente nei rilievi.

## Archivio ed eliminazione

Le condizioni del filtro cantiere e del filtro stato sono invariate. Dopo il filtro, i report vengono ordinati per data decrescente, poi numero decrescente a parita' di data. I cambi di nome del cantiere non separano artificialmente i report dello stesso ID in gruppi diversi.

Le card mostrano data/numero, quantita' di rilievi, tecnico e completamento, senza testi dei rilievi. Duplica e' rimosso dalle azioni dell'archivio; la funzione interna rimane. Archivia/Ripristina e Condividi sono conservati.

Elimina apre sempre una conferma con numero/data. Annulla riceve il focus iniziale; la cancellazione richiede un comando distinto. La transazione rimuove il report e i Blob non piu' referenziati. Foto condivise da altri report o snapshot restano presenti. In caso di errore l'intera transazione viene annullata.

Il massimo numero assegnato e' conservato in `meta`: eliminare l'ultimo report non rende riutilizzabile il suo numero. Numeri dei report esistenti invariati.

## PDF e firma CSE

Il percorso resta: sopralluogo salvato -> modello -> generatore jsPDF -> documento scaricato. Non si archivia il PDF.

La copertina mantiene il format. Ogni rilievo inizia con `pdf.addPage()`; metadata e tre sezioni appartengono a quel rilievo. Le foto vengono raggruppate a coppie solo all'interno dello stesso rilievo. Testo lungo e ulteriori coppie continuano su pagine identificate; il rilievo successivo inizia sempre su una pagina nuova.

Griglia fotografica, proporzioni, centratura, logo, certificazioni e footer societario sono mantenuti. Sono state aggiunte le righe dei metadata richiesti; il PDF non e' quindi identico pixel per pixel alla versione precedente, per queste modifiche deliberate.

La firma **Il CSE p.i.e.** viene disegnata una sola volta, dopo aver generato tutte le pagine, nell'ultima pagina in basso a destra. Il valore e' `siteSnapshot.cseName`, configurato nel cantiere e congelato per quel sopralluogo. Non esiste un nominativo personale fisso o di default. Se il CSE manca, compare "-".

"Sopralluogo effettuato da" rimane in copertina con `general.tecnico`. Il CSE non viene dedotto dal tecnico. Aggiornare esplicitamente lo snapshot in modifica rimane l'unico modo per trasferire la configurazione corrente del cantiere a un report storico.

## Verifiche

Test in Chrome con profili isolati, senza accedere ai dati del browser dell'utente:

- Filtri NEWWARWHOUSE/F9, cinque date discendenti, assenza Duplica nell'archivio, conferma obbligatoria e annullamento senza modifiche.
- Tre rilievi con imprese/piani/sospensioni distinti e foto A/B, C/D, E. Salvataggio, chiusura effettiva e riapertura con confronto completo dei record.
- Aggiunta di una foto al secondo rilievo e verifica dopo riapertura.
- Compatibilita' dei report storici e assegnazione manuale delle fotografie senza proprietario certo.
- 10 sopralluoghi x 3 rilievi x 3 foto = 90 fotografie nel test di carico. Circa 59,5 MiB in IndexedDB, 15 caratteri nei valori localStorage. Foto massima del campione 695.340 byte. Riavvio, visualizzazione e PDF con 9 foto verificati.
- Foto PDF riconosciute dai pixel: A/B esclusivamente nel primo rilievo, C/D nel secondo, E nel terzo. Rapporti geometrici verificati numericamente.
- Documenti da 3, 8 e 15 pagine, testo lungo e continuazioni fotografiche. CSE dinamico soltanto nell'ultima pagina; cambio nominativo e CSE mancante senza default.
- Fotografia con EXIF ruotato e input da 13,1 MB: orientamento, dimensioni e compressione nel nuovo percorso per rilievo verificati.
- Quota simulata in migrazione e salvataggio: rollback, sorgenti originali conservate, verifica prima della rimozione, ripresa e nuovo tentativo riusciti. Il modulo mantiene testi e File selezionati.
- Eliminazione interrotta: nessun report/foto perso. Foto esclusive rimosse al successo, foto condivise conservate e numerazione non riutilizzata dopo riavvio.
- Viewport 320, 390, 768 e 1440 pixel senza overflow orizzontale o pulsanti troncati; screenshot mobile e rendering PDF controllati.

Le risposte AI sono simulate nei test; il servizio AI reale non e' stato modificato ne' chiamato per il collaudo. Restano da provare su telefono reale: fotocamera/selettore foto, tastiera e dialog, download/condivisione PDF e riapertura nello stesso browser.

## Installazione

Estrarre lo ZIP aggiornato e sostituire tutti i file nella stessa cartella pubblicata, includendo `finding-ui.js`. Caricare i file estratti, non lo ZIP. Chiudere le altre schede della vecchia versione e ricaricare lo stesso indirizzo nello stesso browser. Non cancellare i dati del sito.

Aprire un report storico, controllare/assegnare eventuali foto precedenti, poi creare un report con tre rilievi e fotografie diverse. Salvare, riaprire e generare il PDF. Verificare la firma CSE configurata soltanto nell'ultima pagina e il tecnico in copertina.

IndexedDB resta locale a dispositivo/browser/origine: non e' backup cloud o sincronizzazione tra telefono e PC. Questo aggiornamento locale non pubblica automaticamente i file su GitHub Pages.
