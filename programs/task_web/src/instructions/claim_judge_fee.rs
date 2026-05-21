use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::task::{Task, TaskStatus, TaskJudgeAssignment};
use crate::errors::TaskError;

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
        constraint = judge_assignment.has_voted == true @ TaskError::NotEligibleForFee,
        constraint = !judge_assignment.has_claimed_fee @ TaskError::AlreadyClaimed
    )]
    pub judge_assignment: Box<Account<'info, TaskJudgeAssignment>>,

    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = judge_token_account.owner == judge.key()
    )]
    pub judge_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimJudgeFee>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let assignment = &mut ctx.accounts.judge_assignment;

    require!(task.fee_per_judge > 0, TaskError::NotEligibleForFee);

    let voted_correctly = (task.status == TaskStatus::Completed && assignment.vote_is_pass) ||
                          (task.status == TaskStatus::Failed && !assignment.vote_is_pass);
    require!(voted_correctly, TaskError::NotEligibleForFee);

    let next_claimed = task.judge_fee_claimed
        .checked_add(task.fee_per_judge)
        .ok_or(TaskError::MathOverflow)?;
    require!(next_claimed <= task.total_judge_fee_reserved, TaskError::NotEligibleForFee);
    require!(ctx.accounts.escrow_token_vault.amount >= task.fee_per_judge, TaskError::NotEligibleForFee);

    assignment.has_claimed_fee = true;
    assignment.fee_amount = task.fee_per_judge;
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
        CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer), 
        task.fee_per_judge
    )?;

    Ok(())
}
