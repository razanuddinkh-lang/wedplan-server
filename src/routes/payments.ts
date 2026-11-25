import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { env } from "../config/env";
import { getDb } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
const router = Router();
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!env.stripeSecretKey) throw new HttpError(503, "Stripe is not configured on the server.");
  if (!stripeClient) stripeClient = new Stripe(env.stripeSecretKey);
  return stripeClient;
}

router.post("/create-checkout-session", authenticate, requireRole("vendor"), asyncHandler(async (req, res) => {
  // The vendor identity always comes from the verified session; client-supplied IDs are ignored.
  if (req.user!.subscriptionPlan === "premium") throw new HttpError(409, "Your account is already on the Premium plan.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{
      price_data: {
        currency: env.stripeCurrency,
        unit_amount: env.stripePremiumPriceCents,
        recurring: { interval: "month" },
        product_data: { name: "WedPlan Premium Vendor Plan", description: "Unlimited active services and Premium vendor badge." },
      },
      quantity: 1,
    }],
    success_url: `${env.clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.clientUrl}/payment/cancel`,
    client_reference_id: req.user!.id,
    metadata: { vendorId: req.user!.id, plan: "premium" },
    subscription_data: { metadata: { vendorId: req.user!.id, plan: "premium" } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new HttpError(502, "Stripe did not return a Checkout URL.");
  res.status(201).json({ url: session.url, sessionId: session.id });
}));

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date {
  const raw = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return raw ? new Date(raw * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!env.stripeWebhookSecret) { res.status(503).json({ message: "Stripe webhook is not configured." }); return; }
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") { res.status(400).json({ message: "Missing Stripe signature." }); return; }
  let event: Stripe.Event;
  try {
    // Stripe requires the exact raw request body; do not place express.json() before this route.
    event = getStripe().webhooks.constructEvent(req.body as Buffer, signature, env.stripeWebhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe signature.";
    res.status(400).json({ message: `Webhook signature verification failed: ${message}` });
    return;
  }

  const users = getDb().collection("users");
  const transactions = getDb().collection("transactions");
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const vendorId = session.metadata?.vendorId || session.client_reference_id;
      if (session.mode === "subscription" && vendorId && session.payment_status === "paid") {
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (subscriptionId) {
          try { const sub = await getStripe().subscriptions.retrieve(subscriptionId); expiresAt = subscriptionPeriodEnd(sub); } catch (error) { console.error("Could not retrieve Stripe subscription period:", error); }
        }
        await users.updateOne({ $or: [{ _id: vendorId }, { id: vendorId }], role: "vendor" }, { $set: { subscriptionPlan: "premium", subscriptionExpiresAt: expiresAt, stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id, updatedAt: new Date() } });
        try {
          await transactions.insertOne({ vendorId, plan: "premium", amount: (session.amount_total || 0) / 100, currency: session.currency || env.stripeCurrency, stripeSessionId: session.id, stripeSubscriptionId: subscriptionId || null, status: "paid", createdAt: new Date() });
        } catch (error: any) { if (error?.code !== 11000) throw error; }
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const vendorId = subscription.metadata?.vendorId;
      if (vendorId) {
        const active = subscription.status === "active" || subscription.status === "trialing";
        await users.updateOne({ $or: [{ _id: vendorId }, { id: vendorId }], role: "vendor" }, { $set: {
          subscriptionPlan: active ? "premium" : "free",
          subscriptionExpiresAt: active ? subscriptionPeriodEnd(subscription) : null,
          updatedAt: new Date(),
        } });
        if (!active) {
          // Once Premium expires, retain at most the three most recently created approved active listings.
          const activeServices = await getDb().collection("services")
            .find({ vendorId, status: "approved", isActive: true })
            .sort({ createdAt: -1 })
            .toArray();
          const excessIds = activeServices.slice(3).map((service) => service._id);
          if (excessIds.length) {
            await getDb().collection("services").updateMany(
              { _id: { $in: excessIds }, vendorId },
              { $set: { isActive: false, updatedAt: new Date() } },
            );
          }
        }
      }
    }
    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);
    res.status(500).json({ message: "Webhook processing failed. Stripe may retry this event." });
  }
}

export default router;
