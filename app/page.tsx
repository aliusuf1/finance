import HisabDashboard from "../components/hisab-dashboard";

export const dynamic = "force-dynamic";

function SetupRequired() {
  return <main className="setup-required"><section><span className="brand">Hisab</span><h1>Connect Clerk and Supabase</h1><p>The application code is ready. Add the Clerk publishable/secret keys and Supabase project URL/server secret to <code>.env.local</code>, run the included Supabase migration, then restart the server.</p></section></main>;
}

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <SetupRequired />;
  return <HisabDashboard />;
}
