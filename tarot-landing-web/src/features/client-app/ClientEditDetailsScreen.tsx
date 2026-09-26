/* Edit details, inside the app shell. The fields PATCH /profile/me takes from
   a client are the four in UserProfileUpdate (schemas/user.py:32-67): the name
   (3 to 50 characters once trimmed), a line about herself (up to 500), the
   date of birth (not in the future, 18 or over, and never blanked once sent)
   and the gender the reader is told. The
   email is not among them, whatever the route's docstring says
   (profile.py:79-82), so it is not here. Prefilled from GET /profile/me; only
   what changed is sent, and update_user_profile writes only what was sent
   (services/users.py:385, exclude_unset), so an untouched field is never
   overwritten. The backend's own words are shown when it refuses. */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "@/features/auth/hooks/useCurrentUser";
import { profileApi } from "@/features/profile/api/profileApi";
import type { UpdateProfileRequest, UserProfile } from "@/features/profile/types/profile.types";
import { YOU_PATH } from "./clientAppPaths";
import { AccountFrame, refusalText, type YouNotice } from "./ClientAccountForm";

const COPY = {
  title: "Edit details",
  name: "Name",
  bio: "About you",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  submit: "Save",
  saving: "Saving…",
  done: "Details saved.",
  loading: "Loading…",
  loadFailed: "Your details could not be loaded.",
} as const;

/* The four answers the sign up form offers (register.tsx:201-206), in the
   values schemas/user.py:41 accepts. */
const GENDER_OPTIONS = [
  { value: "WOMAN", label: "Woman" },
  { value: "MAN", label: "Man" },
  { value: "OTHER", label: "Other" },
  { value: "NOT_STATED", label: "Prefer not to say" },
] as const;
const GENDER_UNSET = "NOT_STATED";

/** The form's four fields as strings; an empty string stands for null. */
interface Details { username: string; bio: string; date_of_birth: string; gender: string }
const fromProfile = (profile: UserProfile): Details => ({
  username: profile.username,
  bio: profile.bio ?? "",
  date_of_birth: profile.date_of_birth ?? "",
  gender: profile.gender ?? GENDER_UNSET,
});

/** Only the fields that differ from what was loaded; an emptied field clears itself. */
function changesBetween(saved: Details, form: Details): UpdateProfileRequest {
  const body: UpdateProfileRequest = {};
  if (form.username !== saved.username) body.username = form.username;
  if (form.bio !== saved.bio) body.bio = form.bio || null;
  if (form.date_of_birth !== saved.date_of_birth) body.date_of_birth = form.date_of_birth || null;
  if (form.gender !== saved.gender) body.gender = form.gender;
  return body;
}

/** Today in the browser's own calendar, the picker's upper bound (schemas/user.py:62-67). */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function ClientEditDetailsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<Details | null>(null);
  const [form, setForm] = useState<Details | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    profileApi.getMyProfile()
      .then(profile => { if (!live) return; const details = fromProfile(profile); setSaved(details); setForm(details); })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, []);

  if (loadFailed) return <AccountFrame title={COPY.title}><p className="client-chats-notice" role="alert">{COPY.loadFailed}</p></AccountFrame>;
  if (!saved || !form) return <AccountFrame title={COPY.title}><p className="client-chats-notice" role="status">{COPY.loading}</p></AccountFrame>;

  const changes = changesBetween(saved, form);
  const dirty = Object.keys(changes).length > 0;
  const set = (patch: Partial<Details>) => setForm({ ...form, ...patch });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !dirty) return;
    setError(null);
    setBusy(true);
    try {
      const result = await profileApi.updateMyProfile(changes);
      // The Account card reads the signed-in user from the auth context, which
      // AuthInitializer keeps in step with the cached /profile/me answer and
      // rewrites from that cache on every auth render (useCurrentUser.ts:23-27).
      // So the fresh answer, the same shape GET /profile/me returns, goes into
      // the cache, the one source, and the context follows it.
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, result);
      const state: YouNotice = { notice: COPY.done };
      navigate(YOU_PATH, { replace: true, state });
    } catch (reason) {
      setError(refusalText(reason));
      setBusy(false);
    }
  };

  return (
    <AccountFrame title={COPY.title}>
      <form className="client-you-card client-you-form" onSubmit={submit} noValidate>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-details-name">{COPY.name}</label>
          <input id="you-details-name" className="client-you-input" type="text" autoComplete="username" value={form.username} onChange={event => set({ username: event.target.value })} />
        </div>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-details-bio">{COPY.bio}</label>
          <textarea id="you-details-bio" className="client-you-input" value={form.bio} onChange={event => set({ bio: event.target.value })} />
        </div>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-details-dob">{COPY.dateOfBirth}</label>
          <input id="you-details-dob" className="client-you-input" type="date" autoComplete="bday" max={today()} value={form.date_of_birth} onChange={event => set({ date_of_birth: event.target.value })} />
        </div>
        <fieldset className="client-you-field">
          <legend className="client-you-label">{COPY.gender}</legend>
          <div className="client-you-choices">
            {GENDER_OPTIONS.map(option => (
              <label key={option.value} className="client-you-choice">
                <input type="radio" name="gender" value={option.value} checked={form.gender === option.value} onChange={() => set({ gender: option.value })} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="client-you-error" role="alert">{error}</p>}
        <button type="submit" className="client-you-solid" disabled={busy || !dirty} aria-busy={busy}>{busy ? COPY.saving : COPY.submit}</button>
      </form>
    </AccountFrame>
  );
}
