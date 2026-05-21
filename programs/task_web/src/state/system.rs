use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RandomnessMode {
    BlockhashMvp,
    SwitchboardVrf,
    CommitReveal,
}

#[account]
#[derive(InitSpace)]
pub struct SystemConfig {
    pub admin: Pubkey,
    pub judge_fee_bps: u16,
    pub max_judges_per_task: u16,
    pub total_active_judges: u32,
    pub randomness_mode: RandomnessMode,
    pub bump: u8,
}
