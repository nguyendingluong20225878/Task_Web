use crate::errors::TaskError;
use crate::state::escrow::WorkerEscrow;
use crate::state::task::{Task, TaskJudgeAssignment, TaskStatus, MAX_JUDGES};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use mpl_core::instructions::TransferV1CpiBuilder;

#[derive(Accounts)]
pub struct SettlePayment<'info> {
    //các Acc mà ix cần
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
        bump = worker_escrow.bump,
        constraint = worker_escrow.task == task.key() @ TaskError::InvalidConfiguration,
        constraint = worker_escrow.task_id == task.id @ TaskError::InvalidConfiguration,
        constraint = worker_escrow.worker == task.worker @ TaskError::UnauthorizedWorker,
        constraint = worker_escrow.amount_staked == task.worker_stake_amount @ TaskError::InvalidStakeAmount,
        constraint = !worker_escrow.is_released @ TaskError::InvalidStatus
    )]
    pub worker_escrow: Box<Account<'info, WorkerEscrow>>,
    //worker_escrow: PDA- metaData-quản lí trạng thai stake
    #[account(
        mut,
        constraint = escrow_token_vault.key() == task.escrow_token_vault @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.mint == task.token_mint @ TaskError::InvalidTokenAccount,
        constraint = escrow_token_vault.owner == task.key() @ TaskError::InvalidTokenAccount
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,
    //escrow_token_vault: SPL token- token thật - giữ tiền của task,
    // khi task được approve sẽ chuyển tiền từ vault này đến account của worker, nếu task bị reject sẽ chuyển tiền từ vault này về account của requestor
    #[account(
        mut,
        constraint = worker_token_account.owner == task.worker @ TaskError::UnauthorizedWorker,
        constraint = worker_token_account.mint == task.token_mint @ TaskError::InvalidTokenAccount
    )]
    pub worker_token_account: Box<Account<'info, TokenAccount>>, //Nhận thưởng nếu task pass

    #[account(
        mut,
        constraint = requestor_token_account.owner == task.requestor @ TaskError::UnauthorizedWorker,
        constraint = requestor_token_account.mint == task.token_mint @ TaskError::InvalidTokenAccount
    )]
    pub requestor_token_account: Box<Account<'info, TokenAccount>>, //Nhận lại bounty nếu task false

    #[account(mut, constraint = nft_asset.key() == task.nft_asset)]
    /// CHECK: The Metaplex Core Asset account
    pub nft_asset: AccountInfo<'info>, //TK nft liên quan đến task

    #[account(
        mut,
        constraint = worker_system_account.key() == task.worker @ TaskError::UnauthorizedWorker
    )]
    /// CHECK: Worker's system account to receive back SOL if approved
    pub worker_system_account: AccountInfo<'info>,
    //Tài khoản hệ thống của worker, nhận SOL nếu task thành công.
    /// CHECK: Metaplex Core Program
    #[account(address = mpl_core::ID)]
    pub core_program: AccountInfo<'info>, //Đchi Mêtaplex Core Program để gọi CPI transfer NFT

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettlePayment>) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let current_time = Clock::get()?.unix_timestamp;

    let is_approved = task.pass_vote_count >= task.approval_threshold_n; //duyệt hay k
    let max_allowed_fail_votes = task
        .required_judges_m
        .checked_sub(task.approval_threshold_n)
        .ok_or(TaskError::MathOverflow)?; //Số phiếu fail tối đa để task vẫn có thể được duyệt
    let definitely_failed = task.fail_vote_count > max_allowed_fail_votes;
    let is_inconclusive = current_time > task.voting_deadline && !is_approved && !definitely_failed;

    require!(
        is_approved || definitely_failed || is_inconclusive,
        TaskError::VotingNotComplete
    );
    require!(
        task.required_judges_m >= 1
            && task.required_judges_m as usize <= MAX_JUDGES
            && task.approval_threshold_n >= 1
            && task.approval_threshold_n <= task.required_judges_m
            && task.assigned_judge_count == task.required_judges_m
            && ctx.remaining_accounts.len() == task.required_judges_m as usize,
        TaskError::AssignmentSetIncomplete
    );
    require!(
        ctx.accounts.escrow_token_vault.amount >= task.bounty_amount,
        TaskError::InvalidEscrowBalance
    );

    let task_id_bytes = task.id.to_le_bytes();
    let bump = task.bump;
    let seeds = &[b"task", task_id_bytes.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    let total_bounty = task.bounty_amount;
    let task_key = task.key();
    let mut seen_assignments = [false; MAX_JUDGES];
    let mut eligible_judge_count = 0u16;

    for account_info in ctx.remaining_accounts.iter() {
        require!(account_info.is_writable, TaskError::AssignmentSetIncomplete);
        require!(
            account_info.owner == ctx.program_id,
            TaskError::AssignmentSetIncomplete
        );

        let data = account_info.try_borrow_mut_data()?;
        let mut data_ref: &[u8] = &data;
        let assignment = TaskJudgeAssignment::try_deserialize(&mut data_ref)
            .map_err(|_| TaskError::AssignmentSetIncomplete)?;

        let expected_pda = Pubkey::find_program_address(
            &[
                b"task_judge",
                task_id_bytes.as_ref(),
                assignment.judge.as_ref(),
            ],
            ctx.program_id,
        )
        .0;
        require!(
            expected_pda == account_info.key(),
            TaskError::AssignmentSetIncomplete
        );
        require!(
            assignment.task == task_key && assignment.task_id == task.id,
            TaskError::AssignmentSetIncomplete
        );

        let order = assignment.assigned_order as usize;
        require!(
            order < task.required_judges_m as usize,
            TaskError::AssignmentSetIncomplete
        );
        require!(!seen_assignments[order], TaskError::AssignmentSetIncomplete);
        require!(
            task.assigned_judges[order] == assignment.judge
                && assignment.judge != Pubkey::default(),
            TaskError::AssignmentSetIncomplete
        );
        seen_assignments[order] = true;

        let is_eligible = if is_approved {
            assignment.has_voted
                && assignment.voted_at <= task.voting_deadline
                && assignment.vote_is_pass
        } else if definitely_failed {
            assignment.has_voted
                && assignment.voted_at <= task.voting_deadline
                && !assignment.vote_is_pass
        } else {
            false
        };

        if is_eligible {
            eligible_judge_count = eligible_judge_count
                .checked_add(1)
                .ok_or(TaskError::MathOverflow)?;
        }
    }

    require!(
        seen_assignments
            .iter()
            .take(task.required_judges_m as usize)
            .all(|seen| *seen),
        TaskError::AssignmentSetIncomplete
    );
    if is_approved {
        require!(
            eligible_judge_count >= task.approval_threshold_n,
            TaskError::SettlementNotDecisive
        );
    }
    if definitely_failed {
        require!(
            eligible_judge_count > max_allowed_fail_votes,
            TaskError::SettlementNotDecisive
        );
    }

    let winning_votes = eligible_judge_count as u64;
    let vault_balance = ctx.accounts.escrow_token_vault.amount;

    let mut total_fee_to_distribute = 0u64;
    if winning_votes > 0 {
        //số judge vote đúng
        let max_judge_fee = total_bounty
            .checked_mul(task.judge_fee_bps as u64)
            .ok_or(TaskError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(TaskError::MathOverflow)?;
        task.fee_per_judge = max_judge_fee / winning_votes;
        total_fee_to_distribute = task
            .fee_per_judge
            .checked_mul(winning_votes)
            .ok_or(TaskError::MathOverflow)?;
    } else {
        task.fee_per_judge = 0;
    }

    task.settled_judge_winner_count = winning_votes as u16;
    task.total_judge_fee_reserved = total_fee_to_distribute;
    task.judge_fee_claimed = 0;
    require!(
        total_fee_to_distribute <= total_bounty,
        TaskError::MathOverflow
    );
    require!(
        vault_balance >= total_fee_to_distribute,
        TaskError::InvalidEscrowBalance
    );

    for account_info in ctx.remaining_accounts.iter() {
        let mut data = account_info.try_borrow_mut_data()?;
        let mut data_ref: &[u8] = &data;
        let mut assignment = TaskJudgeAssignment::try_deserialize(&mut data_ref)
            .map_err(|_| TaskError::AssignmentSetIncomplete)?;

        let is_eligible = if is_approved {
            assignment.has_voted
                && assignment.voted_at <= task.voting_deadline
                && assignment.vote_is_pass
        } else if definitely_failed {
            assignment.has_voted
                && assignment.voted_at <= task.voting_deadline
                && !assignment.vote_is_pass
        } else {
            false
        };

        assignment.fee_amount = if is_eligible { task.fee_per_judge } else { 0 };
        assignment.has_claimed_fee = false;

        let mut data_ref: &mut [u8] = &mut data;
        assignment.try_serialize(&mut data_ref)?;
    }

    let payout_amount = vault_balance
        .checked_sub(total_fee_to_distribute)
        .ok_or(TaskError::MathOverflow)?;

    if is_approved {
        let cpi_worker = Transfer {
            from: ctx.accounts.escrow_token_vault.to_account_info(),
            to: ctx.accounts.worker_token_account.to_account_info(),
            authority: task.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_worker,
                signer,
            ),
            payout_amount,
        )?;
        task.status = TaskStatus::Completed;
    } else if definitely_failed {
        let cpi_refund = Transfer {
            from: ctx.accounts.escrow_token_vault.to_account_info(),
            to: ctx.accounts.requestor_token_account.to_account_info(),
            authority: task.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_refund,
                signer,
            ),
            payout_amount,
        )?;
        task.status = TaskStatus::Failed;
    } else {
        let cpi_refund = Transfer {
            from: ctx.accounts.escrow_token_vault.to_account_info(),
            to: ctx.accounts.requestor_token_account.to_account_info(),
            authority: task.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_refund,
                signer,
            ),
            payout_amount,
        )?;
        task.status = TaskStatus::Inconclusive;
    }

    TransferV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.nft_asset)
        .authority(Some(&task.to_account_info()))
        .payer(&ctx.accounts.payer.to_account_info())
        .new_owner(&ctx.accounts.requestor)
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke_signed(signer)?;

    let dest_account_info = if is_approved || is_inconclusive {
        ctx.accounts.worker_system_account.to_account_info()
    } else {
        ctx.accounts.requestor.to_account_info()
    };
    ctx.accounts.worker_escrow.is_slashed = definitely_failed;
    ctx.accounts.worker_escrow.is_released = true;
    ctx.accounts.worker_escrow.close(dest_account_info)?;

    Ok(())
}
