use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use crate::state::task::{Task, TaskStatus, MAX_JUDGES, MAX_URI_LENGTH};
use crate::state::judge_pool::{JudgeRecord, JudgeRegistry};
use crate::state::system::{RandomnessMode, SystemConfig};
use crate::errors::TaskError;

#[derive(Accounts)]
pub struct SubmitAndAssign<'info> {
    #[account(mut)]
    pub worker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.worker == worker.key() @ TaskError::UnauthorizedWorker,
        constraint = task.status == TaskStatus::InProgress @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(seeds = [b"system_config"], bump = system_config.bump)]
    pub system_config: Box<Account<'info, SystemConfig>>,

    #[account(seeds = [b"judge_registry"], bump = judge_registry.bump)]
    pub judge_registry: Box<Account<'info, JudgeRegistry>>,//danh sách judge

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SubmitAndAssign>, encrypted_submission_uri: String) -> Result<()> {
    //encrypted_submission_uri: URI đã được worker mã hóa, chứa thông tin về kết quả công việc, chỉ có requestor và judges được assign mới có thể giải mã và xem nội dung này
    let current_time = Clock::get()?.unix_timestamp;

    require!(encrypted_submission_uri.len() <= MAX_URI_LENGTH, TaskError::InvalidConfiguration);//validate input, độ dài URI không được vượt quá giới hạn
    require!(current_time <= ctx.accounts.task.submission_deadline, TaskError::DeadlinePassed);
    require!(
        ctx.accounts.system_config.randomness_mode == RandomnessMode::BlockhashMvp,
        TaskError::UnsupportedRandomness
    );

    let candidate_count = ctx.accounts.judge_registry.active_count as usize;//Số lượng judge đang hoạt động trong JudgeRegistry, sẽ được chọn ngẫu nhiên để assign vào task này
    let required_m = ctx.accounts.task.required_judges_m as usize;
    require!(candidate_count >= required_m, TaskError::NotEnoughJudges);
    require!(ctx.remaining_accounts.len() == candidate_count, TaskError::InvalidJudgePool);

    let task = &mut ctx.accounts.task;
    task.encrypted_submission_uri = encrypted_submission_uri;

    let mut candidates: Vec<Pubkey> = Vec::with_capacity(candidate_count);
    for (i, account_info) in ctx.remaining_accounts.iter().take(candidate_count).enumerate() {
        require!(account_info.is_writable, TaskError::InvalidConfiguration);
        require!(account_info.owner == ctx.program_id, TaskError::InvalidConfiguration);

        let data = account_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let judge_record = JudgeRecord::try_deserialize(&mut data_ref)
            .map_err(|_| TaskError::NotAssignedJudge)?;

        require!(judge_record.is_active, TaskError::NotEnoughJudges);
        require!(judge_record.judge != task.worker, TaskError::UnauthorizedWorker);
        require!(
            judge_record.judge == ctx.accounts.judge_registry.judges[i],
            TaskError::InvalidJudgePool
        );

        let expected_pda = Pubkey::find_program_address(
            &[b"judge_record", judge_record.judge.as_ref()],
            ctx.program_id,
        ).0;
        require!(expected_pda == account_info.key(), TaskError::InvalidConfiguration);
        require!(!candidates.contains(&judge_record.judge), TaskError::DuplicateJudge);

        candidates.push(judge_record.judge);
    }

    let mut selected_indices: Vec<usize> = Vec::with_capacity(required_m);
    let task_key = task.key();
    let worker_key = task.worker;
    let slot_bytes = Clock::get()?.slot.to_le_bytes();
    let mut nonce: u64 = 0;

    while selected_indices.len() < required_m {
        let nonce_bytes = nonce.to_le_bytes();
        let digest = hashv(&[
            b"task_judge_assignment",
            task_key.as_ref(),
            worker_key.as_ref(),
            slot_bytes.as_ref(),
            nonce_bytes.as_ref(),
        ]);
        let mut idx_bytes = [0u8; 8];
        idx_bytes.copy_from_slice(&digest.to_bytes()[..8]);
        let idx = (u64::from_le_bytes(idx_bytes) as usize) % candidate_count;

        if !selected_indices.contains(&idx) {
            selected_indices.push(idx);
        }
        nonce = nonce.checked_add(1).ok_or(TaskError::MathOverflow)?;
    }

    task.assigned_judges = [Pubkey::default(); MAX_JUDGES];

    let mut order = 0usize;
    for (account_idx, account_info) in ctx.remaining_accounts.iter().take(candidate_count).enumerate() {
        if !selected_indices.contains(&account_idx) {
            continue;
        }

        let data = account_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let mut judge_record = JudgeRecord::try_deserialize(&mut data_ref)
            .map_err(|_| TaskError::NotAssignedJudge)?;
        drop(data);

        task.assigned_judges[order] = judge_record.judge;
        judge_record.total_assignment_count = judge_record.total_assignment_count
            .checked_add(1)
            .ok_or(TaskError::MathOverflow)?;
        if task.voting_deadline > judge_record.locked_until {
            judge_record.locked_until = task.voting_deadline;
        }
        let mut data = account_info.try_borrow_mut_data()?;
        let mut data_ref: &mut [u8] = &mut data;
        judge_record.try_serialize(&mut data_ref)?;
        order = order.checked_add(1).ok_or(TaskError::MathOverflow)?;
    }

    task.assigned_judge_count = task.required_judges_m;
    task.status = TaskStatus::Resolving;

    Ok(())
}
