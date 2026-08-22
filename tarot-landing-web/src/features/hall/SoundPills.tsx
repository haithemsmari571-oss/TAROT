/* The sound pills — one source, three places: the entry form (#pills), the
   reflect panel in the room and its preview copy (#rfpills).

   Silence, then the owner's library in the owner's order; when the library is
   loading, failed or empty, the four generated beds the design always had —
   so the first paint is the same as before the library existed, and nothing
   shifts when an empty or failed answer comes back. A non-empty answer
   re-renders the row in place.

   Every pill carries data-snd (the key selectSound receives). startHall owns
   the click (delegated on the container) and repaints aria-pressed from its
   own bedKind; this component's aria-pressed is only the first paint, read
   from the same sessionStorage key, so the two can never disagree. */
import { GENERATED_PILLS, storedSoundKey, useHallSounds } from "./hallSounds";

export const REFLECT_LIBRARY_SOUND_LIMIT = 3;

interface SoundPillsProps {
  id?: string;
  maxLibraryEntries?: number;
}

export default function SoundPills({ id = "pills", maxLibraryEntries }: SoundPillsProps = {}) {
  const library = useHallSounds();
  const stored = storedSoundKey();
  const visibleLibrary = maxLibraryEntries === undefined
    ? library
    : library.slice(0, Math.max(0, maxLibraryEntries));
  const items: ReadonlyArray<{ key: string; name: string }> = library.length
    ? [GENERATED_PILLS[0], ...visibleLibrary]
    : GENERATED_PILLS;
  // a stored key the list no longer carries reads as Silence on first paint
  const pressed = items.some((i) => i.key === stored) ? stored : "none";
  return (
    <div className="pills" id={id} data-source={library.length ? "library" : "generated"}>
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          className="pill"
          data-snd={i.key}
          aria-pressed={i.key === pressed ? "true" : "false"}
        >
          {i.name}
        </button>
      ))}
    </div>
  );
}
