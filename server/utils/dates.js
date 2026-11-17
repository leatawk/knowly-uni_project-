// =====================================================
// DATE HELPERS
//
// Knowly stores and returns timestamps as ISO 8601 UTC
// strings, so the frontend never has to guess a format.
// =====================================================

// Milliseconds a timestamp may be ahead of the server clock
// before it is treated as a future date.
const CLOCK_GRACE_MS = 60 * 1000;

// Parses a timestamp into milliseconds, or null when it
// cannot be read.
function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const ms = Date.parse(value);

  return Number.isFinite(ms) ? ms : null;
}

// True when a timestamp is further ahead than the small
// clock difference allowed between machines.
function isFuture(ms, grace = CLOCK_GRACE_MS) {
  return !Number.isFinite(ms) || ms > Date.now() + grace;
}

// An ISO 8601 UTC string, or null.
function toISO(value) {
  if (value === null || value === undefined) return null;

  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : parseTimestamp(value);

  return Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : null;
}

// Now, as an ISO 8601 UTC string.
function nowISO() {
  return new Date().toISOString();
}

module.exports = {
  CLOCK_GRACE_MS,
  parseTimestamp,
  isFuture,
  toISO,
  nowISO
};
