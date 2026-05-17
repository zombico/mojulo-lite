---
{
  "id": "appointment-to-calendar",
  "name": "Appointment booking to calendar",
  "summary": "Sync new appointment-protocol bookings into a calendar MCP (Google Calendar, Cal.com, Outlook), with attendee + reminder wiring.",
  "version": 1,
  "category": "calendar",
  "requires": {
    "protocols": ["appointments"],
    "destinationMcpCategory": "calendar-like"
  },
  "parameters": [
    {
      "name": "calendarId",
      "prompt": "Which calendar should bookings land in? (calendar id, email, or workspace identifier — depends on the calendar MCP)"
    },
    {
      "name": "defaultDuration",
      "prompt": "Default appointment duration in minutes when the submission doesn't specify one?",
      "default": 30
    },
    {
      "name": "attendeeFields",
      "prompt": "Which submission fields hold attendee identity? (typically email and name)"
    },
    {
      "name": "sendInvites",
      "prompt": "Should the calendar event send email invites to attendees? (true/false)",
      "default": false
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_deployment"],
    "destination": {
      "description": "A calendar-like MCP exposing event create with start/end, attendees, and (optionally) reminders. Examples: Google Calendar, Cal.com, Outlook."
    }
  }
}
---

# Appointment booking to calendar

The `appointments` protocol captures a user's preferred time and contact info into a submission. This catalyst lifts that submission into a real calendar event so the user (or the booked party) sees it on their schedule.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the appointments config and form schema. The appointments protocol stores the captured slot in a known field shape; map it before guessing.
2. Ask the user the four `parameters` questions.
3. Inspect the destination MCP's event-create surface — timezone handling is the part that varies most. Google Calendar wants `start.dateTime` + `start.timeZone`; Cal.com handles it implicitly via booking type.
4. Write `.claude/skills/<bot-slug>-calendar-sync/SKILL.md`.

## Mapping intent

The appointment submission typically holds:

- A datetime (the booked slot) — UTC ISO or a local time + timezone. **Always normalize to UTC before passing to the calendar MCP**, even if the MCP accepts local; calendar-MCP timezone bugs are the #1 source of off-by-an-hour incidents.
- Attendee identity (name + email at minimum) from `attendeeFields`.
- Optional context (chief complaint, service type, notes) → event description.

Event composition:

- **Title:** `{serviceType or 'Appointment'} — {attendeeName}`
- **Description:** the submission notes plus a mojulo trace footer (submission id, conversation id, deployment id) so the calendar entry is traceable back to the source conversation.
- **Duration:** the submission's `duration` field if present, else `defaultDuration`.
- **Attendees:** the user's calendar always; the booked party only if `sendInvites=true` AND the submission includes a valid email.

## Idempotency

Each event create should attach the `mojulo_submission_id` as a custom property (Google Calendar `extendedProperties.private`; Cal.com booking metadata). Search-before-create on that property to avoid duplicates on re-run. The `since` cursor is the primary defense; the property is the safety net.

## Pitfalls

- **Timezone bugs.** Already called out above — surface this prominently in the synthesized skill. If the bot serves users across timezones, the appointment slot's timezone has to be carried, not assumed.
- **`sendInvites` is irreversible.** Once an invite email is sent, it can't be unsent. Default to `false`. Make the user explicitly opt in per run, not just at synthesis time.
- **Cancellations.** This skill creates events; cancellations through the bot (if any) aren't propagated. If the user needs that flow, it's a separate skill — note this as a limitation.
- **No-shows / reschedules.** Mojulo doesn't currently observe these. The calendar is the source of truth post-booking.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `since` (optional ISO), `dryRun` (default true), `sendInvites` (default false, requires explicit per-run flag for true)
- **Outputs:** per-submission decision log `{ submissionId, calendarEventId?, action: 'created' | 'duplicate-skipped' | 'invalid-slot' }`
- **Side effects (live mode):** calendar event create via destination MCP. Email invites only when `sendInvites=true`.
