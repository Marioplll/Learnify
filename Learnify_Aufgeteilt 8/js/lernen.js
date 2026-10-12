// Quizverwaltung und Änderungen des Lernstands.
const uid = () => crypto.randomUUID();
const blank = () => ({ format: FORMAT, version: 1, revision: 0, updated: Date.now(), quizzes: [] });
const copy = value => JSON.parse(JSON.stringify(value));
const stats = q => ({ ...q, attempts: 0, wrong: 0, streak: 0, last_seen: 0 });
function fail(message) { throw new Error(message); }
function quizIn(s, id) { return s.quizzes.find(q => q.id === id) || fail('Dieses Quiz ist nicht mehr vorhanden. Bitte öffne die Übersicht erneut.'); }
function addQuiz(s, name, questions) { name = name.trim(); if (!name || name.length > 100)
    fail('Bitte einen Quiznamen mit höchstens 100 Zeichen angeben.'); if (s.quizzes.length >= 200)
    fail('Maximal 200 Quizze. Bitte zuerst eine Sicherung erstellen und alte Quizze entfernen.'); const quiz = { id: uid(), name, created: Date.now(), questions: questions.map(q => stats({ ...q, id: uid() })), runs: [] }; s.quizzes.unshift(quiz); return quiz.id; }
function beginRun(s, id, limit, fresh = false, now = Date.now()) {
    const quiz = quizIn(s, id), current = quiz.runs.find(r => !r.finished);
    if (current && !fresh)
        return current.id;
    if (!quiz.questions.length)
        fail('Dieses Quiz enthält keine Fragen.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 30)
        fail('Bitte 1 bis 30 Fragen wählen.');
    if (fresh)
        quiz.runs = quiz.runs.filter(r => r.finished);
    const run = { id: uid(), queue: orderQuestions(quiz.questions, limit, now).map(q => q.id), index: 0, results: [], created: now, finished: false };
    quiz.runs.unshift(run);
    quiz.runs = quiz.runs.slice(0, 100);
    return run.id;
}
function answerRun(s, quizId, runId, index, answer, now = Date.now()) {
    const quiz = quizIn(s, quizId), run = quiz.runs.find(r => r.id === runId);
    if (!run)
        fail('Diese Lernrunde wurde inzwischen geändert.');
    if (index < run.index)
        return run.results[index];
    if (run.finished || index !== run.index)
        fail('Der Stand der Lernrunde hat sich geändert. Bitte neu öffnen.');
    if (!Array.isArray(answer) || answer.length > 1)
        fail('Bitte eine Antwort auswählen.');
    const q = quiz.questions.find(q => q.id === run.queue[index]);
    if (!q)
        fail('Die Frage wurde entfernt.');
    if (answer.some(x => !q.options.includes(x)))
        fail('Ungültige Antwort.');
    const correct = grade(q, answer);
    q.attempts++;
    q.wrong += correct ? 0 : 1;
    q.streak = correct ? Math.min(2, q.streak + 1) : 0;
    q.last_seen = now;
    const feedback = { questionId: q.id, prompt: q.prompt, answer, correct, solution: q.correct[0], explanation: q.explanation };
    run.results.push(feedback);
    run.index++;
    run.finished = run.index === run.queue.length;
    return feedback;
}
function changeQuestion(s, quizId, question) { const q = quizIn(s, quizId), i = q.questions.findIndex(x => x.id === question.id); if (i < 0)
    fail('Frage nicht gefunden.'); q.questions[i] = validateQuestion(stats(question)); q.runs = q.runs.filter(r => r.finished); }
function removeQuestion(s, quizId, id) { const q = quizIn(s, quizId); q.questions = q.questions.filter(x => x.id !== id); q.runs = q.runs.filter(r => r.finished); }
const totalsFor = quiz => ({ total: quiz.questions.length, mastered: quiz.questions.filter(q => q.streak >= 2).length, pending: quiz.questions.filter(q => q.wrong > 0 && q.streak < 2).length });
