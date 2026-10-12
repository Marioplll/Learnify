// CSV-Format prüfen und in Fragen umwandeln. Keine eingebetteten Beispielfragen.
const CSV_HEADER = 'typ;frage;antwort_a;antwort_b;antwort_c;antwort_d;richtig;erklaerung';
function parseQuestionCsv(input) {
    if (new TextEncoder().encode(input).length > 500000)
        throw new Error('Die CSV-Datei darf höchstens 500 KB groß sein.');
    const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const delimiter = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n')).includes(';') ? ';' : ',';
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                field += c;
            continue;
        }
        if (c === '"') {
            if (field || closed)
                throw new Error('Anführungszeichen müssen das gesamte Feld umschließen.');
            quoted = true;
            continue;
        }
        if (c === delimiter || c === '\n') {
            row.push(field.trim());
            field = '';
            closed = false;
            if (c === '\n') {
                if (row.some(Boolean))
                    rows.push(row);
                row = [];
            }
            continue;
        }
        if (closed) {
            if (c === ' ' || c === '\t')
                continue;
            throw new Error('Nach einem geschlossenen Textfeld muss ein Trennzeichen folgen.');
        }
        field += c;
    }
    if (quoted)
        throw new Error('Ein Textfeld hat kein schließendes Anführungszeichen.');
    row.push(field.trim());
    if (row.some(Boolean))
        rows.push(row);
    if (rows[0]?.map(s => s.toLowerCase()).join(';') !== CSV_HEADER)
        throw new Error('Die Spaltenüberschriften fehlen oder passen nicht. Bitte verwende die CSV-Vorlage.');
    if (rows.length < 2 || rows.length > 101)
        throw new Error('Die Datei muss 1 bis 100 Fragen enthalten.');
    const seen = new Set();
    return rows.slice(1).map((r, i) => {
        const fail = (message) => { throw new Error(`Frage ${i + 1}: ${message}`); };
        if (r.length !== 8)
            fail('Es müssen genau 8 Spalten vorhanden sein.');
        const [type, prompt, a, b, c, d, key, explanation] = r;
        const kind = type.toLowerCase();
        if (kind !== 'choice' && kind !== 'boolean')
            fail('Als Typ sind choice und boolean erlaubt.');
        if (prompt.length < 8 || prompt.length > 1800)
            fail('Die Frage braucht 8 bis 1800 Zeichen.');
        if (explanation.length > 2000)
            fail('Die Erklärung darf höchstens 2000 Zeichen haben.');
        const signature = prompt.normalize('NFC').toLowerCase();
        if (seen.has(signature))
            fail('Diese Frage kommt doppelt vor.');
        seen.add(signature);
        let options, correct;
        if (kind === 'choice') {
            options = [a, b, c, d];
            if (options.some(o => !o || o.length > 300) || new Set(options.map(o => o.normalize('NFC').toLowerCase())).size !== 4)
                fail('Vier unterschiedliche Antworten mit jeweils 1 bis 300 Zeichen angeben.');
            if (!/^[A-D]$/i.test(key))
                fail('Die richtige Antwort muss A, B, C oder D sein.');
            correct = [options[key.toUpperCase().charCodeAt(0) - 65]];
        }
        else {
            if (a || b || c || d)
                fail('Bei boolean bleiben die vier Antwortspalten leer.');
            if (!/^(richtig|falsch)$/i.test(key))
                fail('Die Lösung muss Richtig oder Falsch heißen.');
            options = ['Richtig', 'Falsch'];
            correct = [key.toLowerCase() === 'richtig' ? 'Richtig' : 'Falsch'];
        }
        return { id: crypto.randomUUID(), kind: kind, prompt, options, correct, sources: [], explanation };
    });
}
