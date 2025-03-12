import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import crypto from "crypto";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define types for old and new schemas
type OldSchema = any;
type NewSchema = any;

// Statistics tracking
interface MigrationStats {
  total: number;
  successful: number;
  duplicates: number;
  failed: number;
  companyMatches: {
    byId: number;
    byDomain: number;
  };
  failures: {
    uuidFormat: number;
    missingCompany: number;
    missingJobRole: number;
    dataValidation: number;
    dbError: number;
    other: number;
  };
}

// Initialize statistics
let stats: MigrationStats = {
  total: 0,
  successful: 0,
  duplicates: 0,
  failed: 0,
  companyMatches: {
    byId: 0,
    byDomain: 0,
  },
  failures: {
    uuidFormat: 0,
    missingCompany: 0,
    missingJobRole: 0,
    dataValidation: 0,
    dbError: 0,
    other: 0,
  },
};

// Arrays to track detailed results
const successResults: string[] = [];
const failureResults: string[] = [];
const duplicateResults: string[] = [];

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

/**
 * Normalize UUID to format required by Prisma (32 hex chars, no dashes)
 * @param id The UUID to normalize
 * @returns The normalized UUID or null if invalid
 */
function normalizeUuid(id: string | null): string | null {
  if (!id) return null;

  try {
    // Remove any dashes
    const normalizedId = id.replace(/-/g, "");

    // Check if result is a valid hex string of correct length
    if (/^[0-9a-f]{32}$/i.test(normalizedId)) {
      return normalizedId;
    }

    // Handle 24-character IDs (possibly MongoDB ObjectIDs)
    if (/^[0-9a-f]{24}$/i.test(normalizedId)) {
      // Pad to 32 characters by adding zeros
      return normalizedId.padEnd(32, "0");
    }

    console.warn(`Invalid UUID format: ${id}`);
    return null;
  } catch (error) {
    console.error(`Error normalizing UUID ${id}:`, error);
    return null;
  }
}

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

/**
 * Normalize domain for better matching
 * Converts to lowercase and removes www. prefix if present
 */
function normalizeDomain(domain: string): string {
  if (!domain) return "";

  // Convert to lowercase
  let normalized = domain.toLowerCase().trim();

  // Remove www. prefix if present
  if (normalized.startsWith("www.")) {
    normalized = normalized.substring(4);
  }

  return normalized;
}

// Find or create JobRole entry with improved error handling
async function findOrCreateJobRole(
  title: string,
  description: string | null
): Promise<{
  id: string;
  title_display: string;
  title_normalized: string;
} | null> {
  try {
    // Truncate title if it's too long (assuming max 200 chars for title_display)
    const truncatedTitle = title.substring(0, 200);
    const normalizedTitle = normalizeTitle(truncatedTitle).substring(0, 200);
    const titleHash = createTitleHash(normalizedTitle);

    // First try to find existing JobRole
    try {
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
    } catch (error) {
      console.error(`Error finding JobRole for ${truncatedTitle}:`, error);
      // Continue to creation attempt
    }

    // Create a new JobRole if not found
    try {
      // Truncate descriptions to safe lengths
      const jobRoleDescription = description || `${truncatedTitle} role`;
      const detailedDescription =
        description || `This is a ${truncatedTitle} position.`;

      const newJobRole = await newPrisma.jobRole.create({
        data: {
          title_hash: titleHash,
          title_display: truncatedTitle,
          title_normalized: normalizedTitle,
          role_description: jobRoleDescription.substring(0, 500), // Ensure it fits in VarChar(500)
          job_role_description_detailed: detailedDescription.substring(0, 4000), // Assuming a reasonable max length
        },
        select: {
          id: true,
          title_display: true,
          title_normalized: true,
        },
      });

      console.log(`Created new JobRole: ${truncatedTitle}`);
      return newJobRole;
    } catch (error: any) {
      // Enhanced error logging for column-length issues
      if (error.code === "P2000") {
        console.error(`Field too long error when creating JobRole for "${truncatedTitle}". 
          Error message: ${error.message}
          Meta info: ${JSON.stringify(error.meta || {})}
        `);

        // Fall back to creating with even shorter values as a last attempt
        try {
          const fallbackTitle = truncatedTitle.substring(0, 100);
          const fallbackNormalizedTitle = normalizeTitle(
            fallbackTitle
          ).substring(0, 100);
          const fallbackHash = createTitleHash(fallbackNormalizedTitle);
          const fallbackDesc = "Generic job role";

          console.log(
            `Attempting fallback creation with shorter title: "${fallbackTitle}"`
          );

          const fallbackJobRole = await newPrisma.jobRole.create({
            data: {
              title_hash: fallbackHash,
              title_display: fallbackTitle,
              title_normalized: fallbackNormalizedTitle,
              role_description: fallbackDesc,
              job_role_description_detailed: fallbackDesc,
            },
            select: {
              id: true,
              title_display: true,
              title_normalized: true,
            },
          });

          console.log(
            `Successfully created fallback JobRole: ${fallbackTitle}`
          );
          return fallbackJobRole;
        } catch (fallbackError) {
          console.error(
            `Even fallback creation failed for job role: ${truncatedTitle}`,
            fallbackError
          );
          return null;
        }
      }

      console.error(`Error creating JobRole for ${truncatedTitle}:`, error);
      return null;
    }
  } catch (error) {
    console.error(`Error in findOrCreateJobRole for ${title}:`, error);
    return null;
  }
}

// Find company in new database by old ID or domain
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
    // Normalize the company ID
    const normalizedId = normalizeUuid(oldCompanyId);
    if (!normalizedId) {
      console.warn(`Invalid company UUID format: ${oldCompanyId}`);
      // Continue to try by domain lookup
    } else {
      // Try to find by ID first
      const companyById = await newPrisma.company.findFirst({
        where: {
          id: normalizedId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          is_deleted: true,
        },
      });

      if (companyById) {
        stats.companyMatches.byId++;
        return companyById;
      }
      console.log(
        `Company with ID ${normalizedId} not found, trying domain lookup...`
      );
    }

    // If ID lookup fails, try to get the company from the old database
    const oldCompany = await oldPrisma.companies.findUnique({
      where: { id: oldCompanyId },
      select: { domain: true },
    });

    if (!oldCompany || !oldCompany.domain) {
      console.warn(
        `Company not found in old database or domain is missing: ${oldCompanyId}`
      );
      return null;
    }

    // Normalize the domain
    const normalizedDomain = normalizeDomain(oldCompany.domain);
    if (!normalizedDomain) {
      console.warn(
        `Invalid domain for company: ${oldCompanyId}, domain: ${oldCompany.domain}`
      );
      return null;
    }

    // Try to find the company by domain in new database
    // First check with exact match
    let companyByDomain = await newPrisma.company.findFirst({
      where: {
        domain: normalizedDomain,
      },
      select: {
        id: true,
        name: true,
        status: true,
        is_deleted: true,
      },
    });

    // If not found, try with string contains/case insensitive
    if (!companyByDomain) {
      // Create both versions to check (with and without www)
      const domainVariants = [normalizedDomain];
      if (normalizedDomain.startsWith("www.")) {
        domainVariants.push(normalizedDomain.substring(4));
      } else {
        domainVariants.push(`www.${normalizedDomain}`);
      }

      companyByDomain = await newPrisma.company.findFirst({
        where: {
          OR: [
            { domain: { equals: domainVariants[0], mode: "insensitive" } },
            { domain: { equals: domainVariants[1], mode: "insensitive" } },
            { domain: { contains: normalizedDomain, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          is_deleted: true,
        },
      });
    }

    if (companyByDomain) {
      stats.companyMatches.byDomain++;
      console.log(
        `Found company by domain: ${oldCompany.domain} -> ${companyByDomain.name} (ID: ${companyByDomain.id})`
      );
      return companyByDomain;
    }

    console.warn(
      `Company not found by ID or domain in new database. ID: ${oldCompanyId}, Domain: ${oldCompany.domain}`
    );
    return null;
  } catch (error) {
    console.error(`Error finding company with ID ${oldCompanyId}:`, error);
    return null;
  }
}

// Migrate a single position
async function migratePosition(oldPosition: any): Promise<string> {
  stats.total++;
  try {
    // Normalize UUID
    const normalizedId = normalizeUuid(oldPosition.id);
    if (!normalizedId) {
      stats.failed++;
      stats.failures.uuidFormat++;
      return `Failed: Invalid UUID format for position ${oldPosition.id}`;
    }

    // Check if position already exists in new database
    try {
      const existingPosition = await newPrisma.position.findUnique({
        where: {
          id: normalizedId,
        },
      });

      if (existingPosition) {
        stats.duplicates++;
        return `Duplicate: Position ${normalizedId} already exists, skipping.`;
      }
    } catch (error: any) {
      // Handle specific Prisma errors differently
      if (error.code === "P2023") {
        stats.failed++;
        stats.failures.uuidFormat++;
        return `Failed: UUID format error for position ${oldPosition.id}: ${error.message}`;
      }
      throw error; // Re-throw other errors
    }

    // Find company in new database
    const company = await findCompany(oldPosition.companyId);
    if (!company) {
      stats.failed++;
      stats.failures.missingCompany++;
      return `Failed: Company not found for position ${normalizedId}, companyId: ${oldPosition.companyId}`;
    }

    // Find or create JobRole
    const jobRole = await findOrCreateJobRole(
      oldPosition.position_title,
      oldPosition.job_description
    );

    if (!jobRole) {
      stats.failed++;
      stats.failures.missingJobRole++;
      return `Failed: Could not create or find JobRole for position ${normalizedId}, title: ${oldPosition.position_title}`;
    }

    // Parse location if available
    const locationInfo = parseLocation(oldPosition.location);

    // Validate and transform data
    try {
      // Prepare data for new Position
      const newPositionData = {
        id: normalizedId,
        title: oldPosition.position_title || "Untitled Position",
        description: oldPosition.job_description || null,

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

        jd_description:
          oldPosition.job_description || "No description available",
        jd_link: oldPosition.link || "https://example.com",

        job_role_id: jobRole.id,

        apollo_id: oldPosition.apollo_id,
        salary_range: oldPosition.salary_range,

        airtable_metadata: {},

        created_at:
          oldPosition.createdAt instanceof Date
            ? oldPosition.createdAt
            : new Date(),
        last_updated_at:
          oldPosition.updatedAt instanceof Date
            ? oldPosition.updatedAt
            : new Date(),
        is_deleted: oldPosition.isDeleted === true,
        deleted_at:
          oldPosition.deletedAt instanceof Date ? oldPosition.deletedAt : null,
      };

      // Create new Position
      await newPrisma.position.create({
        data: newPositionData,
      });

      stats.successful++;
      return `Success: Migrated position ${normalizedId} - ${oldPosition.position_title}`;
    } catch (error: any) {
      stats.failed++;
      stats.failures.dataValidation++;
      return `Failed: Data validation error for position ${normalizedId}: ${error.message}`;
    }
  } catch (error: any) {
    stats.failed++;
    stats.failures.other++;
    return `Error: Unexpected error migrating position ${oldPosition.id}: ${error.message}`;
  }
}

// Migrate all positions
async function migratePositions(): Promise<void> {
  console.log("Starting position migration...");
  const startTime = new Date().getTime();

  try {
    // Reset statistics
    stats = {
      total: 0,
      successful: 0,
      duplicates: 0,
      failed: 0,
      companyMatches: {
        byId: 0,
        byDomain: 0,
      },
      failures: {
        uuidFormat: 0,
        missingCompany: 0,
        missingJobRole: 0,
        dataValidation: 0,
        dbError: 0,
        other: 0,
      },
    };

    // Reset results arrays
    successResults.length = 0;
    failureResults.length = 0;
    duplicateResults.length = 0;

    // Get total count for progress tracking
    const totalPositions = await oldPrisma.positions.count();
    console.log(`Found ${totalPositions} positions to migrate.`);

    // Process in batches
    const batchSize = 50; // Smaller batches for better error isolation
    let processedCount = 0;

    for (let skip = 0; skip < totalPositions; skip += batchSize) {
      console.log(`Processing batch starting at position ${skip}`);

      const positions = await oldPrisma.positions.findMany({
        skip,
        take: batchSize,
      });

      // Process each position and collect results
      for (const position of positions) {
        const result = await migratePosition(position);
        processedCount++;

        // Categorize and store the result
        if (result.startsWith("Success")) {
          successResults.push(result);
        } else if (result.startsWith("Duplicate")) {
          duplicateResults.push(result);
        } else {
          failureResults.push(result);
        }

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

    // Calculate duration
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;

    // Print detailed report
    console.log("\n----- Position Migration Report -----");
    console.log(`Total positions processed: ${stats.total}`);
    console.log(`Successfully migrated: ${stats.successful}`);
    console.log(`Duplicates skipped: ${stats.duplicates}`);
    console.log(`Failed migrations: ${stats.failed}`);

    console.log("\nCompany match details:");
    console.log(`- Companies matched by ID: ${stats.companyMatches.byId}`);
    console.log(
      `- Companies matched by domain: ${stats.companyMatches.byDomain}`
    );
    console.log(
      `- Total companies matched: ${
        stats.companyMatches.byId + stats.companyMatches.byDomain
      }`
    );

    console.log("\nFailure breakdown:");
    console.log(`- UUID format issues: ${stats.failures.uuidFormat}`);
    console.log(`- Missing company: ${stats.failures.missingCompany}`);
    console.log(`- Job role creation issues: ${stats.failures.missingJobRole}`);
    console.log(`- Data validation errors: ${stats.failures.dataValidation}`);
    console.log(`- Database errors: ${stats.failures.dbError}`);
    console.log(`- Other issues: ${stats.failures.other}`);
    console.log(`\nDuration: ${duration} seconds`);

    // Show sample failures if any
    if (failureResults.length > 0) {
      console.log("\nSample failures:");
      failureResults.slice(0, 5).forEach((msg) => console.log(`- ${msg}`));
      if (failureResults.length > 5) {
        console.log(`... and ${failureResults.length - 5} more failures`);
      }
    }

    // Success rate
    const successRate =
      stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 0;
    console.log(`\nSuccess rate: ${successRate}%`);
  } catch (error) {
    console.error("Error during position migration:", error);
  }
}

// Main function to run migration
async function runMigration(): Promise<void> {
  try {
    console.log("Starting position migration process...");
    await migratePositions();
    console.log("Position migration completed.");
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
