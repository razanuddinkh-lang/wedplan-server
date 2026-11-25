import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongodbUri: required("MONGODB_URI"),
  mongodbDbName: process.env.MONGODB_DB_NAME || "wedplan",
  betterAuthUrl: (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, ""),
  clientUrl: (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, ""),
  imgbbApiKey: process.env.IMGBB_API_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePremiumPriceCents: Number(process.env.STRIPE_PREMIUM_PRICE_CENTS || 2900),
  stripeCurrency: (process.env.STRIPE_CURRENCY || "usd").toLowerCase(),
};
