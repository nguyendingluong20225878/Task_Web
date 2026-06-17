import { Keypair, PublicKey } from "@solana/web3.js";

export type LocalValidatorFixture = {
  admin: PublicKey;
  requestor: Keypair;
  worker: Keypair;
  judges: Keypair[];
  requiredJudgeCount: number;
  approvalThreshold: number;
  requiresMetaplexCore: true;
  requiresSplMint: true;
};

export const HARDCODED_ADMIN = new PublicKey(
  "Admin11111111111111111111111111111111111111"
);

export function createLocalValidatorFixture(
  judgeCount = 5
): LocalValidatorFixture {
  if (judgeCount < 5) {
    throw new Error("P0 fixtures require at least 5 judges.");
  }

  return {
    admin: HARDCODED_ADMIN,
    requestor: Keypair.generate(),
    worker: Keypair.generate(),
    judges: Array.from({ length: judgeCount }, () => Keypair.generate()),
    requiredJudgeCount: 3,
    approvalThreshold: 2,
    requiresMetaplexCore: true,
    requiresSplMint: true,
  };
}
