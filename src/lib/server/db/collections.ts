import { Db } from "mongodb";
import {
  IndexedJudge,
  IndexedJudgeAssignment,
  IndexedTask,
  IndexedTransaction,
} from "./models";

export function taskCollection(db: Db) {
  return db.collection<IndexedTask>("tasks");
}

export function judgeCollection(db: Db) {
  return db.collection<IndexedJudge>("judges");
}

export function judgeAssignmentCollection(db: Db) {
  return db.collection<IndexedJudgeAssignment>("judge_assignments");
}

export function transactionCollection(db: Db) {
  return db.collection<IndexedTransaction>("transactions");
}
