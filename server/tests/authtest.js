process.env.AUTH_SECRET = "test-secret-for-automated-tests-only-0123456789";

const test = require("node:test");
const assert = require("node:assert/strict");
const { _test: auth } = require("../services/auth");

test("passwords are hashed with a salt and checked correctly", async () => {
  const one = await auth.hashPassword("knowly2026");
  const two = await auth.hashPassword("knowly2026");

  assert.match(one, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(one, two, "same password, different salt");
  assert.equal(await auth.checkPassword("knowly2026", one), true);
  assert.equal(await auth.checkPassword("knowly2027", one), false);
});

test("a token is accepted, a changed token is refused", () => {
  const token = auth.createToken(42);
  assert.equal(auth.readToken(token).sub, "42");

  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "1", exp: 9999999999 })).toString("base64url");

  assert.equal(auth.readToken(`${forged}.${signature}`), null);
  assert.equal(auth.readToken(`${payload}.${signature}x`), null);
  assert.equal(auth.readToken("not-a-token"), null);
});
