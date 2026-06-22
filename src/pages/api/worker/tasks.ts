import type { NextApiRequest, NextApiResponse } from "next";
import { getMongoDb, listOpenTasks, listTasksByWorker } from "@/lib/server/db";
import { getWalletSession } from "@/lib/server/auth/wallet-session";
import { toActiveWorkerTaskDto, toPublicTaskDto } from "@/lib/server/api/task-dto";

type Mode = "open" | "active";
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, message: "Method must be GET." }); }
  const mode = single(req.query.mode)?.trim() as Mode; if (mode !== "open" && mode !== "active") return res.status(400).json({ ok: false, message: "mode must be open or active." });
  const parsed = Number.parseInt(single(req.query.limit) ?? "50", 10); const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;
  const session = mode === "active" ? getWalletSession(req) : null;
  if (mode === "active" && !session) return res.status(401).json({ ok: false, message: "Wallet session expired. Authenticate again." });
  try { const db = await getMongoDb(); const tasks = mode === "open" ? await listOpenTasks(db, limit) : await listTasksByWorker(db, session!.wallet, limit); return res.status(200).json({ ok: true, mode, tasks: mode === "open" ? tasks.map(toPublicTaskDto) : tasks.map(toActiveWorkerTaskDto) }); }
  catch { return res.status(500).json({ ok: false, message: "Unable to load indexed worker tasks." }); }
}