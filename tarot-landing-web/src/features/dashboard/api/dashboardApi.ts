import axiosClient from "@/lib/axiosClient";

export interface TopPsychic {
  id: number;
  username: string;
  email: string;
  profile_picture_path: string | null;
  totalEarnings: number;
  totalSessions: number;
  averageRating: number;
}

export interface RecentTransaction {
  id: number;
  userId: number;
  username: string | null;
  transactionType: string;
  amount: number;
  status: string;
  description: string | null;
  createdAt: string;
}

export interface SignupDay {
  date: string;
  count: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalPsychics: number;
  totalAdmins: number;
  totalSuperadmins: number;
  totalRevenue: number;
  totalTransactions: number;
  transactionStatusCounts: Record<string, number>;
  chatStatusCounts: Record<string, number>;
  topPsychics: TopPsychic[];
  recentTransactions: RecentTransaction[];
  signupsByDay: SignupDay[];
  unitPriceCents: number;
}

export interface EarningsSummary {
  totalEarnings: number;
  pendingEarnings: number;
  totalSessions: number;
  uniqueClients: number;
}

export interface MyChat {
  id: number;
  status: string;
  user_id?: number;
  psychic_id?: number;
  user?: { id: number; username: string; profile_picture_path?: string };
  psychic?: { id: number; username: string; profile_picture_path?: string };
  created_at: string;
}

export interface UnitPriceResponse {
  unit_price_cents: number;
}

export const dashboardApi = {
  getUnitPrice: async (): Promise<UnitPriceResponse> => {
    const response = await axiosClient.get("/payment/unit-price");
    return response.data;
  },
  getAdminStats: async (): Promise<AdminDashboardStats> => {
    const response = await axiosClient.get("/admin/dashboard/stats");
    return response.data;
  },

  getEarningsSummary: async (): Promise<EarningsSummary> => {
    const response = await axiosClient.get("/admin/psychics/earnings/summary");
    return response.data;
  },

  getMyChats: async (): Promise<MyChat[]> => {
    const response = await axiosClient.get("/chat/my-chats");
    return response.data;
  },
};
