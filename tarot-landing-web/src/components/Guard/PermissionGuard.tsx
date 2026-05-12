import type { ReactNode } from "react";
import { usePermission } from "../../features/auth/hooks/usePermission";
import { Permission } from "../../features/auth/types/auth.types";

interface PermissionGuardProps {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

export const PermissionGuard = ({
  permission,
  fallback = null,
  children,
}: PermissionGuardProps) => {
  const { can } = usePermission();

  if (!can(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
