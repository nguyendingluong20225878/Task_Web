use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB");

#[program]
pub mod task_contract {
    use super::*;

    pub fn admin_init_protocol(ctx: Context<AdminInitProtocol>, judge_fee_bps: u16) -> Result<()> {
        instructions::admin_init_protocol::handler(ctx, judge_fee_bps)
    }

    pub fn judge_register(ctx: Context<JudgeRegister>, stake_amount: u64) -> Result<()> {
        instructions::judge_register::handler(ctx, stake_amount)
    }

    pub fn judge_unregister(ctx: Context<JudgeUnregister>) -> Result<()> {
        instructions::judge_unregister::handler(ctx)
    }

    pub fn initialize_task(
        ctx: Context<InitializeTask>,
        id: u64,
        bounty_amount: u64,
        worker_stake_amount: u64,
        required_judges_m: u16,
        approval_threshold_n: u16,
        deadlines: [i64; 2],
        public_metadata_uri: String,
        encrypted_task_detail_uri: String,
        encrypted_submission_uri: String,
    ) -> Result<()> {
        instructions::initialize_task::handler(
            ctx,
            id,
            bounty_amount,
            worker_stake_amount,
            required_judges_m,
            approval_threshold_n,
            deadlines,
            public_metadata_uri,
            encrypted_task_detail_uri,
            encrypted_submission_uri,
        )
    }

    // FIX 2: Hủy task khi chưa có ai nhận (Trạng thái Open)
    pub fn cancel_open_task(ctx: Context<CancelOpenTask>) -> Result<()> {
        instructions::cancel_open_task::handler(ctx)
    }

    pub fn stake_to_unlock(ctx: Context<StakeToUnlock>) -> Result<()> {
        instructions::stake_to_unlock::handler(ctx)
    }

    pub fn submit_and_assign(
        ctx: Context<SubmitAndAssign>,
        encrypted_submission_uri: String,
    ) -> Result<()> {
        instructions::submit_and_assign::handler(ctx, encrypted_submission_uri)
    }

    pub fn init_judge_assignment(ctx: Context<InitJudgeAssignment>) -> Result<()> {
        instructions::init_judge_assignment::handler(ctx)
    }

    pub fn judge_vote(ctx: Context<JudgeVote>, is_pass: bool) -> Result<()> {
        instructions::judge_vote::handler(ctx, is_pass)
    }

    pub fn settle_payment(ctx: Context<SettlePayment>) -> Result<()> {
        instructions::settle_payment::handler(ctx)
    }

    pub fn claim_judge_fee(ctx: Context<ClaimJudgeFee>) -> Result<()> {
        instructions::claim_judge_fee::handler(ctx)
    }

    // Hủy task khi Worker nhận nhưng bỏ trốn (Trạng thái InProgress)
    pub fn cancel_expired_task(ctx: Context<CancelExpiredTask>) -> Result<()> {
        instructions::cancel_expired_task::handler(ctx)
    }
}
