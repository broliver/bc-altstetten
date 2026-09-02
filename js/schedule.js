/* Teams, games and calendar — data comes from LinkUp's public
 * get_public_schedule() function (Supabase) or, without credentials,
 * from js/demo-data.js. Plain browser JS, no build step. */
;(function () {
  'use strict'

  const cfg = window.BCA_CONFIG || {}
  const $ = (sel) => document.querySelector(sel)

  /* ---------- small helpers ---------- */

  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
  // Fallback team colours for teams that have not picked one in LinkUp
  // (team dashboard → colour). Green first, pink second, then lighter variants.
  const COLORS = ['#49ad33', '#ff4fa3', '#ffffff', '#a6e08a', '#ffa3d0', '#7fd0ff', '#ffd166', '#c39bff']
  const HEX = /^#[0-9a-f]{6}$/i
  // club-level events (no team) are always white
  const CLUB_COLOR = '#ffffff'

  const pad = (n) => String(n).padStart(2, '0')
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const fromIso = (s) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const addDays = (s, n) => {
    const d = fromIso(s)
    d.setDate(d.getDate() + n)
    return isoDay(d)
  }
  const fmtDay = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`
  const fmtShort = (s) => `${WD[fromIso(s).getDay()]} ${s.slice(8, 10)}.${s.slice(5, 7)}.`
  const fmtTime = (ts) => {
    const d = new Date(ts)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const dayOf = (ts) => isoDay(new Date(ts))
  /** "18:00–20:00" on one day, "Fr 16.10. 17:00 – So 18.10. 15:00" across days */
  const eventSpan = (ev) =>
    ev.start_date === ev.end_date
      ? `${ev.start}–${ev.end}`
      : `${fmtShort(ev.start_date)} ${ev.start} – ${fmtShort(ev.end_date)} ${ev.end}`
  const emptyDay = () => ({ practices: [], games: [], closures: [], events: [] })
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const today = isoDay(new Date())

  /* ---------- data ---------- */

  async function loadData() {
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      const res = await fetch(`${cfg.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_public_schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
        },
        body: '{}',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
    if (typeof window.BCA_DEMO === 'function') return window.BCA_DEMO()
    throw new Error('Keine Daten konfiguriert.')
  }

  /**
   * Expand the raw schedule into a per-day index:
   *   byDay[iso] = { practices: [...], games: [...], closures: [...], events: [...] }
   * A practice does not take place if it was cancelled, its gym is closed,
   * or the team has a game that day (same rules as in LinkUp). Events
   * (tournaments, camps, club events) arrive from LinkUp as dated
   * occurrences — recurrences already expanded, closed gyms already
   * removed — and are spread over every day they span.
   */
  function buildModel(data) {
    const gyms = new Map((data.gyms || []).map((g) => [g.id, g]))
    const gymName = (id) => (id && gyms.has(id) ? gyms.get(id).name : '')

    // closed days per gym
    const closed = new Map()
    for (const g of data.gyms || []) {
      const set = new Set()
      for (const c of g.closures || []) for (let d = c.start_date; d <= c.end_date; d = addDays(d, 1)) set.add(d)
      closed.set(g.id, set)
    }
    const closureReason = (gymId, day) => {
      const g = gyms.get(gymId)
      const c = g && (g.closures || []).find((x) => day >= x.start_date && day <= x.end_date)
      return c ? c.reason : null
    }

    const teams = (data.teams || []).map((t, i) => ({
      ...t,
      color: typeof t.color === 'string' && HEX.test(t.color) ? t.color : COLORS[i % COLORS.length],
    }))
    // pseudo-owner of club events (same shape as a team for colour/name)
    const club = { id: 'club', name: data.club_name || 'Club', color: CLUB_COLOR, club: true }
    const byDay = new Map()
    const at = (day) => {
      if (!byDay.has(day)) byDay.set(day, emptyDay())
      return byDay.get(day)
    }

    // window shown in the calendar: 2 months back … end of the latest season
    let from = addDays(today.slice(0, 8) + '01', -62)
    let to = addDays(today, 200)
    for (const t of teams) {
      if (t.season_start && t.season_start < from) from = t.season_start
      if (t.season_end && t.season_end > to) to = t.season_end
    }

    for (const t of teams) {
      const gameDays = new Set()
      for (const g of t.games || []) {
        const day = dayOf(g.starts_at)
        gameDays.add(day)
        at(day).games.push({ team: t, kind: g.kind, ts: g.starts_at, opponent: g.opponent, where: g.kind === 'home' ? gymName(g.gym_id) : g.venue })
      }
      const cancelled = new Map((t.cancellations || []).map((c) => [`${c.practice_time_id}|${c.date}`, c]))
      const sStart = t.season_start || from
      const sEnd = t.season_end || to
      for (let day = from; day <= to; day = addDays(day, 1)) {
        if (day < sStart || day > sEnd) continue
        const wd = fromIso(day).getDay()
        for (const p of t.practice_times || []) {
          if (p.weekday !== wd) continue
          if (p.valid_from && day < p.valid_from) continue
          if (p.valid_to && day > p.valid_to) continue
          let status = 'ok'
          let why = null
          const c = cancelled.get(`${p.id}|${day}`)
          if (c) {
            status = 'cancelled'
            why = c.reason || 'fällt aus'
          } else if (p.gym_id && closed.get(p.gym_id)?.has(day)) {
            status = 'closed'
            why = `${gymName(p.gym_id)} geschlossen${closureReason(p.gym_id, day) ? ` (${closureReason(p.gym_id, day)})` : ''}`
          } else if (gameDays.has(day)) {
            status = 'game'
            why = 'Spieltag – kein Training'
          }
          at(day).practices.push({ team: t, start: p.start_time, end: p.end_time, gym: gymName(p.gym_id), status, why })
        }
      }
    }
    for (const g of data.gyms || []) {
      for (const c of g.closures || []) {
        for (let d = c.start_date; d <= c.end_date; d = addDays(d, 1)) at(d).closures.push({ gym: g.name, reason: c.reason })
      }
    }

    // events: one entry per day they span; first/last mark the edges of multi-day events
    const addEvents = (owner, list) => {
      for (const ev of list || []) {
        if (!ev.start_date) continue
        const end = ev.end_date && ev.end_date >= ev.start_date ? ev.end_date : ev.start_date
        const occ = {
          owner,
          name: ev.name || 'Anlass',
          start_date: ev.start_date,
          end_date: end,
          start: ev.start_time || '',
          end: ev.end_time || '',
          where: ev.gym_id ? gymName(ev.gym_id) : ev.place || '',
        }
        for (let d = ev.start_date; d <= end; d = addDays(d, 1)) at(d).events.push({ ...occ, first: d === ev.start_date, last: d === end })
      }
    }
    for (const t of teams) addEvents(t, t.events)
    addEvents(club, data.club_events)

    for (const e of byDay.values()) {
      e.practices.sort((a, b) => a.start.localeCompare(b.start) || a.team.name.localeCompare(b.team.name))
      e.games.sort((a, b) => a.ts.localeCompare(b.ts))
      e.events.sort((a, b) => (a.first ? a.start : '').localeCompare(b.first ? b.start : '') || a.name.localeCompare(b.name))
    }
    return { teams, gyms, gymName, byDay, club, clubEvents: data.club_events || [] }
  }

  /* ---------- export (CSV / ICS) ---------- */

  const GAME_HOURS = 2 // games have no end time in LinkUp; assume 2 h for calendar entries

  const slug = (s) =>
    String(s)
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'team'

  // One flat row per game, shared by both formats.
  function exportRows(team, model) {
    return [...(team.games || [])]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((g) => {
        const gym = g.kind === 'home' && g.gym_id ? model.gyms.get(g.gym_id) : null
        const where = gym ? gym.name : g.venue || ''
        const address = gym ? [gym.street, [gym.zip, gym.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
        return { g, where, address, kind: g.kind === 'home' ? 'Heim' : 'Auswärts', opponent: g.opponent || '?' }
      })
  }

  function gamesToCsv(team, model) {
    const cell = (v) => {
      const s = String(v ?? '')
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [['Datum', 'Wochentag', 'Zeit', 'Team', 'Heim/Auswärts', 'Gegner', 'Ort', 'Adresse']]
    for (const r of exportRows(team, model)) {
      const day = dayOf(r.g.starts_at)
      lines.push([fmtDay(day), WD_LONG[fromIso(day).getDay()], fmtTime(r.g.starts_at), team.name, r.kind, r.opponent, r.where, r.address])
    }
    // BOM so Excel reads the umlauts; semicolons match the Swiss/German list separator.
    return '\ufeff' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n'
  }

  function gamesToIcs(team, model) {
    const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
    const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    // RFC 5545: lines are at most 75 octets; continuation lines start with a space.
    const enc = new TextEncoder()
    const fold = (line) => {
      const out = []
      let cur = ''
      let bytes = 0
      for (const ch of line) {
        const n = enc.encode(ch).length
        if (bytes + n > (out.length ? 74 : 75)) {
          out.push(cur)
          cur = ''
          bytes = 0
        }
        cur += ch
        bytes += n
      }
      out.push(cur)
      return out.join('\r\n ')
    }
    const stamp = icsDate(new Date())
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BC Altstetten//Spielplan//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsText(`BC Altstetten ${team.name} – Spiele`)}`,
    ]
    for (const r of exportRows(team, model)) {
      const start = new Date(r.g.starts_at)
      const end = new Date(start.getTime() + GAME_HOURS * 3600 * 1000)
      const location = [r.where, r.address].filter(Boolean).join(', ')
      const summary = r.g.kind === 'home' ? `🏀 ${team.name} vs ${r.opponent}` : `🏀 ${r.opponent} vs ${team.name}`
      lines.push(
        'BEGIN:VEVENT',
        `UID:${slug(`${team.id}-${r.g.starts_at}-${r.opponent}`)}@bc-altstetten.ch`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${icsText(summary)}`,
        location ? `LOCATION:${icsText(location)}` : null,
        `DESCRIPTION:${icsText(`${r.kind}spiel ${team.name}${team.category ? ` (${team.category})` : ''} gegen ${r.opponent}`)}`,
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n'
  }

  function download(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportGames(team, model, format) {
    const base = `spiele-${slug(team.name)}`
    if (format === 'csv') download(`${base}.csv`, gamesToCsv(team, model), 'text/csv;charset=utf-8')
    else download(`${base}.ics`, gamesToIcs(team, model), 'text/calendar;charset=utf-8')
  }

  /* ---------- teams ---------- */

  function renderTeams(model) {
    const root = $('#teams-list')
    if (model.teams.length === 0) {
      root.innerHTML = '<p class="empty">Zurzeit sind keine Teams erfasst.</p>'
      return
    }
    root.innerHTML = model.teams
      .map((t) => {
        const practices = (t.practice_times || [])
          .filter((p) => !p.valid_to || p.valid_to >= today)
          .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time))
        const games = [...(t.games || [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        const next = games.find((g) => new Date(g.starts_at).getTime() > Date.now())
        // upcoming events; a recurring event is shown once ("Montags 18:00–19:00 · wöchentlich")
        const seen = new Set()
        const events = (t.events || [])
          .filter((e) => (e.end_date || e.start_date) >= today)
          .filter((e) => (e.recurrence && e.recurrence !== 'none' ? !seen.has(e.id) && seen.add(e.id) : true))
          .slice(0, 6)
        const eventRows = events
          .map(
            (e) => `<li class="stack">
              <span class="when">${esc(eventLine(e))}</span>
              <span>${esc(e.name)}</span>
              ${e.recurrence && e.recurrence !== 'none' ? `<span class="chip">${e.recurrence === 'biweekly' ? 'alle 2 Wochen' : 'wöchentlich'}</span>` : ''}
              ${e.gym_id || e.place ? `<span class="where">${esc(e.gym_id ? model.gymName(e.gym_id) : e.place)}</span>` : ''}
            </li>`,
          )
          .join('')
        const practiceRows =
          practices.length === 0
            ? '<li class="empty">Keine Trainingszeiten erfasst.</li>'
            : practices
                .map(
                  (p) => `<li class="stack">
                    <span class="when">${WD_LONG[p.weekday]} ${p.start_time}–${p.end_time}</span>
                    <span class="where">${esc(model.gymName(p.gym_id))}${p.valid_from && p.valid_from > today ? ` · ab ${fmtDay(p.valid_from)}` : ''}</span>
                  </li>`,
                )
                .join('')
        const gameRows =
          games.length === 0
            ? '<li class="empty">Noch keine Spiele geplant.</li>'
            : games
                .map((g) => {
                  const past = new Date(g.starts_at).getTime() < Date.now()
                  const where = g.kind === 'home' ? model.gymName(g.gym_id) : g.venue
                  return `<li class="stack${past ? ' past' : ''}${next === g ? ' next' : ''}">
                    <span class="when">${fmtShort(dayOf(g.starts_at))} ${fmtTime(g.starts_at)}</span>
                    <span class="ha ha-${g.kind}">${g.kind === 'home' ? 'Heim' : 'Auswärts'}</span>
                    <span>${esc(g.opponent || '?')}</span>
                    ${where ? `<span class="where">${esc(where)}</span>` : ''}
                  </li>`
                })
                .join('')
        return `<article class="team" style="--c:${t.color}">
          <div class="team-head">
            <span class="swatch"></span>
            <h3>${esc(t.name)}</h3>
            ${t.category ? `<span class="chip chip-green">${esc(t.category)}</span>` : ''}
          </div>
          <div>
            <div class="label">Training</div>
            <ul class="rows">${practiceRows}</ul>
          </div>
          ${events.length ? `<div><div class="label">Anlässe</div><ul class="rows">${eventRows}</ul></div>` : ''}
          <details class="games">
            <summary>
              <span>Spiele</span><span class="count">(${games.length})</span>
              ${next ? `<span class="next">nächstes: ${fmtShort(dayOf(next.starts_at))} ${fmtTime(next.starts_at)}</span>` : ''}
            </summary>
            ${
              games.length
                ? `<div class="export">
                    <span>Herunterladen:</span>
                    <button type="button" data-export="csv" data-team="${esc(t.id)}" title="Als Tabelle (CSV) speichern">CSV</button>
                    <button type="button" data-export="ics" data-team="${esc(t.id)}" title="In den Kalender importieren (iCalendar)">ICS (Kalender)</button>
                  </div>`
                : ''
            }
            <ul class="rows">${gameRows}</ul>
          </details>
        </article>`
      })
      .join('')

    root.querySelectorAll('[data-export]').forEach((b) =>
      b.addEventListener('click', () => {
        const team = model.teams.find((t) => String(t.id) === b.dataset.team)
        if (team) exportGames(team, model, b.dataset.export)
      }),
    )
  }

  /** "Do 01.10. 18:00–20:00" or "Fr 16.10. – So 18.10." for a raw event occurrence */
  function eventLine(e) {
    const end = e.end_date && e.end_date >= e.start_date ? e.end_date : e.start_date
    if (e.recurrence && e.recurrence !== 'none' && end === e.start_date)
      return `${WD_LONG[fromIso(e.start_date).getDay()]}s ${e.start_time}–${e.end_time}`
    if (end === e.start_date) return `${fmtShort(e.start_date)} ${e.start_time}–${e.end_time}`
    return `${fmtShort(e.start_date)} – ${fmtShort(end)}`
  }

  /* ---------- club events (upcoming, above the calendar) ---------- */

  function renderClubEvents(model) {
    const root = $('#club-events')
    if (!root) return
    const upcoming = model.clubEvents.filter((e) => (e.end_date || e.start_date) >= today).slice(0, 6)
    if (upcoming.length === 0) {
      root.innerHTML = ''
      return
    }
    root.innerHTML = `<div class="label">Club-Anlässe</div><ul class="rows">${upcoming
      .map(
        (e) => `<li class="stack"><span class="when">${esc(eventLine(e))}</span> <span>${esc(e.name)}</span>
          ${e.gym_id || e.place ? `<span class="where">${esc(e.gym_id ? model.gymName(e.gym_id) : e.place)}</span>` : ''}</li>`,
      )
      .join('')}</ul>`
  }

  /* ---------- calendar ---------- */

  const calState = { year: 0, month: 0, selected: today }

  function renderLegend(model) {
    $('#legend').innerHTML =
      model.teams.map((t) => `<span><i class="swatch" style="--c:${t.color}"></i>${esc(t.name)}</span>`).join('') +
      `<span><i class="swatch" style="--c:${CLUB_COLOR}"></i>Club-Anlass</span>` +
      '<span><i class="swatch game"></i>Spiel</span>' +
      '<span><i class="swatch striped"></i>Halle geschlossen</span>' +
      '<span><s>Training</s> fällt aus</span>'
  }

  function renderCalendar(model) {
    const { year, month, selected } = calState
    const root = $('#cal')
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
    const days = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push('<div class="cal-cell empty"></div>')
    for (let d = 1; d <= days; d++) {
      const iso = isoDay(new Date(year, month, d))
      const e = model.byDay.get(iso) || emptyDay()
      const items = [
        ...e.games.map((g) => ({ ts: fmtTime(g.ts), text: `${fmtTime(g.ts)} 🏀 ${g.team.name} – ${g.opponent}`, color: g.team.color, cls: 'game' })),
        ...e.practices.map((p) => ({ ts: p.start, text: `${p.start} ${p.team.name}`, color: p.team.color, cls: p.status === 'ok' ? '' : 'off' })),
        // multi-day events continue with "↳" and sort to the top of the following days
        ...e.events.map((ev) => ({
          ts: ev.first ? ev.start : '',
          text: ev.first ? `${ev.start} ${ev.name}` : `↳ ${ev.name}`,
          title: `${ev.owner.name}: ${ev.name} · ${eventSpan(ev)}${ev.where ? ` · ${ev.where}` : ''}`,
          color: ev.owner.color,
          cls: 'event',
        })),
      ].sort((a, b) => a.ts.localeCompare(b.ts))
      const max = 4
      const shown = items.length > max ? items.slice(0, max - 1) : items
      const chips = shown.map((it) => `<span class="ev ${it.cls}" style="--c:${it.color}" title="${esc(it.title || it.text)}">${esc(it.text)}</span>`).join('')
      const more = items.length > max ? `<span class="ev more">+${items.length - shown.length} weitere</span>` : ''
      const dots = items.map((it) => `<i class="${it.cls}" style="--c:${it.color}"></i>`).join('')
      const cls = ['cal-cell', iso === today ? 'today' : '', iso === selected ? 'selected' : '', e.closures.length ? 'closed' : ''].filter(Boolean).join(' ')
      const title = e.closures.length ? e.closures.map((c) => `${c.gym} geschlossen${c.reason ? ` (${c.reason})` : ''}`).join('\n') : ''
      cells.push(`<div class="${cls}" data-day="${iso}" title="${esc(title)}"><span class="num">${d}</span>${chips}${more}<span class="dots">${dots}</span></div>`)
    }
    while (cells.length % 7 !== 0) cells.push('<div class="cal-cell empty"></div>')

    root.innerHTML = `
      <div class="cal-head">
        <div class="cal-nav"><button type="button" data-nav="-1" aria-label="Vorheriger Monat">←</button><button type="button" data-nav="1" aria-label="Nächster Monat">→</button></div>
        <div class="cal-title">${MONTHS[month]} ${year}</div>
        <button type="button" class="cal-today" data-today>Heute</button>
      </div>
      <div class="cal-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>`

    root.querySelectorAll('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = new Date(year, month + Number(b.dataset.nav), 1)
        calState.year = d.getFullYear()
        calState.month = d.getMonth()
        renderCalendar(model)
      }),
    )
    root.querySelector('[data-today]').addEventListener('click', () => {
      const d = new Date()
      calState.year = d.getFullYear()
      calState.month = d.getMonth()
      calState.selected = today
      renderCalendar(model)
      renderDetail(model)
    })
    root.querySelectorAll('.cal-cell[data-day]').forEach((c) =>
      c.addEventListener('click', () => {
        calState.selected = c.dataset.day
        renderCalendar(model)
        renderDetail(model)
      }),
    )
  }

  function renderDetail(model) {
    const day = calState.selected
    const e = model.byDay.get(day) || emptyDay()
    const root = $('#day-detail')
    const groups = []
    if (e.events.length)
      groups.push(`<div class="group"><div class="label">Anlässe</div><ul class="rows">${e.events
        .map(
          (ev) => `<li style="--c:${ev.owner.color}"><span class="swatch"></span><span class="when">${esc(eventSpan(ev))}</span>
            <span class="team-name">${esc(ev.name)}</span><span class="owner">${esc(ev.owner.name)}</span>
            ${ev.where ? `<span class="where">${esc(ev.where)}</span>` : ''}</li>`,
        )
        .join('')}</ul></div>`)
    if (e.games.length)
      groups.push(`<div class="group"><div class="label">Spiele</div><ul class="rows">${e.games
        .map(
          (g) => `<li style="--c:${g.team.color}"><span class="swatch"></span><span class="when">${fmtTime(g.ts)}</span>
            <span class="team-name">${esc(g.team.name)}</span><span class="ha ha-${g.kind}">${g.kind === 'home' ? 'Heim' : 'Auswärts'}</span>
            <span>vs ${esc(g.opponent || '?')}</span>${g.where ? `<span class="where">${esc(g.where)}</span>` : ''}</li>`,
        )
        .join('')}</ul></div>`)
    if (e.practices.length)
      groups.push(`<div class="group"><div class="label">Trainings</div><ul class="rows">${e.practices
        .map(
          (p) => `<li style="--c:${p.team.color}"><span class="swatch"></span><span class="when ${p.status === 'ok' ? '' : 'off'}">${p.start}–${p.end}</span>
            <span class="team-name ${p.status === 'ok' ? '' : 'off'}">${esc(p.team.name)}</span>
            ${p.gym ? `<span class="where">${esc(p.gym)}</span>` : ''}
            ${p.status === 'ok' ? '' : `<span class="why">✕ ${esc(p.why)}</span>`}</li>`,
        )
        .join('')}</ul></div>`)
    if (e.closures.length)
      groups.push(`<div class="group"><div class="label">Halle geschlossen</div><ul class="rows">${e.closures
        .map((c) => `<li><span>${esc(c.gym)}</span>${c.reason ? `<span class="where">${esc(c.reason)}</span>` : ''}</li>`)
        .join('')}</ul></div>`)
    root.innerHTML = `<h3>${WD_LONG[fromIso(day).getDay()]}, ${fmtDay(day)}${day === today ? ' · heute' : ''}</h3>${
      groups.length ? groups.join('') : '<p class="empty">Keine Trainings, Spiele oder Anlässe.</p>'
    }`
  }

  /* ---------- boot ---------- */

  async function main() {
    const yearEl = $('#year')
    if (yearEl) yearEl.textContent = String(new Date().getFullYear())
    if (cfg.LINKUP_URL) document.querySelectorAll('[data-linkup]').forEach((a) => (a.href = cfg.LINKUP_URL))
    try {
      const data = await loadData()
      const model = buildModel(data)
      const now = new Date()
      calState.year = now.getFullYear()
      calState.month = now.getMonth()
      renderTeams(model)
      renderClubEvents(model)
      renderLegend(model)
      renderCalendar(model)
      renderDetail(model)
    } catch (err) {
      $('#teams-list').innerHTML = `<p class="error">Daten konnten nicht geladen werden (${esc(err.message)}).</p>`
      $('#cal').innerHTML = ''
    }
  }

  main()
})()
