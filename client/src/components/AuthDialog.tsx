import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type AuthMode = "login" | "register";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AuthDialog({
  open,
  onOpenChange,
}: AuthDialogProps) {
  const utils = trpc.useUtils();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async user => {
      utils.auth.me.setData(undefined, user);
      await utils.auth.me.invalidate();

      resetForm();
      onOpenChange(false);
    },
    onError: error => {
      setError(error.message || "Unable to sign in.");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async user => {
      utils.auth.me.setData(undefined, user);
      await utils.auth.me.invalidate();

      resetForm();
      onOpenChange(false);
    },
    onError: error => {
      setError(error.message || "Unable to create account.");
    },
  });

  const isPending =
    loginMutation.isPending || registerMutation.isPending;

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return;

    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();

    if (mode === "register") {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      registerMutation.mutate({
        name: name.trim(),
        email: trimmedEmail,
        password,
      });

      return;
    }

    loginMutation.mutate({
      email: trimmedEmail,
      password,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login"
              ? "Sign in to Night City DeckLab"
              : "Create your DeckLab account"}
          </DialogTitle>

          <DialogDescription>
            {mode === "login"
              ? "Sign in to sync your collection, decks, scans, and activity."
              : "Create a local account to keep your DeckLab data on your server."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="auth-name">Name</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                disabled={isPending}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              disabled={isPending}
              minLength={8}
              required
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
            >
              {isPending
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </DialogFooter>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                onClick={() => switchMode("register")}
                disabled={isPending}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                onClick={() => switchMode("login")}
                disabled={isPending}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}