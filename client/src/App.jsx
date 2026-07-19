import React, { useEffect, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')
const escapeICS = (text) =>
  String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')

function buildICS(events, calName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UEFS Calendar to ICS//PT-BR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeICS(calName)}`,
  ]

  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  events.forEach((ev, idx) => {
    const dateStr = `${ev.y}${pad(ev.m)}${pad(ev.d)}`
    const uid = `${dateStr}-${idx}-${Math.random().toString(36).slice(2)}@uefs-calendar-ics`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART;TZID=America/Bahia:${dateStr}T090000`)
    lines.push(`DTEND;TZID=America/Bahia:${dateStr}T100000`)
    lines.push(`SUMMARY:${escapeICS(ev.title)}`)
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push('DESCRIPTION:Lembrete')
    lines.push('TRIGGER:-PT30M')
    lines.push('END:VALARM')
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export default function App() {
  const [calendars, setCalendars] = useState([])
  const [status, setStatus] = useState('')
  const [step, setStep] = useState('list')
  const [downloadHref, setDownloadHref] = useState('')
  const [downloadName, setDownloadName] = useState('')

  useEffect(() => {
    loadCalendars()
  }, [])

  useEffect(() => {
    return () => {
      if (downloadHref) URL.revokeObjectURL(downloadHref)
    }
  }, [downloadHref])

  async function loadCalendars() {
    setStatus('Carregando lista de calendários...')
    try {
      const res = await fetch('/api/calendars')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar calendários')
      setCalendars(data.calendars || [])
      setStatus('')
    } catch (err) {
      setCalendars([])
      setStatus(`Erro ao carregar lista: ${err.message}`)
    }
  }

  async function handleCalendarClick(cal) {
    setStep('status')
    setStatus(`Lendo "${cal.title}"...`)
    try {
      const res = await fetch(
        `/api/parse?url=${encodeURIComponent(cal.url)}&title=${encodeURIComponent(
          cal.title
        )}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar PDF')
      if (!data.events || data.events.length === 0) {
        throw new Error('Nenhum evento foi encontrado nesse PDF. O formato pode ser diferente do esperado :(')
      }
      const icsContent = buildICS(data.events, cal.title)
      const blob = new Blob([icsContent], { type: 'text/calendar' })
      const href = URL.createObjectURL(blob)
      setDownloadHref(href)
      setDownloadName(`${cal.title.replace(/[^\w\d]+/g, '_')}.ics`)
      setStatus(`${data.events.length} evento(s) encontrados. Baixe o arquivo e importe no Google Agenda.`)
      setStep('result')
    } catch (err) {
      setStatus(`Erro: ${err.message}`)
      setStep('status')
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Calendário Acadêmico UEFS</h1>
        <p>Escolha um calendário, baixe o arquivo <code>.ics</code> e importe no Google Agenda.</p>
      </header>

      <main>
        {step === 'list' && (
          <section id="list-section">
            <h2>1. Escolha o calendário</h2>
            <ul id="calendar-list">
              {calendars.length === 0 ? (
                <li className="calendar-item" style={{ cursor: 'default' }}>
                  {status || 'Nenhum calendário disponível.'}
                </li>
              ) : (
                calendars.map((cal, index) => (
                  <li key={index} className="calendar-item" onClick={() => handleCalendarClick(cal)}>
                    <span>{cal.title}</span>
                    <span className="arrow">›</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {step === 'status' && (
          <section id="status-section">
            <h2>2. Gerando eventos...</h2>
            <p id="status-text">{status}</p>
            <button id="back-button" onClick={() => setStep('list')}>
              Voltar
            </button>
          </section>
        )}

        {step === 'result' && (
          <section id="result-section">
            <h2>3. Pronto!</h2>
            <p id="result-text">{status}</p>
            <a id="download-link" className="button" href={downloadHref} download={downloadName}>
              ⬇️ Baixar arquivo .ics
            </a>
            <button id="back-button" onClick={() => setStep('list')}>
              Voltar
            </button>
          </section>
        )}
      </main>

      <footer>
        <p>Desenvolvido por:  Fernanda Marinho</p>
      </footer>
    </div>
  )
}
