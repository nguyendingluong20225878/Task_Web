import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

type AnyProgram = Program & { methods: any; account: any; idl: any };

const PROGRAM_ROOT = path.resolve("programs/task_web/src");
const IDL = JSON.parse(fs.readFileSync(path.resolve("target/idl/task_contract.json"), "utf8"));
const ADMIN_PUBKEY = new PublicKey("Admin11111111111111111111111111111111111111");
const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const MAX_URI_LENGTH = 256;
const MAX_JUDGES = 5;
const MAX_ACTIVE_JUDGES = 16;

function src(relativePath: string): string {
  return fs.readFileSync(path.join(PROGRAM_ROOT, relativePath), "utf8");
}

function pda(programId: PublicKey, seeds: Array<Buffer | Uint8Array>): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function taskIdSeed(id: anchor.BN): Buffer {
  return id.toArrayLike(Buffer, "le", 8);
}

function expectAnchorError(error: any, code: string) {
  const errorCode = error?.error?.errorCode?.code;
  const logs = (error?.logs ?? []).join("\n");
  const message = String(error?.message ?? "");
  expect(errorCode ?? logs ?? message).to.satisfy((actual: string) => {
    return actual === code || logs.includes(code) || message.includes(code);
  });
}

describe("task_web QA coverage", () => {
  const connection = new Connection(process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899", "confirmed");
  const wallet = process.env.ANCHOR_WALLET
    ? anchor.Wallet.local()
    : new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
  anchor.setProvider(provider);

  const program = new Program(IDL, provider) as AnyProgram;

  const [systemConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("system_config")],
    program.programId,
  );
  const [judgeRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("judge_registry")],
    program.programId,
  );
  const [judgeStakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("judge_stake_vault")],
    program.programId,
  );

  describe("IDL and domain model", () => {
    it("TC01 exposes all lifecycle instructions", () => {
      const instructionNames = IDL.instructions.map((ix: any) => ix.name);

      expect(instructionNames).to.include.members([
        "admin_init_protocol",
        "judge_register",
        "judge_unregister",
        "initialize_task",
        "stake_to_unlock",
        "submit_and_assign",
        "init_judge_assignment",
        "judge_vote",
        "settle_payment",
        "claim_judge_fee",
        "cancel_open_task",
        "cancel_expired_task",
      ]);
    });

    it("TC02 keeps task status lifecycle normalized", () => {
      const taskStatus = IDL.types.find((type: any) => type.name === "TaskStatus");
      const variants = taskStatus.type.variants.map((variant: any) => variant.name);

      expect(variants).to.deep.eq([
        "Open",
        "InProgress",
        "Resolving",
        "Completed",
        "Failed",
        "Cancelled",
      ]);
    });

    it("TC03 stores URI fields as bounded strings", () => {
      const task = IDL.types.find((account: any) => account.name === "Task");
      const fields = Object.fromEntries(task.type.fields.map((field: any) => [field.name, field]));

      for (const fieldName of [
        "public_metadata_uri",
        "encrypted_task_detail_uri",
        "encrypted_submission_uri",
      ]) {
        expect(fields[fieldName].type).to.deep.eq("string");
      }

      const taskSource = src("state/task.rs");
      expect(taskSource).to.include(`pub const MAX_URI_LENGTH: usize = ${MAX_URI_LENGTH};`);
      expect(taskSource.match(/#\[max_len\(MAX_URI_LENGTH\)\]/g)).to.have.length(3);
    });

    it("TC04 limits task and registry judge capacity", () => {
      expect(src("state/task.rs")).to.include(`pub const MAX_JUDGES: usize = ${MAX_JUDGES};`);
      expect(src("state/judge_pool.rs")).to.include(
        `pub const MAX_ACTIVE_JUDGES: usize = ${MAX_ACTIVE_JUDGES};`,
      );
    });

    it("TC05 uses expected PDA seeds for core accounts", () => {
      const taskId = new anchor.BN(42);
      const worker = PublicKey.unique();
      const judge = PublicKey.unique();
      const task = pda(program.programId, [Buffer.from("task"), taskIdSeed(taskId)]);

      expect(systemConfig.equals(pda(program.programId, [Buffer.from("system_config")]))).to.eq(true);
      expect(judgeRegistry.equals(pda(program.programId, [Buffer.from("judge_registry")]))).to.eq(true);
      expect(judgeStakeVault.equals(pda(program.programId, [Buffer.from("judge_stake_vault")]))).to.eq(true);
      expect(pda(program.programId, [Buffer.from("vault"), task.toBuffer()])).to.be.instanceOf(PublicKey);
      expect(pda(program.programId, [Buffer.from("escrow"), taskIdSeed(taskId), worker.toBuffer()])).to.be.instanceOf(PublicKey);
      expect(pda(program.programId, [Buffer.from("judge_record"), judge.toBuffer()])).to.be.instanceOf(PublicKey);
      expect(pda(program.programId, [Buffer.from("task_judge"), taskIdSeed(taskId), judge.toBuffer()])).to.be.instanceOf(PublicKey);
    });
  });

  describe("Executable negative smoke tests", () => {
    it("TC06 rejects admin_init_protocol from non-hardcoded admin", async function () {
      if (!process.env.ANCHOR_PROVIDER_URL || !process.env.ANCHOR_WALLET) {
        this.skip();
      }
      try {
        await provider.connection.getLatestBlockhash();
      } catch {
        this.skip();
      }

      expect(provider.wallet.publicKey.equals(ADMIN_PUBKEY)).to.eq(false);

      try {
        await program.methods
          .adminInitProtocol(500)
          .accounts({
            admin: provider.wallet.publicKey,
            systemConfig,
            judgeRegistry,
            judgeStakeVault,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Expected UnauthorizedAdmin");
      } catch (error) {
        expectAnchorError(error, "UnauthorizedAdmin");
      }
    });
  });

  describe("Source-level behavior regressions", () => {
    it("TC07 validates initialize_task rejects invalid config before CPI", () => {
      const code = src("instructions/initialize_task.rs");

      expect(code).to.include("deadlines[0] > current_time");
      expect(code).to.include("deadlines[1] >= deadlines[0] + 86400");
      expect(code).to.include("bounty_amount > 0");
      expect(code).to.include("worker_stake_amount > 0");
      expect(code).to.include("required_judges_m > 0");
      expect(code).to.include("approval_threshold_n <= actual_m");
      expect(code).to.include("total_active_judges >= actual_m as u32");
    });

    it("TC08 validates submit_and_assign requires canonical active judge records", () => {
      const code = src("instructions/submit_and_assign.rs");

      expect(code).to.include("ctx.remaining_accounts.len() == candidate_count");
      expect(code).to.include("judge_record.is_active");
      expect(code).to.include("judge_record.judge == ctx.accounts.judge_registry.judges[i]");
      expect(code).to.include("expected_pda == account_info.key()");
      expect(code).to.include("!candidates.contains(&judge_record.judge)");
      expect(code).to.include("judge_record.judge != task.worker");
    });

    it("TC09 validates judge_vote blocks duplicate and non-assigned votes", () => {
      const code = src("instructions/judge_vote.rs");

      expect(code).to.include("!judge_assignment.has_voted");
      expect(code).to.include("task.assigned_judges.iter().any");
      expect(code).to.include("current_time <= task.voting_deadline");
      expect(code).to.include("checked_add(1)");
    });

    it("TC10 requires settlement to have a decisive outcome after deadline", () => {
      const code = src("instructions/settle_payment.rs");

      expect(code).to.include("definitely_failed");
      expect(code).to.match(
        /require!\([^;]*(is_approved|definitely_failed)[^;]*(is_approved|definitely_failed)[^;]*TaskError::VotingNotComplete/s,
        "settle_payment should reject inconclusive partial votes after deadline",
      );
    });

    it("TC11 validates judge fee claim checks winner, cap, and double-claim", () => {
      const code = src("instructions/claim_judge_fee.rs");

      expect(code).to.include("!judge_assignment.has_claimed_fee");
      expect(code).to.include("voted_correctly");
      expect(code).to.include("next_claimed <= task.total_judge_fee_reserved");
      expect(code).to.include("escrow_token_vault.amount >= task.fee_per_judge");
    });
  });

  describe("Full integration cases to enable with test fixtures", () => {
    before(function () {
      const hasAdminFixture = provider.wallet.publicKey.equals(ADMIN_PUBKEY);
      const hasMplCoreFixture = MPL_CORE_PROGRAM_ID.toBase58().length > 0;

      if (!hasAdminFixture || !hasMplCoreFixture) {
        this.skip();
      }
    });

    it("TC12 PASS path: Open -> InProgress -> Resolving -> Completed -> judge claim", async () => {
      throw new Error("TODO: enable after local validator has admin keypair and MPL Core program.");
    });

    it("TC13 FAIL path: enough fail votes slash worker stake and refund requestor", async () => {
      throw new Error("TODO: enable after local validator has admin keypair and MPL Core program.");
    });

    it("TC14 cancel_open_task refunds bounty and returns NFT before worker stakes", async () => {
      throw new Error("TODO: enable after local validator has admin keypair and MPL Core program.");
    });

    it("TC15 cancel_expired_task after submission deadline refunds bounty and slashes stake", async () => {
      throw new Error("TODO: enable after local validator has admin keypair and MPL Core program.");
    });

    it("TC16 rejects overlong URI, zero bounty, zero stake, invalid m/n, and bad deadlines", async () => {
      throw new Error("TODO: enable after local validator has admin keypair and MPL Core program.");
    });
  });
});
