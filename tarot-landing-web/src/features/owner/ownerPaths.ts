/* Every address of the owner's phone admin (ROUND50), one source for the
   router, the guard and the screens. Files that cannot import it name the same
   /owner prefix: public/owner.webmanifest (id, start_url, scope), nginx.conf's
   allow-list and public/robots.txt. */
export const OWNER_PATH = "/owner";
export const OWNER_SIGN_IN_PATH = `${OWNER_PATH}/sign-in`;
export const OWNER_REEL_PATH = `${OWNER_PATH}/reel`;
export const OWNER_PODCAST_PATH = `${OWNER_PATH}/podcast`;

/* The install files the owner shell puts in the page while it is mounted
   (OwnerShell.tsx), in place of the app's (index.html:15-16). */
export const OWNER_MANIFEST_PATH = "/owner.webmanifest";
export const OWNER_APPLE_TOUCH_ICON_PATH = "/icons/owner-apple-touch-icon.png";
