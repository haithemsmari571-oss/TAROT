/* The app's tab addresses, in a module of their own so the router, the navbar
   and the sign-in landing can name them without pulling a lazy screen into the
   main bundle. */
export const HOME_PATH = "/app/home";
export const READERS_PATH = "/app/readers";
export const CHATS_PATH = "/app/chats";
export const YOU_PATH = "/app/you";
/* The account screens under You: two from YOU3A, Favourites from YOU3B. */
export const YOU_DETAILS_PATH = `${YOU_PATH}/details`;
export const YOU_PASSWORD_PATH = `${YOU_PATH}/password`;
export const YOU_FAVOURITES_PATH = `${YOU_PATH}/favourites`;
/* Delete account (ROUND12), under the Account card's Log out. */
export const YOU_DELETE_PATH = `${YOU_PATH}/delete`;
/* The More card's screens (YOU3C): the site's own pages hosted in the app. */
export const YOU_CONSTELLATION_PATH = `${YOU_PATH}/constellation`;
export const YOU_NOTIFICATIONS_PATH = `${YOU_PATH}/notifications`;
export const YOU_TERMS_PATH = `${YOU_PATH}/terms`;
export const YOU_PRIVACY_PATH = `${YOU_PATH}/privacy`;
/* Help & contact (ROUND39): the support address and the complaints line. */
export const YOU_HELP_PATH = `${YOU_PATH}/help`;
