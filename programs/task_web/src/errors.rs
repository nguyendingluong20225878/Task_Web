use anchor_lang::prelude::*;

#[error_code]
pub enum TaskError {
    #[msg("Invalid Task Status for this operation.")]
    InvalidStatus,
    #[msg("Worker stake amount does not match the requirement.")]
    InvalidStakeAmount,
    #[msg("Deadline has passed.")]
    DeadlinePassed,
    #[msg("Not the assigned worker or unauthorized action.")]
    UnauthorizedWorker,
    #[msg("Judge has already voted.")]
    AlreadyVoted,
    #[msg("Voting is still active or threshold not reached.")]
    VotingNotComplete,
    #[msg("Settlement outcome is not decisive.")]
    SettlementNotDecisive,
    #[msg("Not an assigned judge for this task.")]
    NotAssignedJudge,
    #[msg("Not enough active judges in the pool.")]
    NotEnoughJudges,
    #[msg("Judge has already claimed the fee.")]
    AlreadyClaimed,
    #[msg("Judge is not eligible to claim fee for this task.")]
    NotEligibleForFee,
    #[msg("Duplicate judge assignment is not allowed.")]
    DuplicateJudge,
    #[msg("Invalid configuration parameters.")]
    InvalidConfiguration,
    #[msg("Invalid token account for this task.")]
    InvalidTokenAccount,
    #[msg("Task has not expired yet.")]
    TaskNotExpired,
    #[msg("Unauthorized admin.")]
    UnauthorizedAdmin,
    #[msg("Judge stake is currently locked in an active task.")]
    StakeLocked, // FIX 3: Lỗi khi rút cọc sớm
    #[msg("Arithmetic overflow.")]
    MathOverflow,
    #[msg("Judge registry is full.")]
    JudgeRegistryFull,
    #[msg("Invalid canonical judge pool.")]
    InvalidJudgePool,
    #[msg("Unsupported randomness mode.")]
    UnsupportedRandomness,
    #[msg("Settlement assignment set is incomplete or invalid.")]
    AssignmentSetIncomplete,
    #[msg("Escrow vault balance does not match the task invariant.")]
    InvalidEscrowBalance,
}
