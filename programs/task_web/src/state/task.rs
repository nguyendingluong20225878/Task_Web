use anchor_lang::prelude::*;

pub const MAX_URI_LENGTH: usize = 256;
pub const MAX_JUDGES: usize = 5;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    Open,
    InProgress,
    Resolving,
    Completed,
    Failed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Task {
    pub requestor: Pubkey,
    pub worker: Pubkey,
    pub id: u64,

    pub token_mint: Pubkey,
    pub escrow_token_vault: Pubkey,
    pub nft_asset: Pubkey,

    pub bounty_amount: u64,
    pub judge_fee_bps: u16,
    pub worker_stake_amount: u64,

    pub created_at: i64,
    pub submission_deadline: i64,
    pub voting_deadline: i64,

    #[max_len(MAX_URI_LENGTH)]
    pub public_metadata_uri: String,
    #[max_len(MAX_URI_LENGTH)]
    pub encrypted_task_detail_uri: String,
    #[max_len(MAX_URI_LENGTH)]
    pub encrypted_submission_uri: String,

    pub required_judges_m: u16,
    pub approval_threshold_n: u16,
    pub pass_vote_count: u16,
    pub fail_vote_count: u16,
    pub assigned_judge_count: u16,
    pub settled_judge_winner_count: u16,

    pub assigned_judges: [Pubkey; MAX_JUDGES],

    pub fee_per_judge: u64,
    pub total_judge_fee_reserved: u64,
    pub judge_fee_claimed: u64,

    pub status: TaskStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TaskJudgeAssignment {
    pub task_id: u64,
    pub task: Pubkey,
    pub judge: Pubkey,
    pub assigned_order: u16,
    pub assigned_at: i64,
    pub has_voted: bool,
    pub vote_is_pass: bool,
    pub voted_at: i64,
    pub has_claimed_fee: bool,
    pub fee_amount: u64,
    pub bump: u8,
}
