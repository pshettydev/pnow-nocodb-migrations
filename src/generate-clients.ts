import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * Generate Prisma clients for both old and new schemas
 */
async function generatePrismaClients() {
  try {
    console.log("Generating Prisma clients...");

    // Generate old client
    console.log("Generating old client...");
    await execAsync(
      "npx prisma generate --schema=./src/prisma/old-schema/schema.prisma"
    );

    // Generate new client
    console.log("Generating new client...");
    await execAsync(
      "npx prisma generate --schema=./src/prisma/new-schema/schema.prisma"
    );

    console.log("Prisma clients generated successfully!");
  } catch (error) {
    console.error("Error generating Prisma clients:", error);
    process.exit(1);
  }
}

// Run the function
generatePrismaClients();
