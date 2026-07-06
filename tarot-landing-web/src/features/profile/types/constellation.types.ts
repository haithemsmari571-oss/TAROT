export interface DailyCard {
  card_key: number;
  card_name: string;
  interpretation: string;
  manifestation: string;
  ritual: string;
  quote_line: string;
}

export interface StreakStatus {
  length: number;
  week_position: number; // 1-7 within the current cycle (0 if no streak)
  days_to_bonus: number;
  cycle: number; // 7
  bonus: number; // +10
}

export interface StardustBreakdown {
  purchased: number;
  earned: number;
  earned_expiring_soon: number;
  total: number;
}

export interface Ritual {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  reward: number;
  verification_type: "AUTO" | "SCREENSHOT" | "HANDLE";
  is_manual: boolean;
  pending: boolean;
}

export interface RotationInfo {
  rituals: Ritual[];
  next_rotation_at: string;
  seconds_to_rotation: number;
  window_hours: number;
  tasks_per_window: number;
}

export interface ConstellationData {
  dob_set: boolean;
  zodiac_sign: string | null;
  today: {
    date: string;
    pulled: boolean;
    reward: number | null;
    card: DailyCard | null;
  };
  streak: StreakStatus;
  balance: StardustBreakdown;
  rituals: RotationInfo;
  upsell: { headline: string; subline: string; cta_label: string };
  celebrations?: {
    kind: "pull" | "streak" | "claim" | "gift";
    title: string;
    amount: number;
    message?: string;
  }[];
}

export interface PullResult {
  reward: number;
  bonus: number;
  streak: StreakStatus;
  card: DailyCard;
  balance: StardustBreakdown;
}
