use anchor_lang::prelude::*;
use crate::state::system::{RandomnessMode, SystemConfig};
use crate::state::judge_pool::{JudgeRegistry, JudgeStakeVault, MAX_ACTIVE_JUDGES};
use crate::errors::TaskError;

#[derive(Accounts)]//Định nghĩa tất cả account cần cho instruction
pub struct AdminInitProtocol<'info> {
    #[account(
        mut,//có thể bị thay đổi (SOL balance do trả phí init)
        address = pubkey!("Admin11111111111111111111111111111111111111") @ TaskError::UnauthorizedAdmin
        //Signer bắt buộc kí tx
    )]
    pub admin: Signer<'info>,

    #[account( //PDA (system config)
        init,
        payer = admin,
        space = 8 + SystemConfig::INIT_SPACE, //8 bytes cho discriminator + space cho SystemConfig
        //Discriminator = “type tag” 8 bytes đầu của account để phân biệt account này lưu data kiểu gì, giúp Anchor tự động deserialize đúng struct khi load account
        seeds = [b"system_config"],
        //PDA = hash("system_config" + program_id + bump)
        bump
    )]
    pub system_config: Box<Account<'info, SystemConfig>>, //Box<Account> để tiết kiệm RAM khi account có kích thước lớn, chỉ load khi cần thiết

    #[account(//Danh sách judge
        init,
        payer = admin,
        space = 8 + JudgeRegistry::INIT_SPACE,
        seeds = [b"judge_registry"],
        bump
    )]
    pub judge_registry: Box<Account<'info, JudgeRegistry>>,

    #[account(//Vault để giữ stake của judge
        init,
        payer = admin,
        space = 8 + JudgeStakeVault::INIT_SPACE,
        seeds = [b"judge_stake_vault"],
        bump
    )]
    pub judge_stake_vault: Box<Account<'info, JudgeStakeVault>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AdminInitProtocol>, judge_fee_bps: u16) -> Result<()> {
    // ctx : context chứa toàn bộ accounts
    require!(judge_fee_bps <= 10_000, TaskError::InvalidConfiguration);//validate input, không cho fee > 100%, 10.000 bps = 100%
    
    //setup system config
    let config = &mut ctx.accounts.system_config;
    config.admin = ctx.accounts.admin.key();
    config.judge_fee_bps = judge_fee_bps;
    config.max_judges_per_task = crate::state::task::MAX_JUDGES as u16;//Giới hạn số lượng judge tối đa có thể assign cho 1 task
    config.total_active_judges = 0;//Ban đầu chưa có judge nào đăng ký
    config.randomness_mode = RandomnessMode::BlockhashMvp;
    config.bump = ctx.bumps.system_config;//lưu bump để verify PDA 

    //setup judge registry
    let registry = &mut ctx.accounts.judge_registry;
    registry.judges = [Pubkey::default(); MAX_ACTIVE_JUDGES];//toàn bộ là 0x000..., chưa có judge nào
    registry.active_count = 0;
    registry.bump = ctx.bumps.judge_registry;

    ctx.accounts.judge_stake_vault.bump = ctx.bumps.judge_stake_vault;
    Ok(())
}
