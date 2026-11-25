import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { serialize } from "../utils/serialize";
const router = Router();
const bookingSchema = z.object({ serviceId: z.string().min(1), eventDate: z.string().min(10), eventLocation: z.string().trim().min(2).max(180), message: z.string().max(1500).optional().default("") });

async function enrich(docs: Record<string, any>[]) {
  const serviceIds = docs.map((b) => ObjectId.isValid(String(b.serviceId)) ? new ObjectId(String(b.serviceId)) : null).filter((id): id is ObjectId => id !== null);
  const services = await getDb().collection("services").find({ _id: { $in: serviceIds } }).toArray();
  const serviceMap = new Map(services.map((s) => [s._id.toString(), s]));
  const userIds = [...new Set(docs.flatMap((b) => [String(b.vendorId), String(b.customerId)]))];
  const users = await getDb().collection("users").find({ $or: [{ _id: { $in: userIds } }, { id: { $in: userIds } }] }).project({ name: 1, email: 1, image: 1, businessName: 1 }).toArray();
  const userMap = new Map(users.map((u) => [String(u._id ?? u.id), u]));
  return docs.map((b) => {
    const vendor = userMap.get(String(b.vendorId)); const customer = userMap.get(String(b.customerId)); const service = serviceMap.get(String(b.serviceId));
    return {
      ...serialize(b),
      service: service ? { id: service._id.toString(), serviceName: service.serviceName, category: service.category, price: service.price, images: service.images, location: service.location } : undefined,
      vendor: vendor ? { id: String(vendor._id ?? vendor.id), name: vendor.name, email: vendor.email, image: vendor.image, businessName: vendor.businessName } : undefined,
      customer: customer ? { id: String(customer._id ?? customer.id), name: customer.name, email: customer.email, image: customer.image } : undefined,
    };
  });
}

router.post("/", authenticate, requireRole("customer"), asyncHandler(async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid booking request.");
  if (!ObjectId.isValid(parsed.data.serviceId)) throw new HttpError(404, "Service not found.");
  const service = await getDb().collection("services").findOne({ _id: new ObjectId(parsed.data.serviceId), status: "approved", isActive: true });
  if (!service) throw new HttpError(404, "This service is not available for booking.");
  if (String(service.vendorId) === req.user!.id) throw new HttpError(403, "You cannot book your own service.");
  const date = new Date(parsed.data.eventDate);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now()) throw new HttpError(400, "Event date must be a valid future date.");
  const day = date.toISOString().slice(0, 10);
  const activeKey = `${service._id.toString()}:${req.user!.id}:${day}`;
  const document = {
    serviceId: service._id.toString(), vendorId: String(service.vendorId), customerId: req.user!.id,
    eventDate: date, eventLocation: parsed.data.eventLocation, message: parsed.data.message,
    status: "pending", activeKey, createdAt: new Date(), updatedAt: new Date(),
  };
  try {
    const result = await getDb().collection("bookings").insertOne(document);
    res.status(201).json({ message: "Booking request submitted.", booking: { ...document, id: result.insertedId.toString() } });
  } catch (error: any) {
    if (error?.code === 11000) throw new HttpError(409, "You already have an active request for this service and event date.");
    throw error;
  }
}));

router.get("/mine", authenticate, requireRole("customer", "vendor"), asyncHandler(async (req, res) => {
  const filter = req.user!.role === "customer" ? { customerId: req.user!.id } : { vendorId: req.user!.id };
  const docs = await getDb().collection("bookings").find(filter).sort({ createdAt: -1 }).toArray();
  res.json({ bookings: await enrich(docs) });
}));

router.patch("/:id/respond", authenticate, requireRole("vendor"), asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Booking request not found.");
  const status = req.body?.status;
  if (status !== "accepted" && status !== "rejected") throw new HttpError(400, "Status must be accepted or rejected.");
  const bookings = getDb().collection("bookings");
  const existing = await bookings.findOne({ _id: new ObjectId(req.params.id), vendorId: req.user!.id });
  if (!existing) throw new HttpError(404, "Booking request not found or you do not own it.");
  if (existing.status !== "pending") throw new HttpError(409, "Only pending booking requests can be processed.");
  const update: Record<string, unknown> = { status, updatedAt: new Date() };
  const result = await bookings.updateOne({ _id: existing._id, vendorId: req.user!.id, status: "pending" }, { $set: update, ...(status === "rejected" ? { $unset: { activeKey: "" } } : {}) });
  if (!result.modifiedCount) throw new HttpError(409, "This booking request has already been processed.");
  res.json({ message: `Booking request ${status}.` });
}));

router.patch("/:id/cancel", authenticate, requireRole("customer"), asyncHandler(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, "Booking request not found.");
  const result = await getDb().collection("bookings").updateOne(
    { _id: new ObjectId(req.params.id), customerId: req.user!.id, status: "pending" },
    { $set: { status: "cancelled", updatedAt: new Date() }, $unset: { activeKey: "" } },
  );
  if (!result.modifiedCount) throw new HttpError(409, "Only your own pending booking requests can be cancelled.");
  res.json({ message: "Booking request cancelled." });
}));
export default router;
