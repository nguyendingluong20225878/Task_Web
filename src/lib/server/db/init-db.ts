import { closeMongoDb, getMongoDb } from "./mongo";
import {
  judgeAssignmentCollection,
  judgeCollection,
  taskCollection,
  transactionCollection,
} from "./collections";

async function main() {
  const db = await getMongoDb();

  await taskCollection(db).createIndexes([
    { key: { taskPda: 1 }, unique: true },
    { key: { id: 1 }, unique: true },
    { key: { requestor: 1, createdAt: -1 } },
    { key: { worker: 1, updatedAt: -1 } },
    { key: { status: 1, createdAt: -1 } },
    { key: { assignedJudges: 1, status: 1 } },
    { key: { lastIndexedSlot: -1 } },
    { key: { programId: 1, lastIndexedCommitment: 1 } },
  ]);

  await judgeCollection(db).createIndexes([
    { key: { judge: 1 }, unique: true },
    { key: { judgeRecordPda: 1 }, unique: true },
    { key: { isActive: 1, updatedAt: -1 } },
  ]);

  await judgeAssignmentCollection(db).createIndexes([
    { key: { assignmentPda: 1 }, unique: true },
    { key: { taskPda: 1, judge: 1 }, unique: true },
    { key: { judge: 1, assignedAt: -1 } },
    { key: { taskPda: 1, hasVoted: 1 } },
  ]);

  await transactionCollection(db).createIndexes([
    { key: { signature: 1 }, unique: true },
    { key: { taskPda: 1, createdAt: -1 } },
    { key: { actor: 1, createdAt: -1 } },
    { key: { instruction: 1, createdAt: -1 } },
  ]);

  console.log(`MongoDB initialized: ${db.databaseName}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoDb();
  });
