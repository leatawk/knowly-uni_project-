// =====================================================
// INPUT SANITISING HELPERS
//
// Small, pure functions with no knowledge of Knowly's
// business rules, used wherever untrusted text, numbers or
// links arrive from a provider or from the browser.
// =====================================================

// Collapses whitespace, trims, and cuts to a maximum length.
// Anything that is not a string or number becomes "".
function text(value, max = 500) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";

  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

// A finite number that is zero or more, otherwise null.
// Prices and counts are never negative in Knowly.
function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
}

// Accepts only http and https links, so a provider cannot
// send javascript: or data: into the website.
function safeURL(value) {
  try {
    const url = new URL(String(value));

    return url.protocol === "https:" ||
      url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Same listing, same URL: tracking parameters are removed so
// a retailer link never creates a duplicate offer.
function canonicalURL(value) {
  const href = safeURL(value);

  if (!href) return null;

  const url = new URL(href);
  url.hash = "";

  for (const name of [...url.searchParams.keys()]) {
    if (
      /^(utm_|fbclid$|gclid$|mc_|ref$|srsltid$)/i.test(name)
    ) {
      url.searchParams.delete(name);
    }
  }

  return url.href;
}

module.exports = {
  text,
  toNumber,
  safeURL,
  canonicalURL
};
