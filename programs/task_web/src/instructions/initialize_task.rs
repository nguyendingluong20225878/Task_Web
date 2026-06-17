use crate::errors::TaskError;
use crate::state::system::SystemConfig;
use crate::state::task::{Task, TaskStatus, MAX_JUDGES, MAX_URI_LENGTH};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use mpl_core::instructions::CreateV1CpiBuilder;

#[derive(Accounts)] //validate accounts khi instruction được gọi, anchor sẽ tự động check
#[instruction(id: u64)]
pub struct InitializeTask<'info> {
    #[account(mut)] //creator
    pub creator: Signer<'info>, //creator phải kí

    #[account(seeds = [b"system_config"], bump = system_config.bump)]
    //SystemConfig: đọc config: fex,...
    pub system_config: Box<Account<'info, SystemConfig>>,

    #[account( //task
        init,
        payer = creator,
        space = 8 + Task::INIT_SPACE,
        seeds = [b"task", id.to_le_bytes().as_ref()],
        bump
    )]
    pub task: Box<Account<'info, Task>>,

    pub token_mint: Box<Account<'info, Mint>>,

    #[account(//SPL token vault để giữ bounty của task
        init,
        payer = creator, //creator trả phí tạo account vault
        token::mint = token_mint,
        token::authority = task, //owner = task PDA
        seeds = [b"vault", task.key().as_ref()],
        bump
    )]
    pub escrow_token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key() @ TaskError::InvalidTokenAccount,
        constraint = creator_token_account.mint == token_mint.key() @ TaskError::InvalidTokenAccount
    )] //Nguồn tiền của creator
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    /// CHECK: The Metaplex Core Asset account to be created
    pub nft_asset: Signer<'info>,

    /// CHECK: Metaplex Core Program
    #[account(address = mpl_core::ID)]
    pub core_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    //logic hệ thống
    ctx: Context<InitializeTask>,
    id: u64,
    bounty_amount: u64,
    worker_stake_amount: u64,
    required_judges_m: u16,
    approval_threshold_n: u16,
    deadlines: [i64; 2],
    public_metadata_uri: String,
    encrypted_task_detail_uri: String,
    encrypted_submission_uri: String,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;

    require!(deadlines[0] > current_time, TaskError::InvalidConfiguration);
    require!(
        deadlines[1] >= deadlines[0] + 86400,
        TaskError::InvalidConfiguration
    );

    require!(bounty_amount > 0, TaskError::InvalidConfiguration);
    require!(worker_stake_amount > 0, TaskError::InvalidConfiguration);
    require!(
        public_metadata_uri.len() <= MAX_URI_LENGTH,
        TaskError::InvalidConfiguration
    );
    require!(
        encrypted_task_detail_uri.len() <= MAX_URI_LENGTH,
        TaskError::InvalidConfiguration
    );
    require!(
        encrypted_submission_uri.len() <= MAX_URI_LENGTH,
        TaskError::InvalidConfiguration
    );
    require!(
        encrypted_submission_uri.is_empty(),
        TaskError::InvalidConfiguration
    );
    require!(
        ctx.accounts.system_config.judge_fee_bps <= 10_000,
        TaskError::InvalidConfiguration
    );
    require!(required_judges_m > 0, TaskError::InvalidConfiguration);
    require!(
        required_judges_m <= ctx.accounts.system_config.max_judges_per_task,
        TaskError::InvalidConfiguration
    );
    require!(
        required_judges_m <= MAX_JUDGES as u16,
        TaskError::InvalidConfiguration
    );

    let actual_m = required_judges_m;
    require!(
        approval_threshold_n <= actual_m,
        TaskError::InvalidConfiguration
    );
    require!(approval_threshold_n > 0, TaskError::InvalidConfiguration);
    require!(
        ctx.accounts.system_config.total_active_judges >= actual_m as u32,
        TaskError::NotEnoughJudges
    );

    let cpi_accounts = Transfer {
        from: ctx.accounts.creator_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer(CpiContext::new(cpi_program, cpi_accounts), bounty_amount)?;

    let task = &mut ctx.accounts.task;
    task.requestor = ctx.accounts.creator.key();
    task.worker = Pubkey::default();
    task.id = id;
    task.token_mint = ctx.accounts.token_mint.key();
    task.escrow_token_vault = ctx.accounts.escrow_token_vault.key();
    task.nft_asset = ctx.accounts.nft_asset.key();
    task.bounty_amount = bounty_amount;
    task.judge_fee_bps = ctx.accounts.system_config.judge_fee_bps;
    task.worker_stake_amount = worker_stake_amount;
    task.created_at = current_time;
    task.submission_deadline = deadlines[0];
    task.voting_deadline = deadlines[1];
    task.public_metadata_uri = public_metadata_uri.clone();
    task.encrypted_task_detail_uri = encrypted_task_detail_uri;
    task.encrypted_submission_uri = String::new();
    task.required_judges_m = actual_m;
    task.approval_threshold_n = approval_threshold_n;
    task.pass_vote_count = 0;
    task.fail_vote_count = 0;
    task.assigned_judge_count = 0;
    task.settled_judge_winner_count = 0;
    task.assigned_judges = [Pubkey::default(); MAX_JUDGES];
    task.fee_per_judge = 0;
    task.total_judge_fee_reserved = 0;
    task.judge_fee_claimed = 0;
    task.status = TaskStatus::Open;
    task.bump = ctx.bumps.task;

    let name = format!("Task #{}", id);

    CreateV1CpiBuilder::new(&ctx.accounts.core_program)
        .asset(&ctx.accounts.nft_asset.to_account_info())
        .payer(&ctx.accounts.creator.to_account_info())
        .owner(Some(&task.to_account_info()))
        .name(name)
        .uri(public_metadata_uri)
        .system_program(&ctx.accounts.system_program.to_account_info())
        .invoke()?;

    Ok(())
}
