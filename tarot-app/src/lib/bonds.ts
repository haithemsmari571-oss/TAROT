import AsyncStorage from "@react-native-async-storage/async-storage";

// "Your bonds" — recent compatibility checks, stored locally per user so she
// can re-run a check with one tap. Nothing here leaves the device.

export interface StoredBond {
  /** Partner birthday as DD/MM/YYYY (the shape the backend takes). */
  partnerBirthday: string;
  partnerSign: string;
  overallHarmony: number;
  /** ISO datetime of the last check, newest first in the list. */
  checkedAt: string;
}

const STORAGE_PREFIX = "cosmic_bonds_v1";
const MAX_BONDS = 6;

function storageKey(userId: number | null | undefined): string {
  return `${STORAGE_PREFIX}:${userId ?? "guest"}`;
}

export async function loadBonds(
  userId: number | null | undefined
): Promise<StoredBond[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as StoredBond[];
    }
  } catch {
    // Corrupt/absent storage — start with an empty list.
  }
  return [];
}

/** Add (or refresh) a bond, keeping the list newest-first and capped. */
export async function saveBond(
  userId: number | null | undefined,
  bond: StoredBond
): Promise<StoredBond[]> {
  const existing = await loadBonds(userId);
  const next = [
    bond,
    ...existing.filter((b) => b.partnerBirthday !== bond.partnerBirthday),
  ].slice(0, MAX_BONDS);
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Best-effort; the returned list still updates this session's UI.
  }
  return next;
}
