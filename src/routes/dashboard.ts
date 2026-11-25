import { Router } from "express";
import { getDb } from "../config/db";
import { authenticate, requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
const router = Router();
router.get("/stats", authenticate, asyncHandler(async (req, res) => {
  const db = getDb(); const user = req.user!; const stats: Record<string, number | string> = {};
  if (user.role === "vendor") {
    const [services, activeServices, pendingBookings, acceptedBookings] = await Promise.all([
      db.collection("services").countDocuments({ vendorId: user.id }),
      db.collection("services").countDocuments({ vendorId: user.id, status: "approved", isActive: true }),
      db.collection("bookings").countDocuments({ vendorId: user.id, status: "pending" }),
      db.collection("bookings").countDocuments({ vendorId: user.id, status: "accepted" }),
    ]);
    Object.assign(stats, { services, activeServices, pendingBookings, acceptedBookings, subscriptionPlan: user.subscriptionPlan || "free" });
  } else if (user.role === "customer") {
    const [bookings, pending, accepted, rejected] = await Promise.all([
      db.collection("bookings").countDocuments({ customerId: user.id }),
      db.collection("bookings").countDocuments({ customerId: user.id, status: "pending" }),
      db.collection("bookings").countDocuments({ customerId: user.id, status: "accepted" }),
      db.collection("bookings").countDocuments({ customerId: user.id, status: { $in: ["rejected", "cancelled"] } }),
    ]);
    Object.assign(stats, { bookings, pending, accepted, rejected });
  } else if (user.role === "admin") {
    const [users, vendors, customers, totalServices, pendingServices, transactions] = await Promise.all([
      db.collection("users").countDocuments({}),
      db.collection("users").countDocuments({ role: "vendor" }),
      db.collection("users").countDocuments({ role: "customer" }),
      db.collection("services").countDocuments({}),
      db.collection("services").countDocuments({ status: "pending" }),
      db.collection("transactions").countDocuments({}),
    ]);
    Object.assign(stats, { users, vendors, customers, totalServices, pendingServices, transactions });
  }
  res.json({ stats });
}));
export default router;
