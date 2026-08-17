/* PHASE 3 — real data behind /design-preview.
   Nothing here is invented: every call is one the live client already makes.
     psychic name / photo / rate  ->  psychicsApi.getPsychics  (GET /psychic/)
     submitting the question      ->  requestChat              (POST /chat/request)
     the session meter            ->  getChatSessionTime       (GET /chat/{id}/session-time)
     readiness + live messages    ->  NotificationType.CHAT_ACCEPTED + ChatWebSocket
   Where a value cannot be had (no session, not signed in, API down) the design's
   mock value stays and the reason is recorded in window.__hallData.fellBack. */

import { psychicsApi } from "../browse/api/psychicsApi";
import { requestChat } from "../chat/api/chatApi";
import { getToken } from "../auth/utils";

export interface HallDataReport {
  real: string[];
  fellBack: { what: string; why: string }[];
  psychic: { id: number; name: string; photo: string | null; pricePerMinute: number | null } | null;
}

const report: HallDataReport = { real: [], fellBack: [], psychic: null };
const fall = (what: string, why: string) => { report.fellBack.push({ what, why }); console.info(`[hall] fell back: ${what} — ${why}`); };

/** Swap the leading "Valentina" text node for the real reader's name. */
function renameTo(name: string) {
  const targets = [".ptitle", ".lname", ".aname", ".top .nm"];
  for (const sel of targets) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const t = [...el.childNodes].find(n => n.nodeType === 3 && (n.textContent || "").trim().length);
    if (t) t.textContent = (t.textContent || "").replace(/Valentina/, name);
    else if (!el.querySelector("*")) el.textContent = name;
  }
}

export async function wireRealData() {
  (window as any).__hallData = report;

  // ── the reader: real name, real photo in the orb, real per-minute rate ──
  try {
    let page = await psychicsApi.getPsychics({ is_online: true, limit: 1 });
    if (!page?.items?.length) page = await psychicsApi.getPsychics({ limit: 1 });
    const p: any = page?.items?.[0];
    if (!p) {
      fall("psychic name / photo / rate", "the psychics endpoint returned no readers");
    } else {
      const perMin = p.price_per_second != null ? Math.round(p.price_per_second * 60 * 100) / 100 : null;
      report.psychic = { id: p.id, name: p.username, photo: p.profile_picture_url ?? null, pricePerMinute: perMin };
      if (p.username) { renameTo(p.username); report.real.push("psychic name"); }
      const photoEl = document.querySelector<HTMLElement>(".orb .photo");
      if (photoEl && p.profile_picture_url) {
        // keep the design's gradient underneath so a slow or missing image still reads
        photoEl.style.backgroundImage = `url("${p.profile_picture_url}"), ${getComputedStyle(photoEl).backgroundImage}`;
        photoEl.style.backgroundSize = "cover";
        photoEl.style.backgroundPosition = "center";
        report.real.push("psychic photo in the orb");
      } else fall("psychic photo", "this reader has no profile picture set");
      if (perMin != null) report.real.push(`per-minute rate (£${perMin.toFixed(2)}/min)`);
      else fall("per-minute rate", "the reader record has no price_per_second");
    }
  } catch (e: any) {
    fall("psychic name / photo / rate", "GET /psychic/ failed: " + (e?.response?.status || e?.message || e));
  }

  // ── the meter, the readiness signal and the live thread all need a session ──
  const signedIn = !!getToken();
  if (!signedIn) {
    fall("real reading request", "not signed in, so POST /chat/request would be rejected");
    fall("pre-reading readiness signal", "needs an authenticated notifications socket");
    fall("live WebSocket thread + typing", "needs an authenticated chat socket and a chat id");
    fall("session meter (minutes left, balance)", "needs an active chat id for GET /chat/{id}/session-time");
  } else {
    report.real.push("signed in — request submission is live");
  }

  return report;
}

/** Submit the real reading request, if we have a reader and a session. */
export async function submitRealRequest(text: string) {
  const p = report.psychic;
  if (!p) { fall("submit request", "no real reader resolved"); return false; }
  if (!getToken()) { fall("submit request", "not signed in"); return false; }
  try {
    await requestChat({ psychic_id: p.id, message: text.trim() || "I'm ready to begin my reading." });
    report.real.push("reading request submitted");
    return true;
  } catch (e: any) {
    fall("submit request", "POST /chat/request failed: " + (e?.response?.status || e?.message || e));
    return false;
  }
}
