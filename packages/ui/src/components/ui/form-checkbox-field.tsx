import type { ComponentProps } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Checkbox } from "./checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";

type FormCheckboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
} & Omit<ComponentProps<typeof Checkbox>, "name" | "checked" | "onCheckedChange">;

export function FormCheckboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, label, ...checkboxProps }: FormCheckboxFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-2">
          <FormControl>
            <Checkbox {...checkboxProps} checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
          <FormLabel weight="normal">{label}</FormLabel>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
