# Family hustle

Everything your family needs, in one place.

A family organisation app that answers one question fast: *what the hell is
happening in our family this week?* Calendars, kids, school, activities,
appointments, work, shift rosters and an optional shared-care setup, in one
place — plus a monthly export you can actually stick on the fridge.

This repository is the working prototype. It runs entirely in the browser and
stores everything in `localStorage`; there is no backend yet.

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
| 5 | monthly fridge export — image, PDF, print | done |
| 4 | multiple households, shared care, permissions, handovers | scaffolded only |
| 6 | family-aware intelligence | first pass (heads up, availability) |

Shared care exists as a setting and a category, and every screen already
respects it, but the handover and permission screens are not built.

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

**Off work is not the same as available.** A shift carries optional impacts —
kids need pickup, can't attend family events, sleeping after nights, available
before/after. `domain/availability.ts` turns those into a read on whether a
person can actually be counted on, which the home screen and work section both
use. Someone who came off nights this morning shows as *sleeping off nights*,
not *free*.

**Ownership and visibility are different things.** An event belongs to Otis
and can still be visible to the whole family. Both are stored on every entry
and shown separately in the detail sheet.

**The fridge export is designed for paper.** It is not a screenshot of the app:
its own black-on-white layout, a full Monday–Sunday grid, a person key, and a
print stylesheet that hides the app and sizes the sheet to A4 landscape.

## How it is put together

```
src/
  types.ts                 the whole domain in one file
  lib/date.ts              local-time date helpers — no UTC anywhere
  domain/
    occurrences.ts         recurrence → dated occurrences; overnight logic
    availability.ts        shifts → who is actually around; heads-up lines
    categories.ts          categories, shift types, impacts, colours
  state/store.tsx          useReducer + localStorage, with derived helpers
  data/seed.ts             the demo family, anchored to the current week
  components/              ui primitives, occurrence row, detail sheet, tabs
  routes/                  onboarding, home, calendar, add, kids, work, more, fridge
  styles/                  tokens, global, components, print
```

Events, shifts and tasks share one `Entry` union so the calendar only ever has
one kind of thing to draw. Categories (school/daycare, activity, appointment,
family, work, task, shared care) are properties of an entry, not separate
types — which is why the add flow can offer six choices while the model stays
small.

Recurrence covers one-offs, daily, weekly, monthly-by-date, and rosters
(`4 on / 4 off`, `7 on / 7 off`, or any custom on/off cycle) counted from the
entry's start date. A single occurrence can be skipped without breaking the
series.

## Where to go next

- shared care proper: households, parenting schedules, handover days, and the
  permission model between them
- the intelligence in phase 6 — schedule conflicts, roster-aware planning,
  "Theo is on nights, who is doing pickup?" as a real suggestion
- persistence beyond one browser, which is the point at which this needs a
  backend and real accounts
- editing an existing entry (today you can skip an occurrence or delete the
  series, but not change one)

Every new feature gets tested against the same question: **does this make
family life easier to see, organise or manage?**
