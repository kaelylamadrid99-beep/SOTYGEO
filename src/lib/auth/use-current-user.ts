import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

export type CurrentUserState = { user: AppUser | null; isPending: boolean };

function toAppUser(u: User | null | undefined): AppUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    displayName: (meta.full_name as string) || (meta.name as string) || null,
    primaryEmail: u.email ?? null,
    profileImageUrl: (meta.avatar_url as string) || null,
    isDevFallback: false,
  };
}

let current: CurrentUserState = { user: null, isPending: true };
const listeners = new Set<(s: CurrentUserState) => void>();
let started = false;

function set(s: CurrentUserState) {
  const same = s.isPending === current.isPending && s.user?.id === current.user?.id && s.user?.displayName === current.user?.displayName;
  current = same ? current : s;
  listeners.forEach((l) => l(current));
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.onAuthStateChange((_e, session) => {
    set({ user: toAppUser(session?.user), isPending: false });
  });
  void supabase.auth.getSession().then(({ data }) => {
    set({ user: toAppUser(data.session?.user), isPending: false });
  });
}

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ user: null, isPending: true });
  useEffect(() => {
    start();
    setState(current);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
