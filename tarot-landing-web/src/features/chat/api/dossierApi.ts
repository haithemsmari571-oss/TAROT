import axiosClient from "@/lib/axiosClient";

// Platform-wide client dossier: reading history, notes (from any psychic),
// client-spend stats, and astrology (zodiac + life path from DOB). Client spend
// only — psychics are salaried, there is no cut.

export interface ClientDossierNote {
  id: number;
  note: string;
  chat_id: number | null;
  author_psychic_id: number | null;
  author_name: string;
  created_at: string | null;
}

export interface ClientDossierStats {
  lifetime_spend: number;
  today_spend: number;
  week_spend: number;
  session_count: number;
  notes_count: number;
  is_returning: boolean;
}

export interface ClientDossier {
  client: {
    id: number;
    username: string;
    email: string;
    date_of_birth: string | null;
    zodiac: string | null;
    life_path: number | null;
  };
  stats: ClientDossierStats;
  notes: ClientDossierNote[];
}

export interface ChatSpendSummary {
  chat_id: number;
  client_id: number;
  session: {
    total_spent: number;
    credit_spent: number;
    paid_spent: number;
    minutes: number;
  };
  today_spend: number;
  week_spend: number;
  lifetime_spend: number;
}

/** Full dossier for a client (psychic/admin/superadmin). */
export const getClientDossier = async (
  clientId: number
): Promise<ClientDossier> => {
  const res = await axiosClient.get(`/clients/${clientId}/dossier`);
  return res.data;
};

/** Save a dossier note against the client's profile (follows them forever). */
export const saveClientNote = async (
  clientId: number,
  data: { note: string; chat_id?: number | null }
): Promise<ClientDossierNote> => {
  const res = await axiosClient.post(`/clients/${clientId}/notes`, data);
  return res.data;
};

/** End-screen spend summary for one reading (free/paid split + today/week). */
export const getChatSpendSummary = async (
  chatId: number
): Promise<ChatSpendSummary> => {
  const res = await axiosClient.get(`/chat/${chatId}/spend-summary`);
  return res.data;
};
