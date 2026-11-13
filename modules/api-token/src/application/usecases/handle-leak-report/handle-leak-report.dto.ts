export interface LeakReportEntry {
  token: string;
  type: string;
}

export interface HandleLeakReportInput {
  entries: LeakReportEntry[];
}

export interface LeakVerdict {
  token_raw: string;
  token_type: string;
  label: "true_positive" | "false_positive";
}
