"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toDataURL } from "qrcode";
import { MonitorSmartphone, Copy, Check, RefreshCw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import { haptics } from "@/lib/telegram-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function useCountdown(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

export function LinkDeviceDialog({
  locale,
  dict,
  compact = false,
  icon,
  triggerClassName,
}: {
  locale: Locale;
  dict: Dictionary;
  compact?: boolean;
  icon?: ReactNode;
  triggerClassName?: string;
}) {
  const t = dict.link;
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createDeviceLink(locale),
    onSuccess: async (data) => {
      const dataUrl = await toDataURL(data.url, {
        margin: 1,
        width: 480,
        color: { dark: "#15171c", light: "#ffe8b8" },
      });
      setQr(dataUrl);
    },
  });

  const secondsLeft = useCountdown(create.data?.expiresAt ?? null);
  const expired = !!create.data && secondsLeft <= 0;

  const start = () => {
    setQr(null);
    setCopied(false);
    create.mutate();
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) start();
    else {
      create.reset();
      setQr(null);
    }
  };

  const copy = async () => {
    if (!create.data) return;
    try {
      await navigator.clipboard.writeText(create.data.url);
      haptics.tap();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (http / permissions) — the link is visible anyway
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(1, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.button}
            className={triggerClassName ?? "text-muted-foreground hover:text-gold-soft"}
          >
            {icon ?? <MonitorSmartphone className="size-4" />}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
          >
            <MonitorSmartphone className="size-4" />
            <span className="hidden sm:inline">{t.button}</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="border-surface bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-foreground">{t.title}</DialogTitle>
          <DialogDescription className="font-body text-muted-foreground">
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {create.isPending || (!qr && !expired) ? (
            <Skeleton className="aspect-square w-56 rounded-lg bg-muted" />
          ) : expired ? (
            <div className="grid aspect-square w-56 place-items-center rounded-lg border border-dashed border-surface">
              <p className="label-mono text-muted-foreground">{t.expired}</p>
            </div>
          ) : (
            qr && (
              <div className="rounded-lg bg-gold-soft p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR" className="size-56 rounded-sm" />
              </div>
            )
          )}

          {create.data && !expired && (
            <>
              <p className="label-mono text-gold" aria-live="polite">
                {t.expiresIn} {mm}:{ss}
              </p>
              <button
                onClick={copy}
                className="label-mono flex w-full items-center justify-center gap-2 truncate rounded-lg border border-surface bg-muted px-3 py-2.5 text-muted-foreground transition-colors hover:text-gold-soft"
              >
                {copied ? <Check className="size-3.5 text-gold" /> : <Copy className="size-3.5" />}
                <span className="truncate">{copied ? t.copied : t.copy}</span>
              </button>
            </>
          )}

          {expired && (
            <Button
              onClick={start}
              className="rounded-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              <RefreshCw className="size-4" />
              {t.newLink}
            </Button>
          )}

          <p className="font-body text-center text-xs leading-relaxed text-muted-foreground">
            {t.singleUse}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
