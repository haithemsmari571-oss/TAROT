/* Real data for the Hall entry flow.
   Every call here is one the live client already makes — nothing invented:
     the reader   ->  GET /psychic/{id}   (features/chat/api/chatApi.ts:251)
                      GET /psychic/       (features/browse/api/psychicsApi.ts:33)
     the question ->  POST /chat/request  (features/chat/api/chatApi.ts:111)
   There are no silent fallbacks. If a call fails the caller is given the error
   so the UI can show it. */

import { psychicsApi } from "../browse/api/psychicsApi";
import { getPsychicDetails, requestChat } from "../chat/api/chatApi";

export interface Reader {
  id: number;
  name: string;
  photo: string | null;
  pricePerMinute: number | null;
}

let current: Reader | null = null;
export const currentReader = () => current;

const toReader = (p: any): Reader => ({
  id: p.id,
  name: p.username,
  photo: p.profile_picture_url ?? null,
  pricePerMinute: p.price_per_second != null
    ? Math.round(p.price_per_second * 60 * 100) / 100
    : null,
});

/** The real reader. With an id it is that psychic; without, the first listed. */
export async function loadReader(psychicId?: number): Promise<Reader> {
  if (psychicId) {
    const p = await getPsychicDetails(psychicId);
    if (!p) throw new Error("We could not load this reader. Please go back and try again.");
    current = toReader(p);
    return current;
  }
  let page = await psychicsApi.getPsychics({ is_online: true, limit: 1 });
  if (!page?.items?.length) page = await psychicsApi.getPsychics({ limit: 1 });
  const first = page?.items?.[0];
  if (!first) throw new Error("No readers are available right now.");
  current = toReader(first);
  return current;
}

/** Put the real reader into the design's own elements. No new markup, no new CSS. */
export function applyReaderToDom(r: Reader) {
  for (const sel of [".ptitle", ".lname", ".aname", ".top .nm"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const t = Array.from(el.childNodes).find(
      (n) => n.nodeType === 3 && (n.textContent || "").trim().length
    );
    if (t) t.textContent = (t.textContent || "").replace(/Valentina/, r.name);
    else if (!el.querySelector("*")) el.textContent = r.name;
  }
  const photo = document.querySelector<HTMLElement>(".orb .photo");
  if (photo && r.photo) {
    // the design's gradient stays underneath, so a slow or missing image still reads
    photo.style.backgroundImage = `url("${r.photo}"), ${getComputedStyle(photo).backgroundImage}`;
    photo.style.backgroundSize = "cover";
    photo.style.backgroundPosition = "center";
  }
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** The real reading request. Never pretends to have succeeded. */
export async function submitRealRequest(question: string): Promise<SubmitResult> {
  if (!current) return { ok: false, error: "We could not load this reader. Please go back and try again." };
  try {
    await requestChat({
      psychic_id: current.id,
      // the field is optional in the design; send a gentle default rather than an
      // empty first message, matching what the old modal did
      message: question.trim() || "I'm ready to begin my reading.",
    });
    return { ok: true };
  } catch (e: any) {
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail ?? e?.response?.data?.message;
    if (status === 401 || status === 403) return { ok: false, error: "Please sign in again to start a reading." };
    if (status === 402) return { ok: false, error: detail || "You need a little more Stardust to begin this reading." };
    if (status === 400 && /already have an active/i.test(String(detail))) {
      return { ok: false, error: detail };
    }
    return { ok: false, error: detail || "We could not send your request. Please try again." };
  }
}
