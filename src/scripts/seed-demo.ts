import { connectDB, closeDB } from "../config/db";

const demoVendorId = "wedplan-demo-vendor";
const sampleServices = [
  { serviceName: "Golden Hour Wedding Photography", category: "Photography & Videography", description: "A thoughtful photography collection for couples who want natural moments, beautiful portraits, and the real emotion of their celebration. Includes planning consultation and edited digital photographs.", price: 1200, location: "Dhaka, Bangladesh", images: ["https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85"] },
  { serviceName: "The Rosewood Garden Venue", category: "Wedding Venues", description: "An elegant garden setting for intimate ceremonies and joyful receptions. Our venue team helps coordinate the ceremony space, guest seating, and the practical details that keep the day flowing.", price: 2800, location: "Savar, Bangladesh", images: ["https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85"] },
  { serviceName: "Blush & Bloom Floral Design", category: "Decoration & Florist", description: "Seasonal floral styling, ceremony arches, table arrangements, and personal flowers designed around your colour palette. Every installation is prepared with care for your wedding day.", price: 950, location: "Gulshan, Dhaka, Bangladesh", images: ["https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=1200&q=85"] },
  { serviceName: "Gather & Grain Wedding Catering", category: "Catering Services", description: "A flexible wedding menu service with tasting consultations, attentive event staff, and presentation options for family celebrations, formal receptions, and outdoor gatherings.", price: 1800, location: "Chattogram, Bangladesh", images: ["https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=85"] },
  { serviceName: "Soft Glow Bridal Makeup", category: "Makeup & Styling", description: "A calm, personal bridal beauty experience with a trial session, skin preparation, long-wear makeup, and finishing touches for the ceremony and portraits.", price: 450, location: "Dhanmondi, Dhaka, Bangladesh", images: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=85"] },
  { serviceName: "Ever After Wedding Atelier", category: "Wedding Fashion", description: "Personal styling and outfit consultation for wedding celebrations, with made-to-measure options, finishing details, and guidance to help you feel comfortable and confident.", price: 780, location: "Kushtia, Bangladesh", images: ["https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&w=1200&q=85"] },
];

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding is disabled in production. Set ALLOW_DEMO_SEED=true only if you explicitly intend to seed sample data.");
  }
  const db = await connectDB();
  const now = new Date();
  await db.collection("users").updateOne(
    { _id: demoVendorId },
    { $setOnInsert: { name: "WedPlan Demo Studio", email: "demo-vendor@wedplan.local", emailVerified: true, image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=200&q=80", role: "vendor", isBlocked: false, businessName: "WedPlan Demo Studio", subscriptionPlan: "premium", createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  const services = db.collection("services");
  let created = 0;
  for (const sample of sampleServices) {
    const exists = await services.findOne({ vendorId: demoVendorId, serviceName: sample.serviceName });
    if (exists) continue;
    await services.insertOne({ ...sample, vendorId: demoVendorId, status: "approved", isActive: true, createdAt: now, updatedAt: now });
    created += 1;
  }
  console.log(`WedPlan demo seed complete. Added ${created} sample services.`);
  await closeDB();
}

seed().catch(async (error) => {
  console.error("Demo seed failed:", error);
  try { await closeDB(); } catch {}
  process.exit(1);
});
