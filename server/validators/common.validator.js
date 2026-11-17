// =====================================================
// SHARED VALIDATION HELPERS
// =====================================================

// A positive whole number, as used by BIGSERIAL ids.
const ID_PATTERN = /^[1-9][0-9]*$/;

// Marks an error as safe to show the user, so the central
// error handler answers 400 with this exact message
// instead of a generic one.
function badRequest(message, fields) {
  const error = new Error(message);

  error.status = 400;
  error.expose = true;

  if (fields) {
    error.fields = fields;
  }

  return error;
}

function isId(value) {
  return ID_PATTERN.test(String(value));
}

module.exports = {
  ID_PATTERN,
  badRequest,
  isId
};
