/* The Readers tab: the roster on the site's own reader card, over the shell's
   living sky. Online readers come first. A card leads to the reader's profile. */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { psychicsApi } from "@/features/browse/api/psychicsApi";
import PsychicCard from "@/features/browse/components/PsychicCard";
import type { Psychic } from "@/features/browse/types/psychic.types";
import "./client-chats.css";
import "./client-readers.css";

export const READERS_PATH = "/app/readers";

/* Online readers first, then the others, each group in the API's own order,
   which is the site's display order. Two filters rather than a comparator, so
   nothing inside a group is ever re-sorted. */
const onlineFirst = (readers: Psychic[]) => [...readers.filter(reader => reader.is_online), ...readers.filter(reader => !reader.is_online)];

export default function ClientReadersScreen() {
  const navigate = useNavigate();
  const readers = useQuery({
    queryKey: ["app-readers"],
    queryFn: () => psychicsApi.getPsychics({ limit: 100 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const empty = !!readers.data && readers.data.total === 0;

  return (
    <section className="client-readers" aria-label="Readers">
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">Choose your reader</p>
        <h1 className="client-chats-title">Readers</h1>
      </header>
      {readers.isPending && <p className="client-chats-notice" role="status">Loading readers…</p>}
      {readers.isError && <p className="client-chats-notice" role="alert">Could not load readers. <button onClick={() => { void readers.refetch(); }}>Try again</button></p>}
      {empty && <div className="client-chats-empty"><p>No readers right now.</p></div>}
      {readers.data && !empty && (
        <div className="gl-grid">
          {onlineFirst(readers.data.items).map(reader => (
            <PsychicCard key={reader.id} psychic={reader} onClick={() => navigate(`${READERS_PATH}/${reader.id}`)} />
          ))}
        </div>
      )}
    </section>
  );
}
