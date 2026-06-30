import type { Metadata } from "next";
import MasterReportsRouteShell from "./MasterReportsRouteShell";

// Page metadata — see Master Consolidated Reporting design §14.1.
export const metadata: Metadata = {
  title: "Master Consolidated Reports",
};

/**
 * Master Consolidated Reports route entry.
 *
 * This is a Next.js App Router server component that mounts the client-side
 * `<MasterReportsRouteShell>` gate. The gate enforces the page-level
 * `reports.view` permission (Req 9.3, 9.4) and renders the placeholder shell
 * for `<MasterReportsPage>`; task 19.2 will replace that placeholder with the
 * real shell implementation.
 */
export default function MasterReportsPage() {
  return <MasterReportsRouteShell />;
}
