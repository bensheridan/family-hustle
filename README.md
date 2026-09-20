# Family hustle

Everything your family needs, in one place.

A family organisation app that answers one question fast: *what the hell is
happening in our family this week?* Calendars, kids, school, activities,
appointments, work, shift rosters and an optional shared-care setup, in one
place — plus a monthly export you can actually stick on the fridge.

This repository is the working prototype. It runs entirely in the browser and
stores everything in `localStorage`; there is no backend yet.

**Try it:** https://bensheridan.github.io/family-hustle/ — open the demo family
and have a look around. Everything you do stays in your own browser, so you
cannot break it for anyone else, and nothing you type is sent anywhere.

## Running it

```bash
npm install && npm run dev
```

Then open http://localhost:5173. On first load you can either set up a family
or open a demo family (Nadia, Theo, Otis, Juno and Wren — one household, one
shift worker) to look around.

```bash
npm run typecheck   # tsc, no emit
npm run build       # typecheck + production build
npm run preview     # serve the build
```

## What is built

| Phase | Area | Status |
| --- | --- | --- |
| 1 | onboarding, family members, household setup, home, calendar | done |
| 2 | events, activities, appointments, school/daycare, tasks, reminders | done |
| 3 | work profiles, shifts, overnight shifts, rosters and patterns | done |
| 4 | households, care schedules, handovers, household visibility | done |
| 5 | monthly fridge export — image, PDF, print | done |
| 6 | family-aware intelligence | first pass (heads up, availability) |

Shared care is complete enough to use: patterns, per-day changes, handovers,
two households and a visibility model. What it does not have is real accounts,
so the second household is previewed rather than actually separate.

## The rules this code enforces

These come straight from the brief and are worth knowing before changing
anything.

**The app adapts to the family.** Nothing assumes shared care, separated
parents, multiple households or shift work. The work tab does not exist until
someone in the family works shifts (`TabBar.tsx`). Shared care is absent from
the calendar filters until it is switched on (`Calendar.tsx`). In onboarding,
shared care is one option of four and is never preselected.

**Capitalisation.** Interface copy is lowercase — `add event`, `your week`,
`what are you adding?`. Proper nouns are not: `Otis`, `September`, `Monday`,
`The Hive`, `Family hustle`. Names and titles are stored exactly as typed and
never case-forced; month and weekday names are hard-coded with their capitals
in `lib/date.ts`. The brand is **Family hustle** — capital F, lowercase h.

**An overnight shift is one shift.** Tuesday 6:00pm → Wednesday 6:00am
produces a single occurrence anchored to Tuesday, plus a muted tail on
Wednesday morning that points back at the same entry and says whose shift it
is. It is never two unrelated events. See `domain/occurrences.ts`.

**Off work is not the same as available — and neither is working from home.**
A shift carries optional impacts: kids need pickup, can't attend family events,
sleeping after nights, available before/after. `domain/availability.ts` turns
those into a read on whether a person can actually be counted on. Someone who
came off nights this morning shows as *sleeping off nights*, not *free*.
Working from home is its own state again: unavailable the way work makes you
unavailable, but *in the house* — so they can let the dog out, take a delivery,
and be there when school rings.

**A standard week is the common case, so it is the default.** Work is stored as
a weekly recurrence with the worked weekdays, which means "Monday to Friday,
7am–3pm, from home on Monday and Thursday" is one entry, not five. The weekday
picker cycles each day through not working → at work → from home, so both
questions are answered by one control.

**Birthdays are derived, not entered.** A family member's birthday lives on
their profile, and the calendar generates a yearly entry from it — the same
trick as handovers. It cannot be forgotten, duplicated, or deleted by accident,
and it is right every year without anyone touching it. The detail sheet for one
has no delete button, because the profile is the real record.

**A reminder you get on the day is a reminder that failed.** Anything annual
carries a lead time: a birthday starts being mentioned a fortnight out, with
the age they are turning; a renewal can be set to a month. On the morning
itself it is already too late to buy a present or book the garage, so the
heads-up card works from a window, not from today.

**Ownership and visibility are different things.** An event belongs to Otis
and can still be visible to the whole family. Both are stored on every entry
and shown separately in the detail sheet.

**The fridge export is designed for paper.** It is not a screenshot of the app:
its own black-on-white layout, a full Monday–Sunday grid, a person key, and a
print stylesheet that hides the app and sizes the sheet to A4 landscape.

**Shared care is a schedule, not a record.** Nothing logs who did what, counts
nights, or keeps evidence — the brief is explicit that this must not feel like
custody software. A care schedule is a cycle of household ids anchored to a
Monday, which is the same shape as a work roster, so the calendar treats it as
one more thing the family has on. Handovers are *derived* from that cycle
rather than stored, so they can never drift out of sync with the pattern they
came from. See `domain/care.ts`.

## How it is put together

```
src/
  types.ts                 the whole domain in one file
  lib/date.ts              local-time date helpers — no UTC anywhere
  domain/
    occurrences.ts         recurrence → dated occurrences; overnight logic
    availability.ts        shifts → who is actually around; heads-up lines
    care.ts                care patterns, handovers, household visibility
    categories.ts          categories, shift types, impacts, colours
  state/store.tsx          useReducer + localStorage, with derived helpers
  data/seed.ts             the demo family, anchored to the current week
  components/              ui primitives, occurrence row, detail sheet, tabs
  routes/                  onboarding, home, calendar, add, kids, work,
                           more, shared-care, fridge
  styles/                  tokens, global, components, print
```

Events, shifts and tasks share one `Entry` union so the calendar only ever has
one kind of thing to draw. Categories (school/daycare, activity, appointment,
family, work, task, shared care) are properties of an entry, not separate
types — which is why the add flow can offer six choices while the model stays
small.

Recurrence covers one-offs, daily, weekly, monthly-by-date, yearly, and rosters
(`4 on / 4 off`, `7 on / 7 off`, or any custom on/off cycle) counted from the
entry's start date. A single occurrence can be skipped without breaking the
series. Yearly handles 29 February by falling back to the 28th in the years it
does not exist.

## Shared care

Off by default, and invisible when off — no care card on home, no handover
markers on the calendar, no shared care filter, nothing on the fridge sheet.
Switching it off keeps the schedules, so turning it back on costs nothing.

Switching it on sets the family up rather than handing them a blank screen: it
creates a second household (named after the two adults, because "Nadia's" and
"Theo's" is what the kids would say) and gives every child a week on / week off
schedule to adjust.

- **patterns** — week on/week off, 2-2-3, 3-4-4-3, alternating weekends, or
  build the fortnight by hand. Set per child, so siblings can differ.
- **one-off changes** — tap a child on any calendar day to move just that day.
  The pattern carries on untouched, and the day is marked as changed.
- **shading, not events** — care is the colour of a day, not a row sitting on
  it. Month cells take a wash of the household's colour, split diagonally when
  siblings are in different places; week day-headers carry a quiet "Otis at
  Theo's" line. Only actual handovers get a row, because a handover is a real
  thing someone has to drive to.
- **on paper** — the fridge sheet shades days the same way, but two tints of
  equal lightness are the same grey once photocopied, so the household is also
  named wherever a stretch begins and at the start of every week. The sheet
  pins its own light colours, so a PNG exported from the app in dark mode
  still prints the colours the key describes.
- **handovers** — derived from the schedule and shown as calendar rows, with
  children moving the same way on the same day grouped into one row.
- **household visibility** — entries default to both households. Anything
  marked as one household's business is hidden from the other, and *viewing as*
  the other household shows you exactly what they would see. This is a model,
  not enforcement: without accounts there is nothing to enforce it against.

Shared care today assumes one family across two households. A co-parent with
their own Family hustle is a different problem, written up in
[docs/co-parent-access.md](docs/co-parent-access.md) — including why the
current default of "both households see it" is backwards for that case.

## Where to go next

- real accounts and sync, which is what turns the household visibility model
  into actual permissions rather than a preview
- co-parent access (phase 7) — see the design note above; it needs accounts
  first
- handover detail — time and place, which the schedule does not carry yet
- the intelligence in phase 6 — schedule conflicts, roster-aware planning,
  "Theo is on nights, who is doing pickup?" as a real suggestion
- editing an existing entry (today you can skip an occurrence or delete the
  series, but not change one)

Every new feature gets tested against the same question: **does this make
family life easier to see, organise or manage?**
