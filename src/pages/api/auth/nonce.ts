import type { NextApiRequest, NextApiResponse } from "next";
import { createNonce } from "@/lib/server/auth/wallet-session";
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  try { return res.status(200).json({ ok: true, ...createNonce() }); }
  catch { return res.status(503).json({ ok: false, message: "Wallet authentication is not configured." }); }
}
