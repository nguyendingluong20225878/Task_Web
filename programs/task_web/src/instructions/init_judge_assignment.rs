use anchor_lang::prelude::*;
use crate::errors::TaskError;
use crate::state::task::{Task, TaskJudgeAssignment, TaskStatus};

#[derive(Accounts)]
pub struct InitJudgeAssignment<'info> {//acc cho 1 judge thực tiện 1 task
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Assigned judge key used as PDA seed. The handler validates it exists in task.assigned_judges.
    pub judge: AccountInfo<'info>,

    #[account(
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.status == TaskStatus::Resolving @ TaskError::InvalidStatus
        //Chỉ cho phép khởi tạo judge assignment khi task đang ở trạng thái Resolving : đã hết hạn giải quyết và đang chờ kết quả vote từ judges
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        init,
        payer = payer,
        space = 8 + TaskJudgeAssignment::INIT_SPACE,
        seeds = [b"task_judge", task.id.to_le_bytes().as_ref(), judge.key().as_ref()],
        bump
    )]
    pub judge_assignment: Box<Account<'info, TaskJudgeAssignment>>,
    //acc lưu thông tin 1 judge được assign vào task nào, thứ tự bao nhiêu, đã vote chưa, đã claim fee chưa,....

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitJudgeAssignment>) -> Result<()> {
    let task = &ctx.accounts.task;
    let judge_key = ctx.accounts.judge.key();
    let assigned_order = task.assigned_judges//Tìm vị trí của judge trong danh sách assigned_judges của task để biết được thứ tự được assign vào task này
        .iter()
        .position(|key| *key == judge_key)
        .ok_or(TaskError::NotAssignedJudge)? as u16;

    let assignment = &mut ctx.accounts.judge_assignment;
    assignment.task_id = task.id;
    assignment.task = task.key();
    assignment.judge = judge_key;
    assignment.assigned_order = assigned_order;//Thứ tự được assign sẽ quyết định phần thưởng của judge khi task được giải quyết
    assignment.assigned_at = Clock::get()?.unix_timestamp;//Thời điểm được assign, dùng để tính thời gian vote và claim fee
    assignment.has_voted = false;//Ban đầu chưa vote
    assignment.vote_is_pass = false;//Ban đầu chưa vote nên không biết vote là pass hay fail
    assignment.voted_at = 0;//Thời điểm vote, ban đầu là 0, khi judge vote sẽ set lại thời điểm này
    assignment.has_claimed_fee = false;//Ban đầu chưa claim fee,claim fee: hành động nhận phần thưởng sau khi task được giải quyết
    assignment.fee_amount = 0;
    assignment.bump = ctx.bumps.judge_assignment;//lưu bump để verify PDA khi claim fee

    Ok(())
}
