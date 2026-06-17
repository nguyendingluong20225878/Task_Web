import type { AppProps } from "next/app";
import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { AppNavigation } from "@/components/requestor/app-navigation";
import { RoleProvider } from "@/lib/auth/role-state";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <RoleProvider>
        <AppNavigation />
        <Component {...pageProps} />
      </RoleProvider>
    </Providers>
  );
}
