use anchor_lang::prelude::*;

pub const MAX_ACTIVE_JUDGES: usize = 16;

#[account]
#[derive(InitSpace)]
pub struct JudgeRecord {
    pub judge: Pubkey,
    pub amount_staked: u64,
    pub is_active: bool,
    pub total_assignment_count: u16,
    pub locked_until: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct JudgeRegistry {
    pub judges: [Pubkey; MAX_ACTIVE_JUDGES],
    pub active_count: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct JudgeStakeVault {
    pub bump: u8,
}
