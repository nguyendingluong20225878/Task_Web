use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct WorkerEscrow {
    pub worker: Pubkey,
    pub task: Pubkey,
    pub task_id: u64,
    pub amount_staked: u64,
    pub is_slashed: bool,
    pub is_released: bool,
    pub bump: u8,
}
