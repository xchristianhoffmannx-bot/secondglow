'use strict';
// Nach dem Worker-Deploy hier die Adresse eintragen. Leer = Test-Modus mit Beispieltext.
const WORKER_URL = 'https://secondglow.secondglow-worker.workers.dev';

// ---------- Reine Logik (von test.js geprüft) ----------
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r05 = n => Math.round(n * 2) / 2;
const TITLE_MAX = 100, DESC_MAX = 2000, MAX_PHOTOS = 10, MAX_ITEMS = 300;

// Vinted-Richtwerte vom Neupreis (Quelle: Vinted-Notebook, brand/vinted-regeln.md)
const PRICE_SHARE = { 'Neu mit Etikett': [.6, .8], 'Neu ohne Etikett': [.6, .8], 'Sehr gut': [.4, .6], 'Gut': [.2, .4], 'Zufriedenstellend': [.2, .4] };
function priceRange(newPrice, condition) {
  const p = num(newPrice), s = PRICE_SHARE[condition];
  if (!p || !s) return null;
  return [Math.max(1, r05(p * s[0])), Math.max(1, r05(p * s[1]))];
}

function measureText(m = {}) {
  const parts = [['Achsel–Achsel', m.a], ['Länge', m.l], ['Bund', m.b]].filter(([, v]) => num(v) > 0).map(([k, v]) => `${k} ${num(v).toLocaleString('de-DE')} cm`);
  if (String(m.o || '').trim()) parts.push(String(m.o).trim());
  return parts.join(' · ');
}

// Beschreibung = Claude-Text + angehakte Mängel + Maße + Textbaustein. Deterministisch, damit Häkchen live wirken.
function composeDescription(r, off = [], m = {}, footer = '') {
  const blocks = [String(r.description || '').trim()];
  const d = (r.defects || []).filter((_, i) => !off.includes(i));
  if (d.length) blocks.push('Hinweis zum Zustand: ' + d.join('; ') + '.');
  const mt = measureText(m);
  if (mt) blocks.push('📏 Maße (flach gemessen): ' + mt);
  if (String(footer).trim()) blocks.push(String(footer).trim());
  return blocks.filter(Boolean).join('\n\n');
}

// Schuhgröße geht als Stichwort an Claude – Stichworte haben dort Vorrang vor den Fotos
const notesFor = (notes, shoe) => [String(notes || '').trim(), String(shoe || '').trim() && `Schuhgröße (EU): ${String(shoe).trim()}`].filter(Boolean).join('\n');

const DEFAULT_FOOTER = 'Tierfreier Nichtraucherhaushalt 🌿\nVersand innerhalb von 2 Tagen. Schau gern in meinen Kleiderschrank – Bündeln spart Versand!';
const DEFAULT_EXAMPLES = '';
const defaults = () => ({ set: { footer: DEFAULT_FOOTER, examples: DEFAULT_EXAMPLES, code: '' }, items: [] });
const uid = () => Math.random().toString(36).slice(2, 9);

if (typeof module !== 'undefined') module.exports = { priceRange, composeDescription, measureText, notesFor, r05, num };

// ---------- Oberfläche ----------
if (typeof document !== 'undefined') (() => {
  const KEY = 'secondglow.v1';
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.set && s.items) return s; } catch (e) {} return defaults(); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { alert('Speicher voll – bitte alte Artikel löschen.'); return false; } };
  let S = load(), tab = 'new', busy = false, err = '';
  // Aktueller Entwurf. Fotos nur im Speicher: Vinted bekommt sie von ihr direkt.
  let cur = blank();
  function blank() { return { photos: [], notes: '', m: { a: '', l: '', b: '', o: '' }, newPrice: '', shoe: '', r: null, off: [], id: null, change: '' }; }

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = n => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0 });
  const field = (attr, val, label, extra = '') => `<label class="f"><span>${label}</span><input ${attr} value="${esc(val)}" ${extra}></label>`;
  const cm = k => field(`data-m="${k}" type="text" inputmode="decimal"`, cur.m[k], { a: 'Achsel–Achsel (cm)', l: 'Länge (cm)', b: 'Bund (cm)' }[k]);

  const views = {
    new() {
      if (cur.r) return resultView();
      return `<h1>Aus deinen Fotos wird ein Inserat.</h1>
      <p class="hint">Fotos rein, Knopf drücken, Text kopieren.</p>
      ${WORKER_URL ? '' : '<div class="banner">Test-Modus: Es kommt ein Beispieltext, die KI ist noch nicht verbunden.</div>'}
      <section class="card"><div class="row"><h2>Fotos</h2><span class="count">${cur.photos.length}/${MAX_PHOTOS}</span></div>
        <div class="photos">${cur.photos.map((p, i) => `<div><img src="${p}" alt="Foto ${i + 1}"><button data-a="rmph" data-i="${i}" aria-label="Foto entfernen">✕</button></div>`).join('')}
        ${cur.photos.length < MAX_PHOTOS ? '<div class="add" data-a="pick" role="button" tabindex="0"><b>+</b>Foto</div>' : ''}</div>
        <p class="hint">Tipp: Vorder- und Rückseite, Marken- und Pflegeetikett, Mängel aus der Nähe. Ab 5 Fotos verkauft es sich schneller.</p>
      </section>
      <section class="card"><h2>Deine Stichworte <span class="count">(optional)</span></h2>
        <textarea data-c="notes" placeholder="z. B. kaum getragen, fällt klein aus, Zara">${esc(cur.notes)}</textarea>
        <details${measureText(cur.m) || cur.newPrice || cur.shoe ? ' open' : ''}><summary>Maße, Schuhgröße & Neupreis (optional)</summary>
          <div class="g3">${cm('a')}${cm('l')}${cm('b')}</div>
          ${field('data-c="shoe" type="text" inputmode="decimal" list="shoes"', cur.shoe, 'Schuhgröße (EU)', 'placeholder="z. B. 39"')}
          <datalist id="shoes">${Array.from({ length: 25 }, (_, i) => `<option value="${String(34 + i / 2).replace('.', ',')}">`).join('')}</datalist>
          ${field('data-m="o" type="text"', cur.m.o, 'Andere Maße', 'placeholder="z. B. Deko: 20 × 15 × 8 cm"')}
          ${field('data-c="newPrice" type="text" inputmode="decimal"', cur.newPrice, 'Neupreis (€) – für einen Preis-Richtwert')}
        </details>
      </section>
      ${err ? `<p class="warn">${esc(err)}</p>` : ''}
      <button class="primary" data-a="go" ${busy || !cur.photos.length ? 'disabled' : ''}>${busy ? '<span class="spin"></span> Claude schaut sich die Fotos an …' : 'Inserat erstellen'}</button>`;
    },
    items() {
      if (!S.items.length) return '<h1>Meine Artikel</h1><p class="hint">Noch nichts erstellt. Fertige Inserate landen automatisch hier.</p>';
      return '<h1>Meine Artikel</h1>' + S.items.map(it => `<section class="card" style="padding:6px">
        <div class="row"><button class="item" data-a="open" data-id="${esc(it.id)}" style="border:0;background:none">${/^data:image\//.test(it.thumb) ? `<img src="${esc(it.thumb)}" alt="">` : '<i></i>'}
          <span><b>${esc(it.r.title)}</b><small>${new Date(it.date).toLocaleDateString('de-DE')}</small></span></button>
        <button class="del" data-a="del" data-id="${esc(it.id)}" aria-label="Löschen">✕</button></div></section>`).join('');
    },
    set() {
      const s = S.set;
      return `<h1>Einstellungen</h1>
      <section class="card"><h2>Textbaustein</h2><p class="hint">Steht unter jeder Beschreibung.</p>
        <textarea data-s="footer" rows="4">${esc(s.footer)}</textarea></section>
      <section class="card"><h2>Vorbild-Inserate</h2><p class="hint">2–3 deiner Inserate, die sich gut verkauft haben. Claude schreibt dann in deinem Ton.</p>
        <textarea data-s="examples" rows="8" placeholder="Inserat 1 …&#10;---&#10;Inserat 2 …">${esc(s.examples)}</textarea></section>
      <section class="card"><h2>Zugangscode</h2><p class="hint">Einmal eingeben, bleibt auf diesem Handy.</p>
        <input data-s="code" type="password" autocomplete="off" value="${esc(s.code)}"></section>
      <section class="card"><h2>Datensicherung</h2><p class="hint">Alles liegt nur auf diesem Handy. Gelegentlich sichern.</p>
        <div class="two"><button class="ghost" data-a="export">Sichern</button><button class="ghost" data-a="import">Wiederherstellen</button></div></section>`;
    },
  };

  function resultView() {
    const r = cur.r, desc = composeDescription(r, cur.off, cur.m, S.set.footer), range = priceRange(cur.newPrice, r.condition);
    const cnt = cntHtml;
    return `${WORKER_URL ? '' : '<div class="banner">Test-Modus: Beispieltext.</div>'}
    <section class="card"><div class="row"><h2>Titel</h2><span id="tcnt">${cnt(r.title.length, TITLE_MAX)}</span></div>
      <textarea class="out" data-title rows="2" aria-label="Titel bearbeiten">${esc(r.title)}</textarea>
      <p class="hint" style="margin-top:-4px">Du kannst den Titel direkt ändern.</p><button class="copy" data-a="copy" data-k="title">Titel kopieren</button></section>
    <section class="card"><div class="row"><h2>Beschreibung</h2>${cnt(desc.length, DESC_MAX)}</div>
      <p class="out">${esc(desc)}</p><button class="copy" data-a="copy" data-k="desc">Beschreibung kopieren</button></section>
    ${r.defects.length ? `<section class="card defects"><h2>Erkannte Mängel</h2><p class="hint">Angehakt = steht ehrlich im Text. Verschwiegene Mängel führen bei Vinted zu Rückgaben.</p>
      ${r.defects.map((d, i) => `<label class="chk"><input type="checkbox" data-off="${i}" ${cur.off.includes(i) ? '' : 'checked'}><span>${esc(d)}</span></label>`).join('')}</section>` : ''}
    <section class="card"><h2>Für die Vinted-Felder</h2><div class="kv">
      ${[['Kategorie', r.category], ['Marke', r.brand], ['Größe', r.size], ['Zustand', r.condition], ['Farbe', r.color], ['Material', r.material], ['Paket', r.package]]
        .map(([k, v]) => `<span>${k}</span><b>${esc(v || '–')}</b>`).join('')}</div>
      ${r.condition === 'Neu ohne Etikett' ? '<p class="warn">„Neu ohne Etikett“ nur, wenn nie draußen getragen und nie gewaschen – sonst „Sehr gut“ wählen.</p>' : ''}</section>
    ${range ? `<section class="card price"><h2>Preis-Richtwert</h2><b>${eur(range[0])} – ${eur(range[1])}</b>
      <p class="hint">Vinted-Richtwert für „${esc(r.condition)}“ vom Neupreis ${eur(num(cur.newPrice))}. Setz ihn 10–20 % höher an, Käufer handeln gern.</p></section>` : ''}
    <section class="card"><h2>Nicht zufrieden?</h2>
      <input data-c="change" placeholder="ändere: z. B. kürzer, Marke ist Zara" value="${esc(cur.change)}">
      ${err ? `<p class="warn">${esc(err)}</p>` : ''}
      <div class="two" style="margin-top:10px"><button class="ghost" data-a="redo" ${busy ? 'disabled' : ''}>${busy ? '…' : 'Neu schreiben'}</button>
      <button class="primary" data-a="apply" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>' : 'Ändern'}</button></div></section>
    <button class="ghost" data-a="fresh">+ Nächster Artikel</button>`;
  }

  const cntHtml = (n, max) => `<span class="count${n > max ? ' over' : ''}">${n}/${max}</span>`;

  function render() {
    $('#app').innerHTML = views[tab]();
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  }

  // Fotos verkleinern: schneller, günstiger, Etiketten bleiben lesbar.
  async function shrink(file, max, q) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  async function thumbOf(dataUrl) {
    const img = new Image(); img.src = dataUrl; await img.decode();
    return shrink(img, 112, .6);
  }

  async function ask(change) {
    const body = {
      code: S.set.code, notes: notesFor(cur.notes, cur.shoe), measures: measureText(cur.m), examples: S.set.examples,
      images: cur.photos.map(p => p.split(',')[1]), change: change || '', previous: change != null && cur.r ? cur.r : null,
    };
    if (!WORKER_URL) { await new Promise(r => setTimeout(r, 900)); return demo(); }
    const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Der Zugangscode stimmt nicht. Prüf ihn unter „Einstellungen“.');
    if (res.status === 429) throw new Error('Tageslimit erreicht. Morgen geht es weiter.');
    if (!res.ok || !j.result) throw new Error(j.error || 'Das hat nicht geklappt. Bitte gleich nochmal versuchen.');
    return j.result;
  }

  async function run(change) {
    if (busy) return;
    if (WORKER_URL && !S.set.code) { err = 'Bitte zuerst unter „Einstellungen“ den Zugangscode eintragen.'; render(); return; }
    busy = true; err = ''; render();
    try {
      const r = await ask(change);
      const fresh = !cur.id;
      cur.r = r; cur.off = []; cur.change = '';
      if (fresh) {
        cur.id = uid();
        S.items.unshift({ id: cur.id, date: Date.now(), thumb: cur.photos[0] ? await thumbOf(cur.photos[0]) : '', notes: cur.notes, m: cur.m, newPrice: cur.newPrice, shoe: cur.shoe, r, off: [] });
        S.items.length = Math.min(S.items.length, MAX_ITEMS); // ponytail: älteste fliegen raus, Speicher bleibt klein
      } else Object.assign(S.items.find(x => x.id === cur.id) || {}, { r, off: [] });
      save();
    } catch (e) { err = e.message || String(e); }
    busy = false; render(); scrollTo(0, 0);
  }

  function demo() {
    return {
      title: 'Zara Strickpullover Größe M Beige Oversize Grobstrick',
      description: 'Kuscheliger Oversize-Pullover von Zara in warmem Beige 🤎\nGrobstrick mit leicht überschnittenen Schultern – perfekt zu Jeans oder über einem Kleid.\n\nMaterial: 60 % Baumwolle, 40 % Polyacryl (laut Etikett). Fällt größengetreu, durch den Schnitt etwas weiter.\n\nIch verkaufe ihn, weil ich zu viele Pullover habe.',
      defects: ['leichtes Pilling unter den Ärmeln', 'kleiner Fadenzieher am linken Bündchen'],
      category: 'Damen › Kleidung › Pullover & Sweatshirts › Pullover', brand: 'Zara', size: 'M', condition: 'Gut', color: 'Beige', material: 'Baumwolle', package: 'Mittel',
    };
  }

  async function copy(text, b) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    const old = b.textContent; b.textContent = 'Kopiert ✓'; b.classList.add('ok');
    setTimeout(() => { b.textContent = old; b.classList.remove('ok'); }, 1500);
  }

  document.addEventListener('input', e => {
    const d = e.target.dataset, v = e.target.value;
    if (d.c) cur[d.c] = v;
    else if (d.m) cur.m[d.m] = v;
    else if (d.s) { S.set[d.s] = v; save(); }
    else if (d.title != null) {
      // Kein render(): sonst springt der Cursor raus. Nur Zähler und Verlauf nachziehen.
      cur.r.title = v; $('#tcnt').innerHTML = cntHtml(v.length, TITLE_MAX);
      const it = S.items.find(x => x.id === cur.id); if (it) { it.r.title = v; save(); }
    } else if (d.off != null) {
      const i = +d.off; cur.off = e.target.checked ? cur.off.filter(x => x !== i) : [...cur.off, i];
      const it = S.items.find(x => x.id === cur.id); if (it) { it.off = cur.off; save(); }
      render();
    }
  });

  const act = {
    pick: () => $('#pick').click(),
    rmph: d => { cur.photos.splice(+d.i, 1); render(); },
    go: () => run(),
    redo: () => run(''),
    apply: () => cur.change.trim() ? run(cur.change.trim()) : (err = 'Schreib kurz, was geändert werden soll.', render()),
    fresh: () => { cur = blank(); err = ''; render(); scrollTo(0, 0); },
    copy: (d, b) => copy(d.k === 'title' ? cur.r.title : composeDescription(cur.r, cur.off, cur.m, S.set.footer), b),
    open: d => { const it = S.items.find(x => x.id === d.id); cur = { ...blank(), ...JSON.parse(JSON.stringify(it)), photos: [] }; err = ''; tab = 'new'; render(); scrollTo(0, 0); },
    del: d => { if (confirm('Diesen Artikel aus dem Verlauf löschen?')) { S.items = S.items.filter(x => x.id !== d.id); if (cur.id === d.id) cur = blank(); save(); render(); } },
    export: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = `secondglow-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    },
    import: () => $('#imp').click(),
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a],[data-t]'); if (!b) return;
    if (b.dataset.t) { tab = b.dataset.t; err = ''; render(); scrollTo(0, 0); return; }
    act[b.dataset.a](b.dataset, b);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.a === 'pick') act.pick(); });

  $('#pick').addEventListener('change', async e => {
    const files = [...e.target.files].slice(0, MAX_PHOTOS - cur.photos.length); e.target.value = '';
    for (const f of files) { try { cur.photos.push(await shrink(f, 1024, .82)); } catch (x) { err = 'Ein Foto konnte nicht gelesen werden.'; } }
    render();
  });
  $('#imp').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result); if (!s.set || !Array.isArray(s.items)) throw 0;
        if (confirm('Alle aktuellen Daten durch die Sicherung ersetzen?')) { S = s; save(); render(); }
      } catch (x) { alert('Diese Datei ist keine gültige Sicherung.'); }
    };
    rd.readAsText(f); e.target.value = '';
  });

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
