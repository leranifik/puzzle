"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { sessionKey, useSession, useLogout } from "@/hooks/use-session";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserRound, LogOut } from "lucide-react";

export function AuthDialog({ dict }: { dict: Dictionary }) {
  const t = dict.auth;
  const [open, setOpen] = useState(false);
  const { data } = useSession();
  const logout = useLogout();
  const qc = useQueryClient();

  const loginSchema = z.object({
    email: z.string().email(t.errors.email),
    password: z.string().min(6, t.errors.password),
  });
  const registerSchema = loginSchema.extend({
    name: z.string().min(1).max(40),
  });

  type LoginValues = z.infer<typeof loginSchema>;
  type RegisterValues = z.infer<typeof registerSchema>;

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.code === "email_taken") {
      toast.error(t.errors.emailTaken);
    } else if (error instanceof ApiError && error.code === "credentials") {
      toast.error(t.errors.credentials);
    } else {
      toast.error(t.errors.generic);
    }
  };

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKey });
      setOpen(false);
    },
    onError,
  });

  const registerMutation = useMutation({
    mutationFn: api.register,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKey });
      setOpen(false);
    },
    onError,
  });

  const player = data?.player;

  if (player && !player.isGuest) {
    return (
      <div className="flex items-center gap-2">
        <span className="label-mono hidden text-gold-soft sm:inline">{player.name}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={dict.nav.logout}
          onClick={() => logout.mutate()}
          className="text-muted-foreground hover:text-gold-soft"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
        >
          <UserRound className="size-4" />
          <span className="hidden sm:inline">{dict.nav.signIn}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-surface bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-foreground">
            {t.signInTitle}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="in">
          <TabsList className="w-full bg-muted">
            <TabsTrigger value="in" className="flex-1">{t.signInTab}</TabsTrigger>
            <TabsTrigger value="up" className="flex-1">{t.signUpTab}</TabsTrigger>
          </TabsList>

          <TabsContent value="in">
            <form
              noValidate
              className="mt-2 space-y-4"
              onSubmit={loginForm.handleSubmit((v) => loginMutation.mutate(v))}
            >
              <div className="space-y-2">
                <Label htmlFor="li-email" className="label-mono text-muted-foreground">{t.email}</Label>
                <Input id="li-email" type="email" autoComplete="email" {...loginForm.register("email")} />
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="li-pass" className="label-mono text-muted-foreground">{t.password}</Label>
                <Input id="li-pass" type="password" autoComplete="current-password" {...loginForm.register("password")} />
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full rounded-full bg-gold text-primary-foreground hover:bg-gold/90" disabled={loginMutation.isPending}>
                {t.submitIn}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="up">
            <form
              noValidate
              className="mt-2 space-y-4"
              onSubmit={registerForm.handleSubmit((v) => registerMutation.mutate(v))}
            >
              <div className="space-y-2">
                <Label htmlFor="ru-name" className="label-mono text-muted-foreground">{t.name}</Label>
                <Input id="ru-name" placeholder={t.namePlaceholder} {...registerForm.register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-email" className="label-mono text-muted-foreground">{t.email}</Label>
                <Input id="ru-email" type="email" autoComplete="email" {...registerForm.register("email")} />
                {registerForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ru-pass" className="label-mono text-muted-foreground">{t.password}</Label>
                <Input id="ru-pass" type="password" autoComplete="new-password" {...registerForm.register("password")} />
                {registerForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
                )}
              </div>
              <p className="font-body text-xs leading-relaxed text-muted-foreground">{t.upgradeHint}</p>
              <Button type="submit" className="w-full rounded-full bg-gold text-primary-foreground hover:bg-gold/90" disabled={registerMutation.isPending}>
                {t.submitUp}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
