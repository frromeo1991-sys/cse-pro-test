const CSEStorage = (() => {
    const DB_NAME = "CSEProArchive";
    const OLD_KEYS = ["cseProSitesV1", "cseProInspectionsV1", "databaseCantieri"];
    const MIGRATION_KEY = "localStorageMigrationV1";
    const ALL_STORES = ["sites", "inspections", "media", "meta"];
    let database;

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function transactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error || new DOMException("Transazione annullata", "AbortError"));
            transaction.onerror = () => {};
        });
    }

    async function open() {
        if (database) return database;
        database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                for (const name of ALL_STORES) request.result.createObjectStore(name, { keyPath: "id" });
                request.transaction.objectStore("inspections").createIndex("siteId", "siteId");
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Chiudi le altre schede di CSE PRO e ricarica per aggiornare l'archivio."));
        });
        database.onversionchange = () => { database.close(); database = null; };
        return database;
    }

    async function get(store, id) {
        const db = await open();
        return requestResult(db.transaction(store).objectStore(store).get(id));
    }

    async function loadAll() {
        const db = await open();
        const tx = db.transaction(["sites", "inspections", "meta"]);
        const sites = requestResult(tx.objectStore("sites").getAll());
        const inspections = requestResult(tx.objectStore("inspections").getAll());
        const meta = requestResult(tx.objectStore("meta").getAll());
        const values = await Promise.all([sites, inspections, meta]);
        values[0].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        values[1].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return { sites: values[0], inspections: values[1], numberCounters: Object.fromEntries(values[2].filter(row => row.id.startsWith("reportNumber:")).map(row => [row.id.slice(13), row.value])) };
    }

    async function digest(value) {
        const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }

    function dataUrlToBlob(value) {
        const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
        if (!match) throw new Error("Immagine storica non leggibile. L'archivio originale non viene cancellato.");
        const binary = match[2] ? atob(match[3].replace(/\s/g, "")) : decodeURIComponent(match[3]);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new Blob([bytes], { type: match[1] });
    }

    async function prepare(records) {
        const media = new Map();
        const dataUrls = new Map();
        async function visit(value) {
            if (typeof value === "string" && value.startsWith("data:image/")) {
                if (!dataUrls.has(value)) dataUrls.set(value, visit(dataUrlToBlob(value)));
                return dataUrls.get(value);
            }
            if (value instanceof Blob) {
                const id = `img_${await digest(await value.arrayBuffer())}`;
                media.set(id, { id, blob: value, size: value.size, type: value.type });
                return `media:${id}`;
            }
            if (Array.isArray(value)) return Promise.all(value.map(visit));
            if (value && typeof value === "object") {
                const result = {};
                for (const [key, item] of Object.entries(value)) result[key] = await visit(item);
                return result;
            }
            return value;
        }
        return { records: await visit(records), media: [...media.values()] };
    }

    function collectReferences(value, result = new Set()) {
        if (typeof value === "string" && value.startsWith("media:")) result.add(value.slice(6));
        else if (value && typeof value === "object") Object.values(value).forEach(item => collectReferences(item, result));
        return result;
    }

    // All image writes and their parent records commit together, including migration markers.
    async function commitPrepared(prepared, marker = null, deleteSiteIds = [], deleteInspectionIds = []) {
        const db = await open();
        const tx = db.transaction(ALL_STORES, "readwrite");
        const done = transactionDone(tx);
        try {
            for (const image of prepared.media) tx.objectStore("media").put(image);
            for (const site of prepared.records.sites || []) tx.objectStore("sites").put(site);
            for (const report of prepared.records.inspections || []) tx.objectStore("inspections").put(report);
            function retainNumber(siteId, number) {
                const id = `reportNumber:${siteId}`;
                const read = tx.objectStore("meta").get(id);
                read.onsuccess = () => tx.objectStore("meta").put({ id, value: Math.max(read.result?.value || 0, Number(number) || 0) });
            }
            const maxima = new Map();
            for (const report of prepared.records.inspections || []) maxima.set(report.siteId, Math.max(maxima.get(report.siteId) || 0, Number(report.reportNumber) || 0));
            for (const [siteId, number] of maxima) retainNumber(siteId, number);
            for (const id of deleteInspectionIds) {
                const read = tx.objectStore("inspections").get(id);
                read.onsuccess = () => { if (read.result) retainNumber(read.result.siteId, read.result.reportNumber); };
                tx.objectStore("inspections").delete(id);
            }
            for (const id of deleteSiteIds) tx.objectStore("sites").delete(id);
            if (marker) tx.objectStore("meta").put(marker);

            // The same transaction prevents deletion of images referenced by another report/snapshot.
            const references = new Set();
            let remaining = 2;
            for (const name of ["sites", "inspections"]) {
                const read = tx.objectStore(name).getAll();
                read.onsuccess = () => {
                    collectReferences(read.result, references);
                    if (--remaining) return;
                    const cursor = tx.objectStore("media").openCursor();
                    cursor.onsuccess = () => {
                        const row = cursor.result;
                        if (!row) return;
                        if (!references.has(row.key)) row.delete();
                        row.continue();
                    };
                };
            }
        } catch (error) {
            tx.abort();
            await done.catch(() => {});
            throw error;
        }
        await done;
        return prepared.records;
    }

    async function saveBatch(records) {
        return commitPrepared(await prepare(records));
    }

    async function saveSite(site) { return (await saveBatch({ sites: [site] })).sites[0]; }
    async function saveInspection(report) { return (await saveBatch({ inspections: [report] })).inspections[0]; }
    async function deleteSite(id) { await commitPrepared({ records: {}, media: [] }, null, [id]); }
    async function deleteInspection(id) { await commitPrepared({ records: {}, media: [] }, null, [], [id]); }

    async function addChoice(key, value) {
        const db = await open();
        const tx = db.transaction("meta", "readwrite");
        const done = transactionDone(tx);
        const id = `choices:${key}`;
        const read = tx.objectStore("meta").get(id);
        read.onsuccess = () => tx.objectStore("meta").put({ id, values: [...new Set([value, ...(read.result?.values || [])])] });
        await done;
    }

    function parseOld(key, raw) {
        if (raw == null) return [];
        let result;
        try { result = JSON.parse(raw); }
        catch { throw new Error(`Archivio precedente ${key} non leggibile. I dati originali sono conservati.`); }
        if (!Array.isArray(result)) throw new Error(`Archivio ${key} non valido. I dati originali sono conservati.`);
        return result;
    }

    async function convertLegacy(sites, reports, legacy) {
        const siteMap = new Map(sites.map(site => [site.name.trim().toLowerCase(), site]));
        for (const [index, source] of legacy.entries()) {
            const imported = reports.find(report => report.legacyIndex === index);
            const legacyFields = { ...source };
            delete legacyFields.foto1;
            delete legacyFields.foto2;
            if (imported) {
                imported.legacyFields ??= legacyFields;
                continue;
            }
            const name = source.nome || "Cantiere importato";
            const normalized = name.trim().toLowerCase();
            let site = siteMap.get(normalized);
            if (!site) {
                site = { id: `legacy_site_${(await digest(normalized)).slice(0, 20)}`, name, code: name,
                    contractor: source.affidataria || "", cseName: "", responsibleForWorks: source.respLavori || "" };
                sites.push(site);
                siteMap.set(normalized, site);
            }
            const parts = String(source.data || "").split("/");
            const number = Math.max(0, ...reports.filter(report => report.siteId === site.id).map(report => Number(report.reportNumber) || 0)) + 1;
            reports.push({ id: `legacy_inspection_${index}_${(await digest(normalized)).slice(0, 12)}`, siteId: site.id,
                reportNumber: number, date: parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}` : new Date().toISOString().slice(0, 10),
                status: source.stato || "ATTIVO", completionStatus: "COMPLETATO", siteSnapshot: { ...site },
                general: { tecnico: source.tecnico || "", affidataria: source.affidataria || "", referenteAffidataria: source.referenteAffidataria || "",
                    respLavori: source.respLavori || "", esecutrice: source.esecutrice || "", fabbricato: source.fabbricato || "", piano: source.piano || "", sospensioneLavori: source.sospensioneLavori || "NO" },
                findings: [{ id: `legacy_finding_${index}`, number: 1, observation: source.iaDescrizione || "",
                    activityDescription: (source.attivita || []).join("; "), safetyMeasures: source.iaMisure || "", correctiveMeasures: source.iaCorrettive || "",
                    company: source.esecutrice || "", priority: "Ordinaria", timing: source.tempistica_sicurezza || "Messa in sicurezza immediata", photos: [source.foto1, source.foto2].filter(Boolean) }],
                legacyIndex: index, legacyFields });
        }
    }

    async function verifyMigration(marker) {
        for (const name of ["sites", "inspections"]) {
            for (const expected of marker.manifest[name]) {
                const actual = await get(name, expected.id);
                if (!actual || await digest(JSON.stringify(actual)) !== expected.digest) {
                    throw new Error("Verifica migrazione non riuscita. I dati originali sono conservati.");
                }
            }
        }
        for (const expected of marker.manifest.media) {
            const actual = await get("media", expected.id);
            if (!(actual?.blob instanceof Blob) || actual.blob.size !== expected.size ||
                `img_${await digest(await actual.blob.arrayBuffer())}` !== expected.id) {
                throw new Error("Verifica delle fotografie non riuscita. L'archivio originale non viene cancellato.");
            }
        }
    }

    async function finishMigration(marker) {
        await verifyMigration(marker);
        for (const source of marker.sources) {
            const raw = localStorage.getItem(source.key);
            if (raw != null && await digest(raw) !== source.digest) {
                throw new Error("Un'altra scheda ha modificato l'archivio precedente. Chiudila e conserva i dati prima di riprovare la migrazione.");
            }
        }
        // Only verified archive keys are removed. Preferences and the active site stay untouched.
        for (const source of marker.sources) localStorage.removeItem(source.key);
        const db = await open();
        const tx = db.transaction("meta", "readwrite");
        const done = transactionDone(tx);
        tx.objectStore("meta").put({ ...marker, done: true, verifiedAt: new Date().toISOString() });
        await done;
    }

    async function migrateLocalStorage() {
        async function migrate() {
            await open();
            const existingMarker = await get("meta", MIGRATION_KEY);
            if (existingMarker?.done) return;
            if (existingMarker) return finishMigration(existingMarker);
            const sources = [];
            const old = {};
            for (const key of OLD_KEYS) {
                const raw = localStorage.getItem(key);
                old[key] = parseOld(key, raw);
                if (raw != null) sources.push({ key, digest: await digest(raw), characters: raw.length });
            }
            const stored = await loadAll();
            const sites = [...stored.sites];
            const reports = [...stored.inspections];
            for (const site of old.cseProSitesV1) if (!sites.some(item => item.id === site.id)) sites.push(site);
            for (const report of old.cseProInspectionsV1) if (!reports.some(item => item.id === report.id)) reports.push(report);
            await convertLegacy(sites, reports, old.databaseCantieri);
            const prepared = await prepare({ sites, inspections: reports });
            const manifest = { sites: [], inspections: [], media: prepared.media.map(({ id, size }) => ({ id, size })) };
            for (const id of collectReferences(prepared.records)) {
                if (manifest.media.some(item => item.id === id)) continue;
                const image = await get("media", id);
                if (!(image?.blob instanceof Blob)) throw new Error("Manca una fotografia dell'archivio. I dati precedenti sono conservati.");
                manifest.media.push({ id, size: image.blob.size });
            }
            for (const name of ["sites", "inspections"]) {
                for (const record of prepared.records[name]) manifest[name].push({ id: record.id, digest: await digest(JSON.stringify(record)) });
            }
            const marker = { id: MIGRATION_KEY, done: false, sources, manifest, migratedAt: new Date().toISOString() };
            await commitPrepared(prepared, marker);
            await finishMigration(marker);
        }
        if (navigator.locks) return navigator.locks.request("cse-pro-storage-migration", migrate);
        return migrate();
    }

    return { open, loadAll, get, saveBatch, saveSite, saveInspection, deleteSite, deleteInspection, addChoice, migrateLocalStorage, collectReferences };
})();
