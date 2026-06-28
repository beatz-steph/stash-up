import * as React from "react"
import { Control, FieldPath, FieldValues, ControllerRenderProps } from "react-hook-form"
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@workspace/ui/components/form"
import { PasswordInput } from "@workspace/ui/components/password-input"

interface FormPasswordInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> extends React.ComponentProps<typeof PasswordInput> {
  name: TName
  label?: string
  control: Control<TFieldValues>
  description?: string
}

export function FormPasswordInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  name,
  label,
  control,
  description,
  ...props
}: FormPasswordInputProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }: { field: ControllerRenderProps<TFieldValues, TName> }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <PasswordInput {...field} {...props} value={(field.value as string) ?? ""} />
          </FormControl>
          {description && (
            <p className="font-su-sans text-su-caption text-su-muted">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
