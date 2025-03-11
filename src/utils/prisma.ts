import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import dotenv from "dotenv";

dotenv.config();

// Create instances of the Prisma clients
export const oldPrisma = new OldPrismaClient({
  datasources: {
    db: {
      url: process.env.OLD_DATABASE_URL,
    },
  },
});

export const newPrisma = new NewPrismaClient({
  datasources: {
    db: {
      url: process.env.NEW_DATABASE_URL,
    },
  },
});

// Function to close both Prisma clients
export const closePrismaConnections = async () => {
  await oldPrisma.$disconnect();
  await newPrisma.$disconnect();
};

// Function to handle errors and close connections
export const handleError = (error: Error) => {
  console.error("Error during migration:", error);
  closePrismaConnections().catch((disconnectError) => {
    console.error("Error disconnecting from databases:", disconnectError);
  });
  process.exit(1);
};
