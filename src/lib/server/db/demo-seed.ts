import { closeMongoDb, getMongoDb } from "./mongo";
import { upsertTaskFromChain } from "./repositories";

async function main() {
  const db = await getMongoDb();
  const now = new Date();

  await upsertTaskFromChain(db, {
    task: {
      taskPda: "DemoTaskPda111111111111111111111111111111",
      id: "1",
      requestor: "DemoRequestor1111111111111111111111111111",
      tokenMint: "DemoMint111111111111111111111111111111111",
      escrowTokenVault: "DemoVault11111111111111111111111111111111",
      nftAsset: "DemoAsset11111111111111111111111111111111",
      bountyAmount: "1000000",
      judgeFeeBps: 500,
      workerStakeAmount: "100000",
      requiredJudgesM: 3,
      approvalThresholdN: 2,
      passVoteCount: 0,
      failVoteCount: 0,
      assignedJudges: [],
      publicMetadataUri: "ipfs://public-demo",
      encryptedTaskDetailUri: "ipfs://encrypted-task-demo",
      status: "Open",
      createdAt: now,
      submissionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      votingDeadline: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      updatedAt: now,
    },
    slot: 1,
    signature: "DemoIndexedSignature111111111111111111111111111111",
    commitment: "confirmed",
    programId: "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB",
    decodedAccount: {
      source: "demo-seed",
      warning:
        "Demo data must not unlock private content or authorize protocol state.",
    },
  });

  console.log("Demo task upserted");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoDb();
  });
