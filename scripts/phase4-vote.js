#!/usr/bin/env node

require("ts-node/register");
const { runCli } = require("./phase4-vote.ts");

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
