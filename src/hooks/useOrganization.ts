/**
 * useOrganization hook
 *
 * Manages the active organization context.
 * Stores the selected org ID in localStorage.
 * The API layer reads this to send X-Organization-Id header.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const ORG_KEY = "unwire_active_org";

export function getActiveOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function setActiveOrgId(orgId: string): void {
  localStorage.setItem(ORG_KEY, orgId);
}

export function useOrganization() {
  const { user } = useAuth();
  const orgs = (user as any)?.organizations ?? [];

  const [activeOrgId, setActive] = useState<string>(() => {
    const stored = getActiveOrgId();
    // Validate stored org is still accessible
    if (stored && orgs.find((o: any) => o.id === stored)) return stored;
    // Default to first org
    return orgs[0]?.id ?? "";
  });

  const switchOrg = useCallback((orgId: string) => {
    setActiveOrgId(orgId);
    setActive(orgId);
    // Reload to refresh all data with new org context
    window.location.reload();
  }, []);

  const activeOrg = orgs.find((o: any) => o.id === activeOrgId) ?? orgs[0];

  return { activeOrg, activeOrgId, orgs, switchOrg };
}
