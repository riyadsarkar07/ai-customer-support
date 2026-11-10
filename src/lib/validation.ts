import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z
    .string()
    .trim()
    .min(2, "Business name is too short")
    .max(120),
  planSlug: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const switchOrgSchema = z.object({ organizationId: z.string().uuid() });

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "agent", "viewer"]),
});

export const conversationCreateSchema = z.object({
  contactId: z.string().uuid(),
  channelConnectionId: z.string().uuid(),
  subject: z.string().max(200).optional(),
});

export const messageSendSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(8000),
  internal: z.boolean().optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .optional(),
});

export const channelCreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("telegram"),
    name: z.string().trim().min(1).max(80),
    botToken: z.string().trim().min(20, "Invalid bot token"),
  }),
  z.object({
    type: z.literal("website"),
    name: z.string().trim().min(1).max(80),
    allowedOrigins: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal("")),
  }),
]);

export const aiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["openai"]).optional(),
  model: z.string().trim().max(80).optional(),
  personality: z.string().max(2000).optional(),
  tone: z.enum(["friendly", "professional", "casual", "formal"]).optional(),
  languages: z.array(z.enum(["en", "bn"])).min(1).optional(),
  autoDetectLanguage: z.boolean().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  handoverOnLowConfidence: z.boolean().optional(),
  businessRules: z.string().max(8000).optional(),
  greetingMessage: z.string().max(500).optional(),
  aiPaused: z.boolean().optional(),
  maxContextChunks: z.number().int().min(1).max(12).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

export const workflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  trigger: z.object({
    type: z.enum([
      "message_received",
      "conversation_created",
      "keyword_match",
    ]),
    config: z.record(z.unknown()).default({}),
  }),
  conditions: z.array(z.record(z.unknown())).max(20).default([]),
  actions: z
    .array(z.record(z.unknown()))
    .min(1, "At least one action is required")
    .max(20),
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  description: z.string().max(500).optional(),
  price: z.number().min(0),
  currency: z.string().length(3).default("BDT"),
  interval: z.enum(["monthly", "yearly", "lifetime"]).default("monthly"),
  trialDays: z.number().int().min(0).max(365).default(14),
  maxAgents: z.number().int().min(1).default(3),
  maxConversations: z.number().int().min(100).default(1000),
  maxChannels: z.number().int().min(1).default(1),
  maxKnowledgeMb: z.number().int().min(1).default(10),
  maxAiReplies: z.number().int().min(0).default(500),
  features: z.array(z.string().max(120)).max(30).default([]),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  timezone: z.string().max(60).optional(),
  locale: z.enum(["en", "bn"]).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  logoUrl: z.string().max(500).optional().or(z.literal("")),
});

export const checkoutSchema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(["sslcommerz", "bkash", "nagad", "manual"]),
});

export const websiteChatInitSchema = z.object({
  publicKey: z.string().min(10),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const websiteChatMessageSchema = z.object({
  publicKey: z.string().min(10),
  visitorToken: z.string().min(10),
  message: z.string().trim().min(1).max(4000),
});
