import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { escapeRegex, serialize } from "../utils/serialize";
const router = Router();
router.use(authenticate, requireRole("admin"));

router.get("/users", asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  const role = String(req.query.role || ""); const search = String(req.query.search || "").trim();
  if (["admin", "vendor", "customer"].includes(role)) filter.role = role;
  if (search) { const regex = new RegExp(escapeRegex(search), "i"); filter.$or = [{ name: regex }, { email: regex }]; }
  const docs = await getDb().collection("users").find(filter).project({ name: 1, email: 1, image: 1, role: 1, isBlocked: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(200).toArray();
  res.json({ users: docs.map((u) => ({ id: String(u._id ?? u.id), name: u.name, email: u.email, image: u.image, role: u.role, isBlocked: Boolean(u.isBlocked), createdAt: u.createdAt })) });
}));

router.patch("/users/:id/block", asyncHandler(async (req, res) => {
  const parsed = z.object({ isBlocked: z.boolean() }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "isBlocked must be true or false.");
  if (req.params.id === req.user!.id) throw new HttpError(400, "You cannot block your own admin account.");
  const result = await getDb().collection("users").updateOne({ $or: [{ _id: req.params.id }, { id: req.params.id }] }, { $set: { isBlocked: parsed.data.isBlocked, updatedAt: new Date() } });
  if (!result.matchedCount) throw new HttpError(404, "User not found.");
  res.json({ message: parsed.data.isBlocked ? "User blocked." : "User unblocked." });
}));

router.get("/services", asyncHandler(async (req, res) => {
  const status = String(req.query.status || "pending"); const search = String(req.query.search || "").trim();
  const filter: Record<string, unknown> = {};
  if (["pending", "approved", "rejected"].includes(status)) filter.status = status;
  if (search) { const regex = new RegExp(escapeRegex(search), "i"); filter.$or = [{ serviceName: regex }, { location: regex }, { category: regex }]; }
  const docs = await getDb().collection("services").find(filter).sort({ createdAt: -1 }).limit(200).toArray();
  const vendorIds = [...new Set(docs.map((d) => String(d.vendorId)))];
  const vendors = await getDb().collection("users").find({ $or: [{ _id: { $in: vendorIds } }, { id: { $in: vendorIds } }] }).project({ name: 1, businessName: 1, image: 1 }).toArray();
  const vendorMap = new Map(vendors.map((v) => [String(v._id ?? v.id), v]));
  res.json({ services: docs.map((d) => { const v = vendorMap.get(String(d.vendorId)); return { ...serialize(d), vendor: v ? { name: v.name, businessName: v.businessName, image: v.image } : undefined }; }) });
}));

router.patch("/services/:id/status", asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Service not found.");
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Status must be approved or rejected.");
  const services = getDb().collection("services");
  const service = await services.findOne({ _id: new ObjectId(req.params.id) });
  if (!service) throw new HttpError(404, "Service not found.");
  if (parsed.data.status === "approved") {
    const vendor = await getDb().collection("users").findOne({ $or: [{ _id: String(service.vendorId) }, { id: String(service.vendorId) }] });
    if ((vendor?.subscriptionPlan || "free") !== "premium") {
      const activeCount = await services.countDocuments({ vendorId: String(service.vendorId), status: "approved", isActive: true, _id: { $ne: service._id } });
      if (activeCount >= 3 && service.isActive !== false) throw new HttpError(409, "This vendor has reached the Free plan limit of 3 active services. The vendor must upgrade or deactivate another service.");
    }
  }
  await services.updateOne({ _id: service._id }, { $set: { status: parsed.data.status, updatedAt: new Date() } });
  res.json({ message: `Service ${parsed.data.status}.` });
}));

router.delete("/services/:id", asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Service not found.");
  const result = await getDb().collection("services").deleteOne({ _id: new ObjectId(req.params.id) });
  if (!result.deletedCount) throw new HttpError(404, "Service not found.");
  res.json({ message: "Service deleted." });
}));

router.get("/transactions", asyncHandler(async (_req, res) => {
  const docs = await getDb().collection("transactions").find({}).sort({ createdAt: -1 }).limit(500).toArray();
  const ids = [...new Set(docs.map((d) => String(d.vendorId)))];
  const vendors = await getDb().collection("users").find({ $or: [{ _id: { $in: ids } }, { id: { $in: ids } }] }).project({ name: 1, businessName: 1 }).toArray();
  const map = new Map(vendors.map((v) => [String(v._id ?? v.id), v]));
  res.json({ transactions: docs.map((d) => ({ ...serialize(d), vendorName: map.get(String(d.vendorId))?.businessName || map.get(String(d.vendorId))?.name })) });
}));
export default router;
