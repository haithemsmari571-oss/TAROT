import { HOME_PATH } from "@/features/client-app/clientAppPaths";

/* Every address of the owner's phone admin (ROUND50, ROUND51), one source for
   the router, the guard and the screens. Files that cannot import it name the
   same /owner prefix: public/owner.webmanifest (id, start_url, scope),
   nginx.conf's allow-list and public/robots.txt. */
export const OWNER_PATH = "/owner";
export const OWNER_SIGN_IN_PATH = `${OWNER_PATH}/sign-in`;
/* The one posting flow: Choose, Kind, Caption, Share (ROUND51). */
export const OWNER_NEW_POST_PATH = `${OWNER_PATH}/new`;
/* One of "Your posts", opened from the home grid. */
export const OWNER_POST_PATH = `${OWNER_PATH}/posts/:postId`;
export const ownerPostPath = (id: number) => `${OWNER_PATH}/posts/${id}`;

/* Where a finished post is seen in the app, opened in the same tab. The app's
   paths module names Home; Shorts is a literal inside the app's shell
   (ClientAppShell.tsx), which this job may not touch, so it is named here
   once. */
export const APP_HOME_PATH = HOME_PATH;
export const APP_SHORTS_PATH = "/app/shorts";

/* The install files the owner shell puts in the page while it is mounted
   (OwnerShell.tsx), in place of the app's (index.html:15-16). */
export const OWNER_MANIFEST_PATH = "/owner.webmanifest";
export const OWNER_APPLE_TOUCH_ICON_PATH = "/icons/owner-apple-touch-icon.png";
