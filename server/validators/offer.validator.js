// =====================================================
// MANUAL RETAILER PRICE VALIDATION
//
// Checks a price submitted through the verified-price form.
// The listing URL is required, so anyone can check where a
// price came from; Knowly never stores a price without a
// source.
// =====================================================

const { badRequest } = require("./common.validator");
const { text, canonicalURL } = require("../utils/sanitize");
const { parseTimestamp, isFuture } = require("../utils/dates");

const CURRENCIES = ["USD", "LBP", "EUR", "SAR", "AED"];

const AVAILABILITY = [
  "In stock",
  "Out of stock",
  "Unknown"
];

const CONDITIONS = ["New", "Used", "Refurbished"];

const MAX_PRICE = 9999999999;

// Returns a clean offer, or throws a 400 the browser can
// display. Never returns partly-checked data.
function validateOffer(body) {
  const input =
    body && typeof body === "object" ? body : {};

  const storeName = text(input.storeName, 120);
  const price = Number(input.price);
  const currency = text(input.currency, 10).toUpperCase();
  const url = canonicalURL(input.url);

  const availability =
    text(input.availability, 50) || "Unknown";

  const condition = text(input.condition, 50) || "New";

  if (storeName.length < 2) {
    throw badRequest("Enter the store name.");
  }

  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    price > MAX_PRICE
  ) {
    throw badRequest(
      "Enter the price exactly as the store lists it."
    );
  }

  if (!CURRENCIES.includes(currency)) {
    throw badRequest(
      `Currency must be one of: ${CURRENCIES.join(", ")}.`
    );
  }

  if (!url) {
    throw badRequest(
      "Paste the link to the store's product page, starting with https://"
    );
  }

  if (!AVAILABILITY.includes(availability)) {
    throw badRequest("Unknown availability value.");
  }

  if (!CONDITIONS.includes(condition)) {
    throw badRequest("Unknown condition value.");
  }

  const checked = input.checkedAt
    ? parseTimestamp(input.checkedAt)
    : Date.now();

  if (isFuture(checked)) {
    throw badRequest(
      "The date checked cannot be in the future."
    );
  }

  return {
    storeName,
    price,
    currency,
    url,
    availability,
    condition,
    checked
  };
}

module.exports = {
  CURRENCIES,
  AVAILABILITY,
  CONDITIONS,
  validateOffer
};
