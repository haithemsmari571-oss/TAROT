import type { ReactNode } from "react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { UserRole } from "../../features/auth/types/auth.types";

interface RoleGuardProps {
  roles: UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
}

export const RoleGuard = ({
  roles,
  fallback = null,
  children,
}: RoleGuardProps) => {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
