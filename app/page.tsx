import HisabDashboard from "../components/hisab-dashboard";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <HisabDashboard user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
