/* THE CONVERSATION LIST, DRAWN AS THE HALL.

   PRESENTATION ONLY. This component owns no state, makes no request and knows
   nothing about money. Every value arrives as a prop and every action is a
   callback back into ClientChat, which still runs the session exactly as it did.

   It renders inside HallStage, so it sits in the hall's own sky rather than on
   a layer above it. When a conversation is open this component is not rendered
   at all, which is what keeps the room's viewport clear. */
import "../../styles/hall-list.css";

export interface HallListChat {
  id: number;
  name: string;
  avatarUrl?: string | null;
  /** ACTIVE | PAUSED | ENDED | REQUESTED | ARCHIVED — the same value the old
      sidebar showed, already resolved against live session state by the caller. */
  status?: string;
  lastMessage?: string | null;
}

export interface HallListProps {
  chats: HallListChat[];
  onOpen: (id: number) => void;
  onRefresh: () => void;
  onLeave: () => void;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  showPager: boolean;
  /** true while the hall crossfades to the room */
  leaving?: boolean;
  /** replaces the rows entirely: loading, error, or nothing-here */
  note?: { title: string; sub: string; action?: { label: string; onClick: () => void } } | null;
}

/* the exact words the old sidebar used, kept */
const BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "is-active" },
  PAUSED: { label: "Paused", cls: "is-paused" },
  ENDED: { label: "Ended", cls: "is-ended" },
  REQUESTED: { label: "Pending", cls: "is-pending" },
  ARCHIVED: { label: "Cancelled", cls: "is-cancelled" },
};

export default function HallList(p: HallListProps) {
  return (
    <div className={"hlist" + (p.leaving ? " is-leaving" : "")}>
      <div className="hlist-inner">
        <div className="hlist-head">
          <div>
            <div className="hlist-eyebrow">Your readings</div>
            <h1 className="hlist-title">Messages</h1>
            <p className="hlist-sub">Connect with your psychics</p>
          </div>
          <div className="hlist-tools">
            {/* the refresh control the old sidebar had, in the hall's language */}
            <button className="hbtn hbtn-icon" type="button" onClick={p.onRefresh}
                    aria-label="Refresh" title="Refresh">↻</button>
            {/* the way out of /chats — there was none before */}
            <button className="hbtn" type="button" onClick={p.onLeave}>Readers</button>
          </div>
        </div>

        {p.note ? (
          <div className="hnote">
            <div className="hnote-title">{p.note.title}</div>
            <p className="hnote-sub">{p.note.sub}</p>
            {p.note.action && (
              <button className="hbtn" type="button" onClick={p.note.action.onClick}>
                {p.note.action.label}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hlist-scroll">
              {p.chats.map((c) => {
                const b = BADGE[String(c.status)] ?? null;
                return (
                  <button key={c.id} type="button" className="hrow" onClick={() => p.onOpen(c.id)}>
                    <span className="hrow-face">
                      {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <span>✦</span>}
                    </span>
                    <span className="hrow-body">
                      <span className="hrow-top">
                        <span className="hrow-name">{c.name}</span>
                        {b && <span className={"hbadge " + b.cls}>{b.label}</span>}
                      </span>
                      <span className="hrow-last">{c.lastMessage}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {p.showPager && (
              <div className="hpager">
                <button className="hbtn hbtn-icon" type="button" disabled={p.page === 1}
                        onClick={() => p.onPage(Math.max(1, p.page - 1))} aria-label="Previous page">‹</button>
                <span className="hpager-count">{p.page} / {p.totalPages}</span>
                <button className="hbtn hbtn-icon" type="button" disabled={p.page === p.totalPages}
                        onClick={() => p.onPage(Math.min(p.totalPages, p.page + 1))} aria-label="Next page">›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
