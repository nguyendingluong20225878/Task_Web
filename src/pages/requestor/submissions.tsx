import Head from "next/head";
import { RoleGate } from "@/components/auth/role-gate";
import { RequestorSubmissionsPage } from "@/components/requestor/requestor-pages";

export default function Page() {
  return (
    <>
      <Head>
        <title>Theo dõi submission</title>
      </Head>
      <RoleGate requiredRole="requestor">
        <RequestorSubmissionsPage />
      </RoleGate>
    </>
  );
}
