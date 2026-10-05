import { useId, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { categoriesApi } from "@/features/browse/api/categoriesApi";
import type { Category } from "@/features/browse/types/category.types";
import { ZodiacGlyph } from "@/features/client-app/ReaderFacts";
import { SIGNS } from "@/features/oracle/data/Signs";
import { compressScreenshot } from "@/features/profile/lib/compressImage";
import { OwnerBack, OwnerFileChooser } from "./OwnerParts";
import { OWNER_READERS_PATH, ownerReaderPath } from "./ownerPaths";
import {
  changesOf,
  draftOf,
  keepReader,
  LANGUAGE_CHOICES,
  newReaderOf,
  parsePrice,
  READER_BIO_MAX_LENGTH,
  readerRefusal,
  useOwnerReaders,
  type ReaderDraft,
} from "./ownerReaders";
import { createReader, updateReader, type OwnerReader, type OwnerReaderList } from "./ownerReadersApi";
import { useFilePreview } from "./useFilePreview";

const COPY = {
  newTitle: "Add reader",
  loading: "Loading…",
  failed: "This reader could not be loaded.",
  tryAgain: "Try again",
  missing: "This reader is not here any more.",
  added: (name: string) => `${name} is added.`,
  emailSent: "She has an email to set her password.",
  emailNotSent: "The email to set her password could not be sent.",
  show: "Show to clients",
  shown: "Clients can see her.",
  hidden: "Hidden. Clients cannot see her.",
  notSwitched: "It did not change. Try again.",
  photo: "Photo",
  choosePhoto: "Choose a photo",
  changePhoto: "Change photo",
  preparingPhoto: "Preparing the photo…",
  photoUnreadable: "This photo could not be read. Choose another one.",
  nameAndBio: "Name and short bio",
  name: "Name",
  bio: "Short bio",
  bioKeptLonger: `This bio is longer than ${READER_BIO_MAX_LENGTH} characters. It is kept as it is unless you shorten it.`,
  zodiac: "Zodiac sign",
  languages: "Languages",
  addAnother: "Add another",
  languagePlaceholder: "Another language",
  addLanguage: "Add",
  experience: "Experience",
  yearsReading: "Years reading",
  fewerYears: "One year less",
  moreYears: "One year more",
  yearsEmpty: "Empty shows nothing on her profile.",
  ethnicity: "Ethnicity",
  specialities: "Specialities",
  noSpecialities: "The specialities could not be loaded.",
  price: "Price per message (£)",
  priceInvalid: "Write the price in pounds, such as 2.50.",
  email: "Login email",
  emailHint: "She gets an email at this address to set her own password.",
  needed: "A photo, her name, her login email and a price are needed.",
  add: "Add reader",
  adding: "Adding…",
  save: "Save",
  saving: "Saving…",
  saved: "Saved.",
} as const;

/* The photo chooser takes what the server keeps (TAROT-BACKEND
   routers/owner_readers.py READER_PHOTO_FORMATS). */
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Work = "idle" | "busy" | "done" | "failed";

/* Her page as the owner keeps it (ROUND54): /owner/readers/new adds her,
   /owner/readers/:readerId changes her. One scrolling form in sections, Save
   at its end in the page's flow, and on her page the switch that hides her
   from clients or shows her again. */
export default function OwnerReaderScreen() {
  const { readerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const readers = useOwnerReaders();
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.getCategories(), staleTime: 5 * 60_000 });
  const back = () => navigate(OWNER_READERS_PATH);

  if (!readers.data) {
    return (
      <main className="owner-screen owner-reader">
        <OwnerBack onClick={back} />
        {readers.isPending && <p className="owner-note" role="status">{COPY.loading}</p>}
        {readers.isError && (
          <div className="owner-posts-state">
            <p className="owner-error" role="alert">{COPY.failed}</p>
            <button type="button" className="owner-button-quiet" onClick={() => { void readers.refetch(); }}>{COPY.tryAgain}</button>
          </div>
        )}
      </main>
    );
  }

  const reader = readerId === undefined ? null : readers.data.items.find((item) => String(item.id) === readerId) ?? null;
  if (readerId !== undefined && !reader) {
    return (
      <main className="owner-screen owner-reader">
        <OwnerBack onClick={back} />
        <p className="owner-note">{COPY.missing}</p>
      </main>
    );
  }

  const created = (location.state as { created?: { emailSent: boolean } } | null)?.created ?? null;
  return (
    <ReaderForm
      key={reader?.id ?? "new"}
      reader={reader}
      list={readers.data}
      categories={categories.data}
      categoriesFailed={categories.isError}
      created={created}
      onBack={back}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="owner-panel owner-form owner-reader-section" aria-labelledby={id}>
      <h2 className="owner-label" id={id}>{title}</h2>
      {children}
    </section>
  );
}

function ReaderForm({
  reader,
  list,
  categories,
  categoriesFailed,
  created,
  onBack,
}: {
  reader: OwnerReader | null;
  list: OwnerReaderList;
  categories: Category[] | undefined;
  categoriesFailed: boolean;
  created: { emailSent: boolean } | null;
  onBack: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReaderDraft>(() => draftOf(reader, list.defaults));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, showPreview] = useFilePreview();
  const [photoWork, setPhotoWork] = useState<"idle" | "busy" | "failed">("idle");
  const [saving, setSaving] = useState<Work>("idle");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [switching, setSwitching] = useState<Work>("idle");
  const [addingLanguage, setAddingLanguage] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");

  const creating = reader === null;
  const busy = saving === "busy";
  const { limits } = list;

  const edit = (patch: Partial<ReaderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaving("idle");
    setRefusal(null);
  };
  const toggle = <T,>(items: T[], item: T) => (items.includes(item) ? items.filter((each) => each !== item) : [...items, item]);

  /* The photo is made ready on the phone as the app's other pictures are
     (compressImage.ts): at most 1600px, JPEG, its location data dropped. */
  const choosePhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoWork("busy");
    try {
      const prepared = await compressScreenshot(file);
      setPhoto(prepared);
      showPreview(prepared);
      setPhotoWork("idle");
      setSaving("idle");
      setRefusal(null);
    } catch {
      setPhotoWork("failed");
    }
  };

  const addLanguage = () => {
    const name = newLanguage.trim().split(/\s+/).join(" ");
    if (name && !draft.languages.some((language) => language.toLowerCase() === name.toLowerCase())) {
      edit({ languages: [...draft.languages, name] });
    }
    setNewLanguage("");
    setAddingLanguage(false);
  };

  const price = parsePrice(draft.price);
  const nameGiven = draft.name.trim() !== "";
  const changes = reader ? changesOf(draft, reader) : null;
  const changed = changes !== null && (Object.keys(changes).length > 0 || photo !== null);
  const complete = creating
    ? photo !== null && nameGiven && EMAIL_SHAPE.test(draft.email.trim()) && price !== null
    : nameGiven && price !== null;
  const ready = complete && photoWork !== "busy" && (creating || changed);

  const save = async () => {
    if (!ready) return;
    setSaving("busy");
    setRefusal(null);
    try {
      if (!reader) {
        const added = await createReader(newReaderOf(draft), photo!);
        keepReader(queryClient, added);
        navigate(ownerReaderPath(added.id), { replace: true, state: { created: { emailSent: added.password_email_sent } } });
        return;
      }
      const updated = await updateReader(reader.id, changes && Object.keys(changes).length > 0 ? changes : null, photo);
      keepReader(queryClient, updated);
      setDraft(draftOf(updated, list.defaults));
      setPhoto(null);
      showPreview(null);
      setSaving("done");
    } catch (error) {
      setRefusal(readerRefusal(error));
      setSaving("failed");
    }
  };

  const switchListed = async () => {
    if (!reader) return;
    setSwitching("busy");
    try {
      keepReader(queryClient, await updateReader(reader.id, { is_listed: !reader.is_listed }));
      setSwitching("idle");
    } catch {
      setSwitching("failed");
    }
  };

  const pictureUrl = preview?.url ?? reader?.picture_url ?? null;
  const customLanguages = draft.languages.filter((language) => !(LANGUAGE_CHOICES as readonly string[]).includes(language));
  const bioLonger = draft.bio.length > READER_BIO_MAX_LENGTH;

  return (
    <main className="owner-screen owner-reader" data-owner-reader={reader?.id ?? "new"}>
      <OwnerBack onClick={onBack} disabled={busy} />
      <h1 className="owner-title">{reader ? reader.name : COPY.newTitle}</h1>
      {reader && created && (
        <p className="owner-status owner-reader-added" role="status">
          {COPY.added(reader.name)} {created.emailSent ? COPY.emailSent : COPY.emailNotSent}
        </p>
      )}
      {reader && (
        <section className="owner-panel owner-reader-listed">
          <button
            type="button"
            role="switch"
            aria-checked={reader.is_listed}
            className="owner-switch-row"
            onClick={() => { void switchListed(); }}
            disabled={switching === "busy"}
          >
            <span className="owner-switch-copy">
              <span className="owner-switch-label">{COPY.show}</span>
              <span className="owner-switch-line">{reader.is_listed ? COPY.shown : COPY.hidden}</span>
            </span>
            <span className="owner-switch" aria-hidden="true"><span className="owner-switch-knob" /></span>
          </button>
          {switching === "failed" && <p className="owner-error" role="alert">{COPY.notSwitched}</p>}
        </section>
      )}

      <form className="owner-reader-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Section title={COPY.photo}>
          <div className="owner-reader-photo-row">
            <span className="owner-reader-photo" aria-hidden="true">
              {pictureUrl ? <img src={pictureUrl} alt="" /> : <span className="owner-reader-initial">{draft.name.trim().charAt(0).toUpperCase() || "·"}</span>}
            </span>
            <OwnerFileChooser
              label={pictureUrl ? COPY.changePhoto : COPY.choosePhoto}
              accept={PHOTO_ACCEPT}
              quiet
              disabled={busy || photoWork === "busy"}
              onChoose={(file) => { void choosePhoto(file); }}
            />
          </div>
          {photoWork === "busy" && <p className="owner-note owner-note-left" role="status">{COPY.preparingPhoto}</p>}
          {photoWork === "failed" && <p className="owner-error" role="alert">{COPY.photoUnreadable}</p>}
        </Section>

        <Section title={COPY.nameAndBio}>
          <label className="owner-field">
            <span className="owner-reader-field-label">{COPY.name}</span>
            <input
              className="owner-input"
              name="name"
              value={draft.name}
              autoCapitalize="words"
              autoComplete="off"
              disabled={busy}
              onChange={(event) => edit({ name: event.target.value })}
            />
          </label>
          <div className="owner-field">
            <label className="owner-reader-field-label" htmlFor={`${id}-bio`}>{COPY.bio}</label>
            <textarea
              id={`${id}-bio`}
              className="owner-input owner-reader-bio"
              name="bio"
              rows={4}
              value={draft.bio}
              maxLength={Math.max(READER_BIO_MAX_LENGTH, draft.bio.length)}
              autoCapitalize="sentences"
              aria-describedby={`${id}-bio-count`}
              disabled={busy}
              onChange={(event) => {
                const bio = event.target.value;
                // Longer than the cap only by shortening what was stored.
                if (bio.length <= READER_BIO_MAX_LENGTH || bio.length < draft.bio.length) edit({ bio });
              }}
            />
            <div className="owner-caption-foot">
              <p className="owner-caption-hint">{bioLonger ? COPY.bioKeptLonger : ""}</p>
              <span className="owner-caption-count" id={`${id}-bio-count`}>{`${draft.bio.length}/${READER_BIO_MAX_LENGTH}`}</span>
            </div>
          </div>
        </Section>

        <Section title={COPY.zodiac}>
          <div className="owner-chips owner-sign-chips">
            {SIGNS.map((sign) => (
              <button
                key={sign.name}
                type="button"
                className="owner-chip"
                aria-pressed={draft.zodiac === sign.name}
                disabled={busy}
                onClick={() => edit({ zodiac: draft.zodiac === sign.name ? null : sign.name })}
              >
                <ZodiacGlyph sign={sign} /> {sign.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title={COPY.languages}>
          <div className="owner-chips">
            {[...LANGUAGE_CHOICES, ...customLanguages].map((language) => (
              <button
                key={language}
                type="button"
                className="owner-chip"
                aria-pressed={draft.languages.includes(language)}
                disabled={busy}
                onClick={() => edit({ languages: toggle(draft.languages, language) })}
              >
                {language}
              </button>
            ))}
            {!addingLanguage && (
              <button type="button" className="owner-chip owner-chip-add" disabled={busy} onClick={() => setAddingLanguage(true)}>
                + {COPY.addAnother}
              </button>
            )}
          </div>
          {addingLanguage && (
            <div className="owner-reader-add-language">
              <input
                className="owner-input"
                aria-label={COPY.languagePlaceholder}
                placeholder={COPY.languagePlaceholder}
                value={newLanguage}
                maxLength={limits.language_name_max_length}
                autoCapitalize="words"
                autoFocus
                onChange={(event) => setNewLanguage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLanguage();
                  }
                }}
              />
              <button type="button" className="owner-button-quiet" onClick={addLanguage}>{COPY.addLanguage}</button>
            </div>
          )}
        </Section>

        <Section title={COPY.experience}>
          <div className="owner-field">
            <span className="owner-reader-field-label" id={`${id}-years`}>{COPY.yearsReading}</span>
            <div className="owner-stepper" role="group" aria-labelledby={`${id}-years`}>
              <button
                type="button"
                className="owner-stepper-button"
                aria-label={COPY.fewerYears}
                disabled={busy || !draft.years}
                onClick={() => edit({ years: Math.max(0, (draft.years ?? 0) - 1) })}
              >
                −
              </button>
              <input
                className="owner-input owner-stepper-value"
                aria-labelledby={`${id}-years`}
                inputMode="numeric"
                value={draft.years ?? ""}
                disabled={busy}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  edit({ years: digits === "" ? null : Math.min(limits.years_experience_max, Number(digits)) });
                }}
              />
              <button
                type="button"
                className="owner-stepper-button"
                aria-label={COPY.moreYears}
                disabled={busy || (draft.years ?? 0) >= limits.years_experience_max}
                onClick={() => edit({ years: draft.years === null ? 1 : draft.years + 1 })}
              >
                +
              </button>
            </div>
            <p className="owner-caption-hint">{COPY.yearsEmpty}</p>
          </div>
        </Section>

        <Section title={COPY.ethnicity}>
          <input
            className="owner-input"
            aria-label={COPY.ethnicity}
            value={draft.ethnicity}
            maxLength={limits.ethnicity_max_length}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => edit({ ethnicity: event.target.value })}
          />
        </Section>

        <Section title={COPY.specialities}>
          {categoriesFailed && <p className="owner-error" role="alert">{COPY.noSpecialities}</p>}
          {categories && (
            <div className="owner-chips">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="owner-chip"
                  aria-pressed={draft.categoryIds.includes(category.id)}
                  disabled={busy}
                  onClick={() => edit({ categoryIds: toggle(draft.categoryIds, category.id) })}
                >
                  {category.title}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title={COPY.price}>
          <div className="owner-price-field">
            <span aria-hidden="true">£</span>
            <input
              className="owner-input"
              aria-label={COPY.price}
              inputMode="decimal"
              value={draft.price}
              disabled={busy}
              onChange={(event) => edit({ price: event.target.value })}
            />
          </div>
          {draft.price.trim() !== "" && price === null && <p className="owner-error owner-reader-left" role="alert">{COPY.priceInvalid}</p>}
        </Section>

        {creating && (
          <Section title={COPY.email}>
            <input
              className="owner-input"
              type="email"
              aria-label={COPY.email}
              value={draft.email}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => edit({ email: event.target.value })}
            />
            <p className="owner-caption-hint">{COPY.emailHint}</p>
          </Section>
        )}

        <div className="owner-reader-save">
          {creating && !complete && <p className="owner-note">{COPY.needed}</p>}
          {refusal && <p className="owner-error" role="alert">{refusal}</p>}
          {saving === "done" && <p className="owner-status" role="status">{COPY.saved}</p>}
          <button type="submit" className="owner-button" disabled={!ready || busy}>
            {creating ? (busy ? COPY.adding : COPY.add) : busy ? COPY.saving : COPY.save}
          </button>
        </div>
      </form>
    </main>
  );
}
