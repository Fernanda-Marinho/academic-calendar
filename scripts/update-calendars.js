require("dotenv").config();
const { fetch } = require("undici");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const normalizeEnv = (value) => {
  if (typeof value !== "string") return value;
  return value.trim().replace(/^['"]|['"]$/g, "");
};

const SCRAPERAPI_KEY = normalizeEnv(process.env.SCRAPERAPI_KEY);
const SUPABASE_URL = normalizeEnv(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const missing = [];
if (!SCRAPERAPI_KEY) missing.push("SCRAPERAPI_KEY");
if (!SUPABASE_URL) missing.push("SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length) {
  console.error("Missing required environment variables:", missing.join(", "));
  process.exit(1);
}

const TARGET_URL =
  "http://www.prograd.uefs.br/modules/conteudo/conteudo.php?conteudo=6";
const SCRAPERAPI_URL = `http://api.scraperapi.com?api_key=${encodeURIComponent(SCRAPERAPI_KEY)}&url=${encodeURIComponent(TARGET_URL)}&country_code=br&render=false`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch },
  realtime: { transport: ws },
});

function extractPdfLinks(html) {
  const UEFS_BASE = "http://www.prograd.uefs.br/";
  const $ = cheerio.load(html);
  const urls = new Map();

  $("a[href$='.pdf']").each((i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, UEFS_BASE).toString();
      const title = $(el).text().trim() || abs.split("/").pop();
      urls.set(abs, title);
    } catch (err) {}
  });

  return Array.from(urls.entries()).map(([url, title]) => ({ title, url }));
}

async function fetchHtmlViaProxy() {
  console.log("Requesting via ScraperAPI URL:", SCRAPERAPI_URL);
  const res = await fetch(SCRAPERAPI_URL, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    keepalive: false,
    timeout: 30000,
  });

  console.log("ScraperAPI response status:", res.status);
  console.log("ScraperAPI x-cache:", res.headers.get("x-cache") || "none");

  if (!res.ok) {
    throw new Error(`ScraperAPI returned status ${res.status}`);
  }

  const html = await res.text();
  console.log("ScraperAPI response length:", html.length);
  return html;
}

async function upsertSupabase(calendars) {
  const payload = {
    id: "uefs",
    source: "uefs",
    source_url: TARGET_URL,
    data: calendars,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("calendars")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    throw error;
  }

  return payload;
}

async function run() {
  console.log("Starting UEFS scraping via ScraperAPI...");

  const html = await fetchHtmlViaProxy();
  const calendars = extractPdfLinks(html);

  if (!calendars.length) {
    throw new Error("No calendar PDF links extracted from UEFS page.");
  }

  console.log(`Found ${calendars.length} calendar entries.`);
  await upsertSupabase(calendars);
  console.log("Supabase upsert completed for calendars row id=uefs.");
}

run().catch((error) => {
  console.error("Scraping/upsert failed:", error.message);
  console.error(error);
  process.exit(1);
});
