use crate::errors::TaskError;
use crate::state::task::{Task, TaskJudgeAssignment, TaskStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct ClaimJudgeFee<'info> {
    #[account(mut)]
    pub judge: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.status == TaskStatus::Completed || task.status == TaskStatus::Failed @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        mut,
        seeds = [b"task_judge", task.id.to_le_bytes().as_ref(), judge.key().as_ref()],
        bump = judge_assignment.bump,
        constraint = judge_assignment.task == task.key() @ TaskError::NotEligibleForFee,
        constraint = judge_assignment.task_id == task.id @ TaskError::NotEligibleForFee,
        constraint = judge_assignment.judge == judge.key() @ TaskError::NotEligibleForFee,
        constraint = !judge_assignment.has_claimed_fee @ TaskError::AlreadyClaimed
    )]
    pub judge_assignment: Box<Account<'info, TaskJudgeAssignment>>,

    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.mint == task.token_mint @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.owner == task.key() @ TaskError::InvalidTokenAccount
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = judge_token_account.owner == judge.key() @ TaskError::UnauthorizedWorker,
        constraint = judge_token_account.mint == task.token_mint @ TaskError::InvalidTokenAccount
    )]
    pub judge_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimJudgeFee>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let assignment = &mut ctx.accounts.judge_assignment;

    require!(
        task.total_judge_fee_reserved > 0 && task.fee_per_judge > 0,
        TaskError::NotEligibleForFee
    );
    require!(
        assignment.fee_amount == task.fee_per_judge && assignment.fee_amount > 0,
        TaskError::NotEligibleForFee
    );

    let voted_correctly = (task.status == TaskStatus::Completed && assignment.vote_is_pass)
        || (task.status == TaskStatus::Failed && !assignment.vote_is_pass);
    require!(voted_correctly, TaskError::NotEligibleForFee);
    require!(
        assignment.has_voted && assignment.voted_at <= task.voting_deadline,
        TaskError::NotEligibleForFee
    );

    let next_claimed = task
        .judge_fee_claimed
        .checked_add(assignment.fee_amount)
        .ok_or(TaskError::MathOverflow)?;
    require!(
        next_claimed <= task.total_judge_fee_reserved,
        TaskError::NotEligibleForFee
    );
    require!(
        ctx.accounts.escrow_token_vault.amount >= assignment.fee_amount,
        TaskError::NotEligibleForFee
    );

    assignment.has_claimed_fee = true;
    task.judge_fee_claimed = next_claimed;

    let task_id_bytes = task.id.to_le_bytes();
    let bump = task.bump;
    let seeds = &[b"task", task_id_bytes.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.escrow_token_vault.to_account_info(),
        to: ctx.accounts.judge_token_account.to_account_info(),
        authority: task.to_account_info(),
    };

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        assignment.fee_amount,
    )?;

    Ok(())
}
