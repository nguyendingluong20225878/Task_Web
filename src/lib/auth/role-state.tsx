"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ROLES = ["requestor", "worker", "judge"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_DASHBOARD_PATHS: Record<Role, string> = {
  requestor: "/requestor",
  worker: "/worker",
  judge: "/judge",
};

const ROLE_STORAGE_KEY_PREFIX = "task-web:role:";
const RoleStateContext = createContext<RoleStateContextValue | null>(null);

type StoredRoleState = {
  roles: Role[];
  activeRole: Role | null;
};

type RoleStateContextValue = {
  activeRole: Role | null;
  roles: Role[];
  walletAddress: string | null;
  setRoleForConnectedWallet: (role: Role) => void;
  setActiveRoleForConnectedWallet: (role: Role) => void;
  clearRoleForConnectedWallet: () => void;
  getDashboardPath: (role: Role) => string;
  isRoleLoading: boolean;
};

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.some((role) => role === value);
}

function normalizeStoredRoleState(value: unknown): StoredRoleState | null {
  if (isRole(value)) return { roles: [value], activeRole: value };
  if (!value || typeof value !== "object") return null;

  const stored = value as { roles?: unknown; activeRole?: unknown };
  const roles = Array.isArray(stored.roles)
    ? stored.roles.filter(isRole).filter((role, index, values) => values.indexOf(role) === index)
    : [];
  const activeRole = isRole(stored.activeRole) && roles.includes(stored.activeRole)
    ? stored.activeRole
    : roles[0] ?? null;

  return { roles, activeRole };
}

function getRoleStorageKey(walletAddress: string): string {
  return ROLE_STORAGE_KEY_PREFIX + walletAddress;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDashboardPath(role: Role): string {
  return ROLE_DASHBOARD_PATHS[role];
}

export function getStoredRoleState(walletAddress: string): StoredRoleState {
  if (!walletAddress || !canUseLocalStorage()) return { roles: [], activeRole: null };

  const rawValue = window.localStorage.getItem(getRoleStorageKey(walletAddress));
  if (!rawValue) return { roles: [], activeRole: null };

  try {
    return normalizeStoredRoleState(JSON.parse(rawValue)) ?? { roles: [], activeRole: null };
  } catch {
    return normalizeStoredRoleState(rawValue) ?? { roles: [], activeRole: null };
  }
}

export function getStoredRole(walletAddress: string): Role | null {
  return getStoredRoleState(walletAddress).activeRole;
}

function setStoredRoleState(walletAddress: string, value: StoredRoleState): void {
  if (!walletAddress || !canUseLocalStorage()) return;
  window.localStorage.setItem(getRoleStorageKey(walletAddress), JSON.stringify(value));
}

export function clearStoredRole(walletAddress: string): void {
  if (!walletAddress || !canUseLocalStorage()) return;
  window.localStorage.removeItem(getRoleStorageKey(walletAddress));
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { connected, publicKey, signMessage } = useWallet();
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const [storedRoleState, setStoredRoleStateValue] = useState<StoredRoleState>({
    roles: [],
    activeRole: null,
  });
  const [storedWalletAddress, setStoredWalletAddress] = useState<string | null>(null);
  const activeRole = walletAddress && storedWalletAddress === walletAddress
    ? storedRoleState.activeRole
    : null;
  const roles = walletAddress && storedWalletAddress === walletAddress
    ? storedRoleState.roles
    : [];
  const isRoleLoading = Boolean(walletAddress && storedWalletAddress !== walletAddress);

  useEffect(() => {
    if (!walletAddress || !signMessage) { void fetch("/api/auth/logout", { method: "POST" }); return; }
    let cancelled = false;
    void (async () => {
      try {
        const nonceResponse = await fetch("/api/auth/nonce");
        const nonceData = await nonceResponse.json();
        if (!nonceResponse.ok || cancelled) return;
        const message = `Task Web authentication\nWallet: ${walletAddress}\nNonce: ${nonceData.nonce}\nExpires: ${new Date(nonceData.expiresAt).toISOString()}`;
        const signature = await signMessage(new TextEncoder().encode(message));
        if (cancelled) return;
        await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: walletAddress, nonce: nonceData.nonce, message, signature: btoa(String.fromCharCode(...signature)) }) });
      } catch { /* protected data callers surface authentication errors */ }
    })();
    return () => { cancelled = true; };
  }, [signMessage, walletAddress]);
  useEffect(() => {
    if (!walletAddress) {
      setStoredRoleStateValue({ roles: [], activeRole: null });
      setStoredWalletAddress(null);
      return;
    }

    setStoredRoleStateValue(getStoredRoleState(walletAddress));
    setStoredWalletAddress(walletAddress);
  }, [walletAddress]);

  const persist = useCallback((next: StoredRoleState) => {
    if (!walletAddress) return;
    setStoredRoleState(walletAddress, next);
    setStoredRoleStateValue(next);
    setStoredWalletAddress(walletAddress);
  }, [walletAddress]);

  const setRoleForConnectedWallet = useCallback((role: Role) => {
    if (!walletAddress) return;
    const current = storedWalletAddress === walletAddress ? storedRoleState : getStoredRoleState(walletAddress);
    const nextRoles = current.roles.includes(role) ? current.roles : [...current.roles, role];
    persist({ roles: nextRoles, activeRole: role });
  }, [persist, storedRoleState, storedWalletAddress, walletAddress]);

  const setActiveRoleForConnectedWallet = useCallback((role: Role) => {
    if (!roles.includes(role)) return;
    persist({ roles, activeRole: role });
  }, [persist, roles]);

  const clearRoleForConnectedWallet = useCallback(() => {
    if (!walletAddress) {
      setStoredRoleStateValue({ roles: [], activeRole: null });
      setStoredWalletAddress(null);
      return;
    }
    clearStoredRole(walletAddress);
    setStoredRoleStateValue({ roles: [], activeRole: null });
    setStoredWalletAddress(walletAddress);
  }, [walletAddress]);

  const value = useMemo<RoleStateContextValue>(() => ({
    activeRole,
    roles,
    walletAddress,
    setRoleForConnectedWallet,
    setActiveRoleForConnectedWallet,
    clearRoleForConnectedWallet,
    getDashboardPath,
    isRoleLoading,
  }), [
    activeRole,
    clearRoleForConnectedWallet,
    isRoleLoading,
    roles,
    setActiveRoleForConnectedWallet,
    setRoleForConnectedWallet,
    walletAddress,
  ]);

  return <RoleStateContext.Provider value={value}>{children}</RoleStateContext.Provider>;
}

export function useRoleState(): RoleStateContextValue {
  const context = useContext(RoleStateContext);
  if (!context) throw new Error("useRoleState must be used within a RoleProvider");
  return context;
}
