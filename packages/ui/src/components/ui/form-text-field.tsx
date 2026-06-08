import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Button } from "./button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Input } from "./input";

interface FormTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<ComponentProps<typeof Input>, "name" | "form"> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  description?: string;
}

export function FormTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  type,
  ...inputProps
}: FormTextFieldProps<TFieldValues, TName>) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {isPassword ? (
              <div className="relative">
                <Input type={inputType} className="pr-10" {...inputProps} {...field} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute inset-y-0 right-1 my-auto"
                  onClick={() => setRevealed((value) => !value)}
                  aria-label={revealed ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {revealed ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </div>
            ) : (
              <Input type={type} {...inputProps} {...field} />
            )}
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
