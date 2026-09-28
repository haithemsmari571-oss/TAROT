import PageBackground from "../../../components/PageBackground";
import moonlitBalcony from "../../../assets/backgrounds/moonlit-balcony.webp";

/* The sky behind sign-up, sign-in, forgot password, reset and verify: the
   app's own, the moonlit scene under the mood tint on --gl-base, as the app's
   tabs draw it (client-app.css, .client-app-shell::before and ::after) and the
   readers list does (PsychicsBrowse.tsx). The file is already in the build, so
   these pages add no bytes of their own, and a visitor who comes from the
   readers list has it already. */
export default function AuthBackground() {
  return <PageBackground images={moonlitBalcony} variant="glass" />;
}
