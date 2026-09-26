/* /app/you/notifications: the site's Notifications page (features/
   notifications/views/NotificationsPage.tsx) inside the app shell. Its own
   dimmed scene is hidden by client-more.css; the shell's sky stands behind
   it. A notification that names a chat opens /chats?chat_id=…, which sends
   a signed-in client on to /app/chats with the query kept. */
import NotificationsPage from "@/features/notifications/views/NotificationsPage";
import { MORE_LINKS, MoreScreen } from "./ClientMoreScreen";

export default function ClientNotificationsScreen() {
  return (
    <MoreScreen title={MORE_LINKS.notifications.label} kind="notifications">
      <NotificationsPage />
    </MoreScreen>
  );
}
