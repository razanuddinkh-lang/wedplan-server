import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import servicesRouter from "./routes/services";
import bookingsRouter from "./routes/bookings";
import usersRouter from "./routes/users";
import dashboardRouter from "./routes/dashboard";
import adminRouter from "./routes/admin";
import uploadsRouter from "./routes/uploads";
import paymentsRouter, { stripeWebhookHandler } from "./routes/payments";
import { notFound, errorHandler } from "./middleware/error-handler";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
const allowedOrigins = new Set([env.clientUrl]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
}));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "WedPlan API", timestamp: new Date().toISOString() }));

// This endpoint must receive a raw Buffer for Stripe signature verification.
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "1mb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/payments", paymentsRouter);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  app.listen(env.port, () => console.log(`WedPlan API listening at http://localhost:${env.port}`));
}

start().catch((error) => {
  console.error("Failed to start WedPlan API:", error);
  process.exit(1);
});
