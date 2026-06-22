import type { NextApiRequest, NextApiResponse } from "next";
import { setWalletSession, verifyWalletMessage } from "@/lib/server/auth/wallet-session";
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const { wallet, nonce, message, signature } = req.body ?? {};
  if (![wallet, nonce, message, signature].every((value) => typeof value === "string")) return res.status(400).json({ ok: false, message: "Invalid authentication payload." });
  try { const session = verifyWalletMessage(wallet, nonce, message, signature); if (!session) return res.status(401).json({ ok: false, message: "Invalid, expired, or already-used nonce." }); setWalletSession(res, session); return res.status(200).json({ ok: true, ...session }); }
  catch { return res.status(401).json({ ok: false, message: "Invalid wallet signature or auth configuration." }); }
}
