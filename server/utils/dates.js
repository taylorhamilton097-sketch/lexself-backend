'use strict';

/**
 * Date/time helpers for ClearStand.
 *
 * All user-facing daily buckets (Counsel cap, api_usage rows) must roll over at
 * midnight Toronto time so users in Ontario don't get two "today" windows
 * during the 8pm–midnight UTC-offset window.
 */

/**
 * Toronto-local date string (YYYY-MM-DD).
 * Handles EST/EDT transitions automatically via the IANA tz database.
 */
function torontoDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

module.exports = { torontoDateString };
