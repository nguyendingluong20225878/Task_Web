#!/usr/bin/env node

require("ts-node/register");
const { runCli } = require("./phase3-init-judge-assignment.ts");

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
