// Ausführen: node test.js
const assert = require('assert');
const { priceRange, composeDescription, measureText, notesFor } = require('./app.js');

// Preis-Richtwert: Anteil vom Neupreis je Zustand, auf 0,50 gerundet
assert.deepEqual(priceRange('50', 'Sehr gut'), [20, 30]);
assert.deepEqual(priceRange('39,99', 'Gut'), [8, 16]);
assert.deepEqual(priceRange('3', 'Zufriedenstellend'), [1, 1]);   // nie unter 1 €
assert.equal(priceRange('', 'Gut'), null);
assert.equal(priceRange('50', 'Kaputt'), null);

// Maße: leere Felder fallen weg, Komma geht
assert.equal(measureText({ a: '48', l: '', b: '36,5', o: '' }), 'Achsel–Achsel 48 cm · Bund 36,5 cm');
assert.equal(measureText({}), '');

// Beschreibung: abgehakte Mängel fliegen raus, Reihenfolge Text → Mängel → Maße → Baustein
const r = { description: 'Schöner Pulli.', defects: ['Pilling', 'Fadenzieher'] };
const d = composeDescription(r, [0], { l: '60' }, 'Nichtraucher');
assert.equal(d, 'Schöner Pulli.\n\nHinweis zum Zustand: Fadenzieher.\n\n📏 Maße (flach gemessen): Länge 60 cm\n\nNichtraucher');
assert.equal(composeDescription(r, [0, 1], {}, ''), 'Schöner Pulli.');
// Schuhgröße wird zum Stichwort, leere Felder erzeugen nichts
assert.equal(notesFor('kaum getragen', '39,5'), 'kaum getragen\nSchuhgröße (EU): 39,5');
assert.equal(notesFor('', '40'), 'Schuhgröße (EU): 40');
assert.equal(notesFor('Zara', ''), 'Zara');
console.log('ok');
