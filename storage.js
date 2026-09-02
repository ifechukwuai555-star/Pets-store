import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "uploads");

// Make sure the uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Save an uploaded image to the server.
 * The file is renamed to a random safe filename.
 */
export async function saveImage(file) {
  if (!file || !file.buffer) {
    throw new Error("No image file was provided.");
  }

  const extension = path.extname(file.originalname || "").toLowerCase();

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

  if (!allowedExtensions.includes(extension)) {
    throw new Error("Unsupported image type.");
  }

  const filename = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, filename);

  await fs.promises.writeFile(filePath, file.buffer);

  return `/uploads/${filename}`;
}

/**
 * Delete an image from storage.
 */
export async function deleteImage(imageUrl) {
  if (!imageUrl) return;

  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    // Ignore the error if the file has already been deleted.
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
