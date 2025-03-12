import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import crypto from "crypto";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define types for old and new schemas
type OldSchema = any;
type NewSchema = any;

// Initialize Prisma clients with explicit schema paths
const oldPrisma = new OldPrismaClient({
  datasources: {
    db: {
      url: process.env.OLD_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
}) as unknown as OldSchema;

const newPrisma = new NewPrismaClient({
  datasources: {
    db: {
      url: process.env.NEW_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
}) as unknown as NewSchema;

// Utility to normalize job titles for consistency
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .trim();
}

// Create SHA-256 hash of normalized title for JobRole
function createTitleHash(normalizedTitle: string): Buffer {
  return Buffer.from(
    crypto.createHash("sha256").update(normalizedTitle).digest("hex"),
    "hex"
  );
}

// Parse location string into components if possible
function parseLocation(location: string | null): {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
} {
  if (!location) {
    return {
      address: null,
      city: null,
      state: null,
      country: null,
      zip: null,
    };
  }

  // Basic parsing - this could be enhanced with a more sophisticated parser
  // or third-party service in a production environment
  const parts = location.split(",").map((part) => part.trim());

  // Simple heuristic: try to extract components
  // This is a basic implementation and may need enhancement based on data format
  return {
    address: parts[0] || null,
    city: parts[0] || null,
    state: parts.length > 1 ? parts[1] : null,
    country: parts.length > 2 ? parts[2] : "US", // Default to US if not specified
    zip: null, // Extracting ZIP would require more sophisticated parsing
  };
}

// Find or create JobRole entry
async function findOrCreateJobRole(
  title: string,
  description: string | null
): Promise<{
  id: string;
  title_display: string;
  title_normalized: string;
}> {
  try {
    const normalizedTitle = normalizeTitle(title);
    const titleHash = createTitleHash(normalizedTitle);

    // First try to find existing JobRole
    const existingJobRole = await newPrisma.jobRole.findFirst({
      where: {
        title_normalized: normalizedTitle,
      },
      select: {
        id: true,
        title_display: true,
        title_normalized: true,
      },
    });

    if (existingJobRole) {
      return existingJobRole;
    }

    // Create a new JobRole if not found
    const jobRoleDescription = description || `${title} role`;
    const detailedDescription = description || `This is a ${title} position.`;

    const newJobRole = await newPrisma.jobRole.create({
      data: {
        title_hash: titleHash,
        title_display: title,
        title_normalized: normalizedTitle,
        role_description: jobRoleDescription.substring(0, 500), // Ensure it fits in VarChar(500)
        job_role_description_detailed: detailedDescription,
      },
      select: {
        id: true,
        title_display: true,
        title_normalized: true,
      },
    });

    console.log(`Created new JobRole: ${title}`);
    return newJobRole;
  } catch (error) {
    console.error(`Error finding/creating JobRole for ${title}:`, error);
    throw error;
  }
}

// Find company in new database by old ID
async function findCompany(oldCompanyId: string | null): Promise<{
  id: string;
  name: string;
  status: string;
  is_deleted: boolean;
} | null> {
  if (!oldCompanyId) {
    return null;
  }

  try {
    const company = await newPrisma.company.findFirst({
      where: {
        id: oldCompanyId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        is_deleted: true,
      },
    });

    return company;
  } catch (error) {
    console.error(`Error finding company with ID ${oldCompanyId}:`, error);
    return null;
  }
}

// Migrate a single position
async function migratePosition(oldPosition: any): Promise<void> {
  try {
    // Check if position already exists in new database
    const existingPosition = await newPrisma.position.findUnique({
      where: {
        id: oldPosition.id,
      },
    });

    if (existingPosition) {
      console.log(`Position ${oldPosition.id} already exists, skipping.`);
      return;
    }

    // Find company in new database
    const company = await findCompany(oldPosition.companyId);
    if (!company) {
      console.error(
        `Company not found for position ${oldPosition.id}, skipping migration.`
      );
      return;
    }

    // Find or create JobRole
    const jobRole = await findOrCreateJobRole(
      oldPosition.position_title,
      oldPosition.job_description
    );

    // Parse location if available
    const locationInfo = parseLocation(oldPosition.location);

    // Prepare data for new Position
    const newPositionData = {
      id: oldPosition.id,
      title: oldPosition.position_title,
      description: oldPosition.job_description,

      is_active: true,
      company_id: company.id,
      company_name: company.name,
      is_company_deleted: company.is_deleted,
      company_status: company.status,

      location_address: locationInfo.address,
      location_city: locationInfo.city,
      location_state: locationInfo.state,
      location_country: locationInfo.country,
      location_zip: locationInfo.zip,

      jd_description: oldPosition.job_description || "No description available",
      jd_link: oldPosition.link || "https://example.com",

      job_role_id: jobRole.id,

      apollo_id: oldPosition.apollo_id,
      salary_range: oldPosition.salary_range,

      airtable_metadata: {},

      created_at: oldPosition.createdAt || new Date(),
      last_updated_at: oldPosition.updatedAt || new Date(),
      is_deleted: oldPosition.isDeleted || false,
      deleted_at: oldPosition.deletedAt,
    };

    // Create new Position
    await newPrisma.position.create({
      data: newPositionData,
    });

    console.log(
      `Migrated position: ${oldPosition.id} - ${oldPosition.position_title}`
    );
  } catch (error) {
    console.error(`Error migrating position ${oldPosition.id}:`, error);
  }
}

// Migrate all positions
async function migratePositions(): Promise<void> {
  console.log("Starting position migration...");
  const startTime = new Date().getTime();

  try {
    // Get total count for progress tracking
    const totalPositions = await oldPrisma.positions.count();
    console.log(`Found ${totalPositions} positions to migrate.`);

    // Get all positions from old database
    const batchSize = 100;
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    // Process in batches to avoid memory issues
    for (let skip = 0; skip < totalPositions; skip += batchSize) {
      const positions = await oldPrisma.positions.findMany({
        skip,
        take: batchSize,
      });

      // Process each position
      for (const position of positions) {
        try {
          await migratePosition(position);
          successCount++;
        } catch (error) {
          console.error(`Failed to migrate position ${position.id}:`, error);
          failedCount++;
        }
        processedCount++;

        // Log progress
        if (processedCount % 10 === 0 || processedCount === totalPositions) {
          const percentage = Math.round(
            (processedCount / totalPositions) * 100
          );
          console.log(
            `Progress: ${processedCount}/${totalPositions} (${percentage}%)`
          );
        }
      }
    }

    // Log final results
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;

    console.log("\nPosition migration completed:");
    console.log(`Total processed: ${processedCount}`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log(`Duration: ${duration} seconds`);
  } catch (error) {
    console.error("Error during position migration:", error);
  }
}

// Main function to run migration
async function runMigration(): Promise<void> {
  try {
    console.log("Starting position migration process...");
    await migratePositions();
    console.log("Position migration completed successfully.");
  } catch (error) {
    console.error("Position migration failed:", error);
    process.exit(1);
  } finally {
    // Close Prisma connections
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}

// Run the migration
runMigration()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
