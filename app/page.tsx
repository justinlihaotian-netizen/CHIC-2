import { cookies } from "next/headers";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";
import { isValidDateString, todayString } from "@/lib/time";
import PinScreen from "@/components/PinScreen";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  if (!isAuthed((await cookies()).get(AUTH_COOKIE)?.value)) {
    return <PinScreen />;
  }
  const { date: requestedParam } = await searchParams;
  const requested = typeof requestedParam === "string" ? requestedParam : null;
  const date = isValidDateString(requested) ? requested : todayString();
  return <Board initialDate={date} />;
}
