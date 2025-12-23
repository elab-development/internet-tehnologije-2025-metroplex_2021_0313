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

router.post("/:id/regenerate", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const tripId = Number(req.params.id);

    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // 1) check if the trips exists + ownership
    const base = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        userId: true,
        destination: true,
        daysCount: true,
        interests: true,
      },
    });

    if (!base) return res.status(404).json({ message: "Trip not found" });
    if (base.userId !== userId)
      return res.status(403).json({ message: "Forbidden" });

    // 2) load destination activities
    const activities = await prisma.activity.findMany({
      where: { destination: base.destination },
    });

    // 3) generate a new plan
    const plan = generateItinerary({
      activities,
      daysCount: base.daysCount,
      interests: base.interests,
    });

    // 4) tx: delete old plan + generate a new one
    const savedTrip = await prisma.$transaction(async (tx) => {
      // load all day plans for this trip
      const dayPlans = await tx.dayPlan.findMany({
        where: { tripId },
        select: { id: true, dayNumber: true },
        orderBy: { dayNumber: "asc" },
      });

      // delete plannedActivities for those day plans
      const dayPlanIds = dayPlans.map((dp) => dp.id);

      if (dayPlanIds.length > 0) {
        await tx.plannedActivity.deleteMany({
          where: { dayPlanId: { in: dayPlanIds } },
        });

        // delete dayPlans
        await tx.dayPlan.deleteMany({
          where: { tripId },
        });
      }

      // create new dayPlans
      const newDayPlans = [];
      for (let d = 1; d <= base.daysCount; d++) {
        const dp = await tx.dayPlan.create({
          data: { tripId, dayNumber: d },
        });
        newDayPlans.push(dp);
      }

      // add plannedActivities per plan
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

      // return full nested trip
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

    return res.json({
      trip: savedTrip,
      warning: plan.warning,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
