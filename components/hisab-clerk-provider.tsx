"use client";

import { ClerkProvider } from "@clerk/react";

export default function HisabClerkProvider({ children, publishableKey }: { children: React.ReactNode; publishableKey: string }) {
  return <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up">{children}</ClerkProvider>;
}
