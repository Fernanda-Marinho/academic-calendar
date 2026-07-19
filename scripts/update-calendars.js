const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    timeout: 20000,
  });
  if (!resp.ok) throw new Error(`Status ${resp.status}`);
  return resp.text();
}

function extractPdfLinks(html) {
  const UEFS_BASE = 'http://www.prograd.uefs.br/';
  const $ = cheerio.load(html);
  const urls = new Map();
  $("a[href$='.pdf']").each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, UEFS_BASE).toString();
      const title = $(el).text().trim() || abs.split('/').pop();
      urls.set(abs, title);
    } catch (e) {}
  });
  return Array.from(urls.entries()).map(([url, title]) => ({ title, url }));
}

async function update() {
  console.log('Iniciando scraping da UEFS...');
  try {
    const url = 'http://www.prograd.uefs.br/modules/conteudo/conteudo.php?conteudo=6';
    const html = await fetchHtml(url);
    const calendars = extractPdfLinks(html);

    const out = {
      calendars: calendars.length ? calendars : [
        {
          title: 'Calendário Acadêmico UEFS (fallback)',
          url: 'http://www.prograd.uefs.br/arquivos/File/Calensario20262.pdf',
        },
      ],
      updated_at: new Date().toISOString(),
      source: 'github-actions-scraper',
    };

    const outDir = path.join(process.cwd(), 'client', 'public');
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
    const outPath = path.join(outDir, 'calendars.json');

    if (fs.existsSync(outPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const prevLen = Array.isArray(prev.calendars) ? prev.calendars.length : 0;
        const newLen = Array.isArray(out.calendars) ? out.calendars.length : 0;
        if (prevLen === newLen) {
          process.exit(0);
        }
      } catch (e) {
        console.warn('Falha ao ler/parsear arquivo anterior, irá sobrescrever:', e && e.message);
      }
    }

    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Arquivo gerado:', outPath);
    process.exit(0);
  } catch (e) {
    console.error('Erro ao gerar arquivo:', e);
    process.exit(2);
  }
}

update();
