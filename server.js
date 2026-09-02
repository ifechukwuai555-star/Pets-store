import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

import {
  query,
  initializeDatabase
} from "./database.js";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/* =========================================================
   BASIC CONFIGURATION
   ========================================================= */

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));


/* =========================================================
   UPLOADS FOLDER
   ========================================================= */

const uploadsDirectory = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, {
    recursive: true
  });
}


/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDirectory);
  },

  filename: (_req, file, callback) => {
    const extension =
      path.extname(file.originalname).toLowerCase();

    callback(
      null,
      `${randomUUID()}${extension}`
    );
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Only JPG, PNG, WEBP and GIF images are allowed."
        )
      );
    }

    callback(null, true);
  }
});

app.use(
  "/uploads",
  express.static(uploadsDirectory)
);


/* =========================================================
   SESSION
   ========================================================= */

const sessionSecret =
  process.env.SESSION_SECRET ||
  "CHANGE_THIS_SESSION_SECRET_BEFORE_PRODUCTION";

app.use(
  session({
    secret: sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      secure:
        process.env.NODE_ENV === "production",

      sameSite: "lax",

      maxAge: 1000 * 60 * 60 * 8
    }
  })
);


/* =========================================================
   LOGIN RATE LIMIT
   ========================================================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    message:
      "Too many login attempts. Please try again later."
  }
});


/* =========================================================
   OWNER AUTHORIZATION
   ========================================================= */

function requireOwner(req, res, next) {
  if (!req.session.ownerId) {
    return res.status(401).json({
      message:
        "Owner authentication is required."
    });
  }

  next();
}


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT NOW()");

    res.json({
      status: "ok",
      message: "Pet Store API is running."
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "error",
      message: "Database connection failed."
    });
  }
});


/* =========================================================
   OWNER STATUS
   ========================================================= */

app.get("/api/owner/status", async (_req, res) => {
  try {
    const result = await query(
      "SELECT id FROM owners LIMIT 1"
    );

    res.json({
      ownerExists: result.rows.length > 0
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Could not check owner status."
    });
  }
});


/* =========================================================
   OWNER SETUP
   ========================================================= */

app.post("/api/owner/setup", async (req, res) => {
  try {
    const { password } = req.body;

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters."
      });
    }

    const existing = await query(
      "SELECT id FROM owners LIMIT 1"
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message:
          "The owner account has already been created."
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const result = await query(
      `
      INSERT INTO owners (password_hash)
      VALUES ($1)
      RETURNING id
      `,
      [passwordHash]
    );

    req.session.ownerId =
      result.rows[0].id;

    res.status(201).json({
      message:
        "Owner account created successfully."
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Owner setup failed."
    });
  }
});


/* =========================================================
   OWNER LOGIN
   ========================================================= */

app.post(
  "/api/owner/login",
  loginLimiter,
  async (req, res) => {
    try {
      const { password } = req.body;

      if (
        typeof password !== "string" ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Please enter your password."
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
          message:
            "Owner account has not been created yet."
        });
      }

      const owner = result.rows[0];

      const valid =
        await bcrypt.compare(
          password,
          owner.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          message:
            "Invalid owner password."
        });
      }

      req.session.ownerId =
        owner.id;

      res.json({
        message:
          "Owner login successful."
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Login could not be completed."
      });
    }
  }
);


/* =========================================================
   CURRENT OWNER SESSION
   ========================================================= */

app.get(
  "/api/owner/me",
  (req, res) => {
    res.json({
      authenticated:
        Boolean(req.session.ownerId)
    });
  }
);


/* =========================================================
   OWNER LOGOUT
   ========================================================= */

app.post(
  "/api/owner/logout",
  (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        console.error(error);

        return res.status(500).json({
          message:
            "Logout failed."
        });
      }

      res.clearCookie("connect.sid");

      res.json({
        message:
          "Owner logged out successfully."
      });
    });
  }
);


/* =========================================================
   CHANGE OWNER PASSWORD
   ========================================================= */

app.post(
  "/api/owner/change-password",
  requireOwner,
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword
      } = req.body;

      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string"
      ) {
        return res.status(400).json({
          message:
            "Both password fields are required."
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message:
            "New password must contain at least 8 characters."
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
          message:
            "Owner account not found."
        });
      }

      const valid =
        await bcrypt.compare(
          currentPassword,
          result.rows[0].password_hash
        );

      if (!valid) {
        return res.status(401).json({
          message:
            "Current password is incorrect."
        });
      }

      const newHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      await query(
        `
        UPDATE owners
        SET password_hash = $1
        WHERE id = $2
        `,
        [
          newHash,
          req.session.ownerId
        ]
      );

      res.json({
        message:
          "Password changed successfully."
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Password change failed."
      });
    }
  }
);


/* =========================================================
   PUBLIC PETS
   ========================================================= */

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
    console.error(error);

    res.status(500).json({
      message:
        "Could not load pets."
    });
  }
});


/* =========================================================
   OWNER — ADD PET
   ========================================================= */

app.post(
  "/api/pets",
  requireOwner,
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        name,
        category,
        description,
        price
      } = req.body;

      if (
        !name ||
        !category ||
        !description ||
        price === undefined
      ) {
        return res.status(400).json({
          message:
            "Name, category, description and price are required."
        });
      }

      let imageUrl = null;

      if (req.file) {
        imageUrl =
          `/uploads/${req.file.filename}`;
      }

      const result = await query(
        `
        INSERT INTO pets
        (
          name,
          category,
          description,
          price,
          image_url
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          name.trim(),
          category.trim(),
          description.trim(),
          Number(price),
          imageUrl
        ]
      );

      res.status(201).json({
        message:
          "Pet added successfully.",
        pet: result.rows[0]
      });

    } catch (error) {
      console.error(error);

      if (req.file) {
        const uploadedFile =
          path.join(
            uploadsDirectory,
            req.file.filename
          );

        if (fs.existsSync(uploadedFile)) {
          fs.unlinkSync(uploadedFile);
        }
      }

      res.status(500).json({
        message:
          "Could not add pet."
      });
    }
  }
);


/* =========================================================
   OWNER — DELETE PET
   ========================================================= */

app.delete(
  "/api/pets/:id",
  requireOwner,
  async (req, res) => {
    try {
      const result = await query(
        `
        SELECT image_url
        FROM pets
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Pet not found."
        });
      }

      const imageUrl =
        result.rows[0].image_url;

      await query(
        `
        DELETE FROM pets
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (
        imageUrl &&
        imageUrl.startsWith("/uploads/")
      ) {
        const filename =
          path.basename(imageUrl);

        const imagePath =
          path.join(
            uploadsDirectory,
            filename
          );

        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      res.json({
        message:
          "Pet deleted successfully."
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not delete pet."
      });
    }
  }
);


/* =========================================================
   PET LIKE
   ========================================================= */

app.post(
  "/api/pets/:id/like",
  async (req, res) => {
    try {
      const result = await query(
        `
        UPDATE pets
        SET likes = likes + 1
        WHERE id = $1
        RETURNING likes
        `,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Pet not found."
        });
      }

      res.json({
        likes:
          result.rows[0].likes
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not record like."
      });
    }
  }
);


/* =========================================================
   CUSTOMER INQUIRY
   ========================================================= */

app.post(
  "/api/inquiries",
  async (req, res) => {
    try {
      const {
        name,
        phone,
        email,
        pet,
        message
      } = req.body;

      if (
        !name ||
        !phone ||
        !message
      ) {
        return res.status(400).json({
          message:
            "Name, phone and message are required."
        });
      }

      const result = await query(
        `
        INSERT INTO inquiries
        (
          name,
          phone,
          email,
          pet,
          message
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          name.trim(),
          phone.trim(),
          email?.trim() || null,
          pet?.trim() || null,
          message.trim()
        ]
      );

      res.status(201).json({
        message:
          "Inquiry received successfully.",
        inquiry:
          result.rows[0]
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not submit inquiry."
      });
    }
  }
);


/* =========================================================
   CUSTOMER ORDER
   ========================================================= */

app.post(
  "/api/orders",
  async (req, res) => {
    try {
      const {
        name,
        phone,
        email,
        items,
        address
      } = req.body;

      if (
        !name ||
        !phone ||
        !items ||
        !address
      ) {
        return res.status(400).json({
          message:
            "Name, phone, items and address are required."
        });
      }

      const result = await query(
        `
        INSERT INTO orders
        (
          name,
          phone,
          email,
          items,
          address,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
          name.trim(),
          phone.trim(),
          email?.trim() || null,
          items.trim(),
          address.trim(),
          "pending"
        ]
      );

      res.status(201).json({
        message:
          "Order received successfully.",
        order:
          result.rows[0]
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not submit order."
      });
    }
  }
);


/* =========================================================
   OWNER — VIEW INQUIRIES
   ========================================================= */

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
        inquiries:
          result.rows
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not load inquiries."
      });
    }
  }
);


/* =========================================================
   OWNER — VIEW ORDERS
   ========================================================= */

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
        orders:
          result.rows
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Could not load orders."
      });
    }
  }
);


/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (error, _req, res, _next) => {
    console.error(error);

    if (
      error instanceof multer.MulterError
    ) {
      return res.status(400).json({
        message:
          "Image upload failed. Please check the file size and try again."
      });
    }

    res.status(500).json({
      message:
        error.message ||
        "An unexpected server error occurred."
    });
  }
);


/* =========================================================
   START SERVER
   ========================================================= */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `Pet Store server running on port ${PORT}`
      );
    });

  } catch (error) {
    console.error(
      "Failed to start Pet Store server:",
      error
    );

    process.exit(1);
  }
}

startServer();
