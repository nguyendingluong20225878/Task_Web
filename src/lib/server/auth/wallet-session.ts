import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "crypto";
import { PublicKey } from "@solana/web3.js";
import type { NextApiRequest, NextApiResponse } from "next";

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const COOKIE_NAME = "task_web_session";
const nonces = new Map<string, { expiresAt: number; used: boolean }>();
export type WalletSession = { wallet: string; expiresAt: number };

function secret() {
  const value = process.env.WALLET_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("WALLET_SESSION_SECRET must be configured with at least 32 characters.");
  return value;
}
function encode(value: WalletSession) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
function decode(value?: string): WalletSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WalletSession;
    return session.expiresAt > Date.now() && new PublicKey(session.wallet).toBase58() === session.wallet ? session : null;
  } catch { return null; }
}
export function getWalletSession(req: NextApiRequest) {
  const entry = req.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE_NAME}=`));
  return decode(entry?.slice(COOKIE_NAME.length + 1));
}
export function requireWalletSession(req: NextApiRequest, res: NextApiResponse) {
  const session = getWalletSession(req);
  if (session) return session;
  res.status(401).json({ ok: false, message: "Wallet session expired. Authenticate again." });
  return null;
}
export function createNonce() {
  const nonce = randomBytes(24).toString("base64url"); const expiresAt = Date.now() + NONCE_TTL_MS;
  nonces.set(nonce, { expiresAt, used: false }); return { nonce, expiresAt };
}
export function buildWalletMessage(wallet: string, nonce: string, expiresAt: number) {
  return `Task Web authentication\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
}
export function verifyWalletMessage(wallet: string, nonce: string, message: string, signature: string) {
  const record = nonces.get(nonce); if (!record || record.used || record.expiresAt <= Date.now()) return null;
  const publicKey = new PublicKey(wallet);
  if (message !== buildWalletMessage(publicKey.toBase58(), nonce, record.expiresAt)) return null;
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey.toBytes())]), format: "der", type: "spki" });
  if (!verify(null, Buffer.from(message), key, Buffer.from(signature, "base64"))) return null;
  record.used = true; return { wallet: publicKey.toBase58(), expiresAt: Date.now() + SESSION_TTL_MS };
}
export function setWalletSession(res: NextApiResponse, session: WalletSession) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encode(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
}
export function clearWalletSession(res: NextApiResponse) { res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }
