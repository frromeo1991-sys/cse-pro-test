# CSE PRO - aggiornamento del 13 ottobre 2026

## Analisi del progetto

L'app esistente usa HTML, CSS e JavaScript senza framework. I dati sono conservati nel browser:

| Dato | Chiave / struttura |
| --- | --- |
| Cantieri | `cseProSitesV1`, array di cantieri |
| Sopralluoghi | `cseProInspectionsV1`, array di report |
| Cantiere selezionato | `cseProActiveSiteV1` |
| Archivio della prima versione | `databaseCantieri`, conservato dopo l'importazione |
| Tecnico | `inspection.general.tecnico` |
| Rilievi e testi AI | `inspection.findings[]` |
| Due foto del sopralluogo | `inspection.photos[]`, immagini compresse in base64 |
| Foto delle versioni precedenti | `finding.photos[]`, conservate e modificabili |
| Dati storici del cantiere | `inspection.siteSnapshot` |

Non viene usato IndexedDB. Il PDF viene generato con la libreria jsPDF locale e scaricato; non era e non e' un record archiviato nel database dell'app. I PDF gia' scaricati non vengono modificati o eliminati.

Problemi individuati: tecnico usato impropriamente anche come CSE nella firma; Responsabile dei Lavori richiesto ogni volta; assenza di riapertura e modifica; numerazione basata sul numero di record anziche' sul massimo numero assegnato. In fase di modifica era inoltre necessario evitare di rigenerare testi gia' corretti e perdere foto o campi meno recenti.

Restano intenzionalmente fissi il branding Romeo Safety, i recapiti societari nel footer, le attivita' standard e la struttura grafica del format. Nomi di tecnico, CSE e Responsabile dei Lavori sono dati dinamici distinti.

## File interessati

- `index.html`: campi del cantiere, tecnico distinto, suggerimenti degli ultimi tecnici, apertura/modifica archivio e salvataggio bozza.
- `script.js`: gestione delle modifiche, foto salvate, snapshot, compatibilita', numerazione e correzione delle due posizioni PDF richieste.
- `style2.css`: stili aggiuntivi per ruoli, visualizzazione, stato e foto storiche. Branding e grafica generale conservati.
- `report-model.js`: nuovo adattatore puro dai dati salvati al modello del report.
- Questo documento: struttura, compatibilita', verifiche e istruzioni.

La libreria jsPDF, il pacchetto immagini e la richiesta al servizio AI non sono stati sostituiti. Quando si aggiungono rilievi, vengono generati soltanto quelli nuovi o con appunto modificato; i testi gia' pronti restano intatti. Il comando "Rigenera con AI", se tutti i rilievi sono gia' pronti, rigenera intenzionalmente tutti i testi.

## Dati e compatibilita'

Le chiavi di localStorage rimangono le stesse. Nessuna funzione dell'app cancella localStorage o IndexedDB.

Ai cantieri si aggiungono `cseName` e `responsibleForWorks`. Se il responsabile manca nella struttura del cantiere, viene recuperato dall'ultimo sopralluogo salvato che contiene `general.respLavori`. I diversi nominativi dei vecchi report restano nei rispettivi snapshot/dati originali.

Il CSE non viene mai dedotto dal tecnico. Nei vecchi report che non contengono il dato CSE, il campo resta non indicato finche' l'utente non aggiorna intenzionalmente quello specifico report. Impostare oggi un CSE sul cantiere non lo attribuisce retroattivamente a tutti i report.

I record storici sono letti in modo compatibile senza riscrivere tutti i sopralluoghi all'avvio. All'apertura vengono adattati in memoria. Alla modifica vengono mantenuti ID, numero report, data di creazione, stato di archiviazione, campi aggiuntivi, testi e foto. Il salvataggio aggiorna lo stesso record e aggiunge `updatedAt`.

La numerazione dei nuovi report usa il massimo numero gia' assegnato nel cantiere piu' uno; modificare un report non incrementa il numero.

## Snapshot e ruoli

Un nuovo sopralluogo fotografa i dati del cantiere al momento del salvataggio. Il PDF legge:

- "Sopralluogo effettuato da": `general.tecnico` del singolo sopralluogo;
- "Il CSE p.i.e.": `siteSnapshot.cseName`;
- Responsabile dei Lavori: `siteSnapshot.responsibleForWorks`, stampato sulla riga successiva all'intestazione.

Riaprire un report mantiene lo snapshot originale, anche se nel frattempo il cantiere e' cambiato. Il pulsante "Aggiorna dati cantiere" sostituisce lo snapshot nel modulo con i dati attuali: la modifica diventa persistente solo salvando il report. I campi specifici del sopralluogo, ad esempio l'impresa affidataria compilata per quel report, restano quelli inseriti.

Durante la modifica il cantiere del report e' bloccato, per evitare spostamenti involontari. Per un diverso cantiere si crea un nuovo sopralluogo.

## Bozza, archivio e fotografie

"Salva bozza" conserva anche un sopralluogo incompleto, senza obbligare a usare l'AI. "Completa e salva" oppure "Salva modifiche" richiede il tecnico e le tre sezioni compilate per ciascun rilievo. Un report completato puo' sempre essere riaperto.

`completionStatus` distingue BOZZA e COMPLETATO. Il precedente `status` ATTIVO/ARCHIVIATO rimane indipendente e compatibile. I report precedenti vengono considerati completati.

L'archivio offre Apri, Modifica, PDF, Duplica, Archivia/Ripristina e Condividi. Il PDF viene rigenerato dai dati salvati aggiornati; modifiche ancora nel modulo devono essere salvate prima di esportare dall'archivio.

Le due foto del sopralluogo possono essere mantenute, sostituite o rimosse in modifica. Le vecchie foto associate ai singoli rilievi restano visibili in una galleria dedicata, dalla quale si possono eliminare singolarmente. Se un report storico contiene piu' foto delle due posizioni del format, il PDF usa ulteriori pagine con la stessa griglia fotografica, anziche' omettere gli allegati.

In caso di spazio insufficiente, il salvataggio non sostituisce il record originale e lascia i dati nel modulo per consentire un nuovo tentativo.

## Separazione dati e rendering

Il percorso e': dati del sopralluogo -> `createReportModel()` -> `renderCseProPdf()` -> PDF.

`createReportModel()` copia i dati senza modificarli, risolve la compatibilita' e prepara testi/foto. `renderCseProPdf()` conserva il format attuale. Un futuro renderer potra' ricevere lo stesso modello senza cambiare la logica di salvataggio. Importazione Word, segnaposto DOCX e conversioni di template non sono implementati.

## Verifiche eseguite

Test automatici in un profilo Chrome dedicato, senza accedere ai dati del browser dell'utente:

- Gli otto casi richiesti: Mario Rossi / Francesco Romeo / Luca Bianchi; secondo tecnico Andrea Verdi; campi PDF indipendenti; responsabile a capo; aggiunta del terzo rilievo allo stesso report; nuova foto; riapertura dopo riavvio; snapshot storico invariato dopo modifica del cantiere.
- Foto e testi manualmente corretti conservati quando si aggiunge un rilievo; rimozione mirata di foto e rilievi.
- Aggiornamento esplicito dello snapshot limitato al report selezionato.
- Bozza incompleta persistente, successivo completamento senza duplicazione, gestione di errore AI.
- Compatibilita' con foto per rilievo e campi aggiuntivi delle versioni precedenti; priorita' e tempistiche non standard conservate.
- Importazione `databaseCantieri` idempotente e sorgente originale conservata.
- Simulazione di spazio esaurito: record salvato intatto e modifica ancora nel modulo.
- Layout a 320, 390, 768, 1024 e 1440 pixel; screenshot desktop/mobile e assenza di elementi fuori dalla pagina.
- Estrazione e controllo dei testi PDF, coordinate dei nominativi, conteggio foto e rilievi; rendering e controllo visivo delle pagine interessate.

Le risposte AI nei test di questo aggiornamento sono simulate. Endpoint e contenuto della richiesta AI restano quelli della versione gia' verificata. Restano da verificare su un telefono reale l'accesso alla fotocamera/galleria e l'apertura/condivisione dei PDF in Safari o Chrome mobile.

## Come provare

1. Ricaricare la pagina dell'app.
2. Aprire Cantieri -> Modifica, impostare CSE e Responsabile dei Lavori, salvare.
3. Creare un sopralluogo con il tecnico, l'appunto e le foto; generare i testi e salvare, oppure usare Salva bozza.
4. Nell'archivio selezionare Apri per leggere il report, oppure Modifica per aggiungere un rilievo, aggiornare testi o foto e salvare sullo stesso numero.
5. Premere PDF nell'archivio per ottenere il documento aggiornato.
6. Per aggiornare intenzionalmente un vecchio report con il CSE appena configurato, aprire Modifica -> Aggiorna dati cantiere -> Salva modifiche.

Per la versione online, estrarre il nuovo ZIP e sostituire i file nella stessa cartella `test-cse` del repository GitHub, includendo `report-model.js`. Caricare i file estratti, non lo ZIP. Mantenere lo stesso indirizzo web e non cancellare i dati del browser: l'archivio del telefono continua a usare lo stesso localStorage. Gli archivi di PC e telefono restano separati; non e' stata aggiunta sincronizzazione cloud.
