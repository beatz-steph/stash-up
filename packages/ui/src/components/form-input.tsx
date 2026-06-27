import * as React from "react"
import { Control, FieldPath, FieldValues, ControllerRenderProps } from "react-hook-form"
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "./form.js"
import { Input } from "./input.js"

interface FormInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> extends React.ComponentProps<typeof Input> {
  name: TName
  label?: string
  control: Control<TFieldValues>
  description?: string
}

export function FormInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  name,
  label,
  control,
  description,
  ...props
}: FormInputProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }: { field: ControllerRenderProps<TFieldValues, TName> }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input {...field} {...props} value={(field.value as string) ?? ""} />
          </FormControl>
          {description && (
            <p className="text-[0.8rem] text-muted-foreground">{description}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
