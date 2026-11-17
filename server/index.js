// =====================================================
// KNOWLY - SERVER ENTRY POINT
//
// Starts the application built in app.js. Keeping the
// startup separate means the tests can use the app without
// opening a port.
// =====================================================

const createApp = require("./app");
const config = require("./config/env");
const migrations = require("./database/migrations");

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `Knowly backend running at http://localhost:${config.port}`
  );

  // Adds missing tables only; never drops or changes data.
  migrations.ensureTables().catch(error => {
    console.warn(
      "Could not check the database tables:",
      error.message
    );
  });
});

// Let the hosting platform stop the server cleanly.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down.`);

    server.close(() => process.exit(0));
  });
}

module.exports = server;
