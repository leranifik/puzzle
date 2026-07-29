"use client";

import { CloudDownload } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SyncDialog({
  open,
  dict,
  progress,
  onLoad,
  onKeep,
}: {
  open: boolean;
  dict: Dictionary;
  progress: number;
  onLoad: () => void;
  onKeep: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="border-surface bg-card sm:max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-foreground">
            <CloudDownload className="size-5 text-gold" />
            {dict.sync.title}
          </DialogTitle>
          <DialogDescription className="font-body text-muted-foreground">
            {dict.sync.text}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-surface bg-muted px-4 py-3">
          <span className="label-mono text-muted-foreground">{dict.sync.cloudProgress}</span>
          <span className="font-display text-lg font-medium text-gold">
            {Math.round(progress * 100)}%
          </span>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onKeep}
            className="rounded-full border-surface bg-transparent text-muted-foreground hover:bg-surface hover:text-gold-soft"
          >
            {dict.sync.keep}
          </Button>
          <Button onClick={onLoad} className="rounded-full bg-gold text-primary-foreground hover:bg-gold/90">
            {dict.sync.load}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
