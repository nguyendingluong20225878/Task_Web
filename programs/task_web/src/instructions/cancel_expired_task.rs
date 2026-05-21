use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use mpl_core::instructions::TransferV1CpiBuilder;
use crate::state::task::{Task, TaskStatus};
use crate::state::escrow::WorkerEscrow;
use crate::errors::TaskError;

#[derive(Accounts)]
pub struct CancelExpiredTask<'info> {
    #[account(mut)]
    pub requestor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.requestor == requestor.key() @ TaskError::UnauthorizedWorker,
        constraint = task.status == TaskStatus::InProgress @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(//worker escrow PDA, dùng để đánh dấu worker đã bị slash và rút tiền từ escrow nếu task bị hủy)
        mut,
        seeds = [b"escrow", task.id.to_le_bytes().as_ref(), task.worker.as_ref()],
        bump = worker_escrow.bump
    )]
    pub worker_escrow: Box<Account<'info, WorkerEscrow>>,

    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault
        //Đảm bảo account vault được cung cấp là đúng vault của task, tránh việc rút tiền từ vault khác
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = requestor_token_account.owner == task.requestor 
        //Đảm bảo account token của requestor là đúng, tránh việc rút tiền từ account khác
    )]
    
    pub requestor_token_account: Box<Account<'info, TokenAccount>>, 
    
    #[account(
        mut,
        constraint = nft_asset.key() == task.nft_asset 
        //Đảm bảo asset NFT được cung cấp là đúng, tránh việc chuyển ownership từ asset khác
        //asset => NFT đại diện cho quyền sở hữu task, khi task bị hủy sẽ trả lại quyền sở hữu này cho requestor
    )]
    /// CHECK: The Metaplex Core Asset account
    pub nft_asset: AccountInfo<'info>,

    /// CHECK: Metaplex Core Program
    #[account(address = mpl_core::ID)]
    pub core_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelExpiredTask>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let current_time = Clock::get()?.unix_timestamp;//Lấy thời gian hiện tại để so sánh với submission deadline của task, chỉ cho phép hủy task nếu đã quá deadline nộp bài

    require!(current_time > task.submission_deadline, TaskError::TaskNotExpired);

    let task_id_bytes = task.id.to_le_bytes();
    let bump = task.bump;
    let seeds = &[b"task", task_id_bytes.as_ref(), &[bump]];
    let signer = &[&seeds[..]];
    // &[&seeds[..]]: tạo slice chứa seeds để làm signer khi gọi CPI, seeds là dữ liệu dùng để tìm PDA, khi gọi CPI có signer là PDA sẽ có quyền thực hiện hành động như transfer token từ vault của task

    let cpi_refund = Transfer {
        from: ctx.accounts.escrow_token_vault.to_account_info(),
        to: ctx.accounts.requestor_token_account.to_account_info(),
        authority: task.to_account_info(),
    };
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_refund, signer), task.bounty_amount)?;
    // gọi CPI transfer token để trả lại tiền cho requestor, có signer là PDA của task để có quyền rút tiền từ vault

    TransferV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.nft_asset)
        .authority(Some(&task.to_account_info()))
        .new_owner(&ctx.accounts.requestor.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer)?;

    ctx.accounts.worker_escrow.is_slashed = true;
    ctx.accounts.worker_escrow.is_released = true;
    ctx.accounts.worker_escrow.close(ctx.accounts.requestor.to_account_info())?;

    task.status = TaskStatus::Cancelled;

    Ok(())
}
