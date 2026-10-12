// Lokale Speicherung: IndexedDB, ersatzweise localStorage.
// Keine Netzwerkanfragen: Daten bleiben im Speicher dieses Browsers.
const storageKey = 'learnify-offline-v1';
let database = null, storageMode = 'memory', storageNote = '', state = blank(), memory = blank();
const readLocal = () => { const text = localStorage.getItem(storageKey); return text ? validateState(JSON.parse(text)) : blank(); };
async function openStorage() {
    let forceLocal = false;
    try {
        forceLocal = localStorage.getItem(storageKey + '-mode') === 'local';
    }
    catch { }
    if (!forceLocal) {
        try {
            database = await new Promise((resolve, reject) => {
                const req = indexedDB.open('LearnifyOfflineV1', 1);
                let expired = false;
                const timeout = setTimeout(() => { expired = true; reject(new Error('Speicher antwortet nicht.')); }, 4000);
                req.onupgradeneeded = () => req.result.createObjectStore('data');
                req.onsuccess = () => { clearTimeout(timeout); if (expired) {
                    req.result.close();
                    return;
                } resolve(req.result); };
                req.onerror = () => { clearTimeout(timeout); reject(req.error); };
                req.onblocked = () => { clearTimeout(timeout); reject(new Error('Speicher blockiert.')); };
            });
            storageMode = 'idb';
        }
        catch {
            database = null;
        }
    }
    if (!database) {
        try {
            localStorage.setItem(storageKey + '-probe', '1');
            localStorage.removeItem(storageKey + '-probe');
            localStorage.setItem(storageKey + '-mode', 'local');
            storageMode = 'local';
        }
        catch {
            storageMode = 'memory';
            storageNote = 'Der Browser erlaubt hier kein dauerhaftes Speichern. Deine Änderungen bleiben nur bis zum Schließen erhalten. Bitte eine Sicherung herunterladen.';
        }
    }
    state = await readState();
}
function readState() {
    if (storageMode === 'memory')
        return Promise.resolve(copy(memory));
    if (storageMode === 'local')
        return Promise.resolve(readLocal());
    return new Promise((resolve, reject) => { const tx = database.transaction('data', 'readonly'), req = tx.objectStore('data').get('library'); req.onsuccess = () => { try {
        resolve(req.result ? validateState(req.result) : blank());
    }
    catch (e) {
        reject(e);
    } }; req.onerror = () => reject(req.error); });
}
function prepare(s, fn) { const result = fn(s); s.revision++; s.updated = Date.now(); const clean = validateState(s); if (new Blob([JSON.stringify(clean)]).size > 5000000)
    fail('Der lokale Datenbestand ist zu groß. Bitte sichere deine Daten und entferne nicht mehr benötigte Quizze.'); return { next: clean, result }; }
function writeState(fn) {
    if (storageMode !== 'idb') {
        const current = storageMode === 'local' ? readLocal() : copy(memory);
        const { next, result } = prepare(current, fn);
        if (storageMode === 'local')
            localStorage.setItem(storageKey, JSON.stringify(next));
        else
            memory = copy(next);
        state = next;
        return Promise.resolve(result);
    }
    return new Promise((resolve, reject) => {
        const tx = database.transaction('data', 'readwrite'), store = tx.objectStore('data'), req = store.get('library');
        let update, error;
        req.onsuccess = () => { try {
            update = prepare(req.result ? validateState(req.result) : blank(), fn);
            store.put(update.next, 'library');
        }
        catch (e) {
            error = e;
            tx.abort();
        } };
        tx.oncomplete = () => { state = update.next; resolve(update.result); };
        tx.onerror = () => reject(error || tx.error || new Error('Speichern fehlgeschlagen.'));
        tx.onabort = () => reject(error || tx.error || new Error('Speichern abgebrochen.'));
    });
}
