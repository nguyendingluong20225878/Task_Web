import Head from "next/head";
import type { GetServerSideProps } from "next";
import { RoleGate } from "@/components/auth/role-gate";
import { RequestorTaskDetailPage } from "@/components/requestor/requestor-pages";

export default function Page({ id }: { id: string }) {
  return (
    <>
      <Head>
        <title>Quản lý task</title>
      </Head>
      <RoleGate requiredRole="requestor">
        <RequestorTaskDetailPage taskId={decodeURIComponent(id)} />
      </RoleGate>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => ({
  props: {
    id: typeof params?.id === "string" ? params.id : "",
  },
});
