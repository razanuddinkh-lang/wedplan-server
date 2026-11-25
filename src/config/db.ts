import { MongoClient, Db } from "mongodb";
import { env } from "./env";

const client = new MongoClient(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
let database: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (database) return database;
  await client.connect();
  database = client.db(env.mongodbDbName);
  await Promise.all([
    database.collection("services").createIndex({ vendorId: 1, createdAt: -1 }),
    database.collection("services").createIndex({ status: 1, isActive: 1, category: 1 }),
    database.collection("bookings").createIndex({ customerId: 1, createdAt: -1 }),
    database.collection("bookings").createIndex({ vendorId: 1, createdAt: -1 }),
    database.collection("bookings").createIndex({ activeKey: 1 }, { unique: true, sparse: true }),
    database.collection("transactions").createIndex({ stripeSessionId: 1 }, { unique: true, sparse: true }),
    database.collection("transactions").createIndex({ vendorId: 1, createdAt: -1 }),
  ]);
  console.log(`MongoDB connected: ${env.mongodbDbName}`);
  return database;
}

export function getDb(): Db {
  if (!database) throw new Error("Database is not connected yet.");
  return database;
}

export async function closeDB(): Promise<void> {
  await client.close();
  database = null;
}
