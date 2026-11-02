export function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function argument(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);

  return index === -1 ? undefined : argv[index + 1];
}

export function requiredArgument(argv: readonly string[], name: string, usage: string): string {
  const value = argument(argv, name);

  if (!value) {
    throw new Error(usage);
  }

  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
