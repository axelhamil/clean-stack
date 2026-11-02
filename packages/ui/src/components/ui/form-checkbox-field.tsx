import type { ComponentProps, ReactNode } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Checkbox } from "./checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";

interface FormCheckboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<ComponentProps<typeof Checkbox>, "name" | "checked" | "onCheckedChange"> {
  control: Control<TFieldValues>;
  name: TName;
  /** Rich content allowed (inline links), so the label wraps as running text. */
  label: ReactNode;
}

export function FormCheckboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, label, ...checkboxProps }: FormCheckboxFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox {...checkboxProps} checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel weight="normal" className="block leading-normal">
              {label}
            </FormLabel>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
