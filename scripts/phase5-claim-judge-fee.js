#!/usr/bin/env node

require("ts-node/register");
const { runCli } = require("./phase5-claim-judge-fee.ts");

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
