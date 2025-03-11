import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";

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

// Default company status to use if we can't determine a more appropriate one
const DEFAULT_COMPANY_STATUS = "Potential Client"; // Maps to "potential_client"

// Map of all available company statuses
const COMPANY_STATUSES = {
  "dh/contract_agreement_signed": "DH/Contract Agreement Signed",
  no_recruitment_services_required: "No Recruitment Services Required",
  potential_client: "Potential Client",
  "client_inactive/not_responding": "Client Inactive/Not Responding",
  do_not_contact_email_received: "Do Not Contact Email Received",
  position_not_being_filled_by_recruiters:
    "Position Not Being Filled By Recruiters",
  client_backed_out: "Client Backed Out",
  "dh/contract_agreement_sent": "DH/Contract Agreement Sent",
  clients_will_work_in_the_future: "Clients Will Work in the Future",
  not_happy_with_terms: "Not happy With Terms",
  "pro-rated_refund_agreement": "Pro-Rated Refund Agreement",
  job_closed_internally: "Job Closed Internally",
  ready_to_dh_agreement: "Ready To DH Agreement",
  client_wants_refund_policy: "Client Wants Refund Policy",
  contract_terminated: "Contract Terminated",
};

/**
 * Parse the raw_body JSON string from old schema
 * @param rawBodyStr - The raw_body string from old schema
 * @returns Parsed JSON object or null if parsing fails
 */
function parseRawBody(rawBodyStr: string | null): any {
  if (!rawBodyStr) return null;

  try {
    return JSON.parse(rawBodyStr);
  } catch (error) {
    console.error("Error parsing raw_body JSON:", error);
    return null;
  }
}

/**
 * Determine the appropriate company status based on available data
 * In a real scenario, you might have business logic to determine the status
 * For this example, we're using a default status
 */
function determineCompanyStatus(oldCompany: any, rawBody: any): string {
  // In a real implementation, you might have logic to determine
  // the appropriate status based on the old company data
  // For this example, we'll use a default status
  return DEFAULT_COMPANY_STATUS;
}

/**
 * Transform a company from old schema to new schema format
 */
function transformCompany(oldCompany: any): any {
  // Parse raw_body JSON
  const rawBody = parseRawBody(oldCompany.raw_body);

  // Determine company status
  const status = determineCompanyStatus(oldCompany, rawBody);

  // Extract name and website from raw_body if available
  const name = rawBody?.name || `Unknown Company (${oldCompany.domain})`;
  const website = rawBody?.website_url || `http://${oldCompany.domain}`;

  // Convert company_size to string format if needed
  let size = null;
  if (oldCompany.company_size !== null) {
    size = String(oldCompany.company_size);
  } else if (rawBody?.estimated_num_employees) {
    size = String(rawBody.estimated_num_employees);
  }

  // Create transformed company object for new schema
  return {
    id: oldCompany.id, // Keep the same ID
    name: name,
    website: website,
    domain: oldCompany.domain,

    // Optional fields
    size: size,
    revenue: null, // No direct mapping in old schema
    industry: oldCompany.industry || rawBody?.industry || null,

    // Metadata and timestamps
    created_by: "migration_script",
    created_at: oldCompany.createdAt,
    last_updated_by: "migration_script",
    last_updated_at: oldCompany.updatedAt || oldCompany.createdAt,

    // Status field (required in new schema)
    status: status,

    // Deletion tracking
    is_deleted: oldCompany.isDeleted,
    deleted_at: oldCompany.deletedAt,
    deleted_by: oldCompany.isDeleted ? "migration_script" : null,

    // Additional fields from old schema
    organization_id: oldCompany.organizationId,
    careers_page: oldCompany.careers_page,
    linkedin_url: oldCompany.linkedin_url,
    raw_body: rawBody, // Store as a JSON object

    // New fields with no direct mapping
    airtable_metadata: null,
  };
}

/**
 * Main migration function
 */
async function migrateCompanies() {
  console.log("Starting company migration...");

  try {
    // Ensure company statuses exist in the new schema
    await ensureCompanyStatuses();

    // Get all companies from old schema
    const oldCompanies = await oldPrisma.companies.findMany();
    console.log(`Found ${oldCompanies.length} companies in old schema.`);

    let successCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    // Process companies in batches (to avoid memory issues with large datasets)
    const batchSize = 50;
    for (let i = 0; i < oldCompanies.length; i += batchSize) {
      const batch = oldCompanies.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          oldCompanies.length / batchSize
        )}...`
      );

      for (const oldCompany of batch) {
        try {
          // Transform company data
          const newCompany = transformCompany(oldCompany);

          // Check if company with this domain already exists
          const existingCompany = await newPrisma.company.findUnique({
            where: { domain: newCompany.domain },
          });

          if (existingCompany && existingCompany.id !== newCompany.id) {
            console.log(
              `Company with domain ${newCompany.domain} already exists (ID: ${existingCompany.id}). Skipping.`
            );
            existingCount++;
            continue; // Skip to next company
          }

          // Create company in new schema
          await newPrisma.company.upsert({
            where: { id: newCompany.id },
            update: newCompany,
            create: newCompany,
          });

          successCount++;
        } catch (error: any) {
          // Check if error is due to unique constraint violation on domain
          if (
            error.code === "P2002" &&
            error.meta?.target?.includes("domain")
          ) {
            console.log(
              `Company with domain ${oldCompany.domain} already exists. Skipping.`
            );
            existingCount++;
          } else {
            console.error(`Error migrating company ${oldCompany.id}:`, error);
            errorCount++;
          }
        }
      }
    }

    console.log("\nCompany migration completed.");
    console.log(`Total companies found in old schema: ${oldCompanies.length}`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Already existing (skipped): ${existingCount}`);
    console.log(`Failed migrations: ${errorCount}`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Disconnect Prisma clients
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}

/**
 * Ensure that all required company statuses exist in the new schema
 */
async function ensureCompanyStatuses() {
  console.log("Ensuring company statuses exist...");

  try {
    for (const [key, value] of Object.entries(COMPANY_STATUSES)) {
      // Try to find existing status
      const existingStatus = await newPrisma.companyStatus.findUnique({
        where: { key },
      });

      // If status doesn't exist, create it
      if (!existingStatus) {
        await newPrisma.companyStatus.create({
          data: {
            field_type: "SINGLE_SELECT",
            field_display_name: "company_status",
            key,
            value,
            color: null, // You might want to set a default color
            color_hex: null, // You might want to set a default color hex
            created_by: "migration_script",
          },
        });
        console.log(`Created company status: ${key}`);
      }
    }

    console.log("Company statuses check completed.");
  } catch (error) {
    console.error("Error ensuring company statuses:", error);
    throw error; // Re-throw to abort migration if statuses can't be created
  }
}

// Execute migration
migrateCompanies()
  .then(() => {
    console.log("Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
