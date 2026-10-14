import { isValidDateString, todayString } from "@/lib/time";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date: requestedParam } = await searchParams;
  const requested = typeof requestedParam === "string" ? requestedParam : null;
  return <Board initialDate={isValidDateString(requested) ? requested : todayString()} />;
}
