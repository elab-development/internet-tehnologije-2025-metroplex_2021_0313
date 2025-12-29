// backend/src/middleware/requireAuth.js
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { hashToken } from "../utils/tokenHash.js";

export interface AuthPayload extends JwtPayload {
  userId: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      token?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header" });
    }

    const token = header.split(" ")[1];
    req.token = token;
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    const payload = jwt.verify(token, secret) as AuthPayload;
    const tokenHash = hashToken(token);
    const revoked = await prisma.revokedToken.findUnique({
      where: { tokenHash },
    });
    if (revoked) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    // ie: { id, email, role }
    req.user = payload;

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
