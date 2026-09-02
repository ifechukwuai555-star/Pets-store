
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

import { query, initializeDatabase } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === "production";

// --------------------------------------------------
// Basic configuration
// --------------------------------------------------

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// --------------------------------------------------
// CORS
// --------------------------------------------------

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000"
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no Origin header, such as some server-side tools.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true
  })
);

// --------------------------------------------------
// Upload directory
// --------------------------------------------------

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --------------------------------------------------
// Image upload configuration
// --------------------------------------------------

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDir);
  },

  filename: (_req, file, callback) => {
    const extension = path
      .extname(file.originalname || "")
      .toLowerCase();

    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (_req, file, callback) => {
    const extension = path
      .extname(file.originalname || "")
      .toLowerCase();

    if (
      allowedMimeTypes.has(file.mimetype) &&
      allowedExtensions.has(extension)
    ) {
      return callback(null, true);
    }

    callback(
      new Error(
        "Only JPG, JPEG, PNG, WEBP and GIF images are allowed."
      )
    );
  }
});

app.use("/uploads", express.static(uploadDir));

// --------------------------------------------------
// Session configuration
// --------------------------------------------------

const PgSession = connectPgSimple(session);

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET must be configured in production."
  );
}

const sessionSecret =
  process.env.SESSION_SECRET ||
  "development-only-change-this-secret";

app.use(
  session({
    store: new PgSession({
      pool: undefined,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),

    secret: sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// --------------------------------------------------
// Login rate limiting
// --------------------------------------------------

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many login attempts. Please try again later."
  }
});

// --------------------------------------------------
// Helper functions
// --------------------------------------------------

function cleanText(value, maxLength = 1000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128
  );
}

function requireOwner(req, res, next) {
  if (!req.session.ownerId) {
    return res.status(401).json({
      error: "Owner authentication required."
    });
  }

  next();
}

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");

    res.json({
      ok: true,
      message: "Pet Store backend is running."
    });
  } catch (error) {
    console.error("Health check failed:", error);

    res.status(500).json({
      ok: false,
      error: "Database connection failed."
    });
  }
});

// --------------------------------------------------
// Owner status
// --------------------------------------------------

app.get("/api/owner/status", async (_req, res) => {
  try {
    const result = await query(
      "SELECT COUNT(*)::int AS count FROM owners"
    );

    res.json({
      setupRequired: result.rows[0].count === 0
    });
  } catch (error) {
    console.error("Owner status error:", error);

    res.status(500).json({
      error: "Unable to check owner status."
    });
  }
});

// --------------------------------------------------
// Owner setup
// --------------------------------------------------

app.post("/api/owner/setup", loginLimiter, async (req, res) => {
  try {
    const password = req.body?.password;

    if (!validPassword(password)) {
      return res.status(400).json({
        error: "Password must be between 8 and 128 characters."
      });
    }

    const existing = await query(
      "SELECT id FROM owners LIMIT 1"
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Owner account has already been created."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `
      INSERT INTO owners (password_hash)
      VALUES ($1)
      RETURNING id
      `,
      [passwordHash]
    );

    req.session.ownerId = result.rows[0].id;

    res.status(201).json({
      message: "Owner account created successfully."
    });
  } catch (error) {
    console.error("Owner setup error:", error);

    res.status(500).json({
      error: "Unable to create owner account."
    });
  }
});

// --------------------------------------------------
// Owner login
// --------------------------------------------------

app.post("/api/owner/login", loginLimiter, async (req, res) => {
  try {
    const password = req.body?.password;

    if (!password) {
      return res.status(400).json({
        error: "Password is required."
      });
    }

    const result = await query(
      `
      SELECT id, password_hash
      FROM owners
      LIMIT 1
      `
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Owner account has not been created yet."
      });
    }

    const owner = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      owner.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Incorrect password."
      });
    }

    req.session.ownerId = owner.id;

    res.json({
      message: "Owner login successful."
    });
  } catch (error) {
    console.error("Owner login error:", error);

    res.status(500).json({
      error: "Unable to log in."
    });
  }
});

// --------------------------------------------------
// Current owner
// --------------------------------------------------

app.get("/api/owner/me", requireOwner, async (req, res) => {
  res.json({
    authenticated: true,
    ownerId: req.session.ownerId
  });
});

// --------------------------------------------------
// Owner logout
// --------------------------------------------------

app.post("/api/owner/logout", requireOwner, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);

      return res.status(500).json({
        error: "Unable to log out."
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      message: "Logged out successfully."
    });
  });
});

// --------------------------------------------------
// Change owner password
// --------------------------------------------------

app.post(
  "/api/owner/change-password",
  requireOwner,
  async (req, res) => {
    try {
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;

      if (!validPassword(newPassword)) {
        return res.status(400).json({
          error: "New password must be between 8 and 128 characters."
        });
      }

      const result = await query(
        `
        SELECT password_hash
        FROM owners
        WHERE id = $1
        `,
        [req.session.ownerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Owner account not found."
        });
      }

      const matches = await bcrypt.compare(
        currentPassword || "",
        result.rows[0].password_hash
      );

      if (!matches) {
        return res.status(401).json({
          error: "Current password is incorrect."
        });
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      await query(
        `
        UPDATE owners
        SET password_hash = $1
        WHERE id = $2
        `,
        [newHash, req.session.ownerId]
      );

      res.json({
        message: "Password changed successfully."
      });
    } catch (error) {
      console.error("Change password error:", error);

      res.status(500).json({
        error: "Unable to change password."
      });
    }
  }
);

// --------------------------------------------------
// Public pets
// --------------------------------------------------

app.get("/api/pets", async (_req, res) => {
  try {
    const result = await query(
      `
      SELECT
        id,
        name,
        category,
        description,
        price,
        image_url,
        likes,
        created_at
      FROM pets
      ORDER BY created_at DESC
      `
    );

    res.json({
      pets: result.rows
    });
  } catch (error) {
    console.error("Get pets error:", error);

    res.status(500).json({
      error: "Unable to load pets."
    });
  }
});

// --------------------------------------------------
// Owner adds pet
// --------------------------------------------------

app.post(
  "/api/pets",
  requireOwner,
  upload.single("image"),
  async (req, res) => {
    try {
      const name = cleanText(req.body?.name, 100);
      const category = cleanText(req.body?.category, 50);
      const description = cleanText(
        req.body?.description,
        2000
      );

      const price = Number(req.body?.price);

      if (!name || !category || !description) {
        return res.status(400).json({
          error: "Name, category and description are required."
        });
      }

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          error: "Please enter a valid price."
        });
      }

      const imageUrl = req.file
        ? `/uploads/${req.file.filename}`
        : null;

      const result = await query(
        `
        INSERT INTO pets (
          name,
          category,
          description,
          price,
          image_url,
          likes
        )
        VALUES ($1, $2, $3, $4, $5, 0)
        RETURNING *
        `,
        [
          name,
          category,
          description,
          price,
          imageUrl
        ]
      );

      res.status(201).json({
        message: "Pet added successfully.",
        pet: result.rows[0]
      });
    } catch (error) {
      console.error("Add pet error:", error);

      res.status(500).json({
        error: "Unable to add pet."
      });
    }
  }
);

// --------------------------------------------------
// Owner deletes pet
// --------------------------------------------------

app.delete(
  "/api/pets/:id",
  requireOwner,
  async (req, res) => {
    try {
      const result = await query(
        `
        DELETE FROM pets
        WHERE id = $1
        RETURNING image_url
        `,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Pet not found."
        });
      }

      const imageUrl = result.rows[0].image_url;

      if (imageUrl) {
        const filename = path.basename(imageUrl);
        const imagePath = path.join(uploadDir, filename);

        try {
          await fs.promises.unlink(imagePath);
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.error("Image deletion error:", error);
          }
        }
      }

      res.json({
        message: "Pet deleted successfully."
      });
    } catch (error) {
      console.error("Delete pet error:", error);

      res.status(500).json({
        error: "Unable to delete pet."
      });
    }
  }
);

// --------------------------------------------------
// Like a pet
// --------------------------------------------------

app.post("/api/pets/:id/like", async (req, res) => {
  try {
    const result = await query(
      `
      UPDATE pets
      SET likes = likes + 1
      WHERE id = $1
      RETURNING id, likes
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Pet not found."
      });
    }

    res.json({
      id: result.rows[0].id,
      likes: result.rows[0].likes
    });
  } catch (error) {
    console.error("Like pet error:", error);

    res.status(500).json({
      error: "Unable to like pet."
    });
  }
});

// --------------------------------------------------
// Customer inquiry
// --------------------------------------------------

app.post("/api/inquiries", async (req, res) => {
  try {
    const name = cleanText(req.body?.name, 100);
    const phone = cleanText(req.body?.phone, 40);
    const email = cleanText(req.body?.email, 150);
    const pet = cleanText(req.body?.pet, 150);
    const message = cleanText(req.body?.message, 2000);

    if (!name || !phone || !pet || !message) {
      return res.status(400).json({
        error:
          "Name, phone, pet and message are required."
      });
    }

    await query(
      `
      INSERT INTO inquiries (
        name,
        phone,
        email,
        pet,
        message
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        name,
        phone,
        email || null,
        pet,
        message
      ]
    );

    res.status(201).json({
      message:
        "Your inquiry has been received."
    });
  } catch (error) {
    console.error("Inquiry error:", error);

    res.status(500).json({
      error: "Unable to save your inquiry."
    });
  }
});

// --------------------------------------------------
// Customer order
// --------------------------------------------------

app.post("/api/orders", async (req, res) => {
  try {
    const name = cleanText(req.body?.name, 100);
    const phone = cleanText(req.body?.phone, 40);
    const email = cleanText(req.body?.email, 150);
    const items = cleanText(req.body?.items, 5000);
    const address = cleanText(req.body?.address, 1000);

    if (!name || !phone || !items || !address) {
      return res.status(400).json({
        error:
          "Name, phone, items and address are required."
      });
    }

    await query(
      `
      INSERT INTO orders (
        name,
        phone,
        email,
        items,
        address,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      `,
      [
        name,
        phone,
        email || null,
        items,
        address
      ]
    );

    res.status(201).json({
      message:
        "Your order has been received."
    });
  } catch (error) {
    console.error("Order error:", error);

    res.status(500).json({
      error: "Unable to save your order."
    });
  }
});

// --------------------------------------------------
// Owner inquiries
// --------------------------------------------------

app.get(
  "/api/owner/inquiries",
  requireOwner,
  async (_req, res) => {
    try {
      const result = await query(
        `
        SELECT *
        FROM inquiries
        ORDER BY created_at DESC
        `
      );

      res.json({
        inquiries: result.rows
      });
    } catch (error) {
      console.error("Owner inquiries error:", error);

      res.status(500).json({
        error: "Unable to load inquiries."
      });
    }
  }
);

// --------------------------------------------------
// Owner orders
// --------------------------------------------------

app.get(
  "/api/owner/orders",
  requireOwner,
  async (_req, res) => {
    try {
      const result = await query(
        `
        SELECT *
        FROM orders
        ORDER BY created_at DESC
        `
      );

      res.json({
        orders: result.rows
      });
    } catch (error) {
      console.error("Owner orders error:", error);

      res.status(500).json({
        error: "Unable to load orders."
      });
    }
  }
);

// --------------------------------------------------
// Error handling
// --------------------------------------------------

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Image must be 5 MB or smaller."
      });
    }

    return res.status(400).json({
      error: "Image upload failed."
    });
  }

  if (error.message?.includes("Only JPG")) {
    return res.status(400).json({
      error: error.message
    });
  }

  if (error.message?.includes("Origin not allowed")) {
    return res.status(403).json({
      error: "Request origin is not allowed."
    });
  }

  res.status(500).json({
    error: "Something went wrong on the server."
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `Pet Store backend running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Unable to start Pet Store backend:",
      error
    );

    process.exit(1);
  }
}

startServer();

export default app;
