import type { RequestorTask } from "@/lib/requestor/types";

function storageKey(walletAddress: string) {
  return `requestor.drafts.v1:${walletAddress.trim().toLowerCase()}`;
}

/** Local storage is only for unpublished drafts owned by the connected wallet. */
export function getRequestorDrafts(walletAddress?: string) {
  if (typeof window === "undefined" || !walletAddress?.trim()) return [];

  try {
    const value = window.localStorage.getItem(storageKey(walletAddress));
    const drafts = value ? (JSON.parse(value) as RequestorTask[]) : [];
    return drafts.filter((task) => task.status === "Draft");
  } catch {
    return [];
  }
}

export function saveRequestorDraft(task: RequestorTask, walletAddress?: string) {
  if (typeof window === "undefined" || !walletAddress?.trim()) return;
  if (task.status !== "Draft") return;

  const drafts = getRequestorDrafts(walletAddress);
  window.localStorage.setItem(
    storageKey(walletAddress),
    JSON.stringify([task, ...drafts.filter((item) => item.id !== task.id)])
  );
}

export function removeRequestorDraft(taskId: string, walletAddress?: string) {
  if (typeof window === "undefined" || !walletAddress?.trim()) return;
  const drafts = getRequestorDrafts(walletAddress).filter((task) => task.id !== taskId);
  window.localStorage.setItem(storageKey(walletAddress), JSON.stringify(drafts));
}
