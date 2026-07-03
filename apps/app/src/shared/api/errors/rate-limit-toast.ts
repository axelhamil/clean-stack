import { toast } from "sonner";

interface RateLimitToastOptions {
  message: string;
  seconds: number;
}

export function showRateLimitToast({ message, seconds }: RateLimitToastOptions): void {
  if (seconds <= 0) {
    toast.error(message);
    return;
  }

  const id = `rate-limit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let remaining = seconds;

  const interval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(interval);
      toast.dismiss(id);
      return;
    }
    toast.error(message, {
      id,
      description: `Try again in ${remaining}s`,
      duration: Number.POSITIVE_INFINITY,
      onDismiss: () => clearInterval(interval),
    });
  }, 1000);

  toast.error(message, {
    id,
    description: `Try again in ${remaining}s`,
    duration: Number.POSITIVE_INFINITY,
    onDismiss: () => clearInterval(interval),
  });
}
