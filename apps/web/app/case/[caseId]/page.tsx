import { notFound } from "next/navigation";
import { GameShell } from "@/components/game-shell";
import { CASE_CATALOG, isCaseId } from "@/lib/case-catalog";

export function generateStaticParams() {
  return CASE_CATALOG.map((entry) => ({ caseId: entry.id }));
}

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!isCaseId(caseId)) notFound();
  return <GameShell caseId={caseId} />;
}
