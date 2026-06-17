use crate::errors::TaskError;
use crate::state::task::{Task, TaskStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use mpl_core::instructions::TransferV1CpiBuilder;

#[derive(Accounts)]
pub struct CancelOpenTask<'info> {
    #[account(mut)]
    pub requestor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.requestor == requestor.key() @ TaskError::UnauthorizedWorker,
        //Chỉ cho phép requestor hủy task (constraint: validate điều kiện, nếu sai sẽ trả lỗi UnauthorizedWorker)
        constraint = task.status == TaskStatus::Open @ TaskError::InvalidStatus
        //Chỉ cho phép hủy task đang ở trạng thái Open, nếu task đã có worker hoặc đang trong quá trình giải quyết sẽ không được hủy nữa
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.mint == task.token_mint @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.owner == task.key() @ TaskError::InvalidTokenAccount
        //Đảm bảo account vault được cung cấp là đúng vault của task, tránh việc rút tiền từ vault khác
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = requestor_token_account.owner == task.requestor @ TaskError::UnauthorizedWorker,
        constraint = requestor_token_account.mint == task.token_mint @ TaskError::InvalidTokenAccount
        //Đảm bảo account token của requestor là đúng, tránh việc rút tiền từ account khác
    )]
    pub requestor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = nft_asset.key() == task.nft_asset
        //Đảm bảo asset NFT được cung cấp là đúng, tránh việc chuyển ownership từ asset khác
    )]
    /// CHECK: The Metaplex Core Asset account
    pub nft_asset: AccountInfo<'info>,

    /// CHECK: Metaplex Core Program
    #[account(address = mpl_core::ID)]
    pub core_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelOpenTask>) -> Result<()> {
    let task = &mut ctx.accounts.task;

    require!(task.worker == Pubkey::default(), TaskError::InvalidStatus);
    require!(task.pass_vote_count == 0, TaskError::InvalidStatus);
    require!(task.fail_vote_count == 0, TaskError::InvalidStatus);
    require!(task.assigned_judge_count == 0, TaskError::InvalidStatus);
    require!(task.total_judge_fee_reserved == 0, TaskError::InvalidStatus);
    require!(task.fee_per_judge == 0, TaskError::InvalidStatus);
    require!(task.judge_fee_claimed == 0, TaskError::InvalidStatus);
    require!(
        ctx.accounts.escrow_token_vault.amount >= task.bounty_amount,
        TaskError::InvalidEscrowBalance
    );

    let task_id_bytes = task.id.to_le_bytes(); //chuyển id -> bytes để làm seed cho signer khi gọi CPI transfer token và transfer NFT
    let bump = task.bump;
    let seeds = &[b"task", task_id_bytes.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    let cpi_refund = Transfer {
        //gọi CPI transfer token để trả lại tiền cho requestor
        from: ctx.accounts.escrow_token_vault.to_account_info(),
        to: ctx.accounts.requestor_token_account.to_account_info(),
        authority: task.to_account_info(), //PDA là authority để có quyền rút tiền từ vault
    };
    let refund_amount = ctx.accounts.escrow_token_vault.amount;
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_refund,
            signer,
        ),
        refund_amount,
    )?;
    //Gọi CPI transfer NFT để trả lại quyền sở hữu NFT cho requestor

    TransferV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.nft_asset) //
        .authority(Some(&task.to_account_info()))
        .new_owner(&ctx.accounts.requestor.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer)?; //Gọi CPI nhưng có ký bằng PDA,
                                 // gọi hàm của chương trình khác, invoke_signed: gọi hàm của chương trình khác nhưng có kèm signer là PDA để có quyền thực hiện hành động (vd: transfer token từ vault)

    task.status = TaskStatus::Cancelled;

    Ok(())
}
