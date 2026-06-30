"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { Loader2 } from "lucide-react"

import { CreateCircleReqSchema } from "@/app/api/circles/dto/circles.dto"
import { useCreateCircle } from "../mutations"
import { nairaToMinor } from "@/lib/money"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { Card, CardContent } from "@workspace/ui/components/card"

// We create a frontend schema where contribution is a string (since it comes from an input)
// then we transform it to a number before passing it to the mutation.
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
  startDeadline: z.string().refine((val) => {
    return new Date(val) > new Date()
  }, "Start deadline must be in the future"),
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
      startDeadline: "",
    },
  })

  function onSubmit(data: FormValues) {
    const contributionMinor = nairaToMinor(parseFloat(data.contributionNaira))
    const totalSlots = parseInt(data.totalSlots, 10)
    const startDeadline = new Date(data.startDeadline)

    createCircle(
      {
        name: data.name,
        contributionMinor,
        frequency: data.frequency,
        totalSlots,
        startDeadline,
      },
      {
        onSuccess: (circle) => {
          router.push(`/circles/${circle.id}`)
        },
      }
    )
  }

  return (
    <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-base">
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Circle Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Vacation Fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="totalSlots"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Members</FormLabel>
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
                  <FormItem>
                    <FormLabel>Start Deadline</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormDescription>When does the circle officially start?</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Circle
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
