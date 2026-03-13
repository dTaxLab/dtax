"use client";

/**
 * Client context for CPA multi-client management.
 * Tracks the active client being viewed and persists selection in localStorage.
 */

import { createContext, useContext, useState, ReactNode } from "react";

interface ClientContextType {
  activeClientId: string | null;
  activeClientName: string | null;
  setActiveClient: (id: string | null, name?: string | null) => void;
}

const ClientContext = createContext<ClientContextType>({
  activeClientId: null,
  activeClientName: null,
  setActiveClient: () => {},
});

export const useClient = () => useContext(ClientContext);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [activeClientId, setActiveClientId] = useState<string | null>(
    typeof window !== "undefined"
      ? localStorage.getItem("dtax_active_client")
      : null,
  );
  const [activeClientName, setActiveClientName] = useState<string | null>(
    typeof window !== "undefined"
      ? localStorage.getItem("dtax_active_client_name")
      : null,
  );

  const setActiveClient = (id: string | null, name?: string | null) => {
    setActiveClientId(id);
    setActiveClientName(name || null);
    if (id) {
      localStorage.setItem("dtax_active_client", id);
      if (name) localStorage.setItem("dtax_active_client_name", name);
    } else {
      localStorage.removeItem("dtax_active_client");
      localStorage.removeItem("dtax_active_client_name");
    }
  };

  return (
    <ClientContext.Provider
      value={{ activeClientId, activeClientName, setActiveClient }}
    >
      {children}
    </ClientContext.Provider>
  );
}
