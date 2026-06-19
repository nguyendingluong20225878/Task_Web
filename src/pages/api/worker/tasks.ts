import type { NextApiRequest, NextApiResponse } from "next";
import {
  getMongoDb,
  listOpenTasks,
  listTasksByWorker,
  type IndexedTask,
} from "@/lib/server/db";

type WorkerTaskMode = "open" | "active";

type ErrorResponse = {
  ok: false;
  message: string;
};

type SuccessResponse = {
  ok: true;
  mode: WorkerTaskMode;
  tasks: IndexedTask[];
};

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | string[] | undefined) {
  const rawValue = readSingleQueryValue(value);
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 50;

  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseMode(value: string | string[] | undefined): WorkerTaskMode | null {
  const mode = readSingleQueryValue(value)?.trim();
  if (mode === "open" || mode === "active") return mode;
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      message: "Method must be GET.",
    });
  }

  const mode = parseMode(req.query.mode);
  const limit = parseLimit(req.query.limit);

  if (!mode) {
    return res.status(400).json({
      ok: false,
      message: "mode query parameter must be open or active.",
    });
  }

  const worker = readSingleQueryValue(req.query.worker)?.trim();

  if (mode === "active" && !worker) {
    return res.status(400).json({
      ok: false,
      message: "worker query parameter is required for active tasks.",
    });
  }

  try {
    const db = await getMongoDb();
    const tasks =
      mode === "open"
        ? await listOpenTasks(db, limit)
        : await listTasksByWorker(db, worker!, limit);

    return res.status(200).json({
      ok: true,
      mode,
      tasks,
    });
  } catch {
    return res.status(500).json({
      ok: false,
      message:
        "Không tải được dữ liệu MongoDB cho worker. Vui lòng thử lại sau.",
    });
  }
}
