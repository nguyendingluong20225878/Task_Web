use crate::errors::TaskError;
use crate::state::judge_pool::JudgeRecord;
use crate::state::task::{Task, TaskJudgeAssignment, TaskStatus};
use anchor_lang::prelude::*;
//Ghi nhận kết quả
#[derive(Accounts)]
pub struct JudgeVote<'info> {
    #[account(mut)]
    pub judge: Signer<'info>,
    //Judge thực hiện vote, phải là signer để đảm bảo chỉ owner của tài khoản judge mới có thể vote
    #[account(
        mut,
        seeds = [b"task", task.id.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.status == TaskStatus::Resolving @ TaskError::InvalidStatus
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        mut,
        seeds = [b"judge_record", judge.key().as_ref()],
        bump = judge_record.bump,
        constraint = judge_record.judge == judge.key() @ TaskError::NotAssignedJudge
    )]
    pub judge_record: Box<Account<'info, JudgeRecord>>, //Account lưu thông tin stake của judge

    #[account(
        mut,
        seeds = [b"task_judge", task.id.to_le_bytes().as_ref(), judge.key().as_ref()],
        bump = judge_assignment.bump,
        constraint = judge_assignment.task == task.key() @ TaskError::NotAssignedJudge,
        constraint = judge_assignment.task_id == task.id @ TaskError::NotAssignedJudge,
        constraint = judge_assignment.judge == judge.key() @ TaskError::NotAssignedJudge,
        constraint = !judge_assignment.has_voted @ TaskError::AlreadyVoted
    )]
    pub judge_assignment: Box<Account<'info, TaskJudgeAssignment>>,
}

pub fn handler(ctx: Context<JudgeVote>, is_pass: bool) -> Result<()> {
    let task = &mut ctx.accounts.task;
    let judge_key = ctx.accounts.judge.key();

    let order = ctx.accounts.judge_assignment.assigned_order as usize;
    require!(
        order < task.assigned_judge_count as usize,
        TaskError::NotAssignedJudge
    );
    require!(
        task.assigned_judges[order] == judge_key,
        TaskError::NotAssignedJudge
    );

    let current_time = Clock::get()?.unix_timestamp;
    require!(
        current_time <= task.voting_deadline,
        TaskError::DeadlinePassed
    );

    let assignment = &mut ctx.accounts.judge_assignment;
    assignment.has_voted = true; //đã vote chưa
    assignment.vote_is_pass = is_pass; //vote gì
    assignment.voted_at = current_time; //time

    if is_pass {
        task.pass_vote_count = task
            .pass_vote_count
            .checked_add(1)
            .ok_or(TaskError::MathOverflow)?;
    } else {
        task.fail_vote_count = task
            .fail_vote_count
            .checked_add(1)
            .ok_or(TaskError::MathOverflow)?;
    }

    Ok(())
}
