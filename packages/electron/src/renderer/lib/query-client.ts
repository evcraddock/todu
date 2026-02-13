import { MutationCache, QueryClient } from "@tanstack/react-query";
import { showToast } from "../components/ToastContainer.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus — we use change notifications instead
      refetchOnWindowFocus: false,
      // Keep data for 5 minutes before considering it stale
      staleTime: 5 * 60 * 1000,
      // Retry once on failure
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Something went wrong";
      showToast(message, "error");
    },
  }),
});

/**
 * Set up the change notification listener.
 * When the main process pushes a `todu:data:changed` event,
 * invalidate all React Query caches so views re-fetch.
 */
export function setupChangeListener(): () => void {
  return window.todu.on("todu:data:changed", () => {
    queryClient.invalidateQueries();
  });
}
