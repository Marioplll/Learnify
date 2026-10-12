// Oberfläche, Formulare und Benutzeraktionen. Quizdaten kommen aus Dateien.
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const date = value => value ? new Date(value).toLocaleDateString('de-AT') : 'Noch nie';
const percent = t => t.total ? Math.round(t.mastered / t.total * 100) : 0;
const button = (text, action, id = '', style = '') => `<button class="${style}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
let view = 'home', selectedQuiz = '', selectedRun = '', feedback = null, answerIndex = -1, limit = 10, busy = false, draft = [], draftCsv = '', importToken = 0, pendingBackup = null, pendingRevision = 0, editingId = '', toastTimer;
function toast(message) { $('toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').textContent = '', 4500); }
function showError(e) { const message = e?.message || 'Das hat nicht funktioniert.'; if ($('modal').open)
    $('modal-error').textContent = message;
else {
    const p = document.createElement('p');
    p.className = 'error';
    p.role = 'alert';
    p.textContent = message;
    $('app').prepend(p);
} }
async function act(fn) { if (busy)
    return; busy = true; document.body.setAttribute('aria-busy', 'true'); try {
    await fn();
}
catch (e) {
    showError(e);
}
finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
} }
function showModal(html) { $('modal-content').innerHTML = html; $('modal-error').textContent = ''; if (!$('modal').open)
    $('modal').showModal(); }
function closeModal() { importToken++; $('modal').close(); pendingBackup = null; }
function heading(title, subtitle, action = '') { return `<div class="heading"><div><p class="eyebrow">FRAGEN. LERNEN. WIEDERHOLEN.</p><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>${action}</div>`; }
function card(q) { const t = totalsFor(q), p = percent(t), resume = q.runs.some(r => !r.finished); return `<article class="card"><span class="tag">${t.pending ? `${t.pending} zum Wiederholen` : t.total && t.mastered === t.total ? 'Sicher beantwortet' : 'Bereit zum Lernen'}</span><h2>${esc(q.name)}</h2><p class="muted">${t.total} Fragen · ${t.mastered} sicher beantwortet</p><div class="progress-label"><span>Lernfortschritt</span><strong>${p} %</strong></div><progress max="100" value="${p}" aria-label="Lernfortschritt ${esc(q.name)}"></progress><div class="actions">${button('Fragen ansehen', 'review', q.id)}<button class="primary" data-action="start" data-id="${esc(q.id)}" ${!t.total ? 'disabled' : ''}>${resume ? 'Fortsetzen' : 'Lernen'}</button></div></article>`; }
function totals() { return state.quizzes.reduce((a, q) => { const t = totalsFor(q); return { total: a.total + t.total, mastered: a.mastered + t.mastered, pending: a.pending + t.pending }; }, { total: 0, mastered: 0, pending: 0 }); }
function empty() { return `<div class="empty"><h2>Bereit für dein erstes Quiz?</h2><p class="muted">Importiere fertige Fragen oder starte mit den zehn leichten Mathefragen.</p><div class="row" style="justify-content:center">${button('CSV-Beispiel laden', 'example', '', 'primary')}${button('Fragen importieren', 'import')}</div></div>`; }
function render() {
    document.querySelectorAll('nav button').forEach(b => { const active = b.dataset.action === view || (b.dataset.action === 'quizzes' && ['review', 'learn', 'result'].includes(view)); b.classList.toggle('active', active); if (active)
        b.setAttribute('aria-current', 'page');
    else
        b.removeAttribute('aria-current'); });
    $('storage-status').textContent = storageMode === 'memory' ? 'Nur für diese Sitzung' : 'Offline · Auf diesem Gerät';
    $('storage-status').classList.toggle('warning', storageMode === 'memory');
    let html = '';
    const t = totals();
    if (view === 'home') {
        html = heading('Dein Learnify', 'Fertige Fragen rein. In deinem Tempo lernen.', button('Fragen importieren', 'import', '', 'primary'));
        html += `<div class="stats"><div><span>Quizze</span><strong>${state.quizzes.length}</strong></div><div><span>Fragen</span><strong>${t.total}</strong></div><div><span>Zum Wiederholen</span><strong>${t.pending}</strong></div><div><span>Sicher beantwortet</span><strong>${percent(t)} %</strong></div></div><div class="intro"><section class="panel"><p class="eyebrow">EINFACH STARTEN</p><h2>Deine nächste Lernrunde</h2><p class="muted">Importiere Fragen als CSV oder JSON oder lade die zehn leichten Mathefragen direkt per Button. Multiple Choice und Richtig/Falsch können in einem Quiz gemischt werden.</p>${button('CSV-Beispiel laden', 'example')}<h3 class="offline-info-title">Überall weiterlernen</h3><p class="small muted">Diese App funktioniert ohne Internet. Lernstände werden in diesem Browser gespeichert. Zum Wechseln des Geräts eine Sicherung exportieren und dort wieder einlesen.</p></section><section class="learning-path" aria-labelledby="learning-path-title"><p class="learning-path-eyebrow">DEIN LERNWEG</p><h2 id="learning-path-title">In drei Schritten</h2><ol class="learning-path-steps"><li><div><h3>Fragen importieren</h3><p>CSV oder JSON auswählen oder das mitgelieferte Beispielquiz importieren.</p></div></li><li><div><h3>Prüfen und üben</h3><p>Lösungen ansehen, Fragen anpassen, Quiz starten.</p></div></li><li><div><h3>Gezielt wiederholen</h3><p>Der Punktescore bestimmt die nächste Reihenfolge.</p></div></li></ol></section></div><h2>Deine Quizze</h2>${state.quizzes.length ? `<div class="grid">${state.quizzes.slice(0, 4).map(card).join('')}</div>` : empty()}`;
    }
    else if (view === 'quizzes') {
        html = heading('Meine Quizze', 'Starte eine Lernrunde oder bearbeite deine Fragen.', button('Fragen importieren', 'import', '', 'primary')) + (state.quizzes.length ? `<div class="grid">${state.quizzes.map(card).join('')}</div>` : empty());
    }
    else if (view === 'progress') {
        const runs = state.quizzes.flatMap(q => q.runs.map(r => ({ ...r, name: q.name, quizId: q.id }))).sort((a, b) => b.created - a.created).slice(0, 15);
        html = heading('Lernfortschritt', 'Zwei richtige Antworten in Folge machen eine Frage sicher beantwortet.') + `<section class="panel"><div class="score">${percent(t)} %</div><h2>${t.mastered} von ${t.total} Fragen sicher beantwortet</h2><p class="muted">${t.pending} Fragen zum Wiederholen</p><progress max="100" value="${percent(t)}" aria-label="Gesamtfortschritt"></progress></section><h2 class="section-title">Fortschritt je Quiz</h2><div class="grid">${state.quizzes.map(card).join('')}</div><h2 class="section-title">Letzte Lernrunden</h2><div class="panel">${runs.length ? runs.map(r => `<div class="history"><div><strong>${esc(r.name)}</strong><div class="small muted">${date(r.created)} · ${r.finished ? 'Abgeschlossen' : 'Pausiert'}</div></div><span>${r.results.filter(x => x.correct).length} / ${r.results.length} richtig · ${r.index} / ${r.queue.length} beantwortet</span></div>`).join('') : 'Hier erscheinen deine gespeicherten Lernrunden.'}</div>`;
    }
    else if (view === 'review') {
        const q = quizIn(state, selectedQuiz), hasRun = q.runs.some(r => !r.finished);
        html = button('Zurück zu meinen Quizzen', 'quizzes', '', 'back') + heading(q.name, `${q.questions.length} Fragen · Lösungen prüfen und Fragen bearbeiten.`, `${button('Umbenennen', 'rename', q.id)} ${button('Quiz löschen', 'delete-quiz', q.id, 'danger')}`);
        html += `<div class="row"><label for="round-limit">Fragen je Lernrunde</label><select class="limit" id="round-limit">${[5, 10, 20, 30].map(n => `<option ${limit === n ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="primary" data-action="start" data-id="${esc(q.id)}" ${q.questions.length ? '' : 'disabled'}>${hasRun ? 'Lernrunde fortsetzen' : 'Lernen starten'}</button>${hasRun ? button('Neue Runde', 'fresh', q.id) : ''}${button('Fragen als CSV', 'export-csv', q.id)}</div>`;
        html += `<details class="note"><summary>Wie wird die Reihenfolge berechnet?</summary><p>Neue Frage: +6. Länger als sieben Tage nicht beantwortet: +3. Einmal falsch: +3, mindestens zweimal falsch: +5. Insgesamt mindestens zweimal richtig: −2.</p><p>Die Punkte werden addiert. Höchste Punktzahl zuerst; bei Gleichstand die älteste Antwort, dann die feste Fragen-ID. Der Lernstatus „sicher beantwortet“ bedeutet zwei richtige Antworten in Folge.</p></details>`;
        html += q.questions.map((f, i) => `<article class="panel review"><div class="row between"><span class="tag">${i + 1} · ${kindNames[f.kind]}</span><div>${button('Bearbeiten', 'edit-question', f.id)} ${button('Entfernen', 'delete-question', f.id, 'danger')}</div></div><p class="muted small">Priorität: ${priority(f)} Punkte · ${f.attempts - f.wrong} richtig · ${f.wrong} falsch · Zuletzt: ${date(f.last_seen)}</p><h3>${esc(f.prompt)}</h3><p>${f.options.map(esc).join(' · ')}</p><div class="answer-key"><strong>Lösung: ${esc(f.correct[0])}</strong><p>${esc(f.explanation)}</p></div></article>`).join('');
    }
    else if (view === 'learn' || view === 'result') {
        const quiz = quizIn(state, selectedQuiz), run = quiz.runs.find(r => r.id === selectedRun);
        if (!run)
            fail('Die Lernrunde wurde geändert. Öffne das Quiz erneut.');
        if (run.finished && !feedback) {
            view = 'result';
            const n = run.results.filter(f => f.correct).length;
            html = `<div class="study">${heading('Runde geschafft!', quiz.name)}<section class="panel"><div class="score">${n} / ${run.queue.length}</div><h2>Fragen richtig beantwortet</h2><p class="muted">Deine Antworten sind ${storageMode === 'memory' ? 'für diese Sitzung' : 'auf diesem Gerät'} gespeichert.</p><div class="actions">${button('Neue Runde', 'start', quiz.id, 'primary')}${button('Quiz ansehen', 'review', quiz.id)}</div></section><h2 class="section-title">Deine Antworten</h2>${run.results.map(f => `<article class="panel review"><span class="tag">${f.correct ? 'Richtig' : 'Zum Wiederholen'}</span><h3>${esc(f.prompt)}</h3><p>Deine Antwort: ${esc(f.answer[0] ?? 'Übersprungen')}</p><p><strong>Lösung: ${esc(f.solution)}</strong></p><p class="muted">${esc(f.explanation)}</p></article>`).join('')}</div>`;
        }
        else {
            const index = feedback ? run.index - 1 : run.index, q = quiz.questions.find(q => q.id === run.queue[index]);
            if (!q)
                fail('Frage nicht gefunden.');
            html = `<div class="study"><div class="row between">${button('Pausieren', 'review', quiz.id)}<span class="muted">Frage ${index + 1} von ${run.queue.length}</span></div><progress max="${run.queue.length}" value="${run.index}" aria-label="Fortschritt der Lernrunde"></progress><section class="panel study-card"><span class="tag">${kindNames[q.kind]}</span><h1>${esc(q.prompt)}</h1><fieldset style="border:0;padding:0;margin:0" ${feedback ? 'disabled' : ''}><legend class="muted small" style="margin-bottom:12px">Wähle eine Antwort.</legend><div class="options">${q.options.map((option, i) => `<label class="option ${feedback ? (option === q.correct[0] ? 'correct' : feedback.answer.includes(option) ? 'incorrect' : '') : ''}"><input type="radio" name="answer" value="${i}" ${feedback ? feedback.answer.includes(option) ? 'checked' : '' : answerIndex === i ? 'checked' : ''}><span>${esc(option)}</span></label>`).join('')}</div></fieldset>${feedback ? `<div class="feedback ${feedback.correct ? 'success' : 'error'}"><h2>${feedback.correct ? 'Richtig!' : 'Diese Frage kommt zum Wiederholen.'}</h2><p><strong>Lösung: ${esc(feedback.solution)}</strong></p><p>${esc(feedback.explanation)}</p></div><div class="actions">${button(run.finished ? 'Ergebnis ansehen' : 'Nächste Frage', 'next', '', 'primary')}</div>` : `<div class="actions"><button id="answer-submit" class="primary" data-action="answer" ${answerIndex < 0 ? 'disabled' : ''}>Antwort prüfen</button>${button('Überspringen', 'skip')}</div>`}</section><p class="small muted" style="margin-top:16px">Überspringen zählt als falsch. Jede geprüfte Antwort wird sofort gespeichert.</p></div>`;
        }
    }
    else if (view === 'backup') {
        html = heading('Datenabgleich', 'Deine Quizze und Lernstände bleiben bei dir.') + `<div class="intro"><section class="panel"><h2>Sicherung herunterladen</h2><p>Speichert alle Quizze, Lösungen, Lernstände und die letzten bis zu 100 Lernrunden je Quiz in einer Datei.</p>${button('Sicherung herunterladen', 'export', '', 'primary')}<p class="small muted" style="margin-top:16px">Bewahre die Datei an einem sicheren Ort auf. Sie enthält deine Fragen und Antworten.</p></section><section class="panel"><h2>Daten abgleichen</h2><p>Öffne eine Learnify-Sicherung aus der Online-App oder von einem anderen Gerät. In der Vorschau entscheidest du pro Quiz, welche Daten du übernimmst.</p><label class="field">Sicherungsdatei auswählen<input type="file" id="backup-file" accept=".json,application/json"></label></section></div><section class="panel"><h2>Wo liegen meine Daten?</h2><p>Im lokalen Browserspeicher (${storageMode === 'idb' ? 'IndexedDB' : storageMode === 'local' ? 'lokaler Speicher' : 'nur Arbeitsspeicher'}). Es werden keine Daten an einen Server gesendet.</p><p>Die Daten stehen nicht direkt in den HTML-, JavaScript- oder JSON-Quelldateien. Ein anderer Browser, ein anderes Gerät oder ein anderer Speicherort der HTML-Datei kann einen eigenen Datenbestand anzeigen. Übertrage deine Daten dann mit einer Sicherung.</p><p>Beim Löschen von Website-Daten, im privaten Browserfenster oder bei einer Speicherbereinigung können Daten verloren gehen. Lade deshalb regelmäßig eine Sicherung herunter.</p><p class="muted">In der Online-App findest du unter „Datenabgleich“ denselben JSON-Export und Import. Es gibt keinen automatischen Hintergrundabgleich. Arbeite möglichst abwechselnd online und offline und übertrage vor dem Wechsel deine aktuelle Sicherung.</p></section>`;
    }
    $('app').innerHTML = (storageNote ? `<p class="note warning-note">${esc(storageNote)}</p>` : '') + html + `<footer>Learnify Offline · Keine Anmeldung · Keine KI · Keine Verbindung zum Internet erforderlich</footer>`;
}
async function navigate(next, id) { state = await readState(); view = next; if (id)
    selectedQuiz = id; feedback = null; answerIndex = -1; render(); window.scrollTo(0, 0); }
function openImport(example = false) {
    importToken++;
    draft = [];
    draftCsv = '';
    showModal(`<h2>Fragen importieren</h2><p class="muted">CSV oder JSON auswählen oder das CSV-Beispiel direkt laden. Die Vorschau wird vor dem Speichern geprüft.</p>${button('CSV-Beispiel laden', 'fill-example')}<label class="field">Quizname<input id="import-name" maxlength="100" value="Importiertes Quiz"></label><label class="field">Fragendatei (CSV oder JSON)<input id="csv-file" type="file" accept=".csv,.json,text/csv,application/json"></label><details><summary>Format & Vorlage</summary><p class="small">Maximal 100 Fragen und 500 KB. choice: vier Antworten und Lösung A–D. boolean: Antwortspalten leer lassen, Lösung Richtig oder Falsch.</p><pre>${esc(CSV_HEADER)}</pre>${button('CSV-Vorlage herunterladen', 'template')}</details><details><summary>CSV-Inhalt bearbeiten</summary><label class="field">CSV-Inhalt<textarea id="csv-text" rows="6" spellcheck="false"></textarea></label>${button('Vorschau aktualisieren', 'preview')}</details><p class="note">Fragen importieren legt ein neues Quiz ohne Lernfortschritt an. Eine Lernstandsicherung bitte unter „Datenabgleich“ einlesen.</p><div id="preview" class="preview"></div><button id="import-save" class="primary" data-action="save-import" disabled>Quiz speichern</button>`);
    if (example)
        fillExample();
}
function preview(text) { draft = []; draftCsv = text; $('modal-error').textContent = ''; $('preview').innerHTML = ''; $('import-save').disabled = true; try {
    draft = parseQuestionCsv(text);
    $('preview').innerHTML = `<h3>${draft.length} Fragen in der Vorschau</h3>` + draft.map((q, i) => `<article><strong>${i + 1}. ${esc(q.prompt)}</strong><p>${q.options.map(esc).join(' · ')}</p><p class="small"><strong>Lösung: ${esc(q.correct[0])}</strong><br>${esc(q.explanation)}</p></article>`).join('');
    $('import-save').disabled = false;
    $('import-save').textContent = `${draft.length} Fragen als Quiz speichern`;
}
catch (e) {
    showError(e);
} }
function fillExample() { importToken++; $('import-name').value = 'Leichte Mathe · 10 Fragen'; $('csv-text').value = LEARNIFY_SAMPLE_CSV; preview(LEARNIFY_SAMPLE_CSV); }
function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function csvFor(q) { return '\uFEFF' + questionsToCsv(q.questions); }
async function exportBackup() { state = await readState(); download('Learnify-Sicherung-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(state, null, 2), 'application/json'); toast('Die Sicherung wurde zum Download bereitgestellt.'); }
function confirmAction(title, text, action, id) { showModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions">${button('Abbrechen', 'close')}${button('Bestätigen', action, id, 'danger')}</div>`); }
function openEdit(id) { const q = quizIn(state, selectedQuiz).questions.find(q => q.id === id); if (!q)
    fail('Frage nicht gefunden.'); editingId = id; showModal(`<h2>Frage bearbeiten</h2><label class="field">Frage<textarea id="edit-prompt" maxlength="1800">${esc(q.prompt)}</textarea></label>${q.kind === 'choice' ? q.options.map((x, i) => `<label class="field">Antwort ${String.fromCharCode(65 + i)}<input id="edit-option-${i}" maxlength="300" value="${esc(x)}"></label>`).join('') : ''}<label class="field">Richtige Antwort<select id="edit-correct">${q.options.map((x, i) => `<option value="${i}" ${x === q.correct[0] ? 'selected' : ''}>${q.kind === 'choice' ? 'Antwort ' + String.fromCharCode(65 + i) : esc(x)}</option>`).join('')}</select></label><label class="field">Erklärung<textarea id="edit-explanation" maxlength="2000">${esc(q.explanation)}</textarea></label><p class="note">Der Lernstand dieser Frage wird zurückgesetzt. Pausierte Lernrunden dieses Quiz werden entfernt.</p>${button('Änderungen speichern', 'save-edit', '', 'primary')}`); }
async function startQuiz(id, fresh = false) { selectedQuiz = id; selectedRun = await writeState(s => beginRun(s, id, limit, fresh)); feedback = null; answerIndex = -1; view = 'learn'; render(); window.scrollTo(0, 0); }
document.addEventListener('click', e => {
    const target = e.target.closest('[data-action]');
    if (!target || target.disabled)
        return;
    const action = target.dataset.action, id = target.dataset.id;
    act(async () => {
        if (['home', 'quizzes', 'progress', 'backup', 'review'].includes(action))
            return navigate(action, id);
        if (action === 'close')
            return closeModal();
        if (action === 'import' || action === 'example')
            return openImport(action === 'example');
        if (action === 'fill-example')
            return fillExample();
        if (action === 'preview')
            return preview($('csv-text').value);
        if (action === 'template')
            return download('Learnify-Fragenvorlage.csv', '\uFEFF' + CSV_HEADER + '\n', 'text/csv;charset=utf-8');
        if (action === 'save-import') {
            const name = $('import-name').value, questions = parseQuestionCsv(draftCsv);
            if (!draft.length)
                fail('Bitte zuerst eine gültige Vorschau erstellen.');
            const quizId = await writeState(s => addQuiz(s, name, questions));
            closeModal();
            await navigate('review', quizId);
            toast('Quiz gespeichert.');
            return;
        }
        if (action === 'start')
            return startQuiz(id);
        if (action === 'fresh')
            return confirmAction('Neue Runde starten?', 'Die pausierte Runde wird ersetzt. Bereits beantwortete Fragen behalten ihren Lernstand.', 'confirm-fresh', id);
        if (action === 'confirm-fresh') {
            await startQuiz(id, true);
            closeModal();
            return;
        }
        if (action === 'answer' || action === 'skip') {
            const quiz = quizIn(state, selectedQuiz), run = quiz.runs.find(r => r.id === selectedRun);
            if (feedback)
                return;
            const q = quiz.questions.find(q => q.id === run.queue[run.index]);
            if (action === 'answer' && answerIndex < 0)
                fail('Bitte wähle eine Antwort.');
            feedback = await writeState(s => answerRun(s, selectedQuiz, selectedRun, run.index, action === 'skip' ? [] : [q.options[answerIndex]]));
            render();
            return;
        }
        if (action === 'next') {
            feedback = null;
            answerIndex = -1;
            render();
            window.scrollTo(0, 0);
            return;
        }
        if (action === 'rename') {
            const q = quizIn(state, id);
            showModal(`<h2>Quiz umbenennen</h2><label class="field">Quizname<input id="rename-name" maxlength="100" value="${esc(q.name)}"></label>${button('Speichern', 'save-name', id, 'primary')}`);
            return;
        }
        if (action === 'save-name') {
            const name = $('rename-name').value.trim();
            if (!name)
                fail('Bitte einen Namen eingeben.');
            await writeState(s => { quizIn(s, id).name = name; });
            closeModal();
            render();
            return;
        }
        if (action === 'delete-quiz')
            return confirmAction('Quiz löschen?', 'Alle Fragen, Lernstände und Lernrunden dieses Quiz werden entfernt.', 'confirm-delete-quiz', id);
        if (action === 'confirm-delete-quiz') {
            await writeState(s => { s.quizzes = s.quizzes.filter(q => q.id !== id); });
            closeModal();
            await navigate('quizzes');
            return;
        }
        if (action === 'delete-question')
            return confirmAction('Frage entfernen?', 'Diese Frage und ihr Lernstand werden entfernt. Pausierte Lernrunden dieses Quiz werden beendet.', 'confirm-delete-question', id);
        if (action === 'confirm-delete-question') {
            await writeState(s => removeQuestion(s, selectedQuiz, id));
            closeModal();
            render();
            return;
        }
        if (action === 'edit-question')
            return openEdit(id);
        if (action === 'save-edit') {
            const old = quizIn(state, selectedQuiz).questions.find(q => q.id === editingId), options = old.kind === 'choice' ? [0, 1, 2, 3].map(i => $('edit-option-' + i).value.trim()) : ['Richtig', 'Falsch'];
            const q = { ...old, prompt: $('edit-prompt').value, options, correct: [options[Number($('edit-correct').value)]], explanation: $('edit-explanation').value };
            await writeState(s => changeQuestion(s, selectedQuiz, q));
            closeModal();
            render();
            toast('Frage gespeichert. Lernstand zurückgesetzt.');
            return;
        }
        if (action === 'export')
            return exportBackup();
        if (action === 'export-csv') {
            download('Learnify-Fragen.csv', csvFor(quizIn(state, id)), 'text/csv;charset=utf-8');
            return;
        }
        if (action === 'restore') {
            if (!pendingBackup)
                fail('Bitte zuerst eine Sicherung auswählen.');
            const selected = Array.from(document.querySelectorAll('input[name="sync-pick"]:checked')).map(el => el.value);
            if (!selected.length)
                fail('Bitte mindestens ein Quiz auswählen.');
            const restore = copy(pendingBackup);
            await writeState(s => { if (s.revision !== pendingRevision)
                fail('Seit der Vorschau wurden Daten geändert. Bitte die Sicherungsdatei erneut auswählen.'); s.quizzes = applyBackup(s, restore, selected).quizzes; });
            closeModal();
            await navigate('home');
            toast(selected.length + ' Quizze mit Lernstand übernommen. Öffne Meine Quizze oder Lernfortschritt.');
            return;
        }
    });
});
document.addEventListener('change', e => {
    const el = e.target;
    if (el.name === 'answer') {
        answerIndex = Number(el.value);
        $('answer-submit').disabled = false;
        return;
    }
    if (el.id === 'round-limit') {
        limit = Number(el.value);
        return;
    }
    if (el.id === 'csv-file') {
        const file = el.files?.[0];
        el.value = '';
        if (!file)
            return;
        const token = ++importToken;
        draft = [];
        draftCsv = '';
        $('preview').innerHTML = '';
        $('import-save').disabled = true;
        act(async () => { if (file.size > 500000)
            fail('Bitte eine Fragendatei bis 500 KB wählen.'); const text = await file.text(); if (token !== importToken || !$('modal').open)
            return; let csv = text, name = file.name.replace(/\.(csv|json)$/i, '').slice(0, 100); if (/\.json$/i.test(file.name)) {
            const data = parseQuestionSet(text);
            name = data.name;
            csv = questionsToCsv(data.questions);
        } $('import-name').value = name; $('csv-text').value = csv; preview(csv); });
        return;
    }
    if (el.id === 'backup-file') {
        const file = el.files?.[0];
        el.value = '';
        if (!file)
            return;
        act(async () => {
            if (file.size > MAX_BACKUP_BYTES)
                fail('Bitte eine Sicherung bis 5 MB wählen.');
            pendingBackup = parseBackup(await file.text());
            state = await readState();
            pendingRevision = state.revision;
            const plan = planBackup(state, pendingBackup), labels = { new: 'Neues Quiz', same: 'Bereits identisch', conflict: 'Unterschiedliche Stände' };
            showModal(`<h2>Datenabgleich prüfen</h2><p>${plan.length} Quizze in der Datei. Neue Quizze ohne Namenskonflikt sind vorausgewählt. Wähle bei unterschiedlichen Ständen ausdrücklich, ob der Dateistand gelten soll.</p><div class="preview">${plan.map(q => `<article><span class="tag">${labels[q.status]}</span><h3>${esc(q.name)}</h3><p>Datei: ${esc(learningSummary(q.incoming))}</p>${q.current ? `<p>Hier: ${esc(learningSummary(q.current))}</p>` : ''}${q.incoming.attempts === 0 ? '<p class="note warning-note">Diese Datei enthält für dieses Quiz noch keine beantworteten Fragen. Sie bringt keinen Lernfortschritt mit.</p>' : ''}${q.sameName ? '<p class="note warning-note">Dieses Quiz wurde getrennt angelegt. Es wird mit dem Lernstand aus der Datei zusätzlich hinzugefügt. Das bisherige gleichnamige Quiz bleibt unverändert. Prüfe danach das neu hinzugefügte Quiz unter „Meine Quizze“.</p>' : ''}${q.status !== 'same' ? `<label class="option"><input type="checkbox" name="sync-pick" value="${esc(q.id)}" ${q.status === 'new' && !q.sameName ? 'checked' : ''}><span>${q.status === 'new' ? 'Neues Quiz mit Lernstand hinzufügen' : 'Dateistand verwenden – ersetzt Fragen, Lernstand und Lernrunden dieses Quiz'}</span></label>` : ''}</article>`).join('')}</div><p class="note warning-note">Es werden keine Lernzahlen addiert. Beim Ersetzen kann ein neuerer Stand überschrieben werden. Nicht ausgewählte und nicht in der Datei enthaltene Quizze bleiben erhalten.</p><div class="actions">${button('Aktuelle Daten sichern', 'export')}${button('Abbrechen', 'close')}${button('Auswahl übernehmen', 'restore', '', 'primary')}</div>`);
        });
    }
});
document.addEventListener('input', e => { if (e.target.id === 'csv-text') {
    draft = [];
    draftCsv = '';
    $('preview').innerHTML = '';
    $('import-save').disabled = true;
} });
$('modal').addEventListener('cancel', e => { if (busy)
    e.preventDefault();
else {
    importToken++;
    pendingBackup = null;
} });
openStorage().then(render).catch(e => {
    document.querySelectorAll('nav button').forEach(b => b.disabled = true);
    $('storage-status').textContent = 'Speicher nicht verfügbar';
    $('app').innerHTML = '<h1>Daten konnten nicht geöffnet werden</h1><p>Vorhandene Daten wurden nicht verändert. Versuche dieselbe Datei im bisherigen Browser erneut zu öffnen.</p>';
    showError(e);
});
