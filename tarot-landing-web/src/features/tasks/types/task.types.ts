// Types + plain-language labels for the admin Rituals (Tasks) & Claims screens.
// Values mirror the backend enums exactly; labels are what the non-technical
// owner sees.

export type VerificationType = "AUTO" | "SCREENSHOT" | "HANDLE";
export type TaskFrequency =
  | "ONCE_PER_ACCOUNT"
  | "ONCE_PER_DAY"
  | "ONCE_PER_WINDOW"
  | "UNLIMITED";
export type TaskStatus = "ACTIVE" | "INACTIVE";
export type TriggerEvent =
  | "DAILY_PULL"
  | "READING_RATED"
  | "FAVOURITES_PICKED"
  | "FIRST_PURCHASE"
  | "PURCHASE_DISTINCT_READER"
  | "REFERRAL_FIRST_PAYMENT"
  | "STREAK_MILESTONE";
export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  reward: number;
  verification_type: VerificationType;
  trigger_event: TriggerEvent | null;
  frequency: TaskFrequency;
  status: TaskStatus;
  starts_at: string | null;
  ends_at: string | null;
  rotation_weight: number;
  created_at: string;
  updated_at: string;
}

export interface TaskFormData {
  title: string;
  description: string;
  icon: string;
  reward: number;
  verification_type: VerificationType;
  trigger_event: TriggerEvent | null;
  frequency: TaskFrequency;
  status: TaskStatus;
  starts_at: string | null;
  ends_at: string | null;
  rotation_weight: number;
}

export interface Claim {
  id: number;
  user_id: number;
  username: string | null;
  task_id: number;
  task_title: string | null;
  task_reward: number | null;
  verification_type: VerificationType | null;
  status: ClaimStatus;
  evidence_path: string | null;
  evidence_paths?: string[];
  message?: string | null;
  evidence_handle: string | null;
  reward_amount: number | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
}

// ── Plain-language option lists (label = what the owner reads) ────────────────
export const VERIFICATION_OPTIONS: { label: string; value: VerificationType }[] = [
  { label: "Automatic (system detects it)", value: "AUTO" },
  { label: "Photo / screenshot (you approve)", value: "SCREENSHOT" },
  { label: "Social handle or link (you approve)", value: "HANDLE" },
];

export const TRIGGER_OPTIONS: { label: string; value: TriggerEvent }[] = [
  { label: "Pulled today's card", value: "DAILY_PULL" },
  { label: "Rated a reading", value: "READING_RATED" },
  { label: "Picked 3 favourite guides", value: "FAVOURITES_PICKED" },
  { label: "Made their first purchase", value: "FIRST_PURCHASE" },
  { label: "Read with a new guide", value: "PURCHASE_DISTINCT_READER" },
  { label: "A referral made their first payment", value: "REFERRAL_FIRST_PAYMENT" },
  { label: "Reached a streak milestone", value: "STREAK_MILESTONE" },
];

export const FREQUENCY_OPTIONS: { label: string; value: TaskFrequency }[] = [
  { label: "Once per account (one-time)", value: "ONCE_PER_ACCOUNT" },
  { label: "Once per day", value: "ONCE_PER_DAY" },
  { label: "Once per rotation window (~5h)", value: "ONCE_PER_WINDOW" },
  { label: "Unlimited (24h cooldown still applies)", value: "UNLIMITED" },
];

export const STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: "Active (live now)", value: "ACTIVE" },
  { label: "Inactive (hidden)", value: "INACTIVE" },
];

export const verificationLabel = (v: VerificationType | null | undefined) =>
  VERIFICATION_OPTIONS.find((o) => o.value === v)?.label ?? "—";
export const triggerLabel = (t: TriggerEvent | null | undefined) =>
  TRIGGER_OPTIONS.find((o) => o.value === t)?.label ?? "—";
export const frequencyLabel = (f: TaskFrequency | null | undefined) =>
  FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? "—";
