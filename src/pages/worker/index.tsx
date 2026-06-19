import Head from "next/head";
import { RoleGate } from "@/components/auth/role-gate";
import { WorkerDashboard } from "@/components/worker/worker-dashboard";

export default function WorkerDashboardPage() {
  return (
    <>
      <Head>
        <title>Worker Dashboard | Task Web</title>
        <meta name="description" content="Worker dashboard for Task Web." />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <RoleGate requiredRole="worker">
        <WorkerDashboard />
      </RoleGate>
    </>
  );
}
