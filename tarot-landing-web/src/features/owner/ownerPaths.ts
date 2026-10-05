/* Every address of the owner's phone admin (ROUND50, ROUND51, ROUND53,
   ROUND54), one source for the router, the guard and the screens. Files that
   cannot import it name the same /owner prefix: public/owner.webmanifest (id,
   start_url, scope), nginx.conf's allow-list (owner(?:/.*)?, which already
   covers Messages and Readers) and public/robots.txt. */
export const OWNER_PATH = "/owner";
export const OWNER_SIGN_IN_PATH = `${OWNER_PATH}/sign-in`;
/* The one posting flow: Choose, Kind, Caption, Share (ROUND51). */
export const OWNER_NEW_POST_PATH = `${OWNER_PATH}/new`;
/* One of "Your posts", opened from the home grid. */
export const OWNER_POST_PATH = `${OWNER_PATH}/posts/:postId`;
export const ownerPostPath = (id: number) => `${OWNER_PATH}/posts/${id}`;
/* Messages (ROUND53): every conversation, then one conversation. */
export const OWNER_MESSAGES_PATH = `${OWNER_PATH}/messages`;
export const OWNER_THREAD_PATH = `${OWNER_MESSAGES_PATH}/:chatId`;
export const ownerThreadPath = (chatId: number) => `${OWNER_MESSAGES_PATH}/${chatId}`;
/* Readers (ROUND54): every reader, a new one, then one reader. */
export const OWNER_READERS_PATH = `${OWNER_PATH}/readers`;
export const OWNER_NEW_READER_PATH = `${OWNER_READERS_PATH}/new`;
export const OWNER_READER_PATH = `${OWNER_READERS_PATH}/:readerId`;
export const ownerReaderPath = (readerId: number) => `${OWNER_READERS_PATH}/${readerId}`;

/* The install files the owner shell puts in the page while it is mounted
   (OwnerShell.tsx), in place of the app's (index.html:15-16). */
export const OWNER_MANIFEST_PATH = "/owner.webmanifest";
export const OWNER_APPLE_TOUCH_ICON_PATH = "/icons/owner-apple-touch-icon.png";
