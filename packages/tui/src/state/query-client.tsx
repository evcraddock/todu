import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JSX, ReactNode } from "react";

export function createTuiQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}

export interface TuiQueryProviderProps {
  client: QueryClient;
  children: ReactNode;
}

export function TuiQueryProvider({ client, children }: TuiQueryProviderProps): JSX.Element {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
