
import { PsychicSessionPage, ClientChatPage, AdminChatDetailPage } from "../features/chat/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";


const chatRoutes: RouteConfig[] = [
  {
    path: "/admin/chats",
    name: "chats Page",
    component: PsychicSessionPage,
    layout: "private",
    allowedRoles: [UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN],
  },
  {
    path: "/admin/chats/:chatId",
    name: "Admin Chat Detail",
    component: AdminChatDetailPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
  {
    path: "/chats",
    name: "Client Chats",
    component: ClientChatPage,
    layout: "public",
    requiresAuth: true,
  },
];

export default chatRoutes;
