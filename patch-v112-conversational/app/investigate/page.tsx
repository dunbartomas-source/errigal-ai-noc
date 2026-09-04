import type { Metadata } from "next";
import DashboardGate from "../dashboard-gate";

export const metadata: Metadata = {
  title: "Guided Investigation | Errigal AI-NOC",
  description:
    "A conversational, evidence-led AI-NOC workflow for alarm triage, OEM checks, correlation, resolution, verification, and escalation.",
};

export default function GuidedInvestigationPage() {
  return <DashboardGate />;
}
