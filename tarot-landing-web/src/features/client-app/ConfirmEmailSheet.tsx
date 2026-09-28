/* "Confirm your email to keep going" (EmailConfirm=A, ROUND38). A new client
   is let in before she confirms her email; the server holds her second
   message and her first top-up until she does (TAROT-BACKEND
   app/services/email_confirmation.py) and answers EMAIL_NOT_CONFIRMED. The
   room and the top-up window then open this sheet. Its one action sends the
   confirmation email again (POST /auth/resend-verify-email) and shows the
   server's answer. Nothing she wrote is lost: the room puts her message back
   in the box, to send once she has confirmed.

   A modal dialog, so it sits in the top layer over the tab bar and over the
   top-up window alike: the You sheet's recipe (client-you.css), styled here
   without the shell's scope because the top-up window is mounted outside it. */
import { useEffect, useRef, useState } from "react";
import { resendVerifyEmail } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";
import { REFUSAL_FALLBACK, serverRefusal } from "@/lib/serverRefusal";
import "../../styles/glass.css";
import "./client-confirm-email.css";

/** The server's reason for a message or top-up that waits for the confirmation. */
export const EMAIL_NOT_CONFIRMED = "EMAIL_NOT_CONFIRMED";

export const CONFIRM_EMAIL_COPY = {
  title: "Confirm your email to keep going",
  resend: "Resend email",
} as const;

export default function ConfirmEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      setAnswer(null);
      sheet.showModal();
    } else if (!open && sheet.open) {
      sheet.close();
    }
  }, [open]);

  const resend = async () => {
    if (sending || !user?.email) return;
    setSending(true);
    setAnswer(null);
    try {
      setAnswer((await resendVerifyEmail(user.email)).message);
    } catch (error) {
      setAnswer(serverRefusal(error) ?? REFUSAL_FALLBACK);
    } finally {
      setSending(false);
    }
  };

  /* A tap on the scrim lands on the dialog itself and closes it; the close
     button and Escape close it too, and onClose tells the owner. */
  return (
    <dialog
      ref={dialog}
      className="confirm-email-sheet"
      aria-labelledby="confirm-email-sheet-title"
      onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      <div className="confirm-email-sheet-body">
        <button type="button" className="confirm-email-sheet-close" aria-label="Close" onClick={() => dialog.current?.close()}>
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="confirm-email-sheet-title" className="confirm-email-sheet-title">{CONFIRM_EMAIL_COPY.title}</h2>
        <button type="button" className="gl-btn-solid confirm-email-sheet-resend" onClick={resend} disabled={sending} aria-busy={sending}>
          {CONFIRM_EMAIL_COPY.resend}
        </button>
        {answer && <p className="confirm-email-sheet-answer" role="status">{answer}</p>}
      </div>
    </dialog>
  );
}
