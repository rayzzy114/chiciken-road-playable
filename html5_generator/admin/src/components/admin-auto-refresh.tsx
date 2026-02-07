"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

type AdminAutoRefreshProps = {
  intervalMs?: number;
};

export function AdminAutoRefresh({ intervalMs = 5000 }: AdminAutoRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, router, startTransition]);

  return null;
}
