import Head from "next/head";
import { RoleGate } from "@/components/auth/role-gate";
import { RequestorTasksPage } from "@/components/requestor/requestor-pages";

export default function Page() {
  return (
    <>
      <Head>
        <title>Task đã tạo</title>
      </Head>
      <RoleGate requiredRole="requestor">
        <RequestorTasksPage />
      </RoleGate>
    </>
  );
}
