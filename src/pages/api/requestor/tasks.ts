import type { NextApiRequest, NextApiResponse } from "next";
import {
  getMongoDb,
  listTasksByRequestor,
  type IndexedTask,
} from "@/lib/server/db";

type ErrorResponse = {
  ok: false;
  message: string;
};

type SuccessResponse = {
  ok: true;
  tasks: IndexedTask[];
};

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

  const requestor = readSingleQueryValue(req.query.requestor)?.trim();
  const taskId = readSingleQueryValue(req.query.taskId)?.trim();
  const taskPda = readSingleQueryValue(req.query.taskPda)?.trim();

  if (!requestor) {
    return res.status(400).json({
      ok: false,
      message: "requestor query parameter is required.",
    });
  }

  try {
    const db = await getMongoDb();
    const tasks = await listTasksByRequestor(db, requestor);
    const filteredTasks = tasks.filter((task) => {
      if (taskId && task.id !== taskId) return false;
      if (taskPda && task.taskPda !== taskPda) return false;
      return true;
    });

    return res.status(200).json({
      ok: true,
      tasks: filteredTasks,
    });
  } catch {
    return res.status(500).json({
      ok: false,
      message:
        "Không tải được dữ liệu MongoDB cho requestor. Vui lòng thử lại sau.",
    });
  }
}
