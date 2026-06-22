import type { TaskStatus } from "@/lib/server/db/models";

const PUBLIC_URI_SCHEMES = ["https://", "http://", "ipfs://", "ar://"];
const ENCRYPTED_URI_SCHEMES = ["enc://", ...PUBLIC_URI_SCHEMES];

export function shortAddress(value?: string, prefix = 4, suffix = 4) {
  if (!value) return "";
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function isProtocolUri(value: string, encrypted = false) {
  const normalized = value.trim().toLowerCase();
  const schemes = encrypted ? ENCRYPTED_URI_SCHEMES : PUBLIC_URI_SCHEMES;
  return Boolean(normalized) && schemes.some((scheme) => normalized.startsWith(scheme));
}

/** Converts a public content URI to a browser-safe destination. */
export function publicUriHref(value?: string) {
  const uri = value?.trim();
  if (!uri || !isProtocolUri(uri)) return undefined;
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

export type DisplayTaskStatus = TaskStatus | "Draft" | "Submitted" | "Judged";

export function displayTaskStatus(status: DisplayTaskStatus) {
  if (status === "Resolving") return "Submitted";
  return status;
}

export function taskStatusLabel(status: DisplayTaskStatus) {
  const labels: Record<DisplayTaskStatus, string> = {
    Draft: "Draft",
    Open: "Open",
    InProgress: "In progress",
    Resolving: "Under review",
    Submitted: "Submitted",
    Judged: "Judged",
    Completed: "Completed",
    Failed: "Failed",
    Cancelled: "Cancelled",
    Inconclusive: "Inconclusive",
  };
  return labels[status];
}
