# Archivio IndexedDB - CSE PRO

## Causa del problema

La versione precedente salvava l'intero array di cantieri e sopralluoghi come JSON in localStorage (`cseProSitesV1`, `cseProInspectionsV1`). Le fotografie compresse venivano convertite in Base64 e incluse in quei JSON. Inoltre `siteSnapshot` copiava le immagini del cantiere in ogni report. La prima versione lasciava anche `databaseCantieri` come copia aggiuntiva dell'archivio importato.

La codifica Base64 aumenta la dimensione rispetto al file binario e duplicare le immagini negli snapshot aumenta ancora l'occupazione. Il PDF non era salvato in localStorage: era gia' generato su richiesta. Il problema riguardava quindi foto e copie degli archivi, non la persistenza del PDF.

Funzioni coinvolte nella versione precedente: `compressFile()`, `readSingleImage()`, `snapshotSite()`, `saveJson()`, `persistCore()`, `saveSite()` e `saveInspection()`, in `script.js`.

## Struttura attuale

Database IndexedDB: `CSEProArchive`, versione 1.

| Store | Contenuto |
| --- | --- |
| `sites` | Cantieri, ruoli e riferimenti alle immagini del cantiere |
| `inspections` | Sopralluoghi, rilievi annidati, testi, stato, numerazione e snapshot |
| `media` | File immagine come Blob, con ID, tipo MIME e dimensione |
| `meta` | Stato/manifest migrazione, valori dei selettori e contatori numerazione |

La relazione rimane `inspection.siteId -> site.id`; ogni sopralluogo contiene i propri `findings[]` e lo snapshot storico. `inspection.photos[]`, `finding.photos[]` e i campi immagine del cantiere/snapshot contengono riferimenti `media:img_...`, non immagini Base64.

Gli ID delle immagini derivano da SHA-256 del contenuto binario: due riferimenti alla stessa immagine condividono un unico Blob, anche tra cantieri, snapshot e report duplicati. Un salvataggio elimina i Blob non piu' referenziati, ma mantiene quelli ancora usati da qualsiasi altro record o snapshot.

localStorage contiene soltanto la preferenza `cseProActiveSiteV1` e altre eventuali preferenze leggere. Non riceve nuovi archivi, fotografie, file binari o PDF.

## Fotografie

`media.js` gestisce decodifica, orientamento EXIF, ridimensionamento e compressione delle nuove immagini. Usa `createImageBitmap` con orientamento da immagine, con fallback alla decodifica del browser. Il JPEG risultante ha i pixel gia' orientati e non dipende dall'EXIF per essere visualizzato correttamente.

Il lato lungo massimo e' 1600 pixel (alcuni campi esistenti mantengono limiti inferiori). La qualita' iniziale e' circa 0,82; per immagini molto pesanti viene ridotta in modo progressivo. Se necessario, si ridimensiona ulteriormente per puntare a circa 700 KB. Le immagini precedenti non vengono ricompresse durante la migrazione, cosi' da conservare esattamente i file originali gia' archiviati.

Il modulo dispone di una galleria e di "Aggiungi fotografie" per ciascun rilievo, con selezione multipla e rimozione. Non c'e' un limite funzionale di due fotografie. Per le foto generali storiche prive di associazione certa vedere `RILIEVI-ARCHIVIO.md`.

Le anteprime usano URL temporanei dei Blob. Gli URL dei file selezionati vengono rilasciati al salvataggio, alla rimozione o alla chiusura della pagina. Il Base64 viene prodotto temporaneamente per il PDF quando jsPDF deve leggere il Blob; non viene risalvato nell'archivio.

## Migrazione automatica

1. Si apre IndexedDB e si controlla il marker della migrazione.
2. Si leggono rigorosamente i tre vecchi archivi localStorage, senza sostituire dati non leggibili con array vuoti.
3. Si conservano ID, numeri, date, stato, nominativi, testi, rilievi, campi aggiuntivi e foto. Gli eventuali record della prima versione non ancora rappresentati vengono importati; quelli gia' importati non vengono duplicati.
4. Si trasformano le immagini Base64 in Blob senza ricomprimerle e si sostituiscono i valori con riferimenti.
5. Record, immagini e marker provvisorio vengono scritti in una sola transazione.
6. Si rileggono i record e si verificano gli hash del contenuto e delle fotografie, oltre alle dimensioni dei Blob.
7. Si controlla che le sorgenti localStorage non siano state modificate da un'altra scheda; solo allora si rimuovono le tre chiavi di archivio verificate.
8. Il marker definitivo impedisce di ripetere la migrazione.

Se la scrittura fallisce, la transazione viene annullata e le chiavi originali rimangono. Se la verifica fallisce, le chiavi originali non vengono eliminate. Se l'app si interrompe tra scrittura e conclusione, al riavvio riprende la verifica della migrazione pendente, senza creare nuovi duplicati.

Non si usano `localStorage.clear()` o cancellazioni del database nell'app. Gli eventuali reset presenti nei test riguardano esclusivamente profili Chrome dedicati, mai il profilo dell'utente.

## Salvataggi e PDF

`storage.js` e' l'unico responsabile della persistenza principale. Preparazione/compressione avvengono prima della transazione. Blob e record padre vengono poi salvati insieme: un errore non lascia immagini orfane o report parziali. Lo stato in memoria e il modulo vengono aggiornati/puliti solo dopo il commit riuscito.

Se lo spazio del dispositivo realmente termina, viene mostrato un messaggio esplicito; il report precedente resta intatto e appunti/foto selezionati restano nel modulo, consentendo di liberare spazio e riprovare.

Il PDF continua a usare `createReportModel()` e `renderCseProPdf()`. `loadImage()` risolve i riferimenti IndexedDB in immagini temporanee. La fase storage da sola aveva mantenuto il layout identico. La fase successiva aggiunge i metadata per rilievo e limita la firma CSE all'ultima pagina, preservando branding e griglia fotografica: vedere `RILIEVI-ARCHIVIO.md`. Non viene archiviato il PDF completo.

## Test eseguiti

- Cinque fotografie salvate in un sopralluogo, chiusura effettiva del browser e riapertura: dati e immagini presenti.
- Dieci nuovi sopralluoghi, cinque fotografie distinte ciascuno: 50 foto, circa 31,6 MB in IndexedDB e soltanto 59 caratteri di preferenze in localStorage nel test.
- Le foto di un vecchio sopralluogo sono visibili dopo la migrazione; snapshot e file uguali sono deduplicati senza alterare i dati.
- Aggiunta della sesta fotografia allo stesso report e verifica dopo riapertura.
- PDF generato da un sopralluogo archiviato: tutte le sei fotografie memorizzate in IndexedDB sono incluse.
- Confronto del PDF prima/dopo migrazione: quattro pagine renderizzate identiche pixel per pixel; nominativi e immagini verificati.
- Foto JPEG di ingresso da 13,1 MB e fotografia EXIF ruotata: ridimensionamento, orientamento dei pixel e compressione verificati. La foto piu' grande persistita nel test era circa 647 KB.
- Migrazione annullata per quota simulata: nessun record o Blob parziale; sorgenti conservate.
- Verifica migrazione interrotta e successiva ripresa: sorgenti rimosse soltanto dopo verifica riuscita.
- Spazio esaurito durante un aggiornamento: vecchio record e numero di Blob invariati, nuovi file ancora disponibili nel modulo; successivo tentativo riuscito.
- Foto condivise tra report duplicati: una rimozione non elimina l'immagine ancora usata altrove; l'ultimo riferimento rimosso libera il Blob.
- JSON precedente non leggibile: archivio originale conservato e messaggio comprensibile.
- Doppio clic sulla duplicazione: una sola operazione, senza numeri duplicati.
- Layout a 320, 390, 768 e 1440 pixel, anteprime visibili nell'archivio e nell'editor.

Le verifiche sono state eseguite in Chrome desktop con profili isolati. Le risposte AI sono simulate: servizio, endpoint e richiesta AI non sono cambiati. Resta da verificare la fotocamera e la condivisione del PDF su Safari/Chrome del telefono reale.

## Aggiornamento e prova sul telefono

Estrarre lo ZIP aggiornato e sostituire i file nella stessa cartella `test-cse` su GitHub, includendo i nuovi `storage.js` e `media.js`. Aggiornare anche `index.html` e `script.js`. Caricare i file estratti, non lo ZIP.

Aprire la stessa pagina nello stesso browser che contiene i dati precedenti e ricaricarla: la migrazione parte automaticamente prima di rendere disponibile il modulo. Non cancellare i dati del browser. Evitare di continuare a salvare dalla vecchia versione in un'altra scheda durante l'aggiornamento.

Aprire un vecchio report, verificare le foto, poi creare un sopralluogo e caricare cinque foto con "Aggiungi fotografie". Salvare, chiudere e riaprire. La funzione Modifica permette di aggiungere o rimuovere immagini e rigenerare il PDF aggiornato.

IndexedDB resta un archivio locale del dispositivo/browser, non una sincronizzazione cloud. Le quote effettive dipendono dal browser e dallo spazio disponibile, ma l'archivio non e' piu' limitato dalla piccola quota di localStorage.
