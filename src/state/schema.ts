import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const filingStatus = z.enum(["single", "mfs", "hoh", "mfj", "qss"]);
export const stateCode = z.enum(["AK", "WA", "OR", "ID"]);
export const taxYear = z.union([z.literal(2025), z.literal(2026)]);
export const ownerKey = z.enum(["p1", "p2", "joint"]);
export const tierKey = z.enum([
  "income-growth",
  "balanced",
  "growth-income",
  "growth",
  "aggressive-growth",
  "custom",
]);

export const tierConfig = z.object({
  tier: tierKey,
  customMean: z.number().optional(),
  customStdev: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const personSchema = z.object({
  name: z.string().optional(),
  birthYear: z.number().int().min(1900).max(2025),
  retirementAge: z.number().min(40).max(90),
  currentSalary: z.number().min(0).default(0),
  salaryGrowth: z.number().default(0.03),
  longevityAge: z.number().min(60).max(120).default(95),
});
export type Person = z.infer<typeof personSchema>;

export const profileSchema = z.object({
  mode: z.enum(["single", "couple"]),
  person1: personSchema,
  person2: personSchema.optional(),
  filingStatus,
  state: stateCode,
  taxYear,
  inflation: z.number().min(0).max(0.20),
  dependents: z.number().int().min(0).default(0),
});
export type Profile = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

const baseAsset = z.object({
  id: z.string(),
  nickname: z.string().optional(),
  owner: ownerKey,
  balance: z.number().min(0),
});

const taxAdvantagedRetirement = baseAsset.extend({
  category: z.enum([
    "trad-401k",
    "roth-401k",
    "trad-ira",
    "roth-ira",
    "sep-ira",
    "hsa",
  ]),
  contributionPct: z.number().min(0).max(1).optional(), // for 401k-style
  employerMatchPct: z.number().min(0).max(1).optional(),
  annualContribution: z.number().min(0).optional(), // for IRA/HSA
  tier: tierConfig,
});

const brokerage = baseAsset.extend({
  category: z.literal("brokerage"),
  monthlyContribution: z.number().min(0).default(0),
  costBasis: z.number().min(0).default(0),
  tier: tierConfig,
});

const realEstate = baseAsset.extend({
  category: z.literal("real-estate"),
  subtype: z.enum(["primary", "vacation", "rental"]),
  marketValue: z.number().min(0),
  appreciation: z.number().default(0.035),
  mortgageBalance: z.number().min(0).default(0),
  basis: z.number().min(0).default(0),
  yearsOwned: z.number().min(0).default(0),
  monthlyRentIncome: z.number().min(0).default(0),
  monthlyRentExpense: z.number().min(0).default(0),
  actionAtRetirement: z.enum(["hold", "liquidate"]).default("hold"),
});

const otherAsset = baseAsset.extend({
  category: z.literal("other"),
  subtype: z.enum(["pension", "annuity", "business", "crypto", "metals"]),
  monthlyBenefit: z.number().min(0).optional(),
  startAge: z.number().min(0).max(120).optional(),
  cola: z.number().optional(),
  termYears: z.number().optional(), // annuity
  survivorPct: z.number().min(0).max(1).optional(),
  appreciation: z.number().optional(),
  expectedReturn: z.number().optional(),
  costBasis: z.number().min(0).optional(),
  actionAtRetirement: z.enum(["hold", "liquidate", "sell-over-years"]).optional(),
  sellOverYears: z.number().optional(),
});

export const assetSchema = z.discriminatedUnion("category", [
  taxAdvantagedRetirement,
  brokerage,
  realEstate,
  otherAsset,
]);
export type Asset = z.infer<typeof assetSchema>;

// ---------------------------------------------------------------------------
// Income streams
// ---------------------------------------------------------------------------

export const incomeStreamSchema = z.object({
  id: z.string(),
  label: z.string().default("Income"),
  owner: ownerKey,
  monthlyAmount: z.number().min(0),
  startAge: z.number().min(0).max(120),
  endAge: z.number().min(0).max(120).nullable().default(null), // null = lifetime
  growth: z.number().default(0), // 0 = follow inflation
  taxability: z.enum(["ordinary", "ltcg", "tax-free", "partial-ss"]).default("ordinary"),
});
export type IncomeStream = z.infer<typeof incomeStreamSchema>;

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const expenseCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  monthlyToday: z.number().min(0),
  growth: z.number().default(0), // 0 = follow inflation
  startAge: z.number().min(0).max(120).nullable().default(null), // null = retirement age
  endAge: z.number().min(0).max(120).nullable().default(null), // null = plan-to age
  phaseOutAtAge: z.number().min(0).max(120).nullable().default(null),
  stepChange: z
    .object({ atAge: z.number(), multiplier: z.number() })
    .nullable()
    .default(null),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

// ---------------------------------------------------------------------------
// Healthcare
// ---------------------------------------------------------------------------

export const healthcareSchema = z.object({
  acaTier: z.enum(["bronze", "silver", "gold"]).default("silver"),
  medigap: z.boolean().default(false),
  ltc: z.object({
    enabled: z.boolean().default(true),
    probability: z.number().min(0).max(1).default(0.6),
    annualCost: z.number().min(0).default(108_000),
    durationYears: z.number().min(0).default(2.5),
    insurance: z.object({
      enabled: z.boolean().default(false),
      annualPremium: z.number().min(0).default(0),
      dailyBenefit: z.number().min(0).default(0),
    }),
  }),
});
export type Healthcare = z.infer<typeof healthcareSchema>;

// ---------------------------------------------------------------------------
// Social Security
// ---------------------------------------------------------------------------

export const ssPersonSchema = z.object({
  pia: z.number().min(0).default(0),
  claimAge: z.number().min(62).max(70).default(67),
  alreadyClaiming: z.boolean().default(false),
});
export const socialSecuritySchema = z.object({
  person1: ssPersonSchema,
  person2: ssPersonSchema.optional(),
});
export type SocialSecurity = z.infer<typeof socialSecuritySchema>;

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

export const optionsSchema = z.object({
  withdrawalStrategy: z
    .enum(["default-tax-aware", "lumped", "tax-optimized", "roth-ladder"])
    .default("default-tax-aware"),
  bracketAdjustForInflation: z.boolean().default(true),
  rothConversionRule: z
    .object({
      enabled: z.boolean().default(false),
      fillToBracket: z.enum(["12", "22", "24", "32"]).default("24"),
      startAge: z.number().min(0).max(120).default(60),
      endAge: z.number().min(0).max(120).default(74),
    })
    .default({ enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }),
  monteCarlo: z
    .object({
      simulations: z.number().int().min(250).max(5000).default(500),
    })
    .default({ simulations: 500 }),
});
export type Options = z.infer<typeof optionsSchema>;

// ---------------------------------------------------------------------------
// Plan: the entire user input
// ---------------------------------------------------------------------------

export const planSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  profile: profileSchema,
  assets: z.array(assetSchema).default([]),
  incomeStreams: z.array(incomeStreamSchema).default([]),
  expenses: z.array(expenseCategorySchema).default([]),
  healthcare: healthcareSchema,
  socialSecurity: socialSecuritySchema,
  options: optionsSchema,
});
export type Plan = z.infer<typeof planSchema>;
