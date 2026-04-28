export const duration = {
  instant: 0.08,
  fast: 0.12,
  base: 0.16,
  slow: 0.22,
} as const;

export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  outQuart: [0.25, 1, 0.5, 1] as const,
};

export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;
