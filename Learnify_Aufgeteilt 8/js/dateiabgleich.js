// Gemeinsames Sicherungsformat mit der Online-App.
const FORMAT = 'learnify-offline';
const MAX_BACKUP_BYTES = 5000000;
function fail(message) { throw new Error(message); }
function requireText(value, max = 2000) { if (typeof value !== 'string' || value.length > max)
    fail('Ungültiger Text in der Sicherung.'); return value; }
function count(value, max = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < 0 || value > max)
    fail('Ungültiger Zahlenwert in der Sicherung.'); return value; }
function validateQuestion(q) {
    if (!q || !['choice', 'boolean'].includes(q.kind))
        fail('Erlaubt sind Multiple Choice und Richtig/Falsch.');
    const prompt = requireText(q.prompt, 1800).trim();
    if (prompt.length < 8)
        fail('Die Frage braucht mindestens 8 Zeichen.');
    if (!Array.isArray(q.options) || !Array.isArray(q.correct) || q.correct.length !== 1)
        fail('Genau eine richtige Antwort ist erforderlich.');
    const options = q.options.map(x => requireText(x, 300).trim());
    if (options.length !== (q.kind === 'choice' ? 4 : 2) || options.some(x => !x) || new Set(options.map(x => x.normalize('NFC').toLowerCase())).size !== options.length)
        fail('Antwortmöglichkeiten müssen vollständig und unterschiedlich sein.');
    if (q.kind === 'boolean' && options.join('|') !== 'Richtig|Falsch')
        fail('Die Antworten müssen Richtig und Falsch sein.');
    if (!options.includes(q.correct[0]))
        fail('Die Lösung muss eine der Antwortmöglichkeiten sein.');
    const attempts = count(q.attempts), wrong = count(q.wrong, attempts), streak = count(q.streak, 2);
    if (streak > attempts - wrong)
        fail('Der Lernstand ist widersprüchlich.');
    const id = requireText(q.id, 100);
    if (!id)
        fail('Fragen-ID fehlt.');
    return { id, kind: q.kind, prompt, options, correct: [q.correct[0]], explanation: requireText(q.explanation), sources: [], attempts, wrong, streak, last_seen: count(q.last_seen) };
}
function validateState(raw) {
    if (!raw || raw.format !== FORMAT || raw.version !== 1 || !Array.isArray(raw.quizzes) || raw.quizzes.length > 200)
        fail('Das ist keine unterstützte Learnify-Offline-Sicherung.');
    const ids = new Set();
    const takeId = value => { const id = requireText(value, 100); if (!id || ids.has(id))
        fail('IDs fehlen oder sind doppelt vorhanden.'); ids.add(id); return id; };
    const quizzes = raw.quizzes.map(q => {
        if (!q || typeof q !== 'object')
            fail('Ungültiges Quiz in der Sicherung.');
        const id = takeId(q.id), name = requireText(q.name, 100).trim();
        if (!name)
            fail('Quizname fehlt.');
        if (!Array.isArray(q.questions) || q.questions.length > 100 || !Array.isArray(q.runs) || q.runs.length > 100)
            fail('Die Sicherung enthält zu viele oder ungültige Einträge.');
        const questions = q.questions.map(x => { const question = validateQuestion(x); takeId(question.id); return question; });
        const runs = q.runs.map(r => {
            if (!r || typeof r !== 'object')
                fail('Ungültige Lernrunde.');
            const id = takeId(r.id);
            if (!Array.isArray(r.queue) || !r.queue.length || r.queue.length > 30 || new Set(r.queue).size !== r.queue.length)
                fail('Ungültige Fragenreihenfolge.');
            const queue = r.queue.map(x => requireText(x, 100)), index = count(r.index, queue.length);
            if (typeof r.finished !== 'boolean' || r.finished !== (index === queue.length) || !Array.isArray(r.results) || r.results.length !== index)
                fail('Ungültiger Stand einer Lernrunde.');
            if (!r.finished && queue.some(id => !questions.some(q => q.id === id)))
                fail('Eine Frage der laufenden Lernrunde fehlt.');
            const results = r.results.map((f, i) => {
                if (!f || f.questionId !== queue[i] || typeof f.correct !== 'boolean' || !Array.isArray(f.answer) || f.answer.length > 1)
                    fail('Ungültiges Lernergebnis.');
                return { questionId: queue[i], prompt: requireText(f.prompt, 1800), correct: f.correct, answer: f.answer.map(x => requireText(x, 300)), solution: requireText(f.solution, 300), explanation: requireText(f.explanation) };
            });
            return { id, queue, index, results, created: count(r.created), finished: r.finished };
        });
        if (runs.filter(r => !r.finished).length > 1)
            fail('Ein Quiz darf nur eine pausierte Lernrunde haben.');
        return { id, name, created: count(q.created), questions, runs };
    });
    return { format: FORMAT, version: 1, revision: count(raw.revision ?? 0), updated: count(raw.updated ?? 0), quizzes };
}
function parseBackup(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
        fail('Die Sicherung darf höchstens 5 MB groß sein.');
    let raw;
    try {
        raw = JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch {
        fail('Die Datei ist keine lesbare JSON-Sicherung.');
    }
    return validateState(raw);
}
function quizFingerprint(quiz) {
    const q = validateState({ format: FORMAT, version: 1, quizzes: [quiz] }).quizzes[0];
    q.questions.sort((a, b) => a.id.localeCompare(b.id));
    q.runs.sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(q);
}
function quizSummary(q) { return { questions: q.questions.length, attempts: q.questions.reduce((n, x) => n + x.attempts, 0), wrong: q.questions.reduce((n, x) => n + x.wrong, 0), lastSeen: q.questions.reduce((n, x) => Math.max(n, x.last_seen), 0), runs: q.runs.length, mastered: q.questions.filter(x => x.streak >= 2).length }; }
function planBackup(current, incoming) {
    return incoming.quizzes.map(q => {
        const existing = current.quizzes.find(x => x.id === q.id);
        return { id: q.id, name: q.name, status: !existing ? 'new' : quizFingerprint(existing) === quizFingerprint(q) ? 'same' : 'conflict', incoming: quizSummary(q), current: existing ? quizSummary(existing) : null, sameName: !existing && current.quizzes.some(x => x.name === q.name) };
    });
}
function applyBackup(current, incoming, selected) {
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(id => !incoming.quizzes.some(q => q.id === id)))
        fail('Ungültige Quizauswahl.');
    const quizzes = current.quizzes.map(q => selected.includes(q.id) ? incoming.quizzes.find(x => x.id === q.id) : q);
    for (const q of incoming.quizzes)
        if (selected.includes(q.id) && !current.quizzes.some(x => x.id === q.id))
            quizzes.push(q);
    const next = validateState({ ...current, quizzes });
    if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_BACKUP_BYTES)
        fail('Der Datenbestand würde größer als 5 MB. Bitte weniger Quizze auswählen.');
    return next;
}
function learningSummary(s) { return `${s.mastered} / ${s.questions} sicher beantwortet (${s.questions ? Math.round(s.mastered / s.questions * 100) : 0} %) · ${s.attempts} Antworten · ${s.wrong} falsch · ${s.runs} Lernrunden`; }
