import InvestigationChat from "./investigate/investigation-chat";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <InvestigationChat sessionId={session?.trim() || undefined} />;
}
