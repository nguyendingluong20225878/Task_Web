use crate::errors::TaskError;
use crate::state::judge_pool::{JudgeRecord, JudgeRegistry, JudgeStakeVault};
use crate::state::system::SystemConfig;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct JudgeUnregister<'info> {
    #[account(mut)]
    pub judge: Signer<'info>,

    #[account(mut, seeds = [b"system_config"], bump = system_config.bump)]
    pub system_config: Box<Account<'info, SystemConfig>>,

    #[account(mut, seeds = [b"judge_registry"], bump = judge_registry.bump)]
    pub judge_registry: Box<Account<'info, JudgeRegistry>>, //Danh sách judge

    #[account(
        mut,
        seeds = [b"judge_record", judge.key().as_ref()],
        bump = judge_record.bump,
        close = judge 
    )]
    pub judge_record: Box<Account<'info, JudgeRecord>>, //acc lưu thông tin stake của judge

    #[account(
        mut,
        seeds = [b"judge_stake_vault"],
        bump = judge_stake_vault.bump
    )]
    pub judge_stake_vault: Box<Account<'info, JudgeStakeVault>>, //kho chứa stake của judge
}

pub fn handler(ctx: Context<JudgeUnregister>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time > ctx.accounts.judge_record.locked_until,
        TaskError::StakeLocked
    );
    let amount_to_refund = ctx.accounts.judge_record.amount_staked; //tiền stake đc hoàn cho judge
    ctx.accounts.system_config.total_active_judges = ctx
        .accounts
        .system_config
        .total_active_judges
        .checked_sub(1) //giảm tổng số judge đang hoạt động -1
        .ok_or(TaskError::MathOverflow)?;

    //Xóa Judge khỏi JudgeRegistry (bằng cách hoán đổi phần tử cuối mảng lên vị trí bị xóa để tối ưu)

    let registry = &mut ctx.accounts.judge_registry;
    let judge_key = ctx.accounts.judge.key();
    let remove_idx = registry.judges[..registry.active_count as usize]
        .iter() //tìm vị trí của judge trong dsach judge
        .position(|key| *key == judge_key) //nếu không tìm thấy sẽ trả về lỗi NotAssignedJudge
        .ok_or(TaskError::NotAssignedJudge)?;
    let last_idx = registry
        .active_count
        .checked_sub(1)
        .ok_or(TaskError::MathOverflow)? as usize;
    registry.judges[remove_idx] = registry.judges[last_idx];
    registry.judges[last_idx] = Pubkey::default();
    registry.active_count = registry
        .active_count
        .checked_sub(1)
        .ok_or(TaskError::MathOverflow)?;

    **ctx
        .accounts
        .judge_stake_vault
        .to_account_info()
        .try_borrow_mut_lamports()? = ctx
        .accounts
        .judge_stake_vault
        .to_account_info()
        .lamports()
        .checked_sub(amount_to_refund)
        .ok_or(TaskError::MathOverflow)?;
    **ctx.accounts.judge.try_borrow_mut_lamports()? = ctx
        .accounts
        .judge
        .lamports()
        .checked_add(amount_to_refund)
        .ok_or(TaskError::MathOverflow)?;

    Ok(())
}
