"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Org admins can view the CRM exactly as a member sees it (the OS's User /
 * Admin switch). View preference only — anything that must stay admin-only
 * regardless of the switch keys on `useSession().isAdmin`.
 * Kept per organization in localStorage; signing out or switching clears it.
 */
type AdminMode = {
  isAdmin: boolean;
  adminMode: boolean;
  setAdminMode: (on: boolean) => void;
};

const AdminModeContext = createContext<AdminMode>({
  isAdmin: false,
  adminMode: false,
  setAdminMode: () => {},
});

export function AdminModeProvider({
  isAdmin,
  tenantKey,
  children,
}: {
  isAdmin: boolean;
  tenantKey: string;
  children: ReactNode;
}) {
  const key = `recruit:user-mode:${tenantKey}`;
  const [mode, setMode] = useState(() => localStorage.getItem(key) !== "1");
  const setAdminMode = (on: boolean) => {
    if (on) localStorage.removeItem(key);
    else localStorage.setItem(key, "1");
    setMode(on);
  };
  return (
    <AdminModeContext.Provider value={{ isAdmin, adminMode: isAdmin && mode, setAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  return useContext(AdminModeContext);
}
