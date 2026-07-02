import { z } from "zod";

export const CreateCircleReqSchema = z.object({
  name: z.string().min(1, "Circle name is required"),
  contributionMinor: z.number().int().positive("Contribution must be positive"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  totalSlots: z.number().int().min(2, "Circle must have at least 2 slots"),
  startDeadline: z.coerce.date().refine((val) => val > new Date(), {
    message: "Start deadline must be in the future",
  }),
});

export const InviteReqSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export const CircleSummaryResSchema = z.object({
  id: z.string(),
  name: z.string(),
  contributionMinor: z.number().int(),
  currency: z.string(),
  frequency: z.string(),
  status: z.string(),
  totalSlots: z.number().int(),
  createdAt: z.date().or(z.string()),
  myRole: z.string().optional(),
  myStatus: z.string().optional(),
  filledSlots: z.number().int(),
});

export const MemberDetailSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    image: z.string().nullable(),
  }),
  role: z.string(),
  payoutPosition: z.number().int(),
  status: z.string(),
  vaProvisionStatus: z.string(),
});

export const InviteDetailSchema = z.object({
  id: z.string(),
  invitedUser: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    image: z.string().nullable(),
  }),
  status: z.string(),
  expiresAt: z.date().or(z.string()),
});

export const CycleDetailSchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  status: z.string(),
  potExpectedMinor: z.number().int(),
  potCollectedMinor: z.number().int(),
  deadline: z.date().or(z.string()),
  recipientMembershipId: z.string(),
  payout: z.object({
    id: z.string(),
    status: z.string(),
    amountMinor: z.number().int(),
    failureReason: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const ContributionDetailSchema = z.object({
  membershipId: z.string(),
  amountMinor: z.number().int(),
  status: z.string(),
});

export const CircleDetailResSchema = z.object({
  id: z.string(),
  name: z.string(),
  contributionMinor: z.number().int(),
  currency: z.string(),
  frequency: z.string(),
  status: z.string(),
  totalSlots: z.number().int(),
  startDeadline: z.date().or(z.string()).nullable(),
  createdAt: z.date().or(z.string()),
  members: z.array(MemberDetailSchema),
  invites: z.array(InviteDetailSchema),
  currentCycle: CycleDetailSchema.nullable().optional(),
  contributions: z.array(ContributionDetailSchema).optional(),
});

export const InviteResSchema = z.object({
  id: z.string(),
  circle: z.object({
    id: z.string(),
    name: z.string(),
    contributionMinor: z.number().int(),
    frequency: z.string(),
  }),
  invitedBy: z.object({
    name: z.string(),
    username: z.string(),
  }),
  status: z.string(),
  expiresAt: z.date().or(z.string()),
});

export const CreateCircleResSchema = z.object({
  id: z.string(),
});

export const CreateInviteResSchema = z.object({
  id: z.string(),
  circleId: z.string(),
  invitedUserId: z.string(),
  status: z.string(),
});

export type CircleSummaryRes = z.infer<typeof CircleSummaryResSchema>;
export type CircleDetailRes = z.infer<typeof CircleDetailResSchema>;
export type InviteRes = z.infer<typeof InviteResSchema>;
export type CreateCircleRes = z.infer<typeof CreateCircleResSchema>;
export type CreateInviteRes = z.infer<typeof CreateInviteResSchema>;
