"use client";

import { SignUp } from "@clerk/react";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="auth-shell">
      <Suspense>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      </Suspense>
    </div>
  );
}
