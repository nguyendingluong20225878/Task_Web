import {
  mapIndexedTaskToWorkerTask,
  type IndexedWorkerTask,
  type WorkerTask,
} from "@/lib/worker/types";

type WorkerTasksMode = "open" | "active";

type WorkerTasksSuccessResponse = {
  ok: true;
  mode?: WorkerTasksMode;
  tasks?: unknown;
};

type WorkerTasksErrorResponse = {
  ok: false;
  message?: string;
  error?: { message?: string };
};

type WorkerTasksResponse =
  | WorkerTasksSuccessResponse
  | WorkerTasksErrorResponse;

function buildWorkerTasksUrl(
  mode: WorkerTasksMode,
  params: { worker?: string; limit?: number } = {}
) {
  const searchParams = new URLSearchParams({ mode });

  if (params.worker) {
    searchParams.set("worker", params.worker);
  }

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }

  return `/api/worker/tasks?${searchParams.toString()}`;
}

function getWorkerTasksErrorMessage(
  mode: WorkerTasksMode,
  data: WorkerTasksResponse | null
) {
  if (data && !data.ok) {
    return (
      data.message ??
      data.error?.message ??
      "Không tải được Worker tasks từ API."
    );
  }

  return mode === "open"
    ? "Không tải được danh sách Worker tasks đang mở."
    : "Không tải được danh sách Worker tasks đang active.";
}

async function fetchWorkerTasks(
  mode: WorkerTasksMode,
  params: { worker?: string; limit?: number } = {}
): Promise<WorkerTask[]> {
  const response = await fetch(buildWorkerTasksUrl(mode, params));
  const data = (await response.json().catch(() => null)) as
    | WorkerTasksResponse
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(getWorkerTasksErrorMessage(mode, data));
  }

  if (!Array.isArray(data.tasks)) return [];

  return data.tasks.map((task) =>
    mapIndexedTaskToWorkerTask(task as IndexedWorkerTask)
  );
}

export function fetchOpenWorkerTasks(limit?: number): Promise<WorkerTask[]> {
  return fetchWorkerTasks("open", { limit });
}

export function fetchActiveWorkerTasks(
  workerWallet: string,
  limit?: number
): Promise<WorkerTask[]> {
  return fetchWorkerTasks("active", {
    worker: workerWallet.trim(),
    limit,
  });
}
