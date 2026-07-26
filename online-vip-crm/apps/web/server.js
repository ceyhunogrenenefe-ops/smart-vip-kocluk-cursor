'use strict';

const http = require('node:http');

const port = Number(process.env.PORT || 3000);
const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000';

const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Online VIP CRM</title>
  <style>
    :root { --brand-primary: #e8232a; --brand-secondary: #1a3fad; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background:
      radial-gradient(1200px 600px at 10% -10%, #ffe8ea 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #e8eefc 0%, transparent 50%),
      #f8fafc; color: #0f172a; min-height: 100vh; display: grid; place-items: center; }
    main { max-width: 36rem; padding: 2rem; text-align: center; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.02em; margin: 0 0 0.75rem;
      background: linear-gradient(120deg, var(--brand-primary), var(--brand-secondary));
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    p { line-height: 1.6; color: #334155; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <main>
    <h1>Online VIP CRM</h1>
    <p>Web arayüzü henüz yer tutucu. API: <code>${apiUrl}</code></p>
  </main>
</body>
</html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(port, () => {
  console.info(`[web] Online VIP CRM placeholder listening on :${port}`);
});
