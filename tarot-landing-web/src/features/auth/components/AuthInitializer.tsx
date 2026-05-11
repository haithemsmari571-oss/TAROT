import { useEffect } from "react";
import { useCurrentUser } from "../hooks";

export const AuthInitializer = ({ children }: { children: React.ReactNode }) => {
  const { isLoading } = useCurrentUser();

  return <>{children}</>;
};
