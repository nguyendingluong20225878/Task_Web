import type { NextApiRequest, NextApiResponse } from "next";
import { PublicKey } from "@solana/web3.js";
import {
  getMongoDb,
  insertTransaction,
  upsertTaskFromChain,
  type ChainTaskSnapshot,
} from "@/lib/server/db";
import {
  COMMITMENT,
  getConfirmedSignatureSlot,
  readTaskFromDevnet,
} from "@/lib/server/solana/read-task";

const ALLOWED_INSTRUCTIONS = [
  "initialize_task",
  "settle_payment",
  "stake_to_unlock",
  "cancel_open_task",
  "submit_and_assign",
  "judge_vote",
  "claim_judge_fee",
] as const;

type AllowedInstruction = (typeof ALLOWED_INSTRUCTIONS)[number];

type IndexTaskBody = {
  taskId?: unknown;
  signature?: unknown;
  instruction?: unknown;
  actor?: unknown;
  slot?: unknown;
};

type ErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type SuccessResponse = {
  ok: true;
  taskId: string;
  taskPda: string;
  indexedSlot: number;
  signature: string;
};

function error(
  res: NextApiResponse<ErrorResponse>,
  status: number,
  code: string,
  message: string
) {
  return res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

function isAllowedInstruction(value: unknown): value is AllowedInstruction {
  return (
    typeof value === "string" &&
    (ALLOWED_INSTRUCTIONS as readonly string[]).includes(value)
  );
}

function readBody(body: unknown): IndexTaskBody {
  return body && typeof body === "object" ? (body as IndexTaskBody) : {};
}

function validatePublicKey(value: string) {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function validateInput(body: unknown) {
  const parsed = readBody(body);
  const { taskId, signature, instruction, actor, slot } = parsed;

  if (typeof taskId !== "string" || !taskId) {
    return { ok: false as const, code: "INVALID_TASK_ID", message: "taskId is required." };
  }
  if (!/^\d+$/.test(taskId)) {
    return {
      ok: false as const,
      code: "INVALID_TASK_ID",
      message: "taskId must be a numeric string.",
    };
  }
  if (typeof signature !== "string" || !signature) {
    return {
      ok: false as const,
      code: "INVALID_SIGNATURE",
      message: "signature is required.",
    };
  }
  if (!isAllowedInstruction(instruction)) {
    return {
      ok: false as const,
      code: "INVALID_INSTRUCTION",
      message: "instruction is not allowed.",
    };
  }
  if (typeof actor !== "string" || !actor || !validatePublicKey(actor)) {
    return {
      ok: false as const,
      code: "INVALID_ACTOR",
      message: "actor must be a wallet public key string.",
    };
  }
  if (
    slot !== undefined &&
    (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0)
  ) {
    return {
      ok: false as const,
      code: "INVALID_SLOT",
      message: "slot must be a non-negative integer when provided.",
    };
  }

  return {
    ok: true as const,
    value: {
      taskId,
      signature,
      instruction,
      actor,
      slot: slot as number | undefined,
    },
  };
}

function mapError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (message === "TASK_ACCOUNT_NOT_FOUND") {
    return {
      status: 404,
      code: "TASK_ACCOUNT_NOT_FOUND",
      message: "Task account was not found on Solana Devnet.",
    };
  }
  if (message === "SIGNATURE_FAILED") {
    return {
      status: 409,
      code: "SIGNATURE_FAILED",
      message: "Transaction signature has a failed status on Solana Devnet.",
    };
  }
  if (message === "SIGNATURE_NOT_CONFIRMED") {
    return {
      status: 409,
      code: "SIGNATURE_NOT_CONFIRMED",
      message: "Transaction signature is not confirmed on Solana Devnet.",
    };
  }
  return {
    status: 500,
    code: "INDEX_TASK_FAILED",
    message: "Failed to index task from confirmed chain state.",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return error(res, 405, "METHOD_NOT_ALLOWED", "Method must be POST.");
  }

  const input = validateInput(req.body);
  if (!input.ok) {
    return error(res, 400, input.code, input.message);
  }

  try {
    const { taskId, signature, instruction, actor, slot: clientSlot } =
      input.value;
    const [chainTask, signatureSlot] = await Promise.all([
      readTaskFromDevnet(taskId),
      getConfirmedSignatureSlot(signature),
    ]);

    const indexedSlot = chainTask.slot ?? signatureSlot ?? clientSlot;
    if (indexedSlot == null) {
      return error(
        res,
        502,
        "CHAIN_SLOT_UNAVAILABLE",
        "Could not determine a safe confirmed slot from chain state."
      );
    }

    const db = await getMongoDb();
    const snapshot: ChainTaskSnapshot = {
      task: chainTask.task,
      slot: indexedSlot,
      signature,
      commitment: COMMITMENT,
      programId: chainTask.programId,
      decodedAccount: chainTask.decodedAccount,
    };

    await upsertTaskFromChain(db, snapshot);
    await insertTransaction(db, {
      signature,
      slot: indexedSlot,
      instruction,
      taskPda: chainTask.taskPda,
      actor,
      status: "confirmed",
      createdAt: new Date(),
      isSimulated: false,
    });

    return res.status(200).json({
      ok: true,
      taskId,
      taskPda: chainTask.taskPda,
      indexedSlot,
      signature,
    });
  } catch (caught) {
    const mapped = mapError(caught);
    return error(res, mapped.status, mapped.code, mapped.message);
  }
}
