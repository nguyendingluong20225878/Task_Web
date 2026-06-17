import type {
  ChainTaskSnapshot,
  IndexedTask,
} from "../../../src/lib/server/db";

export type Commitment = "confirmed" | "finalized";

export type IndexCheckpoint = {
  programId: string;
  slot: number;
  commitment: Commitment;
  updatedAt: Date;
};

export type DecodedTaskAccount = IndexedTask & {
  decodedAccount: Record<string, unknown>;
};

export type TaskSnapshotInput = {
  task: DecodedTaskAccount;
  slot: number;
  signature: string;
  commitment: Commitment;
  programId: string;
};

export type TaskSnapshotWriter = (snapshot: ChainTaskSnapshot) => Promise<void>;

export function buildTaskSnapshot(input: TaskSnapshotInput): ChainTaskSnapshot {
  if (
    !input.slot ||
    !input.signature ||
    !input.commitment ||
    !input.programId ||
    !input.task.decodedAccount
  ) {
    throw new Error(
      "Task snapshots require slot, signature, commitment, programId, and decodedAccount."
    );
  }

  const { decodedAccount, ...task } = input.task;
  return {
    task,
    slot: input.slot,
    signature: input.signature,
    commitment: input.commitment,
    programId: input.programId,
    decodedAccount,
  };
}

export async function indexTaskAccount(
  input: TaskSnapshotInput,
  writeTaskSnapshot: TaskSnapshotWriter
) {
  await writeTaskSnapshot(buildTaskSnapshot(input));
}

export function shouldAdvanceCheckpoint(
  current: IndexCheckpoint | undefined,
  next: IndexCheckpoint
) {
  if (!current) {
    return true;
  }

  if (current.programId !== next.programId) {
    throw new Error("Checkpoint programId mismatch.");
  }

  return next.slot > current.slot;
}
