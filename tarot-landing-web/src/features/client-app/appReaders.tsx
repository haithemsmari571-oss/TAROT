/* The roster the app screens share, and the readings every screen makes of a
   reader: her name as the card writes it, her presence line, her photo disc.
   One query key, so the Readers tab, the favourites shelf and the Favourites
   screen read one answer to GET /psychic/. */
import { useQuery } from "@tanstack/react-query";
import { psychicsApi } from "@/features/browse/api/psychicsApi";
import type { Psychic } from "@/features/browse/types/psychic.types";
import { clockAt } from "./ukTime";
import "./client-chats.css";

export const APP_READERS_QUERY_KEY = ["app-readers"] as const;

export function useAppReaders() {
  return useQuery({
    queryKey: APP_READERS_QUERY_KEY,
    queryFn: () => psychicsApi.getPsychics({ limit: 100 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Serif names read as names, not labels: Title case whatever the DB holds,
    exactly as the card does (PsychicCard.tsx:33-35). */
export const readerName = (reader: Pick<Psychic, "username">) =>
  reader.username ? reader.username.charAt(0).toUpperCase() + reader.username.slice(1).toLowerCase() : "";

/** Online now, Back at 20:00, or Offline. */
export const presenceLine = (reader: Pick<Psychic, "is_online" | "next_online_at">) =>
  reader.is_online ? "Online now" : reader.next_online_at ? `Back at ${clockAt(reader.next_online_at)}` : "Offline";

/** The readers behind a list of ids, in the list's order. An id the roster
    does not hold is left out. */
export function pickReaders(ids: number[], readers: Psychic[] | undefined): Psychic[] {
  const byId = new Map((readers ?? []).map(reader => [reader.id, reader]));
  return ids.flatMap(id => { const reader = byId.get(id); return reader ? [reader] : []; });
}

/** The chats list's disc (ClientChatsScreen.tsx, client-chats.css
    .client-chats-avatar): initial, photo over it when there is one, presence dot. */
export function ReaderDisc({ reader }: { reader: Pick<Psychic, "username" | "profile_picture_url" | "is_online"> }) {
  const name = readerName(reader);
  return (
    <span className="client-chats-avatar">
      <span className="client-chats-initial" aria-hidden="true">{name.slice(0, 1)}</span>
      {reader.profile_picture_url && <img src={reader.profile_picture_url} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
      <span className={`client-chats-online-dot${reader.is_online ? " is-online" : ""}`} aria-label={reader.is_online ? "Online" : "Offline"} />
    </span>
  );
}
