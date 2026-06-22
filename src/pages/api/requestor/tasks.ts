import type { NextApiRequest, NextApiResponse } from "next";
import { getMongoDb, listTasksByRequestor } from "@/lib/server/db";
import { requireWalletSession } from "@/lib/server/auth/wallet-session";
import { toRequestorTaskDto } from "@/lib/server/api/task-dto";

type ErrorResponse = { ok: false; message: string };
type SuccessResponse = { ok: true; tasks: ReturnType<typeof toRequestorTaskDto>[] };
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export default async function handler(req: NextApiRequest, res: NextApiResponse<SuccessResponse | ErrorResponse>) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, message: "Method must be GET." }); }
  const session = requireWalletSession(req, res); if (!session) return;
  const taskId = single(req.query.taskId)?.trim(); const taskPda = single(req.query.taskPda)?.trim();
  try { const db = await getMongoDb(); const tasks = await listTasksByRequestor(db, session.wallet); return res.status(200).json({ ok: true, tasks: tasks.filter((task) => (!taskId || task.id === taskId) && (!taskPda || task.taskPda === taskPda)).map(toRequestorTaskDto) }); }
  catch { return res.status(500).json({ ok: false, message: "Unable to load indexed requestor tasks." }); }
}