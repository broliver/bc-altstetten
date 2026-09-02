// Demo data in the exact shape of LinkUp's get_public_schedule() RPC.
// Used when js/config.js has no Supabase credentials (local preview).
window.BCA_DEMO = function () {
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = new Date()
  const shift = (days) => {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return d
  }
  const nextWeekday = (wd, weeks) => {
    const d = new Date(today)
    d.setDate(d.getDate() + (((wd - d.getDay() + 7) % 7) || 7) + weeks * 7)
    return d
  }
  const ts = (d, time) => {
    const [h, m] = time.split(':').map(Number)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString()
  }
  const seasonYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1
  // events arrive as dated occurrences (recurrences expanded by LinkUp, closed gyms removed)
  const weekly = (name, wd, start, end, gymId, weeks) =>
    Array.from({ length: weeks }, (_, i) => nextWeekday(wd, i))
      .filter((d) => !(iso(d) >= iso(shift(21)) && iso(d) <= iso(shift(34)) && gymId === 'g1'))
      .map((d) => ({ id: `e-${name}`, name, start_date: iso(d), end_date: iso(d), start_time: start, end_time: end, gym_id: gymId, place: null, recurrence: 'weekly' }))

  return {
    club_name: 'BC Altstetten',
    season_start: `${seasonYear}-08-01`,
    generated_at: today.toISOString(),
    club_events: [
      { id: 'e-lager', name: 'Clublager', start_date: iso(nextWeekday(5, 5)), end_date: iso(nextWeekday(0, 5)), start_time: '17:00', end_time: '15:00', gym_id: null, place: 'Sportzentrum Tenero', recurrence: 'none' },
      { id: 'e-gv', name: 'Generalversammlung', start_date: iso(nextWeekday(3, 8)), end_date: iso(nextWeekday(3, 8)), start_time: '19:30', end_time: '21:30', gym_id: null, place: 'Restaurant Lindenhof', recurrence: 'none' },
    ],
    gyms: [
      {
        id: 'g1', name: 'Sporthalle Altstetten', street: 'Badenerstrasse 700', zip: '8048', city: 'Zürich',
        closures: [{ start_date: iso(shift(21)), end_date: iso(shift(34)), reason: 'Herbstferien' }],
      },
      { id: 'g2', name: 'Turnhalle Kappeli', street: 'Kappelistrasse 20', zip: '8048', city: 'Zürich', closures: [] },
    ],
    teams: [
      {
        id: 't1', name: 'Herren 1', category: '2. Liga', home_gym_id: 'g1', color: '#49ad33',
        season_start: `${seasonYear}-08-01`, season_end: `${seasonYear + 1}-06-30`,
        practice_times: [
          { id: 'p1', weekday: 2, start_time: '20:15', end_time: '21:45', gym_id: 'g1', valid_from: null, valid_to: null },
          { id: 'p2', weekday: 4, start_time: '20:00', end_time: '21:30', gym_id: 'g2', valid_from: null, valid_to: null },
        ],
        cancellations: [{ practice_time_id: 'p2', date: iso(nextWeekday(4, 1)), reason: 'Trainer abwesend' }],
        games: [
          { kind: 'away', starts_at: ts(nextWeekday(6, -2), '15:00'), opponent: 'BC Arlesheim', gym_id: null, venue: 'Sporthalle Arlesheim' },
          { kind: 'home', starts_at: ts(nextWeekday(6, 1), '17:30'), opponent: 'BC Oberwil', gym_id: 'g1', venue: null },
          { kind: 'away', starts_at: ts(nextWeekday(0, 3), '16:00'), opponent: 'TV Muttenz', gym_id: null, venue: 'Sporthalle Muttenz' },
        ],
        events: [
          { id: 'e-turnier', name: 'Vorbereitungsturnier', start_date: iso(nextWeekday(6, 3)), end_date: iso(nextWeekday(6, 3)), start_time: '09:00', end_time: '18:00', gym_id: 'g2', place: null, recurrence: 'none' },
          ...weekly('Konditionstraining', 1, '18:00', '19:00', 'g1', 12),
        ],
      },
      {
        id: 't2', name: 'Damen 1', category: '1. Liga', home_gym_id: 'g1', color: '#ff4fa3',
        season_start: `${seasonYear}-08-01`, season_end: `${seasonYear + 1}-06-30`,
        practice_times: [
          { id: 'p3', weekday: 1, start_time: '19:00', end_time: '20:30', gym_id: 'g1', valid_from: null, valid_to: null },
          { id: 'p4', weekday: 4, start_time: '18:30', end_time: '20:00', gym_id: 'g2', valid_from: null, valid_to: null },
        ],
        cancellations: [],
        games: [
          { kind: 'home', starts_at: ts(nextWeekday(0, 1), '13:00'), opponent: 'BC Allschwil', gym_id: 'g1', venue: null },
          { kind: 'away', starts_at: ts(nextWeekday(6, 4), '18:00'), opponent: 'Basket Zürich', gym_id: null, venue: 'Saalsporthalle' },
        ],
        events: [],
      },
      {
        id: 't3', name: 'U16', category: 'Jugend', home_gym_id: 'g2', color: '#7fd0ff',
        season_start: `${seasonYear}-08-01`, season_end: `${seasonYear + 1}-06-30`,
        practice_times: [
          { id: 'p5', weekday: 2, start_time: '18:30', end_time: '20:00', gym_id: 'g1', valid_from: null, valid_to: null },
          { id: 'p6', weekday: 5, start_time: '17:00', end_time: '18:30', gym_id: 'g2', valid_from: null, valid_to: null },
        ],
        cancellations: [],
        games: [{ kind: 'home', starts_at: ts(nextWeekday(6, 2), '11:00'), opponent: 'Küsnacht Cats', gym_id: 'g2', venue: null }],
        events: [
          { id: 'e-camp', name: 'Jugendcamp', start_date: iso(nextWeekday(1, 2)), end_date: iso(nextWeekday(3, 2)), start_time: '09:00', end_time: '16:00', gym_id: 'g2', place: null, recurrence: 'none' },
        ],
      },
    ],
  }
}
