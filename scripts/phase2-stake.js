#!/usr/bin/env node

require("ts-node/register");
const { runCli } = require("./phase2-stake.ts");

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
