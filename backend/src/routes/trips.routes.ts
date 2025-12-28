import { Router, Request, Response } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { generateItinerary } from "../services/planner.service.js";

const router = Router();

type CreateTripBody = {
  destination?: string;
  daysCount?: number | string;
  budget?: number | string;
  interests?: string;
};

router.post(
  "/",
  requireAuth,
  async (req: Request<{}, {}, CreateTripBody>, res: Response) => {
    try {
      const { destination, daysCount, budget, interests } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "destination is required" });
      }

      const days = Number(daysCount);
      if (!Number.isInteger(days) || days < 1 || days > 30) {
        return res
          .status(400)
          .json({ message: "daysCount must be integer 1-30" });
      }

      let bud: number | null = null;
      if (budget !== undefined && budget !== null && budget !== "") {
        const parsed = Number(budget);
        if (Number.isNaN(parsed) || parsed < 0) {
          return res
            .status(400)
            .json({ message: "budget must be a number >= 0" });
        }
        bud = parsed;
      }

      if (!interests || typeof interests !== "string") {
        return res
          .status(400)
          .json({ message: "interests is required (comma-separated)" });
      }

      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // 1) fetch activities for destination (van transakcije je OK)
      const activities = await prisma.activity.findMany({
        where: { destination },
      });

      // 2) generate plan in memory
      const plan = generateItinerary({
        activities,
        daysCount: days,
        interests,
      });

      // 3) persist Trip + DayPlan + PlannedActivity in ONE transaction
      const savedTrip = await prisma.$transaction(async (tx) => {
        // create Trip inside tx
        const createdTrip = await tx.trip.create({
          data: {
            userId,
            destination,
            daysCount: days,
            budget: bud,
            interests,
          },
        });

        const dayPlans = [];

        for (let d = 1; d <= days; d++) {
          const dp = await tx.dayPlan.create({
            data: { tripId: createdTrip.id, dayNumber: d },
          });
          dayPlans.push(dp);
        }

        for (let d = 1; d <= days; d++) {
          const dp = dayPlans[d - 1];
          const dayItems = plan.days[d - 1] ?? [];

          for (let i = 0; i < dayItems.length; i++) {
            await tx.plannedActivity.create({
              data: {
                dayPlanId: dp.id,
                activityId: dayItems[i].id,
                orderIndex: i + 1,
              },
            });
          }
        }

        return tx.trip.findUnique({
          where: { id: createdTrip.id },
          include: {
            dayPlans: {
              orderBy: { dayNumber: "asc" },
              include: {
                plannedActivities: {
                  orderBy: { orderIndex: "asc" },
                  include: { activity: true },
                },
              },
            },
          },
        });
      });

      return res.status(201).json({
        trip: savedTrip,
        warning: plan.warning,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.get("/my", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const trips = await prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        destination: true,
        daysCount: true,
        budget: true,
        interests: true,
        createdAt: true,
        dayPlans: {
          select: {
            //id: true,
            _count: { select: { plannedActivities: true } },
          },
        },
      },
    });

    const mapped = trips.map((t) => ({
      id: t.id,
      destination: t.destination,
      daysCount: t.daysCount,
      budget: t.budget,
      interests: t.interests,
      createdAt: t.createdAt,
      summary: {
        totalPlannedActivities: t.dayPlans.reduce(
          (sum, dp) => sum + dp._count.plannedActivities,
          0
        ),
      },
    }));

    return res.json({ trips: mapped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const tripId = Number(req.params.id);

    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const base = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, userId: true },
    });

    if (!base) return res.status(404).json({ message: "Trip not found" });
    if (base.userId !== userId)
      return res.status(403).json({ message: "Forbidden" });

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        dayPlans: {
          orderBy: { dayNumber: "asc" },
          include: {
            plannedActivities: {
              orderBy: { orderIndex: "asc" },
              include: { activity: true },
            },
          },
        },
      },
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    return res.json({ trip });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const tripId = Number(req.params.id);

    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const base = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, userId: true },
    });

    if (!base) return res.status(404).json({ message: "Trip not found" });
    if (base.userId !== userId)
      return res.status(403).json({ message: "Forbidden" });

    // Delete trip (cascade should remove DayPlan + PlannedActivity)
    await prisma.trip.delete({ where: { id: tripId } });

    return res.status(200).json({ message: "Trip deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

type RegenerateBody = {
  interests?: string;
};

router.post(
  "/:id/regenerate",
  requireAuth,
  async (req: Request<{ id: string }, {}, RegenerateBody>, res: Response) => {
    const userId = req.user!.userId;
    const tripId = Number(req.params.id);

    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Lock window (auto-expire) to prevent double-clicks and avoid permanent locks
    const now = new Date();
    const lockTtlMs = 2 * 60 * 1000; // 2 minutes
    const lockUntil = new Date(Date.now() + lockTtlMs);

    try {
      // 1) Load base trip data (keeps 404 vs 403 behavior)
      const base = await prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          userId: true,
          destination: true,
          daysCount: true,
          interests: true,
          regenLockUntil: true,
        },
      });

      if (!base) return res.status(404).json({ message: "Trip not found" });
      if (base.userId !== userId)
        return res.status(403).json({ message: "Forbidden" });

      // 2) Acquire lock (only if lock is missing or expired)
      const lockResult = await prisma.trip.updateMany({
        where: {
          id: tripId,
          userId,
          OR: [{ regenLockUntil: null }, { regenLockUntil: { lt: now } }],
        },
        data: { regenLockUntil: lockUntil },
      });

      if (lockResult.count === 0) {
        // Another regen is in progress (double-click or parallel request)
        return res
          .status(409)
          .json({ message: "Regeneration already in progress" });
      }

      // 3) Decide interests (optional override)
      const incomingInterests = req.body?.interests;

      if (incomingInterests !== undefined) {
        if (
          typeof incomingInterests !== "string" ||
          incomingInterests.trim() === ""
        ) {
          return res
            .status(400)
            .json({ message: "interests must be a non-empty string" });
        }
      }

      const effectiveInterests =
        typeof incomingInterests === "string" && incomingInterests.trim() !== ""
          ? incomingInterests.trim()
          : base.interests;

      // 4) Fetch activities (fallback if empty)
      const activities = await prisma.activity.findMany({
        where: { destination: base.destination },
      });

      const plan =
        activities.length === 0
          ? {
              days: Array.from({ length: base.daysCount }, () => [] as any[]),
              warning: "No activities found for destination",
            }
          : generateItinerary({
              activities,
              daysCount: base.daysCount,
              interests: effectiveInterests,
            });

      // 5) Persist: delete old plan + optionally update interests + create new plan
      const savedTrip = await prisma.$transaction(async (tx) => {
        // Delete old planned activities + day plans
        const existingDayPlans = await tx.dayPlan.findMany({
          where: { tripId },
          select: { id: true },
        });

        const dayPlanIds = existingDayPlans.map((dp) => dp.id);

        if (dayPlanIds.length > 0) {
          await tx.plannedActivity.deleteMany({
            where: { dayPlanId: { in: dayPlanIds } },
          });

          await tx.dayPlan.deleteMany({ where: { tripId } });
        }

        // Update trip interests if overridden
        if (effectiveInterests !== base.interests) {
          await tx.trip.update({
            where: { id: tripId },
            data: { interests: effectiveInterests },
          });
        }

        // Create new day plans
        const newDayPlans = [];
        for (let d = 1; d <= base.daysCount; d++) {
          const dp = await tx.dayPlan.create({
            data: { tripId, dayNumber: d },
          });
          newDayPlans.push(dp);
        }

        // Create planned activities (if plan is empty, this loop just does nothing)
        for (let d = 1; d <= base.daysCount; d++) {
          const dp = newDayPlans[d - 1];
          const dayItems = plan.days[d - 1] ?? [];

          for (let i = 0; i < dayItems.length; i++) {
            await tx.plannedActivity.create({
              data: {
                dayPlanId: dp.id,
                activityId: dayItems[i].id,
                orderIndex: i + 1,
              },
            });
          }
        }

        return tx.trip.findUnique({
          where: { id: tripId },
          include: {
            dayPlans: {
              orderBy: { dayNumber: "asc" },
              include: {
                plannedActivities: {
                  orderBy: { orderIndex: "asc" },
                  include: { activity: true },
                },
              },
            },
          },
        });
      });

      return res.json({ trip: savedTrip, warning: plan.warning });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    } finally {
      // Best-effort unlock (even if planner/transaction fails)
      try {
        await prisma.trip.updateMany({
          where: { id: tripId, userId },
          data: { regenLockUntil: null },
        });
      } catch {
        // ignore unlock errors
      }
    }
  }
);

export default router;
