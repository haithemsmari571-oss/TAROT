import axiosClient from "@/lib/axiosClient";
import type { ConstellationData, PullResult } from "../types/constellation.types";

export const constellationApi = {
  get: async (): Promise<ConstellationData> => {
    const res = await axiosClient.get("/constellation");
    return res.data;
  },

  // Reveal today's card — server rolls + credits the reward. Once per day.
  pull: async (): Promise<PullResult> => {
    const res = await axiosClient.post("/constellation/pull");
    return res.data;
  },

  // Pending reward celebrations (approved claims + gifts). Non-destructive —
  // the global host acknowledges each once shown. Polled from anywhere.
  getCelebrations: async (): Promise<{
    celebrations: {
      id: number;
      kind: "pull" | "streak" | "claim" | "gift";
      title: string;
      amount: number;
      message?: string;
    }[];
  }> => {
    const res = await axiosClient.get("/constellation/celebrations");
    return res.data;
  },

  // Mark celebrations (by notification id) as seen so they never re-fire.
  ackCelebrations: async (ids: number[]): Promise<void> => {
    if (ids.length) await axiosClient.post("/constellation/celebrations/ack", { ids });
  },

  // Quiet fallback for a rare legacy account with no DOB.
  setBirthdate: async (dateISO: string): Promise<void> => {
    await axiosClient.post("/constellation/birthdate", { date_of_birth: dateISO });
  },

  // Submit a manual ritual: up to 4 compressed images + an optional message, or
  // a social handle.
  submitClaim: async (
    taskId: number,
    opts: { files?: File[]; message?: string; handle?: string }
  ): Promise<{ id: number; status: string; message: string }> => {
    const form = new FormData();
    (opts.files || []).forEach((f) => form.append("screenshots", f));
    if (opts.message) form.append("message", opts.message);
    if (opts.handle) form.append("handle", opts.handle);
    const res = await axiosClient.post(
      `/constellation/rituals/${taskId}/claim`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return res.data;
  },
};
