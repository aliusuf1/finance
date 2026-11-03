"use client";

import { SignIn } from "@clerk/react";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="auth-shell">
      <Suspense>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </Suspense>
    </div>
  );
}
