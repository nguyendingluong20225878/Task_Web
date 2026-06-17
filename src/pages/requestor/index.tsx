import Head from "next/head";
import { RoleGate } from "@/components/auth/role-gate";
import { RequestorDashboardPage } from "@/components/requestor/requestor-pages";

export default function Page() {
  return (
    <>
      <Head>
        <title>Requestor Dashboard</title>
      </Head>
      <RoleGate requiredRole="requestor">
        <RequestorDashboardPage />
      </RoleGate>
    </>
  );
}
