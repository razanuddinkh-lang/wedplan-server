import { Router } from "express";
import { z } from "zod";
import { getDb } from "../config/db";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
const router = Router();
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  image: z.string().url().optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
}).strict();
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await getDb().collection("users").findOne({ $or: [{ _id: req.user!.id }, { id: req.user!.id }] });
  if (!user) throw new HttpError(404, "Account not found.");
  res.json({ user: { id: req.user!.id, name: user.name, email: user.email, image: user.image, role: user.role, businessName: user.businessName, subscriptionPlan: user.subscriptionPlan, subscriptionExpiresAt: user.subscriptionExpiresAt } });
}));
router.patch("/me", authenticate, asyncHandler(async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) throw new HttpError(400, "Provide valid profile fields.");
  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (req.user!.role !== "vendor") delete updates.businessName;
  const result = await getDb().collection("users").updateOne({ $or: [{ _id: req.user!.id }, { id: req.user!.id }] }, { $set: updates });
  if (!result.matchedCount) throw new HttpError(404, "Account not found.");
  res.json({ message: "Profile updated." });
}));
export default router;
