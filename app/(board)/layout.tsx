import { cookies } from "next/headers";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";
import PinScreen from "@/components/PinScreen";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

// Every page sits behind the PIN and inside the sidebar shell.
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthed((await cookies()).get(AUTH_COOKIE)?.value)) return <PinScreen />;
  return <Shell>{children}</Shell>;
}
