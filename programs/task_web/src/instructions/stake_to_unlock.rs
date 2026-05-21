use anchor_lang::prelude::*;
use crate::state::task::{Task, TaskStatus};
use crate::state::escrow::WorkerEscrow;
use crate::errors::TaskError;
//woker nhận việc
#[derive(Accounts)]
pub struct StakeToUnlock<'info> {
    #[account(mut)]
    pub worker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.status == TaskStatus::Open @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(//Worker escrow PDA = account do program tạo ra để giữ tiền stake của worker
        init,
        payer = worker,
        space = 8 + WorkerEscrow::INIT_SPACE,
        //escrow : tiền bị khóa trung gian
        seeds = [b"escrow", task.id.to_le_bytes().as_ref(), worker.key().as_ref()],
        bump
    )]
    pub worker_escrow: Box<Account<'info, WorkerEscrow>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<StakeToUnlock>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let amount = task.worker_stake_amount;

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.worker.key(),
        &ctx.accounts.worker_escrow.key(),//Worker chuyển tiền stake vào worker escrow PDA
        amount,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.worker.to_account_info(),
            ctx.accounts.worker_escrow.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let escrow = &mut ctx.accounts.worker_escrow;
    escrow.worker = ctx.accounts.worker.key();
    escrow.task = task.key();
    escrow.task_id = task.id;
    escrow.amount_staked = amount;
    escrow.is_slashed = false;//slash: hình thức phạt, khi worker bị hủy task hoặc không hoàn thành sẽ bị slash, mất một phần hoặc toàn bộ tiền stake
    escrow.is_released = false;//chưa được giải phóng, khi task được hoàn thành và worker được trả thưởng sẽ giải phóng tiền stake, nếu task bị hủy hoặc worker không hoàn thành sẽ bị slash
    escrow.bump = ctx.bumps.worker_escrow;

    task.worker = ctx.accounts.worker.key();
    task.status = TaskStatus::InProgress;

    Ok(())
}
