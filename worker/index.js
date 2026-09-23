// SecondGlow-Türsteher: prüft Code + Tageslimit, schickt Fotos an Claude, gibt das Inserat als JSON zurück.
// Secrets (wrangler secret put): ANTHROPIC_API_KEY, APP_CODE. KV-Binding: LIMIT.
import Anthropic, { APIError, RateLimitError } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = 'claude-sonnet-5';
const DAILY_LIMIT = 50, MAX_IMAGES = 10;

const Listing = z.object({
  title: z.string(),
  description: z.string(),
  defects: z.array(z.string()),
  category: z.string(),
  brand: z.string(),
  size: z.string(),
  condition: z.enum(['Neu mit Etikett', 'Neu ohne Etikett', 'Sehr gut', 'Gut', 'Zufriedenstellend']),
  color: z.string(),
  material: z.string(),
  package: z.enum(['Klein', 'Mittel', 'Groß']),
});

const SYSTEM = `Du schreibst Vinted-Inserate für eine private Verkäuferin in Deutschland. Sie verkauft vor allem Damenkleidung, manchmal Schuhe und Deko. Du bekommst Fotos eines einzelnen Artikels und manchmal ihre Stichworte.

Ihre Stichworte haben immer Vorrang vor dem, was du auf den Fotos zu erkennen glaubst.

Titel (title):
- Höchstens 100 Zeichen. Aufbau: Marke + Artikeltyp + Größe + Farbe + ein Hauptmerkmal (etwas Sichtbares, das Käuferinnen suchen: Schnitt, Muster, Stoff, Stil – nie etwas, das fehlt), z. B. "Zara Wollmantel Größe 38 Camel Zweireiher".
- Sachlich, keine Werbe-Adjektive, keine Emojis, keine Hashtags. Vinted durchsucht vor allem den Titel.

Beschreibung (description):
- 2–4 kurze Absätze, zusammen höchstens 1200 Zeichen. Freundlich, ehrlich, natürlich, höchstens 1–3 passende Emojis.
- Was rein gehört: was es ist, Schnitt/Passform (z. B. "fällt klein aus", nur wenn bekannt), Material laut Etikett (nur wenn auf einem Foto lesbar oder in den Stichworten), ein kurzer Styling-Tipp.
- Einen Verkaufsgrund nur, wenn er in den Stichworten steht – sonst keinen erfinden. Überhaupt: nichts behaupten, was weder auf den Fotos zu sehen ist noch in den Stichworten steht.
- Suchbegriffe natürlich einweben (Artikelart, Stil, Anlass). Keine Hashtags, keine Keyword-Listen, keine fremden Markennamen – das gilt bei Vinted als Spam.
- NICHT in die Beschreibung: Maße, Mängel, Versand- oder Haushaltshinweise. Das fügt die App selbst an.

Mängel (defects):
- Jeder sichtbare oder in den Stichworten genannte Mangel als kurze, ehrliche Formulierung, z. B. "leichtes Pilling unter den Ärmeln", "kleiner Fleck am rechten Ärmel (siehe Foto 4)".
- Nichts erfinden. Keine Mängel erkennbar: leere Liste.

Felder:
- category: Vinted-Kategoriepfad auf Deutsch, z. B. "Damen › Kleidung › Kleider › Midikleider".
- brand, size, material, color: nur was auf Fotos/Etikett erkennbar oder in den Stichworten steht, sonst "nicht erkennbar". Nie raten.
- condition: eine der fünf Vinted-Stufen. "Neu mit Etikett" nur mit sichtbarem Originaletikett. "Neu ohne Etikett" nur, wenn die Stichworte sagen, dass es nie getragen wurde. "Sehr gut" nur ohne jeden Fleck, Loch oder Riss. Sichtbare Gebrauchsspuren: "Gut". Deutliche Mängel: "Zufriedenstellend".
- package: Klein (bis 0,5 kg: Shirts, Blusen, Schmuck), Mittel (bis 1 kg: Kleider, Jeans, Pullover, Schuhe), Groß (bis 2 kg: Wintermäntel, Stiefel).`;

function userContent(b) {
  const images = (b.images || []).slice(0, MAX_IMAGES).map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
  const parts = [];
  if (b.notes?.trim()) parts.push(`Stichworte der Verkäuferin:\n${b.notes.trim()}`);
  if (b.measures?.trim()) parts.push(`Maße (hängt die App selbst an, nur als Info für Größe/Passform):\n${b.measures.trim()}`);
  if (b.examples?.trim()) parts.push(`Vorbild-Inserate der Verkäuferin. Übernimm Ton, Länge und Stil, nicht den Inhalt:\n${b.examples.trim()}`);
  if (b.previous) {
    parts.push(`Bisheriges Inserat (kann Fehler enthalten – übernimm nur, was durch Fotos oder Stichworte belegt ist; alle Regeln gelten weiter):\n${JSON.stringify(b.previous)}`);
    parts.push(b.change?.trim() ? `Änderungswunsch: ${b.change.trim()}\nÄndere nur, was sich daraus ergibt.` : 'Schreib Titel und Beschreibung neu, in einer spürbar anderen Formulierung. Die belegten Fakten bleiben.');
  }
  if (!images.length && !b.previous) parts.push('(Keine Fotos – arbeite nur mit den Stichworten.)');
  parts.push('Erstelle jetzt das Inserat.');
  return [...images, { type: 'text', text: parts.join('\n\n') }];
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

export async function handle(req, env, client) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Ungültige Anfrage.' }, 400); }
  if (!env.APP_CODE || b.code !== env.APP_CODE) return json({ error: 'Falscher Code.' }, 401);
  if (!Array.isArray(b.images) || b.images.length > MAX_IMAGES || b.images.some(i => typeof i !== 'string')) return json({ error: 'Höchstens 10 Fotos.' }, 400);
  if (!b.images.length && !b.previous) return json({ error: 'Bitte mindestens ein Foto.' }, 400);

  // ponytail: Zähler ohne Sperre, bei zwei gleichzeitigen Anfragen kann einer durchrutschen – bei 50/Tag egal
  const day = 'n:' + new Date().toISOString().slice(0, 10);
  const used = Number(await env.LIMIT.get(day)) || 0;
  if (used >= DAILY_LIMIT) return json({ error: 'Tageslimit erreicht.' }, 429);
  await env.LIMIT.put(day, String(used + 1), { expirationTtl: 60 * 60 * 48 });

  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: zodOutputFormat(Listing) },
      messages: [{ role: 'user', content: userContent(b) }],
    });
    if (res.stop_reason === 'refusal') return json({ error: 'Claude wollte zu diesen Fotos nichts schreiben.' }, 422);
    if (!res.parsed_output) return json({ error: 'Die Antwort war unvollständig. Bitte nochmal versuchen.' }, 502);
    return json({ result: res.parsed_output });
  } catch (e) {
    console.error('claude', e?.status, e?.message);
    if (e instanceof RateLimitError) return json({ error: 'Claude ist gerade ausgelastet. Gleich nochmal versuchen.' }, 503);
    if (e instanceof APIError && e.status) return json({ error: `Claude-Fehler ${e.status}. Bitte nochmal versuchen.` }, 502);
    return json({ error: 'Keine Verbindung zu Claude. Bitte nochmal versuchen.' }, 502);
  }
}

export default {
  fetch: (req, env) => handle(req, env, new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })),
};
