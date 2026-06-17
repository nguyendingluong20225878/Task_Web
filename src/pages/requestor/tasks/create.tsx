import Head from "next/head";
import { RoleGate } from "@/components/auth/role-gate";
import { RequestorCreateTaskPage } from "@/components/requestor/requestor-pages";

export default function Page() {
  return (
    <>
      <Head>
        <title>Tạo task mới</title>
      </Head>
      <RoleGate requiredRole="requestor">
        <RequestorCreateTaskPage />
      </RoleGate>
    </>
  );
}
