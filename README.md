# BC Altstetten — club website

Static website of the Basketball Club Altstetten, served at **bc-altstetten.ch**.
The [LinkUp](https://github.com/broliver/LinkUp) club-management app is deployed alongside it
under **bc-altstetten.ch/linkup/**.

- Plain HTML + CSS + JS
- Teams, leagues, practice times, games, events and the calendar are read live from LinkUp's
  public Supabase function `get_public_schedule()` (read-only, no contacts or player data).
- Events (tournaments, camps, club events) come per team in `events` and club-wide in
  `club_events`, already expanded into dated occurrences. Team events are drawn in the team
  colour, club events in white; multi-day events span every day in the calendar.

## Local preview

Open `index.html` through any static server, for example:

```bash
npx serve .          # or: python -m http.server 8080
```

Without Supabase credentials in `js/config.js` the site shows demo data (`js/demo-data.js`),
so the layout can be checked offline.

   