"use client";

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

export function ContinueDialog({
  open,
  dict,
  onContinue,
  onNew,
}: {
  open: boolean;
  dict: Dictionary;
  onContinue: () => void;
  onNew: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="border-surface bg-card sm:max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">
            {dict.game.continueQuestion}
          </DialogTitle>
          <DialogDescription className="font-body text-muted-foreground">
            {dict.game.continueText}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onNew}
            className="rounded-full border-surface bg-transparent text-muted-foreground hover:bg-surface hover:text-gold-soft"
          >
            {dict.game.continueNo}
          </Button>
          <Button onClick={onContinue} className="rounded-full bg-gold text-primary-foreground hover:bg-gold/90">
            {dict.game.continueYes}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
