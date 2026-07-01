"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { Loader2 } from "lucide-react"

import { useCreateCircle } from "../mutations"
import { nairaToMinor } from "@/lib/money"
import { DatePicker } from "@/components/date-picker"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Card, CardContent } from "@workspace/ui/components/card"

// Inputs arrive as strings; transform to numbers/Date before sending to the API.
const formSchema = z.object({
  name: z.string().min(1, "Circle name is required"),
  contributionNaira: z.string().refine((val) => {
    const num = parseFloat(val)
    return !isNaN(num) && num > 0
  }, "Contribution must be a positive number"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  totalSlots: z.string().refine((val) => {
    const num = parseInt(val, 10)
    return !isNaN(num) && num >= 2
  }, "Circle must have at least 2 slots"),
  startDeadline: z
    .date({ message: "Pick a start deadline" })
    .refine((val) => val > new Date(), "Start deadline must be in the future"),
})

type FormValues = z.infer<typeof formSchema>

export function CreateCircleForm() {
  const router = useRouter()
  const { mutate: createCircle, isPending } = useCreateCircle()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contributionNaira: "",
      frequency: "MONTHLY",
      totalSlots: "",
      startDeadline: undefined,
    },
  })

  function onSubmit(data: FormValues) {
    createCircle(
      {
        name: data.name,
        contributionMinor: nairaToMinor(parseFloat(data.contributionNaira)),
        frequency: data.frequency,
        totalSlots: parseInt(data.totalSlots, 10),
        startDeadline: data.startDeadline,
      },
      {
        onSuccess: (circle) => {
          router.push(`/circles/${circle.id}`)
        },
      },
    )
  }

  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Circle name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vacation Fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contributionNaira"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contribution (₦)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="1" placeholder="5000" {...field} />
                    </FormControl>
                    <FormDescription>Amount each member contributes per period</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="totalSlots"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total members</FormLabel>
                    <FormControl>
                      <Input type="number" min="2" placeholder="5" {...field} />
                    </FormControl>
                    <FormDescription>Including yourself</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startDeadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start deadline</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select a date"
                        fromToday
                      />
                    </FormControl>
                    <FormDescription>All slots must be filled by this date</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full rounded-su-pill" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create circle
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
