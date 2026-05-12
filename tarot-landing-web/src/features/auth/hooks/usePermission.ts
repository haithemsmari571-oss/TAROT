import { useCallback } from "react";
import { useAuth } from "./useAuth";
import { Permission, ROLE_PERMISSIONS } from "../types";

export const usePermission = () => {
  const { user } = useAuth();

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false;
      const permissions = ROLE_PERMISSIONS[user.role];
      return permissions?.includes(permission) ?? false;
    },
    [user]
  );

  const canAny = useCallback(
    (permissions: Permission[]): boolean => {
      if (!user) return false;
      return permissions.some((p) => can(p));
    },
    [can, user]
  );

  const canAll = useCallback(
    (permissions: Permission[]): boolean => {
      if (!user) return false;
      return permissions.every((p) => can(p));
    },
    [can, user]
  );

  return { can, canAny, canAll };
};
