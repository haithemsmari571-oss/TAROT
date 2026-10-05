/* Every address of the owner's phone admin (ROUND50, ROUND51, ROUND53,
   ROUND54), one source for the router, the guard and the screens. Files that
   cannot import it name the same /owner prefix: public/owner.webmanifest (id,
   start_url, scope), nginx.conf's owner location (^/owner(?:/.*)?/?$, every
   /owner address answers owner.html) and public/robots.txt. */
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

/* Whether an address is the owner's, /owner or anything under it, without
   regard to case, as React Router and nginx.conf match it (ROUND55). Every
   such address is owner.html (vite.config.ts serves it on the dev server),
   and a session that cannot be refreshed there signs in again at
   OWNER_SIGN_IN_PATH, never at the website's /login (lib/axiosClient.ts). */
export function isOwnerPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path === OWNER_PATH || path.startsWith(`${OWNER_PATH}/`);
}
