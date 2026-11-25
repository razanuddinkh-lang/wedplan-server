import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { escapeRegex, serialize } from "../utils/serialize";

const router = Router();
const serviceSchema = z.object({
  serviceName: z.string().trim().min(3).max(90),
  category: z.enum(["Photography & Videography", "Wedding Venues", "Decoration & Florist", "Catering Services", "Makeup & Styling", "Wedding Fashion"]),
  description: z.string().trim().min(20).max(3000),
  price: z.coerce.number().positive().max(100000000),
  location: z.string().trim().min(2).max(120),
  images: z.array(z.string().url()).min(1).max(5),
  isActive: z.boolean().optional(),
});
async function attachVendors(docs: Record<string, any>[]) {
  const ids = [...new Set(docs.map((doc) => String(doc.vendorId)))];
  const vendors = await getDb().collection("users").find({ $or: [{ _id: { $in: ids } }, { id: { $in: ids } }] }).project({ name: 1, image: 1, businessName: 1, subscriptionPlan: 1 }).toArray();
  const byId = new Map(vendors.map((v) => [String(v._id ?? v.id), v]));
  return docs.map((doc) => {
    const vendor = byId.get(String(doc.vendorId));
    return { ...serialize(doc), vendor: vendor ? { id: String(vendor._id ?? vendor.id), name: vendor.name, image: vendor.image, businessName: vendor.businessName, subscriptionPlan: vendor.subscriptionPlan || "free" } : undefined };
  });
}

// Public marketplace endpoint: only approved and active services are returned.
router.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
  const filter: Record<string, any> = { status: "approved", isActive: true };
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "");
  const location = String(req.query.location || "").trim();
  if (search) { const regex = new RegExp(escapeRegex(search), "i"); filter.$or = [{ serviceName: regex }, { description: regex }]; }
  if (category && categories.includes(category)) filter.category = category;
  if (location) filter.location = new RegExp(escapeRegex(location), "i");
  const sort = String(req.query.sort || "newest");
  const sortSpec: import("mongodb").Sort = sort === "price_asc" ? { price: 1 } : sort === "price_desc" ? { price: -1 } : { createdAt: -1 };
  const [docs, total] = await Promise.all([
    getDb().collection("services").find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit).toArray(),
    getDb().collection("services").countDocuments(filter),
  ]);
  res.json({ services: await attachVendors(docs), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

// Vendor's own listings. Kept before /:id so "mine" is not treated as an ObjectId.
router.get("/mine", authenticate, requireRole("vendor"), asyncHandler(async (req, res) => {
  const docs = await getDb().collection("services").find({ vendorId: req.user!.id }).sort({ createdAt: -1 }).toArray();
  res.json({ services: docs.map(serialize) });
}));

router.get("/:id", authenticate, asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Service not found.");
  const doc = await getDb().collection("services").findOne({ _id: new ObjectId(req.params.id), status: "approved", isActive: true });
  if (!doc) throw new HttpError(404, "Service not found or not available.");
  const [service] = await attachVendors([doc]);
  res.json({ service });
}));

router.post("/", authenticate, requireRole("vendor"), asyncHandler(async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid service details.");
  const now = new Date();
  const document = {
    ...parsed.data,
    vendorId: req.user!.id,
    status: "pending",
    isActive: parsed.data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  const result = await getDb().collection("services").insertOne(document);
  res.status(201).json({ message: "Service submitted for admin review.", service: { ...document, id: result.insertedId.toString() } });
}));

router.patch("/:id", authenticate, requireRole("vendor"), asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Service not found.");
  const collection = getDb().collection("services");
  const existing = await collection.findOne({ _id: new ObjectId(req.params.id), vendorId: req.user!.id });
  if (!existing) throw new HttpError(404, "Service not found or you do not own it.");
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) throw new HttpError(400, "Provide valid service fields to update.");
  if (parsed.data.isActive === true && existing.status === "approved" && req.user!.subscriptionPlan !== "premium") {
    const activeCount = await collection.countDocuments({ vendorId: req.user!.id, status: "approved", isActive: true, _id: { $ne: existing._id } });
    if (activeCount >= 3) throw new HttpError(403, "Your Free plan allows up to 3 active services. Upgrade to Premium for unlimited listings.");
  }
  const contentChanged = Object.keys(parsed.data).some((key) => key !== "isActive");
  await collection.updateOne({ _id: existing._id, vendorId: req.user!.id }, { $set: { ...parsed.data, ...(contentChanged ? { status: "pending" } : {}), updatedAt: new Date() } });
  const updated = await collection.findOne({ _id: existing._id });
  res.json({ message: contentChanged ? "Service updated and sent for review." : "Service availability updated.", service: serialize(updated!) });
}));

router.delete("/:id", authenticate, asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Service not found.");
  const filter: Record<string, unknown> = { _id: new ObjectId(req.params.id) };
  if (req.user!.role === "vendor") filter.vendorId = req.user!.id;
  else if (req.user!.role !== "admin") throw new HttpError(403, "You cannot delete services.");
  const result = await getDb().collection("services").deleteOne(filter);
  if (!result.deletedCount) throw new HttpError(404, "Service not found or you do not own it.");
  res.json({ message: "Service deleted." });
}));

export default router;
