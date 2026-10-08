"use client";

import { useState, useEffect } from "react";
import { ImmersiveWizard } from "./components/immersive-wizard";
import { LoginScreen } from "./components/login-screen";

export default function Home() {
  const [auth, setAuth] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    fetch("/api/auth/check")
      .then((res) => setAuth(res.ok ? "authenticated" : "unauthenticated"))
      .catch(() => setAuth("unauthenticated"));
  }, []);

  if (auth === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (auth === "unauthenticated") {
    return <LoginScreen onLogin={() => setAuth("authenticated")} />;
  }

  return <ImmersiveWizard />;
}
