import multer from "multer";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) { const error = new Error("Only JPG, PNG, and WebP images are allowed.") as Error & { statusCode?: number }; error.statusCode = 400; return callback(error); }
    callback(null, true);
  },
});
