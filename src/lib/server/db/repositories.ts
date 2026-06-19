import { Db } from "mongodb";
import {
  judgeAssignmentCollection,
  judgeCollection,
  taskCollection,
  transactionCollection,
} from "./collections";
import {
  ChainTaskSnapshot,
  IndexedJudge,
  IndexedJudgeAssignment,
  IndexedTask,
  IndexedTransaction,
} from "./models";

export async function upsertTask(db: Db, task: IndexedTask) {
  throw new Error(
    "upsertTask is disabled for protocol state. Use upsertTaskFromChain(snapshot) from the indexer."
  );
}

export async function upsertTaskFromChain(db: Db, snapshot: ChainTaskSnapshot) {
  const { task, slot, signature, commitment, programId, decodedAccount } =
    snapshot;
  if (slot == null || !signature || !commitment || !programId || !decodedAccount) {
    throw new Error(
      "Indexed task snapshots require slot, signature, commitment, programId, and decodedAccount."
    );
  }

  const now = new Date();
  await taskCollection(db).updateOne(
    { taskPda: task.taskPda },
    {
      $set: {
        ...task,
        lastSignature: signature,
        lastIndexedSlot: slot,
        lastIndexedCommitment: commitment,
        programId,
        decodedAccount,
        updatedAt: task.updatedAt ?? now,
      },
    },
    { upsert: true }
  );
}

export async function updateTaskStatus(
  db: Db,
  taskPda: string,
  status: IndexedTask["status"],
  signature?: string
) {
  throw new Error(
    "updateTaskStatus is disabled. Final task status must be indexed from on-chain Task accounts."
  );
}

export async function upsertJudge(db: Db, judge: IndexedJudge) {
  const now = new Date();
  await judgeCollection(db).updateOne(
    { judge: judge.judge },
    { $set: { ...judge, updatedAt: judge.updatedAt ?? now } },
    { upsert: true }
  );
}

export async function upsertJudgeAssignment(
  db: Db,
  assignment: IndexedJudgeAssignment
) {
  const now = new Date();
  await judgeAssignmentCollection(db).updateOne(
    { assignmentPda: assignment.assignmentPda },
    { $set: { ...assignment, updatedAt: assignment.updatedAt ?? now } },
    { upsert: true }
  );
}

export async function insertTransaction(
  db: Db,
  transaction: IndexedTransaction
) {
  await transactionCollection(db).updateOne(
    { signature: transaction.signature },
    { $setOnInsert: transaction },
    { upsert: true }
  );
}

export async function listOpenTasks(db: Db, limit = 50) {
  return taskCollection(db)
    .find({ status: "Open" }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function listTasksByRequestor(
  db: Db,
  requestor: string,
  limit = 50
) {
  return taskCollection(db)
    .find({ requestor }, { projection: { _id: 0 } })
    .sort({ createdAt: -1, updatedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function listTasksByWorker(db: Db, worker: string, limit = 50) {
  return taskCollection(db)
    .find({ worker }, { projection: { _id: 0 } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function listJudgeAssignments(db: Db, judge: string, limit = 50) {
  return judgeAssignmentCollection(db)
    .find({ judge })
    .sort({ assignedAt: -1 })
    .limit(limit)
    .toArray();
}
