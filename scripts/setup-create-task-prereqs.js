#!/usr/bin/env node

require("dotenv/config");

const anchor = require("@coral-xyz/anchor");
const { BN, Program } = require("@coral-xyz/anchor");
const {
Keypair,
LAMPORTS_PER_SOL,
PublicKey,
SystemProgram,
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

/* =========================
WALLET LOADER
========================= */
function loadAdminWallet() {
try {
console.log("🔑 Using Anchor wallet...");
return anchor.Wallet.local();
} catch (e) {
const walletPath =
process.env.ANCHOR_WALLET ||
`${process.env.HOME}/.config/solana/id.json`;

console.warn("⚠️ Wallet fallback:", walletPath);

if (!fs.existsSync(walletPath)) {
  console.warn("⚠️ Wallet not found → creating new one...");
  const keypair = Keypair.generate();
  fs.mkdirSync(path.dirname(walletPath), { recursive: true });
  fs.writeFileSync(
    walletPath,
    JSON.stringify(Array.from(keypair.secretKey))
  );
  console.log("✅ New wallet:", keypair.publicKey.toBase58());
  return new anchor.Wallet(keypair);
}

const secret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
console.log("✅ Loaded wallet:", keypair.publicKey.toBase58());
return new anchor.Wallet(keypair);

}
}

/* =========================
PROGRAM LOADER
========================= */
function loadProgram(provider) {
const idlPath = path.resolve("target/idl/task_contract.json");
if (!fs.existsSync(idlPath)) {
throw new Error("❌ Missing IDL. Run: anchor build");
}
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
return new Program(idl, provider);
}

/* =========================
KEYPAIR
========================= */
function loadOrCreateKeypair(filePath) {
if (fs.existsSync(filePath)) {
return Keypair.fromSecretKey(
Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")))
);
}
const keypair = Keypair.generate();
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
return keypair;
}

/* =========================
BALANCE CHECK (NO AIRDROP)
========================= */
async function checkBalance(connection, pubkey, minSol, label) {
const balance = await connection.getBalance(pubkey);
const sol = balance / LAMPORTS_PER_SOL;

console.log(`💰 ${label} balance:`, sol);

if (sol < minSol) {
throw new Error(
`❌ ${label} needs at least ${minSol} SOL (current: ${sol})`
);
}
}

/* =========================
CONFIRM TX
========================= */
async function confirmSignature(connection, signature) {
const latest = await connection.getLatestBlockhash();
await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

/* =========================
MAIN
========================= */
async function main() {
const rpcUrl =
process.env.SOLANA_RPC_URL ||
process.env.ANCHOR_PROVIDER_URL ||
"https://api.devnet.solana.com";

console.log("🌐 RPC:", rpcUrl);

const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

const wallet = loadAdminWallet();

const provider = new anchor.AnchorProvider(
connection,
wallet,
anchor.AnchorProvider.defaultOptions()
);

anchor.setProvider(provider);

const program = loadProgram(provider);

const [systemConfig] = PublicKey.findProgramAddressSync(
[Buffer.from("system_config")],
program.programId
);

const [judgeRegistry] = PublicKey.findProgramAddressSync(
[Buffer.from("judge_registry")],
program.programId
);

const [judgeStakeVault] = PublicKey.findProgramAddressSync(
[Buffer.from("judge_stake_vault")],
program.programId
);

/* ===== CHECK ADMIN BALANCE ===== */
await checkBalance(connection, wallet.publicKey, 0.5, "Admin");

let initSignature = "already-initialized";
const configInfo = await connection.getAccountInfo(systemConfig);

if (!configInfo) {
console.log("🚀 Initializing protocol...");
initSignature = await program.methods
.adminInitProtocol(500)
.accounts({
admin: wallet.publicKey,
systemConfig,
judgeRegistry,
judgeStakeVault,
systemProgram: SystemProgram.programId,
})
.rpc();

await confirmSignature(connection, initSignature);

}

const judge = loadOrCreateKeypair(path.resolve(".anchor/judge-1.json"));

/* ===== CHECK JUDGE BALANCE ===== */
await checkBalance(connection, judge.publicKey, 0.2, "Judge");

const [judgeRecord] = PublicKey.findProgramAddressSync(
[Buffer.from("judge_record"), judge.publicKey.toBuffer()],
program.programId
);

let judgeSignature = "already-registered";
const judgeInfo = await connection.getAccountInfo(judgeRecord);

if (!judgeInfo) {
console.log("⚖️ Registering judge...");

// 🔻 REDUCED STAKE (0.1 SOL)
const stakeAmount = new BN(100_000_000);

judgeSignature = await program.methods
  .judgeRegister(stakeAmount)
  .accounts({
    judge: judge.publicKey,
    systemConfig,
    judgeRegistry,
    judgeRecord,
    judgeStakeVault,
    systemProgram: SystemProgram.programId,
  })
  .signers([judge])
  .rpc();

await confirmSignature(connection, judgeSignature);

}

const config = await program.account.systemConfig.fetch(systemConfig);
const registry = await program.account.judgeRegistry.fetch(judgeRegistry);

console.log("\n📊 RESULT:");
console.log(
JSON.stringify(
{
rpcUrl,
programId: program.programId.toBase58(),
admin: wallet.publicKey.toBase58(),
systemConfig: systemConfig.toBase58(),
judgeRegistry: judgeRegistry.toBase58(),
judgeStakeVault: judgeStakeVault.toBase58(),
initSignature,
judge: judge.publicKey.toBase58(),
judgeRecord: judgeRecord.toBase58(),
judgeSignature,
totalActiveJudges: Number(config.totalActiveJudges),
activeJudgeCount: Number(registry.activeCount),
},
null,
2
)
);
}

main().catch((err) => {
console.error("❌ ERROR:", err);

process.exit(1);
});
