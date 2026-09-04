import DashboardGate from "./dashboard-gate";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <DashboardGate sessionId={session?.trim() || undefined} />;
}
