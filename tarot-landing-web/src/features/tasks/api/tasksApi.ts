import axiosClient from "@/lib/axiosClient";
import type { Claim, ClaimStatus, Task, TaskFormData } from "../types/task.types";

// All endpoints are admin-only and enforced server-side (MANAGE_TASKS).
// The browser never computes rewards — approval credits from the task record.
export const tasksApi = {
  // ── Task Manager ───────────────────────────────────────────────────────────
  listTasks: async (): Promise<Task[]> => {
    const res = await axiosClient.get("/admin/tasks");
    return res.data;
  },

  createTask: async (data: TaskFormData): Promise<Task> => {
    const res = await axiosClient.post("/admin/tasks", data);
    return res.data;
  },

  updateTask: async (id: number, data: Partial<TaskFormData>): Promise<Task> => {
    const res = await axiosClient.put(`/admin/tasks/${id}`, data);
    return res.data;
  },

  duplicateTask: async (id: number): Promise<Task> => {
    const res = await axiosClient.post(`/admin/tasks/${id}/duplicate`);
    return res.data;
  },

  deleteTask: async (id: number): Promise<void> => {
    await axiosClient.delete(`/admin/tasks/${id}`);
  },

  // ── Claims Queue ───────────────────────────────────────────────────────────
  listClaims: async (status: ClaimStatus = "PENDING"): Promise<Claim[]> => {
    const res = await axiosClient.get("/admin/claims", { params: { status } });
    return res.data;
  },

  approveClaim: async (id: number): Promise<Claim> => {
    const res = await axiosClient.post(`/admin/claims/${id}/approve`);
    return res.data;
  },

  rejectClaim: async (id: number, reason?: string): Promise<Claim> => {
    const res = await axiosClient.post(`/admin/claims/${id}/reject`, { reason });
    return res.data;
  },

  bulkApprove: async (
    claimIds: number[]
  ): Promise<{ approved: number[]; skipped: { claim_id: number; reason: string }[] }> => {
    const res = await axiosClient.post("/admin/claims/bulk-approve", {
      claim_ids: claimIds,
    });
    return res.data;
  },
};
