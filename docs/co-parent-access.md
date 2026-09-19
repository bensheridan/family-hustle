# Phase 7 — co-parent access

Not built. This is the design problem behind the next phase, written down
before anyone writes code against the wrong model.

## What prompted it

Testing shared care with a parent who actually lives in a shared-care
arrangement surfaced two things.

The first was about how care should render:

> I want to almost shade the days? So it doesn't need to necessarily sit as an
> event each day.

That one is done — care is now the colour of a day rather than a row on it, on
screen and on the fridge sheet.

The second is the hard part, and it arrived almost as an aside: **what happens
when the co-parent runs their own Family hustle.**

## The case to design against

A parent shares *some* of their children with a co-parent — not all of them.
The co-parent has their own life and would plausibly run their own family in
the app: their own calendar, possibly a new partner, possibly other children.

The two need to agree on pickups and handovers for the children they share.
Neither should be looking at the rest of the other's week.

## Why the current model does not fit

Shared care today assumes **one family, two households**. Both households live
inside one instance, and `householdVisibility` on each entry is either `both`
(the default) or one household.

That is the wrong shape in two ways.

**The default is backwards.** Entries default to `both`, so a co-parent joining
today would see everything unless each item were marked otherwise. The need is
the inverse: a co-parent sees what concerns the children they share, and
nothing else, without anyone having to remember to hide things. Default-deny,
not default-share.

**The unit is wrong.** Visibility is per household. What is actually wanted is
per *child* — a co-parent is connected to specific children, not to a
household. Another child, a partner's work roster, the household's tasks, and
anything to do with the other home are simply outside the relationship.

And "they'd just create their own schedule" says the co-parent is not a guest
in someone else's family. They have their own family, and the two families
**link** on the children they share.

## The shape of the fix

A **link between two families, scoped to specific children.**

- One parent invites a co-parent and names which children the link covers.
- The co-parent accepts from their own Family hustle. They keep their own
  family, their own calendar, their own everything.
- The link carries a shared care schedule for those children, and both sides
  see the same one rather than each keeping a private copy that drifts.
- Everything else stays behind the wall on both sides. Neither parent sees the
  other's other children, partner, work or plans.

What crosses the link, by default:

| Shared | Not shared |
| --- | --- |
| the care schedule and handovers for the linked children | anyone else's schedule |
| school and daycare for those children | household tasks and chores |
| medical appointments for those children | work rosters and shifts |
| activities those children attend | family events and social plans |
| things either parent explicitly shares | everything not on the left |

Both sides can share an individual item outward — a school production, say —
but nothing is shared merely because a category matched. The category defaults
above are a starting position to test, not a decision.

## Open questions

These change the design, so they are worth answering with real users before
building:

1. When one parent changes a handover, does it change for the other, or does it
   arrive as a request they accept? (Sync vs propose — the single biggest fork.)
2. Should each parent see anything of the other's week — even "unavailable
   Tuesday" with no detail — or nothing at all?
3. Do a child's activities belong to both parents automatically, or does
   whoever added it decide?
4. If the two sides disagree about who has the children on a day, what should
   the app do? Show both claims? Refuse to pick? This is where it risks turning
   into the custody software the brief says it must never be.
5. Can one parent see that the other has *something* on, without seeing what it
   is, so that a swap request is not made blind?

## What it needs first

This phase cannot be prototyped honestly in `localStorage`. Two families means
two accounts, an invitation flow, and a server that decides what crosses the
link. The visibility model in the app today is a sketch of the idea, enforced
by nothing — anyone holding the phone can switch views.

So the order is: accounts and sync first, then this.

## The line not to cross

The brief is explicit that Family hustle must not feel like custody or
co-parenting software. A link between two households is exactly where that risk
lives. No logs of who did what. No counting nights. No record either parent
could use against the other. The feature exists so two people can agree who is
doing the school pickup on Thursday — nothing more.
