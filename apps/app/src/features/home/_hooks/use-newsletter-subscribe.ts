import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../../adapters/api-client";
import type { NewsletterInput } from "../_schemas/newsletter.schema";

export function useNewsletterSubscribe() {
  return useMutation({
    mutationFn: async (input: NewsletterInput) => {
      const res = await api.newsletter.subscribe.$post({ json: input });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: ({ email }) => {
      toast.success("Inscription confirmée", {
        description: `${email} recevra les prochains updates.`,
      });
    },
    onError: () => {
      toast.error("Inscription échouée", {
        description: "Réessaye dans un instant.",
      });
    },
  });
}
