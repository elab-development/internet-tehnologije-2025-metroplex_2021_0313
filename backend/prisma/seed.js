import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const activities = [
    // PARIS
    {
      destination: "Paris",
      name: "Louvre Museum",
      type: "culture",
      durationHours: 3,
      priceLevel: 3,
      latitude: 48.8606,
      longitude: 2.3376,
    },
    {
      destination: "Paris",
      name: "Eiffel Tower",
      type: "culture",
      durationHours: 2,
      priceLevel: 3,
      latitude: 48.8584,
      longitude: 2.2945,
    },
    {
      destination: "Paris",
      name: "Montmartre Walk",
      type: "nature",
      durationHours: 2,
      priceLevel: 1,
      latitude: 48.8867,
      longitude: 2.3431,
    },

    // ROME
    {
      destination: "Rome",
      name: "Colosseum",
      type: "culture",
      durationHours: 2,
      priceLevel: 3,
      latitude: 41.8902,
      longitude: 12.4922,
    },
    {
      destination: "Rome",
      name: "Trastevere Food Tour",
      type: "gastronomy",
      durationHours: 3,
      priceLevel: 3,
      latitude: 41.887,
      longitude: 12.4663,
    },
    {
      destination: "Rome",
      name: "Villa Borghese Park",
      type: "nature",
      durationHours: 2,
      priceLevel: 1,
      latitude: 41.9142,
      longitude: 12.4923,
    },

    // BELGRADE
    {
      destination: "Belgrade",
      name: "Kalemegdan Fortress",
      type: "culture",
      durationHours: 2,
      priceLevel: 1,
      latitude: 44.8231,
      longitude: 20.4506,
    },
    {
      destination: "Belgrade",
      name: "Skadarlija Dinner",
      type: "gastronomy",
      durationHours: 2,
      priceLevel: 2,
      latitude: 44.8176,
      longitude: 20.4656,
    },
    {
      destination: "Belgrade",
      name: "Ada Ciganlija",
      type: "nature",
      durationHours: 3,
      priceLevel: 1,
      latitude: 44.7871,
      longitude: 20.411,
    },
  ];

  for (const a of activities) {
    await prisma.activity.upsert({
      where: {
        destination_name: {
          destination: a.destination,
          name: a.name,
        },
      },
      update: a,
      create: a,
    });
  }

  console.log("Activity seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
