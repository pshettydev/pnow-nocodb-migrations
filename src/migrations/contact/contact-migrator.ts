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
    emailStatusError: number;
    duplicateEmail: number;
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
    emailStatusError: 0,
    duplicateEmail: 0,
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

/**
 * Find or create ContactEmailStatus for the contact
 * @param status The email status value from old schema
 * @returns The email status object or null if error
 */
async function findOrCreateEmailStatus(
  status: string | null
): Promise<{ value: string; key: string } | null> {
  // Default to "unavailable" if not provided
  const emailStatus = status?.toLowerCase() || "unavailable";

  try {
    // Try to find existing email status
    const existingStatus = await newPrisma.contactEmailStatus.findFirst({
      where: { value: emailStatus },
      select: { value: true, key: true },
    });

    if (existingStatus) {
      return existingStatus;
    }

    // Create a new email status if not found
    // Generate key by replacing spaces with underscores and lowercase
    const statusKey = emailStatus.toLowerCase().replace(/\s+/g, "_");

    const newStatus = await newPrisma.contactEmailStatus.create({
      data: {
        field_display_name: "email_status",
        value: emailStatus,
        key: statusKey,
        color: null,
        color_hex: null,
        created_by: "migration_script",
      },
      select: {
        value: true,
        key: true,
      },
    });

    console.log(`Created new ContactEmailStatus: ${emailStatus}`);
    return newStatus;
  } catch (error) {
    console.error(`Error in findOrCreateEmailStatus for ${status}:`, error);

    // Try to create a fallback generic status
    try {
      const fallbackStatus = "unavailable";
      const existingFallback = await newPrisma.contactEmailStatus.findFirst({
        where: { value: fallbackStatus },
        select: { value: true, key: true },
      });

      if (existingFallback) {
        return existingFallback;
      }

      // Create generic status
      const newFallback = await newPrisma.contactEmailStatus.create({
        data: {
          field_display_name: "email_status",
          value: fallbackStatus,
          key: fallbackStatus,
          created_by: "migration_script",
        },
        select: {
          value: true,
          key: true,
        },
      });

      return newFallback;
    } catch (fallbackError) {
      console.error(
        "Even fallback email status creation failed:",
        fallbackError
      );
      return null;
    }
  }
}

/**
 * Find company in new database by old ID or domain
 */
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

/**
 * Migrate a single contact from old schema to new schema
 */
async function migrateContact(oldContact: any): Promise<string> {
  stats.total++;
  try {
    // Normalize UUID
    const normalizedId = normalizeUuid(oldContact.id);
    if (!normalizedId) {
      stats.failed++;
      stats.failures.uuidFormat++;
      return `Failed: Invalid UUID format for contact ${oldContact.id}`;
    }

    // Check if contact already exists in new database
    try {
      const existingContact = await newPrisma.contact.findUnique({
        where: {
          id: normalizedId,
        },
      });

      if (existingContact) {
        stats.duplicates++;
        return `Duplicate: Contact ${normalizedId} already exists, skipping.`;
      }
    } catch (error: any) {
      // Handle specific Prisma errors differently
      if (error.code === "P2023") {
        stats.failed++;
        stats.failures.uuidFormat++;
        return `Failed: UUID format error for contact ${oldContact.id}: ${error.message}`;
      }
      throw error; // Re-throw other errors
    }

    // Find company in new database
    const company = await findCompany(oldContact.companyId);
    if (!company) {
      stats.failed++;
      stats.failures.missingCompany++;
      return `Failed: Company not found for contact ${normalizedId}, companyId: ${oldContact.companyId}`;
    }

    // Find or create email status
    const emailStatus = await findOrCreateEmailStatus(oldContact.email_status);
    if (!emailStatus) {
      stats.failed++;
      stats.failures.emailStatusError++;
      return `Failed: Could not create or find EmailStatus for contact ${normalizedId}`;
    }

    // Handle email uniqueness - check if email exists and is not null
    let contactEmail = oldContact.email;
    if (contactEmail) {
      try {
        const existingEmail = await newPrisma.contact.findFirst({
          where: {
            email: contactEmail,
            id: { not: normalizedId }, // Don't match self
          },
        });

        if (existingEmail) {
          // Append random string to email to make it unique
          const randomStr = Math.random().toString(36).substring(2, 8);
          const emailParts = contactEmail.split("@");
          if (emailParts.length === 2) {
            contactEmail = `${emailParts[0]}+${randomStr}@${emailParts[1]}`;
          } else {
            // If email format is invalid, append random string
            contactEmail = `${contactEmail}+${randomStr}`;
          }
          console.log(
            `Email conflict detected, using modified email: ${contactEmail}`
          );
        }
      } catch (error) {
        console.error(`Error checking email uniqueness: ${error}`);
        // Continue with original email, might fail later
      }
    }

    // Prepare data for new Contact
    // Truncate fields that might be too long for the database
    const newContactData = {
      id: normalizedId,

      // Required fields (with fallbacks and truncation)
      name: (
        oldContact.full_name ||
        `${oldContact.first_name || ""} ${oldContact.last_name || ""}`.trim() ||
        "Unknown Contact"
      ).substring(0, 250),
      job_title: (oldContact.title || "Unknown Title").substring(0, 250),
      company_id: company.id,

      // Optional fields
      email: contactEmail,
      phone: null, // Not available in old schema
      linkedin: oldContact.linkedin_url,

      // Additional fields from old schema
      apollo_id: oldContact.apollo_id,
      first_name: oldContact.first_name?.substring(0, 100),
      last_name: oldContact.last_name?.substring(0, 100),
      full_name: oldContact.full_name?.substring(0, 200),
      linkedin_url: oldContact.linkedin_url?.substring(0, 500),
      title: oldContact.title?.substring(0, 250),
      email_status: emailStatus.value,
      photo_url: oldContact.photo_url?.substring(0, 500),
      organization_id: oldContact.organization_id,

      // Location info (limited to reasonable lengths)
      // location_id: null, // Would need location creation

      // Arrays (ensure they're valid arrays)
      departments: Array.isArray(oldContact.departments)
        ? oldContact.departments
        : [],
      subdepartments: Array.isArray(oldContact.subdepartments)
        ? oldContact.subdepartments
        : [],
      seniority: oldContact.seniority?.substring(0, 100),
      functions: Array.isArray(oldContact.functions)
        ? oldContact.functions
        : [],

      // JSON data
      raw_body: oldContact.raw_body,
      airtable_metadata: {},

      // Timestamps and flags
      created_at:
        oldContact.createdAt instanceof Date
          ? oldContact.createdAt
          : new Date(),
      last_updated_at:
        oldContact.updatedAt instanceof Date
          ? oldContact.updatedAt
          : new Date(),
      is_deleted: oldContact.isDeleted === true,
      deleted_at:
        oldContact.deletedAt instanceof Date ? oldContact.deletedAt : null,
    };

    // Create new Contact
    await newPrisma.contact.create({
      data: newContactData,
    });

    stats.successful++;
    return `Success: Migrated contact ${normalizedId} - ${
      oldContact.full_name || "Unknown"
    }`;
  } catch (error: any) {
    // Handle specific error types
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      stats.failed++;
      stats.failures.duplicateEmail++;
      return `Failed: Duplicate email error for contact ${oldContact.id}: ${oldContact.email}`;
    } else if (error.code === "P2000") {
      stats.failed++;
      stats.failures.dataValidation++;
      return `Failed: Data too long for contact ${oldContact.id}: ${error.meta?.target}`;
    } else {
      stats.failed++;
      stats.failures.other++;
      return `Error: Unexpected error migrating contact ${oldContact.id}: ${error.message}`;
    }
  }
}

/**
 * Migrate all contacts in batches
 */
async function migrateContacts(): Promise<void> {
  console.log("Starting contact migration...");
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
        emailStatusError: 0,
        duplicateEmail: 0,
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
    const totalContacts = await oldPrisma.contacts.count();
    console.log(`Found ${totalContacts} contacts to migrate.`);

    // Process in batches
    const batchSize = 50; // Smaller batches for better error isolation
    let processedCount = 0;

    for (let skip = 0; skip < totalContacts; skip += batchSize) {
      console.log(`Processing batch starting at contact ${skip}`);

      const contacts = await oldPrisma.contacts.findMany({
        skip,
        take: batchSize,
      });

      // Process each contact and collect results
      for (const contact of contacts) {
        const result = await migrateContact(contact);
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
        if (processedCount % 10 === 0 || processedCount === totalContacts) {
          const percentage = Math.round((processedCount / totalContacts) * 100);
          console.log(
            `Progress: ${processedCount}/${totalContacts} (${percentage}%)`
          );
        }
      }
    }

    // Calculate duration
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;

    // Print detailed report
    console.log("\n----- Contact Migration Report -----");
    console.log(`Total contacts processed: ${stats.total}`);
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
    console.log(`- Email status errors: ${stats.failures.emailStatusError}`);
    console.log(`- Duplicate email errors: ${stats.failures.duplicateEmail}`);
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
    console.error("Error during contact migration:", error);
  }
}

/**
 * Main function to run migration
 */
async function runMigration(): Promise<void> {
  try {
    console.log("Starting contact migration process...");
    await migrateContacts();
    console.log("Contact migration completed.");
  } catch (error) {
    console.error("Contact migration failed:", error);
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
