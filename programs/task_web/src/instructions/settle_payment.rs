use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use mpl_core::instructions::TransferV1CpiBuilder;
use crate::state::task::{Task, TaskStatus};
use crate::state::escrow::WorkerEscrow;
use crate::errors::TaskError;

#[derive(Accounts)]
pub struct SettlePayment<'info> {//các Acc mà ix cần
    #[account(mut)]
    pub payer: Signer<'info>, //người kí

    #[account(
        mut,
        constraint = requestor.key() == task.requestor @ TaskError::UnauthorizedWorker
    )]
    /// CHECK: Requestor is constrained to task.requestor and receives NFT or slashed SOL.
    pub requestor: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.status == TaskStatus::Resolving @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        mut,
        seeds = [b"escrow", task.id.to_le_bytes().as_ref(), task.worker.as_ref()],
        bump = worker_escrow.bump
    )]
    pub worker_escrow: Box<Account<'info, WorkerEscrow>>,
    //worker_escrow: PDA- metaData-quản lí trạng thai stake
    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,
    //escrow_token_vault: SPL token- token thật - giữ tiền của task, 
    // khi task được approve sẽ chuyển tiền từ vault này đến account của worker, nếu task bị reject sẽ chuyển tiền từ vault này về account của requestor
    #[account(
        mut,
        constraint = worker_token_account.owner == task.worker @ TaskError::UnauthorizedWorker
    )]
    pub worker_token_account: Box<Account<'info, TokenAccount>>, //Nhận thưởng nếu task pass

    #[account(
        mut,
        constraint = requestor_token_account.owner == task.requestor 
    )]
    pub requestor_token_account: Box<Account<'info, TokenAccount>>, //Nhận lại bounty nếu task false
    
    #[account(
        mut,
        constraint = nft_asset.key() == task.nft_asset 
    )]
    /// CHECK: The Metaplex Core Asset account
    pub nft_asset: AccountInfo<'info>,//TK nft liên quan đến task

    #[account(
        mut,
        constraint = worker_system_account.key() == task.worker @ TaskError::UnauthorizedWorker
    )]
    /// CHECK: Worker's system account to receive back SOL if approved
    pub worker_system_account: AccountInfo<'info>, 
    //Tài khoản hệ thống của worker, nhận SOL nếu task thành công.

    /// CHECK: Metaplex Core Program
    #[account(address = mpl_core::ID)]
    pub core_program: AccountInfo<'info>,//Đchi Mêtaplex Core Program để gọi CPI transfer NFT

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettlePayment>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let current_time = Clock::get()?.unix_timestamp;
    
    //kiểm tra điêug kiện 
    let votes_cast = task.pass_vote_count
        .checked_add(task.fail_vote_count)
        .ok_or(TaskError::MathOverflow)?;
    require!(votes_cast == task.required_judges_m || current_time > task.voting_deadline, TaskError::VotingNotComplete);
    //Chỉ cho phép settle payment khi đã đủ số phiếu vote cần thiết hoặc đã quá deadline vote

    let is_approved = task.pass_vote_count >= task.approval_threshold_n;//duyệt hay k
    let quorum_met = votes_cast == task.required_judges_m;//đủ số phiếu vote cần thiết chưa
    
    let max_allowed_fail_votes = task.required_judges_m - task.approval_threshold_n;//Số phiếu fail tối đa để task vẫn có thể được duyệt
    let definitely_failed = task.fail_vote_count > max_allowed_fail_votes;

    let task_id_bytes = task.id.to_le_bytes();
    let bump = task.bump;
    let seeds = &[b"task", task_id_bytes.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    let total_bounty = task.bounty_amount;
    let winning_votes = if is_approved {
        task.pass_vote_count
    } else {
        task.fail_vote_count
    } as u64;
    
    let mut total_fee_to_distribute = 0u64;
    if winning_votes > 0 {//số judge vote đúng
        let max_judge_fee = total_bounty
            .checked_mul(task.judge_fee_bps as u64)
            .ok_or(TaskError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(TaskError::MathOverflow)?;
        task.fee_per_judge = max_judge_fee / winning_votes;
        total_fee_to_distribute = task.fee_per_judge
            .checked_mul(winning_votes)
            .ok_or(TaskError::MathOverflow)?;
    } else {
        task.fee_per_judge = 0;
    }

    task.settled_judge_winner_count = winning_votes as u16;
    task.total_judge_fee_reserved = total_fee_to_distribute;
    task.judge_fee_claimed = 0;

    let payout_amount = total_bounty
        .checked_sub(total_fee_to_distribute)
        .ok_or(TaskError::MathOverflow)?;

    if is_approved {
        let cpi_worker = Transfer {
            from: ctx.accounts.escrow_token_vault.to_account_info(),
            to: ctx.accounts.worker_token_account.to_account_info(),
            authority: task.to_account_info(),
        };
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_worker, signer), payout_amount)?;
        task.status = TaskStatus::Completed;
    } else {
        let cpi_refund = Transfer {
            from: ctx.accounts.escrow_token_vault.to_account_info(),
            to: ctx.accounts.requestor_token_account.to_account_info(),
            authority: task.to_account_info(),
        };
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_refund, signer), payout_amount)?;
        task.status = TaskStatus::Failed;
    }

    TransferV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.nft_asset)
        .authority(Some(&task.to_account_info()))
        .new_owner(&ctx.accounts.requestor)
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer)?;

    let dest_account_info = if is_approved || (!quorum_met && !definitely_failed) {
        ctx.accounts.worker_system_account.to_account_info()
    } else {
        ctx.accounts.requestor.to_account_info()
    };
    ctx.accounts.worker_escrow.is_slashed = !(is_approved || (!quorum_met && !definitely_failed));
    ctx.accounts.worker_escrow.is_released = true;
    ctx.accounts.worker_escrow.close(dest_account_info)?;

    Ok(())
}
