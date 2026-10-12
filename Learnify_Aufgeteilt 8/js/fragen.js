// JSON-Fragenimport, gemeinsam mit der Online-App.
function questionsToCsv(questions) {
    const quote = (value) => '"' + String(value).replace(/"/g, '""') + '"';
    return CSV_HEADER + '\n' + questions.map(q => [q.kind, q.prompt, ...(q.kind === 'boolean' ? ['', '', '', ''] : q.options), q.kind === 'boolean' ? q.correct[0] : String.fromCharCode(65 + q.options.indexOf(q.correct[0])), q.explanation].map(quote).join(';')).join('\n') + '\n';
}
function parseQuestionSet(text) {
    if (new TextEncoder().encode(text).length > 500000)
        throw new Error('Die Fragendatei darf höchstens 500 KB groß sein.');
    let data;
    try {
        data = JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch {
        throw new Error('Die Datei enthält kein gültiges JSON.');
    }
    if (!data || data.format !== 'learnify-question-set' || data.version !== 1)
        throw new Error('Bitte eine Fragendatei im Format learnify-question-set auswählen. Lernstandsicherungen gehören in „Datenabgleich“.');
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100)
        throw new Error('Der Quizname braucht 1 bis 100 Zeichen.');
    if (!Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 100)
        throw new Error('Die Datei muss 1 bis 100 Fragen enthalten.');
    const questions = data.questions.map((q) => validateQuestion({ ...((q && typeof q === 'object') ? q : {}), id: crypto.randomUUID(), attempts: 0, wrong: 0, streak: 0, last_seen: 0 }));
    return { name: data.name.trim(), questions: parseQuestionCsv(questionsToCsv(questions)) };
}
