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

type RoleStateContextValue = {
  activeRole: Role | null;
  walletAddress: string | null;
  setRoleForConnectedWallet: (role: Role) => void;
  clearRoleForConnectedWallet: () => void;
  getDashboardPath: (role: Role) => string;
  isRoleLoading: boolean;
};

function isRole(value: string | null): value is Role {
  return ROLES.some((role) => role === value);
}

function getRoleStorageKey(walletAddress: string): string {
  return `${ROLE_STORAGE_KEY_PREFIX}${walletAddress}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDashboardPath(role: Role): string {
  return ROLE_DASHBOARD_PATHS[role];
}

export function getStoredRole(walletAddress: string): Role | null {
  if (!walletAddress || !canUseLocalStorage()) {
    return null;
  }

  try {
    const storedRole = window.localStorage.getItem(getRoleStorageKey(walletAddress));
    return isRole(storedRole) ? storedRole : null;
  } catch {
    return null;
  }
}

export function setStoredRole(walletAddress: string, role: Role): void {
  if (!walletAddress || !canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(getRoleStorageKey(walletAddress), role);
}

export function clearStoredRole(walletAddress: string): void {
  if (!walletAddress || !canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(getRoleStorageKey(walletAddress));
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { connected, publicKey } = useWallet();
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const [storedRoleState, setStoredRoleState] = useState<{
    activeRole: Role | null;
    walletAddress: string | null;
  }>({
    activeRole: null,
    walletAddress: null,
  });
  const activeRole =
    walletAddress && storedRoleState.walletAddress === walletAddress ? storedRoleState.activeRole : null;
  const isRoleLoading = Boolean(walletAddress && storedRoleState.walletAddress !== walletAddress);

  useEffect(() => {
    if (!walletAddress) {
      setStoredRoleState({ activeRole: null, walletAddress: null });
      return;
    }

    setStoredRoleState({
      activeRole: getStoredRole(walletAddress),
      walletAddress,
    });
  }, [walletAddress]);

  const setRoleForConnectedWallet = useCallback(
    (role: Role) => {
      if (!walletAddress) {
        return;
      }

      setStoredRole(walletAddress, role);
      setStoredRoleState({ activeRole: role, walletAddress });
    },
    [walletAddress],
  );

  const clearRoleForConnectedWallet = useCallback(() => {
    if (!walletAddress) {
      setStoredRoleState({ activeRole: null, walletAddress: null });
      return;
    }

    clearStoredRole(walletAddress);
    setStoredRoleState({ activeRole: null, walletAddress });
  }, [walletAddress]);

  const value = useMemo<RoleStateContextValue>(
    () => ({
      activeRole,
      walletAddress,
      setRoleForConnectedWallet,
      clearRoleForConnectedWallet,
      getDashboardPath,
      isRoleLoading,
    }),
    [
      activeRole,
      walletAddress,
      setRoleForConnectedWallet,
      clearRoleForConnectedWallet,
      isRoleLoading,
    ],
  );

  return <RoleStateContext.Provider value={value}>{children}</RoleStateContext.Provider>;
}

export function useRoleState(): RoleStateContextValue {
  const context = useContext(RoleStateContext);

  if (!context) {
    throw new Error("useRoleState must be used within a RoleProvider");
  }

  return context;
}
