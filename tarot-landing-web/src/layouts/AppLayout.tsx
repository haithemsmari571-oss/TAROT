// src/layouts/AppLayout.tsx
import AdminLayout from "./AdminLayout";
import PublicLayout from "./PublicLayout";

type AppLayoutProps = {
  isPrivate: boolean;
};

export default function AppLayout({ isPrivate }: AppLayoutProps) {
  // Decide which layout to render
  if (isPrivate) {
    return <AdminLayout />;
  }

  return <PublicLayout />;
}
