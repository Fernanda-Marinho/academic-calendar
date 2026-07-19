const cheerio = require("cheerio");

const UEFS_BASE = "http://www.prograd.uefs.br/";
const UEFS_CALENDARS_PATH = "modules/conteudo/conteudo.php?conteudo=6";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const fallback = [
    {
      title: "Calendário Acadêmico UEFS 2026.2",
      url: "http://www.prograd.uefs.br/arquivos/File/Calensario20262.pdf",
    },
  ];

  try {
    const url = new URL(UEFS_CALENDARS_PATH, UEFS_BASE).toString();
    const resp = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "UEFS-Calendar-Scraper/1.0",
      },
      timeout: 10000,
    });
    if (!resp.ok) {
      res
        .status(200)
        .json({
          calendars: fallback,
          warning: `Fallback: retorno ${resp.status}`,
        });
      return;
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    const urls = new Map();

    $("a[href$='.pdf']").each((i, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const abs = new URL(href, UEFS_BASE).toString();
        const title = $(el).text().trim() || abs.split("/").pop();
        urls.set(abs, title);
      } catch (e) {}
    });

    const calendars = Array.from(urls.entries()).map(([url, title]) => ({
      title,
      url,
    }));
    if (calendars.length === 0) {
      res
        .status(200)
        .json({
          calendars: fallback,
          warning: "Nenhum PDF detectado; usando fallback.",
        });
      return;
    }

    res.status(200).json({ calendars });
  } catch (err) {
    res
      .status(200)
      .json({
        calendars: fallback,
        warning: `Erro no scraping: ${String(err)}`,
      });
  }
};
