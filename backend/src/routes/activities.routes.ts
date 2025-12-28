import { Router, Request, Response } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

type ActivityBody = {
  destination?: string;
  name?: string;
  type?: string;
  durationHours?: number | string;
  priceLevel?: number | string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

// GET /api/activities?destination=Paris&type=MUSEUM
router.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const destination =
        typeof req.query.destination === "string"
          ? req.query.destination
          : undefined;
      const type =
        typeof req.query.type === "string" ? req.query.type : undefined;

      const activities = await prisma.activity.findMany({
        where: {
          ...(destination ? { destination } : {}),
          ...(type ? { type } : {}),
        },
        orderBy: [{ destination: "asc" }, { name: "asc" }],
      });

      return res.json({ activities });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// POST /api/activities
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request<{}, {}, ActivityBody>, res: Response) => {
    try {
      const {
        destination,
        name,
        type,
        durationHours,
        priceLevel,
        latitude,
        longitude,
      } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "destination is required" });
      }
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "name is required" });
      }
      if (!type || typeof type !== "string") {
        return res.status(400).json({ message: "type is required" });
      }

      const dur = Number(durationHours);
      if (!Number.isFinite(dur) || dur <= 0) {
        return res
          .status(400)
          .json({ message: "durationHours must be a number > 0" });
      }

      const pl = Number(priceLevel);
      if (!Number.isInteger(pl) || pl < 1 || pl > 5) {
        return res
          .status(400)
          .json({ message: "priceLevel must be integer 1-5" });
      }

      const lat =
        latitude === null || latitude === undefined || latitude === ""
          ? null
          : Number(latitude);
      const lon =
        longitude === null || longitude === undefined || longitude === ""
          ? null
          : Number(longitude);

      if (lat !== null && !Number.isFinite(lat)) {
        return res
          .status(400)
          .json({ message: "latitude must be a number or null" });
      }
      if (lon !== null && !Number.isFinite(lon)) {
        return res
          .status(400)
          .json({ message: "longitude must be a number or null" });
      }

      const created = await prisma.activity.create({
        data: {
          destination,
          name,
          type,
          durationHours: dur,
          priceLevel: pl,
          latitude: lat,
          longitude: lon,
        },
      });

      return res.status(201).json({ activity: created });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res.status(409).json({ message: "Activity already exists" });
      }
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/activities/:id
router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const activity = await prisma.activity.findUnique({ where: { id } });
    if (!activity)
      return res.status(404).json({ message: "Activity not found" });

    return res.json({ activity });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/activities/:id
router.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request<{ id: string }, {}, ActivityBody>, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const existing = await prisma.activity.findUnique({ where: { id } });
      if (!existing)
        return res.status(404).json({ message: "Activity not found" });

      const patch: any = {};

      if (req.body.destination !== undefined) {
        if (
          typeof req.body.destination !== "string" ||
          req.body.destination.trim() === ""
        ) {
          return res
            .status(400)
            .json({ message: "destination must be a non-empty string" });
        }
        patch.destination = req.body.destination;
      }

      if (req.body.name !== undefined) {
        if (typeof req.body.name !== "string" || req.body.name.trim() === "") {
          return res
            .status(400)
            .json({ message: "name must be a non-empty string" });
        }
        patch.name = req.body.name;
      }

      if (req.body.type !== undefined) {
        if (typeof req.body.type !== "string" || req.body.type.trim() === "") {
          return res
            .status(400)
            .json({ message: "type must be a non-empty string" });
        }
        patch.type = req.body.type;
      }

      if (req.body.durationHours !== undefined) {
        const dur = Number(req.body.durationHours);
        if (!Number.isFinite(dur) || dur <= 0) {
          return res
            .status(400)
            .json({ message: "durationHours must be a number > 0" });
        }
        patch.durationHours = dur;
      }

      if (req.body.priceLevel !== undefined) {
        const pl = Number(req.body.priceLevel);
        if (!Number.isInteger(pl) || pl < 1 || pl > 5) {
          return res
            .status(400)
            .json({ message: "priceLevel must be integer 1-5" });
        }
        patch.priceLevel = pl;
      }

      if (req.body.latitude !== undefined) {
        const lat =
          req.body.latitude === null || req.body.latitude === ""
            ? null
            : Number(req.body.latitude);
        if (lat !== null && !Number.isFinite(lat)) {
          return res
            .status(400)
            .json({ message: "latitude must be a number or null" });
        }
        patch.latitude = lat;
      }

      if (req.body.longitude !== undefined) {
        const lon =
          req.body.longitude === null || req.body.longitude === ""
            ? null
            : Number(req.body.longitude);
        if (lon !== null && !Number.isFinite(lon)) {
          return res
            .status(400)
            .json({ message: "longitude must be a number or null" });
        }
        patch.longitude = lon;
      }

      const updated = await prisma.activity.update({
        where: { id },
        data: patch,
      });

      return res.json({ activity: updated });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res.status(409).json({ message: "Activity already exists" });
      }
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// DELETE /api/activities/:id
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const existing = await prisma.activity.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing)
      return res.status(404).json({ message: "Activity not found" });

    try {
      await prisma.activity.delete({ where: { id } });
    } catch {
      return res
        .status(409)
        .json({ message: "Activity is used in planned activities" });
    }

    return res.json({ message: "Activity deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
