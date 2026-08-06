import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { activeOrgQueryOptions } from "../../../shared/api/queries/active-org";
import { useAuthorization } from "../../../shared/auth/use-authorization";
import {
  API_SCOPES,
  EXPIRY_OPTIONS,
  type TokenFormInput,
  tokenFormSchema,
} from "../api-tokens.schema";

interface TokenFormProps {
  defaultValues: TokenFormInput;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: TokenFormInput) => void;
}

export function TokenForm({ defaultValues, submitLabel, isPending, onSubmit }: TokenFormProps) {
  const { hasMembership, can } = useAuthorization();
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const canCreateOrgToken = hasMembership && can({ apiToken: ["create"] });

  const form = useForm<TokenFormInput>({
    resolver: zodResolver(tokenFormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormTextField control={form.control} name="name" label="Token name" placeholder="My app" />

        <FormField
          control={form.control}
          name="scopes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scopes</FormLabel>
              <div className="flex flex-col gap-2">
                {API_SCOPES.map((scope) => (
                  <div key={scope} className="flex items-center gap-2">
                    <Checkbox
                      id={`scope-${scope}`}
                      checked={field.value.includes(scope)}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...field.value, scope]
                          : field.value.filter((s) => s !== scope);
                        field.onChange(next);
                      }}
                    />
                    <label htmlFor={`scope-${scope}`} className="cursor-pointer font-mono text-sm">
                      {scope}
                    </label>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {canCreateOrgToken && activeOrg && (
          <FormField
            control={form.control}
            name="organizationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token scope</FormLabel>
                <Select
                  value={field.value ?? "personal"}
                  onValueChange={(v) => field.onChange(v === "personal" ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value={activeOrg.id}>{activeOrg.name}</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="expiresInDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expiry</FormLabel>
              <Select
                value={field.value !== null ? String(field.value) : "never"}
                onValueChange={(v) => field.onChange(v === "never" ? null : Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.label}
                      value={opt.value !== null ? String(opt.value) : "never"}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
