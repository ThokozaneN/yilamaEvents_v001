import { z } from 'zod';

/**
 * YILAMA EVENTS: VALIDATION LAYER
 * Centralized schemas for consistent data integrity across the platform.
 */

// Common snippets
const emailSchema = z.string().email("Invalid email format").toLowerCase();
const phoneSchema = z.string().regex(/^(\+27|0)[6-8][0-9]{8}$/, "Invalid SA mobile number");

// Strong password validation
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/, "Password must contain at least one special character");

// AUTH SCHEMAS
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required")
});

export const signUpSchema = z.object({
  fullName: z.string().min(3, "Full name is required").max(100),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  phone: z.union([phoneSchema, z.literal('')]).optional(), // Make phone truly optional for attendees
  businessName: z.string().min(2, "Business name required").optional(),
  orgPhone: z.union([phoneSchema, z.literal('')]).optional(),
  idNumber: z.string().regex(/^\d{13}$/, "ID must be 13 digits").optional(),
  websiteUrl: z.string().url("Invalid URL").optional().or(z.literal(''))
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

// EVENT SCHEMAS
export const eventSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  category: z.string(),
  description: z.string().min(10, "Description must be at least 10 characters").max(3000),
  venue: z.string().min(5, "Venue address must be at least 5 characters"),
  starts_at: z.string().refine((val) => {
    if (!val) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d > new Date();
  }, { message: "Event must start in the future" }),
  parking_info: z.string().max(500).optional(),
  total_ticket_limit: z.number().int().min(1, "At least 1 ticket is required").max(100000)
});

export const ticketTierSchema = z.object({
  name: z.string().min(2, "Tier name required"),
  price: z.number().min(0, "Price cannot be negative").max(100000),
  quantity_limit: z.number().int().min(1, "Quantity must be at least 1")
});

// PROFILE SCHEMAS
export const profileUpdateSchema = z.object({
  name: z.string().min(3, "Name is too short"),
  business_name: z.string().min(2).optional(),
  organization_phone: phoneSchema.optional(),
  website_url: z.string().url().optional().or(z.literal('')),
  social_handles: z.object({
    instagram: z.string().optional(),
    twitter: z.string().optional(),
    facebook: z.string().optional()
  }).optional()
});