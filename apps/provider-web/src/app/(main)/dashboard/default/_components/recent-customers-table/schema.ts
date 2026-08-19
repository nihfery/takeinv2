import z from "zod";

const recentCustomersSchema = z.object({
  bookingCount: z.number(),
  code: z.string(),
  currency: z.string(),
  email: z.string(),
  id: z.string(),
  lastBooking: z.string().nullable(),
  name: z.string(),
  status: z.string(),
  totalSpentMinor: z.number(),
});

export type RecentCustomerRow = z.infer<typeof recentCustomersSchema>;
