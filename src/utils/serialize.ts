import type { Document } from "mongodb";
export function serialize<T extends Document>(doc: T) {
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
}
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
