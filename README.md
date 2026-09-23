# SecondGlow

Android-PWA für Vinted-Inserate: Fotos → Claude (Sonnet 5) → Titel + Beschreibung zum Kopieren.
Vinted-Regeln: [brand/vinted-regeln.md](brand/vinted-regeln.md)

## Aufbau
- `index.html`, `app.js`, `sw.js`, `manifest.json`: die App, kein Build-Schritt. Daten nur in `localStorage`.
- `worker/`: Cloudflare Worker. Hält den API-Schlüssel, prüft den Zugangscode, erlaubt 50 Inserate pro Tag.
- Ist `WORKER_URL` in `app.js` leer, läuft die App im Test-Modus mit Beispieltext.

## Lokal
```
python -m http.server 8124
node test.js
cd worker && npm install && node test.js
```

## Worker einrichten (einmalig, braucht ein Cloudflare-Konto)
```
cd worker
npx wrangler login
npx wrangler kv namespace create LIMIT      # id in wrangler.toml eintragen
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_CODE            # den Code, den sie in der App eingibt
npx wrangler deploy                          # die ausgegebene URL in app.js als WORKER_URL eintragen
```

## App veröffentlichen
GitHub Pages aus `main`, Repo-Wurzel (wie beim Kerzenkalkulator). Bei jeder Änderung in `sw.js` die Cache-Version `V` hochzählen, sonst sieht das Handy die alte Version.
