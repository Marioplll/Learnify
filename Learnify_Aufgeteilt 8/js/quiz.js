// Antwortprüfung und Fragenanordnungsalgorithmus.
const kindNames = { cloze: 'Lückentext', choice: 'Multiple Choice', drag: 'Drag & Drop', estimate: 'Schätzfrage', boolean: 'Richtig oder falsch' };
const unique = (a) => [...new Set(a)];
const normalizeAnswer = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
function grade(q, answer) {
    if (q.kind === 'cloze')
        return typeof answer === 'string' && !!answer.trim() && q.correct.some(c => normalizeAnswer(c) === normalizeAnswer(answer));
    if (q.kind === 'estimate') {
        if (typeof answer !== 'string' || !answer.trim())
            return false;
        const n = Number(answer.replace(',', '.'));
        return Number.isFinite(n) && Math.abs(n - q.value) <= q.tolerance + 1e-9;
    }
    if (!Array.isArray(answer) || answer.some(x => typeof x !== 'string'))
        return false;
    if (q.kind === 'drag')
        return answer.length === q.correct.length && answer.every((v, i) => v === q.correct[i]);
    return answer.length === q.correct.length && unique(answer).length === answer.length && q.correct.every(v => answer.includes(v));
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function priorityDetails(q, now = Date.now()) {
    const isNew = q.attempts === 0;
    const newPoints = isNew ? 6 : 0;
    const timePoints = !isNew && q.last_seen > 0 && now - q.last_seen > WEEK_MS ? 3 : 0;
    const errorPoints = q.wrong >= 2 ? 5 : q.wrong === 1 ? 3 : 0;
    const correctCount = q.attempts - q.wrong;
    const correctPoints = correctCount >= 2 ? -2 : 0;
    return { score: newPoints + timePoints + errorPoints + correctPoints, newPoints, timePoints, errorPoints, correctPoints, correctCount };
}
function priority(q, now = Date.now()) { return priorityDetails(q, now).score; }
function orderQuestions(rows, limit, now = Date.now()) {
    if (!Number.isInteger(limit) || limit < 1)
        throw new Error('Die Anzahl muss eine positive ganze Zahl sein.');
    // Capture one time for the whole round; equal scores use oldest answer then stable ID.
    return [...rows].sort((a, b) => priority(b, now) - priority(a, now) || (a.attempts === 0 ? 0 : a.last_seen) - (b.attempts === 0 ? 0 : b.last_seen) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit);
}
function publicQuestion(q) { const { correct, value, explanation, sources, ...rest } = q; return { ...rest, sources: sources.map(({ text, ...s }) => s), multi: correct.length > 1 && q.kind === 'choice' }; }
