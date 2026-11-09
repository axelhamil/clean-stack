export const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
];

export const PRIVATE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
];
