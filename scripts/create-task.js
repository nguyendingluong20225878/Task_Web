#!/usr/bin/env node

require("ts-node/register");
const { closeMongoDb } = require("../src/lib/server/db/mongo");
const { runCli, withTimeout } = require("./create-task.ts");

runCli()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await withTimeout(
      closeMongoDb(),
      Number(process.env.DB_CLOSE_TIMEOUT_MS || 2000),
      "MongoDB close timed out"
    ).catch(() => undefined);
    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  });
