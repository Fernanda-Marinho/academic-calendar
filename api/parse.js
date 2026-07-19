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
  const rawLines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const events = [];
  let currentMonth = null;
  let currentYear = fallbackYear || new Date().getFullYear();

  const ignoreLine = /^dias letivos/i;

  // *MONTH/YYYY  or  MONTH/YYYY  or  MONTH YYYY
  const monthHeaderRe =
    /^\*?(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*[\/\-]?\s*(\d{4})?/i;

  // dd/mm a dd/mm
  const crossMonthRangeRe =
    /^(\d{1,2})\/(\d{1,2})\s*a\s*(\d{1,2})\/(\d{1,2})(?:\s+(.+))?$/i;

  // dd a dd
  const sameMonthRangeRe = /^(\d{1,2})\s*(?:a|-)\s*(\d{1,2})(?:\s+(.+))?$/i;

  // dd e dd d, d e d
  const dayListRe = /^(\d{1,2}(?:\s*,\s*\d{1,2})*\s*e\s*\d{1,2})\s+(.+)$/i;

  // dd
  const singleDayRe = /^(\d{1,2})\s+(.+)$/;

  // dd, dd a dd, dd/mm a dd/mm and até dd/mm
  const dateOnlyLineRe =
    /^(?:até\s*)?\d{1,2}(?:\/\d{1,2})?(?:\s*(?:a|e|até|-)\s*\d{1,2}(?:\/\d{1,2})?)*$/i;

  //ignore header and end of page
  const footerDateLineRe = /^\d{1,2}\s+de\s+[A-ZÇÃÕ]+/i;
  const diasLetivosLineRe = /^dias letivos\b/i;
  const footerLineRe = /^Resolu[cç][aã]o\s+\d+.*SEI.*\/\s*pg\.\s*\d+/i;
  const removeDiasLetivosSuffixRe = /\s+dias letivos\s*:?#?\s*\d*\s*$/i;
  const removeFooterSuffixRe =
    /\s*Resolu[cç][aã]o\s+\d+.*SEI.*\/\s*pg\.\s*\d+\s*$/i;
  const atAnywhereRe = /(?:^|\s)até\s*(\d{1,2})(?:\/(\d{1,2}))?(?:\s+(.+))?/i;

  function cleanDescription(desc) {
    return desc
      .replace(removeDiasLetivosSuffixRe, "")
      .replace(removeFooterSuffixRe, "")
      .trim();
  }

  function isMonthHeader(line) {
    return monthHeaderRe.test(line);
  }

  function isDateLine(line) {
    return (
      crossMonthRangeRe.test(line) ||
      sameMonthRangeRe.test(line) ||
      dayListRe.test(line) ||
      singleDayRe.test(line)
    );
  }

  const lines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
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
      while (i + 1 < rawLines.length) {
        const next = rawLines[i + 1];
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

    let m;

    if ((m = line.match(atAnywhereRe))) {
      const [, d1, mo1, afterDesc] = m;
      const dayNum = parseInt(d1, 10);
      const monthNum = mo1 ? parseInt(mo1, 10) : currentMonth;
      let desc = (afterDesc || line.replace(m[0], "")).trim();
      desc = cleanDescription(desc);
      events.push({
        title: desc,
        y: currentYear,
        m: monthNum,
        d: dayNum,
        endY: currentYear,
        endM: monthNum,
        endD: dayNum,
      });
      continue;
    }

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

    if ((m = line.match(dayListRe))) {
      const [, dayList, desc] = m;
      const parts = dayList
        .split(/,|e/i)
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

    const pdfResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/pdf,*/*",
        Referer: "http://www.prograd.uefs.br/",
      },
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

    res.status(200).json({
      title: title || "Calendário",
      count: events.length,
      events,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      cause: err.cause ? String(err.cause) : undefined,
    });
  }
};
