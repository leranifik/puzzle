"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const sessionKey = ["session"] as const;

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: api.session });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}
