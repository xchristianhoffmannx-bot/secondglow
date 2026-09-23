// Ausführen: node test.js  (ohne Netz: Claude und KV sind Attrappen)
import assert from 'assert';
import { handle } from './index.js';

const kv = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => m.set(k, v) }; };
const env = { APP_CODE: 'geheim', LIMIT: kv() };
const ok = { title: 'T', description: 'D', defects: [], category: 'c', brand: 'b', size: 's', condition: 'Gut', color: 'x', material: 'm', package: 'Mittel' };
let sent;
const client = { messages: { parse: async p => { sent = p; return { stop_reason: 'end_turn', parsed_output: ok }; } } };
const post = body => new Request('https://w/', { method: 'POST', body: JSON.stringify(body) });

assert.equal((await handle(post({ code: 'falsch', images: ['x'] }), env, client)).status, 401);
assert.equal((await handle(post({ code: 'geheim', images: Array(11).fill('x') }), env, client)).status, 400);
assert.equal((await handle(post({ code: 'geheim', images: [] }), env, client)).status, 400);

const r = await handle(post({ code: 'geheim', images: ['AAA', 'BBB'], notes: 'kaum getragen' }), env, client);
assert.equal(r.status, 200);
assert.deepEqual((await r.json()).result, ok);
assert.equal(sent.model, 'claude-sonnet-5');
assert.equal(sent.messages[0].content.filter(c => c.type === 'image').length, 2);
assert.ok(sent.messages[0].content.at(-1).text.includes('kaum getragen'));
assert.equal(sent.output_config.format.type, 'json_schema');

// Ändern ohne Fotos (aus dem Verlauf) ist erlaubt
assert.equal((await handle(post({ code: 'geheim', images: [], previous: ok, change: 'kürzer' }), env, client)).status, 200);
assert.ok(sent.messages[0].content.at(-1).text.includes('Änderungswunsch: kürzer'));

// Tageslimit: nach 50 Anfragen ist Schluss (2 sind schon verbraucht)
for (let i = 0; i < 48; i++) await handle(post({ code: 'geheim', images: ['A'] }), env, client);
assert.equal((await handle(post({ code: 'geheim', images: ['A'] }), env, client)).status, 429);

const refuse = { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } };
assert.equal((await handle(post({ code: 'geheim', images: ['A'] }), { ...env, LIMIT: kv() }, refuse)).status, 422);
// Claude-Fehler kommen als sauberes JSON mit CORS-Header zurück, nicht als Absturz
const boom = { messages: { parse: async () => { throw new Error('netz weg'); } } };
const e = await handle(post({ code: 'geheim', images: ['A'] }), { ...env, LIMIT: kv() }, boom);
assert.equal(e.status, 502);
assert.equal(e.headers.get('access-control-allow-origin'), '*');
console.log('ok');
