import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../utils/http-error";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "API route not found." });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  if (error?.code === 11000) {
    res.status(409).json({ message: "A conflicting record already exists." });
    return;
  }
  if (error?.name === "ZodError") {
    res.status(400).json({ message: "Please check the submitted information." });
    return;
  }
  if (error?.name === "MulterError" || error?.statusCode === 400) {
    res.status(400).json({ message: error.message || "Image upload failed." });
    return;
  }
  console.error("API error:", error);
  res.status(500).json({ message: "An unexpected server error occurred." });
};
