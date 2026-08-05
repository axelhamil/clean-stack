import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { useForm } from "react-hook-form";
import { type BanFormInput, banFormSchema } from "../admin-users.schema";

const DURATION_OPTIONS = [
  { label: "24 hours", value: String(86400) },
  { label: "7 days", value: String(604800) },
  { label: "30 days", value: String(2592000) },
  { label: "Permanent", value: "permanent" },
] as const;

interface BanFormProps {
  isPending: boolean;
  onSubmit: (values: BanFormInput) => void;
}

export function BanForm({ isPending, onSubmit }: BanFormProps) {
  const form = useForm<BanFormInput>({
    resolver: zodResolver(banFormSchema),
    mode: "onChange",
    defaultValues: { reason: "", expiresIn: undefined },
  });

  const reason = form.watch("reason");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason</FormLabel>
              <FormControl>
                <Textarea placeholder="Reason for suspension…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiresIn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration</FormLabel>
              <Select
                value={field.value !== undefined ? String(field.value) : "permanent"}
                onValueChange={(v) => field.onChange(v === "permanent" ? undefined : Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="destructive" disabled={!reason.trim() || isPending}>
          Suspend account
        </Button>
      </form>
    </Form>
  );
}
