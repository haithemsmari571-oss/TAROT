
import { createElement } from "react";
import { PsychicSessionPage, ClientChatPage, AdminChatDetailPage } from "../features/chat/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
import { ProtectedRoute } from "../features/auth/components";

/* The reading is drawn as the hall now, and the hall is the whole window — it
   paints its own sky to every edge. Under the public layout the navbar, the
   offer line and the footer sat on top of it and covered the room's own header.
   So the client reading takes layout "guest", which renders with no wrapper at
   all, exactly as /reading/new and /design-preview already do. Guest routes
   carry no guard of their own (App.tsx:165-169), so the sign-in guard that
   requiresAuth used to provide is applied here instead — a reading still needs
   an account. */
const ClientChatRoom = () =>
  createElement(ProtectedRoute, null, createElement(ClientChatPage));


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
    component: ClientChatRoom,
    layout: "guest",
  },
];

export default chatRoutes;
