import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashToken } from "../utils/tokenHash.js";

const router = Router();

type RegisterBody = {
  email?: string;
  password?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

// POST /api/auth/register
router.post(
  "/register",
  async (req: Request<{}, {}, RegisterBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required." });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ message: "Password must be at least 6 characters." });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({ message: "Email is already in use." });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true, role: true, createdAt: true },
      });

      return res.status(201).json(user);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error." });
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  async (req: Request<{}, {}, LoginBody>, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required." });
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user)
        return res.status(401).json({ message: "Invalid credentials." });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ message: "Invalid credentials." });

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        getJwtSecret(),
        { expiresIn: "7d" }
      );

      return res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error." });
    }
  }
);

// GET /api/auth/me
router.get("/me", requireAuth, (req: Request, res: Response) => {
  return res.json({ user: req.user });
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    const token = req.token;
    if (!token)
      return res.status(401).json({ message: "Invalid or expired token" });

    const exp = req.user?.exp;
    if (!exp) return res.status(400).json({ message: "Token has no exp" });

    const tokenHash = hashToken(token);
    const expiresAt = new Date(exp * 1000);

    // optional cleanup
    await prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // idempotent insert
    await prisma.revokedToken.upsert({
      where: { tokenHash },
      update: { expiresAt },
      create: { tokenHash, expiresAt },
    });

    return res.json({ message: "Logged out" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
