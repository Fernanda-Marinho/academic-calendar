const pdfParse = require("pdf-parse");

const MESES = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function parseCalendarText(text, fallbackYear) {
  const cleanText = text.replace(/\$/g, "");

  const rawLines = cleanText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const danglingSepRe = /(?:\d{1,2}(?:\/\d{1,2})?\s*(?:a|ate|até|[\-–—]|e)\s*)$/i;
  const mergedRawLines = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    while (danglingSepRe.test(line) && i + 1 < rawLines.length) {
      i++;
      line = `${line} ${rawLines[i]}`;
    }
    mergedRawLines.push(line);
  }

  const events = [];
  let currentMonth = null;
  let currentYear = fallbackYear || new Date().getFullYear();

  const ignoreLine = /^dias letivos/i;

  // *MONTH DE YYYY / MONTH/YYYY / MONTH YYYY
  const monthHeaderRe =
    /^\*?(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)(?:\s*(?:de|\/|\-)?\s*(\d{4}))?/i;

  const rangeSep = '(?:a|ate|até|[\-–—])';

  // dd/mm a dd/mm
  const crossMonthRangeRe =
    new RegExp('^(\\d{1,2})\\/(\\d{1,2})\\s*' + rangeSep + '\\s*(\\d{1,2})\\/(\\d{1,2})(?:\\s+(.+))?$', 'i');

  // dd a dd
  const sameMonthRangeRe =
    new RegExp('^(\\d{1,2})\\s*' + rangeSep + '\\s*(\\d{1,2})(?:\\s+(.+))?$', 'i');

  // dd/mm
  const singleDayWithMonthRe = /^(\d{1,2})\/(\d{1,2})\s+(.+)$/i;

  // d, d e d
  const dayListRe =
    /^(\d{1,2}(?:\s*[,\/]\s*\d{1,2})*(?:\s*(?:e|,)\s*\d{1,2})+)(?:\s+(.+))?$/i;

  // dd
  const singleDayRe = /^(\d{1,2})\s+(.+)$/;

  const dateOnlyLineRe =
    new RegExp('^(?:até\\s*)?\\d{1,2}(?:\\/\\d{1,2})?(?:\\s*' + rangeSep + '\\s*\\d{1,2}(?:\\/\\d{1,2})?)*$', 'i');

  const footerDateLineRe = /^\d{1,2}\s+de\s+[A-ZÇÃÕ]+/i;
  const diasLetivosLineRe = /^dias letivos\b/i;
  const footerLineRe = /^Resolu[cç][aã]o\s+\d+.*SEI.*\/\s*pg\.\s*\d+/i;
  const removeDiasLetivosSuffixRe = /\s+dias letivos\s*:?#?\s*\d*\s*$/i;
  const removeFooterSuffixRe =
    /\s*Resolu[cç][aã]o\s+\d+.*SEI.*\/\s*pg\.\s*\d+\s*$/i;
  const atAnywhereRe = /(?:^|\s)até\s*(\d{1,2})(?:\/(\d{1,2}))?(?:\s+(.+))?/i;

  const aDefinirRe = /a\s*definir|a\s*indefinido|a-definir/i;

  function cleanDescription(desc) {
    if (!desc) return "";
    return desc
      .replace(removeDiasLetivosSuffixRe, "")
      .replace(removeFooterSuffixRe, "")
      .replace(/^[\s\|\-–—:\.]+/g, "")
      .trim();
  }

  function isMonthHeader(line) {
    return monthHeaderRe.test(line);
  }

  function isDateLine(line) {
    return (
      crossMonthRangeRe.test(line) ||
      sameMonthRangeRe.test(line) ||
      singleDayWithMonthRe.test(line) ||
      dayListRe.test(line) ||
      singleDayRe.test(line) ||
      dateOnlyLineRe.test(line)
    );
  }

  const lines = [];
  for (let i = 0; i < mergedRawLines.length; i += 1) {
    const line = mergedRawLines[i];
    if (
      ignoreLine.test(line) ||
      diasLetivosLineRe.test(line) ||
      footerLineRe.test(line)
    )
      continue;

    if (isMonthHeader(line)) {
      lines.push(line);
      continue;
    }

    if (isDateLine(line)) {
      let merged = line;
      while (i + 1 < mergedRawLines.length) {
        const next = mergedRawLines[i + 1];
        if (
          isMonthHeader(next) ||
          dateOnlyLineRe.test(next) ||
          isDateLine(next) ||
          diasLetivosLineRe.test(next) ||
          footerLineRe.test(next)
        ) {
          break;
        }
        merged += ` ${next}`;
        i += 1;
      }
      lines.push(merged);
      continue;
    }
  }

  for (const line of lines) {
    const monthMatch = line.match(monthHeaderRe);
    if (monthMatch) {
      currentMonth = MESES[normalize(monthMatch[1])];
      if (monthMatch[2]) currentYear = parseInt(monthMatch[2], 10);
      continue;
    }

    if (!currentMonth) continue;
    if (footerDateLineRe.test(line)) continue;
    if (aDefinirRe.test(line)) continue;

    let m;

    // ate dd or até dd
    if ((m = line.match(atAnywhereRe))) {
      const [, d1, mo1, afterDesc] = m;
      const dayNum = parseInt(d1, 10);
      const monthNum = mo1 ? parseInt(mo1, 10) : currentMonth;
      let desc = (afterDesc || line.replace(m[0], "")).trim();
      desc = cleanDescription(desc);
      if (desc) {
        events.push({
          title: desc,
          y: currentYear,
          m: monthNum,
          d: dayNum,
          endY: currentYear,
          endM: monthNum,
          endD: dayNum,
        });
      }
      continue;
    }

    // dd/mm a dd/mm
    if ((m = line.match(crossMonthRangeRe))) {
      const [, d1, mo1, d2, mo2, desc] = m;
      events.push({
        title: cleanDescription(desc || ""),
        y: currentYear,
        m: parseInt(mo1, 10),
        d: parseInt(d1, 10),
        endY: currentYear,
        endM: parseInt(mo2, 10),
        endD: parseInt(d2, 10),
      });
      continue;
    }

    // dd a dd 
    if ((m = line.match(sameMonthRangeRe))) {
      const [, d1, d2, desc] = m;
      events.push({
        title: cleanDescription(desc || ""),
        y: currentYear,
        m: currentMonth,
        d: parseInt(d1, 10),
        endY: currentYear,
        endM: currentMonth,
        endD: parseInt(d2, 10),
      });
      continue;
    }

    // dd/mm 
    if ((m = line.match(singleDayWithMonthRe))) {
      const [, d1, mo1, desc] = m;
      const dayNum = parseInt(d1, 10);
      const monthNum = parseInt(mo1, 10);
      events.push({
        title: cleanDescription(desc),
        y: currentYear,
        m: monthNum,
        d: dayNum,
        endY: currentYear,
        endM: monthNum,
        endD: dayNum,
      });
      continue;
    }

    // compost date
    if ((m = line.match(dayListRe))) {
      const [, dayList, desc] = m;
      const parts = dayList
        .split(/[,/]|\s+e\s+|\s+and\s+/i)
        .map((s) => s.trim())
        .filter(Boolean);
      const cleanedDesc = cleanDescription(desc);
      const numericParts = parts
        .map((p) => parseInt(p, 10))
        .filter(Number.isFinite);

      if (numericParts.length) {
        const startDay = Math.min(...numericParts);
        const endDay = Math.max(...numericParts);
        events.push({
          title: cleanedDesc,
          y: currentYear,
          m: currentMonth,
          d: startDay,
          endY: currentYear,
          endM: currentMonth,
          endD: endDay,
        });
      }
      continue;
    }

    // only one day
    if ((m = line.match(singleDayRe))) {
      const [, d1, desc] = m;
      const dayNum = parseInt(d1, 10);
      if (dayNum >= 1 && dayNum <= 31) {
        events.push({
          title: cleanDescription(desc),
          y: currentYear,
          m: currentMonth,
          d: dayNum,
          endY: currentYear,
          endM: currentMonth,
          endD: dayNum,
        });
      }
    }
  }

  return events;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const { url, title, debug } = req.query;
    if (!url) {
      res.status(400).json({ error: "Parâmetro 'url' é obrigatório" });
      return;
    }
    const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;
    let fetchUrl = url;
    if (SCRAPERAPI_KEY) {
      fetchUrl = `http://api.scraperapi.com?api_key=${encodeURIComponent(
        SCRAPERAPI_KEY,
      )}&url=${encodeURIComponent(url)}&country_code=br&render=false`;
      console.log('Using ScraperAPI proxy for URL:', url);
    }

    const pdfResponse = await fetch(fetchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/pdf,*/*",
        ...(SCRAPERAPI_KEY ? {} : { Referer: "http://www.prograd.uefs.br/" }),
      },
      timeout: 10000,
    });
    if (!pdfResponse.ok) {
      const bodySnippet = (await pdfResponse.text().catch(() => "")).slice(
        0,
        300,
      );
      res.status(502).json({
        error: `Falha ao baixar PDF (status ${pdfResponse.status} ${pdfResponse.statusText})`,
        bodySnippet,
        urlTentada: url,
      });
      return;
    }
    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    const data = await pdfParse(buffer);

    if (debug) {
      res.status(200).json({ rawText: data.text });
      return;
    }

    const events = parseCalendarText(data.text);

    const pad = (n) => String(n).padStart(2, "0");
    const toIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

    const normalized = events.map((ev) => {
      const sy = ev.y || new Date().getFullYear();
      const sm = ev.m || 1;
      const sd = ev.d || 1;
      const ey = ev.endY || sy;
      const em = ev.endM || sm;
      const ed = ev.endD || sd;

      const endDateObj = new Date(ey, em - 1, ed + 1);
      const nextY = endDateObj.getFullYear();
      const nextM = endDateObj.getMonth() + 1;
      const nextD = endDateObj.getDate();

      const start = toIso(sy, sm, sd);
      const end = toIso(ey, em, ed);
      const endExclusive = toIso(nextY, nextM, nextD);

      return {
        title: ev.title || "Evento",
        y: sy,
        m: sm,
        d: sd,
        endY: ey,
        endM: em,
        endD: ed,
        year: sy,
        month: sm,
        day: sd,
        endYear: ey,
        endMonth: em,
        endDay: ed,
        start,
        end,
        endExclusive,
        raw: ev,
      };
    });

    res.status(200).json({
      title: title || "Calendário",
      count: normalized.length,
      events: normalized,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      cause: err.cause ? String(err.cause) : undefined,
    });
  }
};