use anchor_lang::prelude::*;
use crate::state::judge_pool::{JudgeRecord, JudgeRegistry, JudgeStakeVault, MAX_ACTIVE_JUDGES};
use crate::state::system::SystemConfig;
use crate::errors::TaskError;

#[derive(Accounts)]
pub struct JudgeRegister<'info> {
    #[account(mut)] // Judge account 
    pub judge: Signer<'info>,

    #[account(mut, seeds = [b"system_config"], bump = system_config.bump)]
    pub system_config: Box<Account<'info, SystemConfig>>,

    #[account(mut, seeds = [b"judge_registry"], bump = judge_registry.bump)]
    pub judge_registry: Box<Account<'info, JudgeRegistry>>,

    #[account(//Account để lưu thông tin stake của judge
        init,
        payer = judge,
        space = 8 + JudgeRecord::INIT_SPACE,
        seeds = [b"judge_record", judge.key().as_ref()],
        bump
    )]
    pub judge_record: Box<Account<'info, JudgeRecord>>,

    #[account(//Vault giữ tiền của judge
        mut,
        seeds = [b"judge_stake_vault"],
        bump = judge_stake_vault.bump
    )]
    pub judge_stake_vault: Box<Account<'info, JudgeStakeVault>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JudgeRegister>, stake_amount: u64) -> Result<()> {
    require!(stake_amount > 0, TaskError::InvalidConfiguration);//validate input, số tiền stake phải > 0
    require!(//Giới hạn số lượng judge tối đa có thể đăng ký
        (ctx.accounts.judge_registry.active_count as usize) < MAX_ACTIVE_JUDGES,
        TaskError::JudgeRegistryFull
    );

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.judge.key(),//Nguồn tiền: tài khoản của judge
        &ctx.accounts.judge_stake_vault.key(),//Đích đến: vault giữ stake của judge
        stake_amount,//Số tiền stake
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.judge.to_account_info(),
            ctx.accounts.judge_stake_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let record = &mut ctx.accounts.judge_record;//Lưu thông tin stake của judge vào JudgeRecord
    record.judge = ctx.accounts.judge.key();
    record.amount_staked = stake_amount;
    record.is_active = true;
    record.total_assignment_count = 0;//Đếm số lần judge được assign vào task, dùng để tính toán reward
    record.locked_until = 0;// Thời điểm judge có thể rút stake, ban đầu là 0, khi judge unregister sẽ set lại thời điểm này 
    record.bump = ctx.bumps.judge_record;

    let registry = &mut ctx.accounts.judge_registry;
    let idx = registry.active_count as usize;
    registry.judges[idx] = ctx.accounts.judge.key();
    registry.active_count = registry.active_count.checked_add(1).ok_or(TaskError::MathOverflow)?;

    ctx.accounts.system_config.total_active_judges = ctx.accounts.system_config.total_active_judges
        .checked_add(1)
        .ok_or(TaskError::MathOverflow)?;

    Ok(())
}
