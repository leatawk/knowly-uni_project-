// =====================================================
// ACCOUNT VALIDATION
//
// Field-by-field messages are returned together, so the
// registration form can highlight every problem at once
// instead of one at a time.
// =====================================================

const { badRequest } = require("./common.validator");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email) {
  return (
    email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email)
  );
}

function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  if (
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return "Use at least one letter and one number.";
  }

  return null;
}

// Registration: name, email and password must all be valid.
function validateRegistration(body) {
  const input =
    body && typeof body === "object" ? body : {};

  const name = String(input.name || "")
    .replace(/\s+/g, " ")
    .trim();

  const email = cleanEmail(input.email);
  const password = String(input.password || "");

  const errors = {};

  if (name.length < 2 || name.length > 150) {
    errors.name = "Enter your name (2 to 150 characters).";
  }

  if (!validEmail(email)) {
    errors.email =
      "Enter a valid email address, like name@example.com.";
  }

  const problem = passwordProblem(password);

  if (problem) {
    errors.password = problem;
  }

  if (Object.keys(errors).length) {
    throw badRequest("Check the highlighted fields.", errors);
  }

  return { name, email, password };
}

// Login: only the shape is checked here. A wrong email or
// password is answered with 401 by services/auth.js, which
// deliberately does not say which of the two was wrong.
function validateLogin(body) {
  const input =
    body && typeof body === "object" ? body : {};

  return {
    email: cleanEmail(input.email),
    password: String(input.password || "")
  };
}

module.exports = {
  EMAIL,
  cleanEmail,
  validEmail,
  passwordProblem,
  validateRegistration,
  validateLogin
};
