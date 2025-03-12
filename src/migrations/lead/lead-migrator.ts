import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
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

// Define lead status constants
const LEAD_STATUSES = {
  new_lead: "New Lead",
  converted_to_company: "Converted to Company",
  in_progress: "In Progress",
  failed: "Failed",
};

// Default lead status to use if we can't determine a more appropriate one
const DEFAULT_LEAD_STATUS = "new_lead";

/**
 * Determine the appropriate lead status based on available data
 */
function determineLeadStatus(oldLead: any): string {
  if (oldLead.isStuck) {
    return "failed";
  } else if (oldLead.isPending) {
    return "in_progress";
  } else if (oldLead.companyId) {
    // Check if this lead's company exists in the new schema
    // If yes, it could be considered "converted_to_company"
    // This will be handled in the migration function
    return "new_lead"; // Default for now
  }
  return DEFAULT_LEAD_STATUS;
}

/**
 * Transform a lead from old schema to new schema format
 */
function transformLead(
  oldLead: any,
  status: string,
  companyInNewSchema?: any
): any {
  return {
    id: oldLead.id,
    email: oldLead.email,

    // Company relation
    company_id: companyInNewSchema?.id || null,
    company_name: companyInNewSchema?.name || null,
    company_website: companyInNewSchema?.website || null,

    // Status field (required in new schema)
    status: status,

    // Version field (new in the new schema)
    version: 1.0,

    // Boolean flags (renamed with snake_case)
    email_sent: oldLead.emailSent,
    email_opened: oldLead.emailOpened,
    is_pending: oldLead.isPending,
    is_processed: oldLead.isProcessed,
    has_organization: oldLead.hasOrganization,
    has_positions: oldLead.hasPositions,
    retry_count: oldLead.retryCount,
    is_stuck: oldLead.isStuck,

    // Metadata and timestamps
    created_by: oldLead.createdBy || "migration_script",
    created_at: oldLead.createdAt,
    last_updated_by: "migration_script",
    last_updated_at: oldLead.updatedAt || oldLead.createdAt,

    // Deletion tracking
    is_deleted: oldLead.isDeleted,
    deleted_at: oldLead.deletedAt,
    deleted_by: oldLead.isDeleted ? "migration_script" : null,

    // New fields with no direct mapping
    person_name: null,
    linkedin: null,
    phone: null,
    job_title: null,
    company_size: null,
    revenue: null,
    industry: null,
  };
}

/**
 * Generate a placeholder email for a company without a lead
 */
function generatePlaceholderEmail(company: any): string {
  // Clean the domain to ensure it's valid for email
  const domain = company.domain.trim().toLowerCase();

  // Generate a unique noreply email with a timestamp to avoid conflicts
  const timestamp = Date.now();
  return `noreply+${timestamp}@${domain}`;
}

/**
 * Ensure that all required lead statuses exist in the new schema
 */
async function ensureLeadStatuses() {
  console.log("Ensuring lead statuses exist...");

  try {
    for (const [key, value] of Object.entries(LEAD_STATUSES)) {
      // Try to find existing status
      const existingStatus = await newPrisma.leadStatus.findUnique({
        where: { key },
      });

      // If status doesn't exist, create it
      if (!existingStatus) {
        await newPrisma.leadStatus.create({
          data: {
            field_type: "SINGLE_SELECT",
            field_display_name: "leads_status",
            key,
            value,
            color: null,
            color_hex: null,
            created_by: "migration_script",
          },
        });
        console.log(`Created lead status: ${key}`);
      }
    }

    console.log("Lead statuses check completed.");
  } catch (error) {
    console.error("Error ensuring lead statuses:", error);
    throw error; // Re-throw to abort migration if statuses can't be created
  }
}

/**
 * Migrate leads from the old schema to the new schema
 */
async function migrateOldLeads() {
  console.log("Migrating leads from old schema...");

  // Get all leads from old schema
  const oldLeads = await oldPrisma.leads.findMany();
  console.log(`Found ${oldLeads.length} leads in old schema.`);

  let successCount = 0;
  let existingCount = 0;
  let errorCount = 0;

  // Process leads in batches
  const batchSize = 50;
  for (let i = 0; i < oldLeads.length; i += batchSize) {
    const batch = oldLeads.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        oldLeads.length / batchSize
      )}...`
    );

    for (const oldLead of batch) {
      try {
        // Check if lead with this email already exists in new schema
        const existingLead = await newPrisma.lead.findUnique({
          where: { email: oldLead.email },
        });

        if (existingLead) {
          console.log(
            `Lead with email ${oldLead.email} already exists. Skipping.`
          );
          existingCount++;
          continue;
        }

        // Determine status based on lead data
        let status = determineLeadStatus(oldLead);

        // Check if this lead's company exists in the new schema
        let companyInNewSchema = null;
        if (oldLead.companyId) {
          companyInNewSchema = await newPrisma.company.findUnique({
            where: { id: oldLead.companyId },
          });

          if (companyInNewSchema) {
            // Update status if company exists
            status = "converted_to_company";
          }
        }

        // Transform lead data
        const newLead = transformLead(oldLead, status, companyInNewSchema);

        // Create lead in new schema
        await newPrisma.lead.create({
          data: newLead,
        });

        successCount++;
      } catch (error: any) {
        // Check if error is due to unique constraint violation on email
        if (error.code === "P2002" && error.meta?.target?.includes("email")) {
          console.log(
            `Lead with email ${oldLead.email} already exists. Skipping.`
          );
          existingCount++;
        } else {
          console.error(`Error migrating lead ${oldLead.id}:`, error);
          errorCount++;
        }
      }
    }
  }

  return { successCount, existingCount, errorCount };
}

/**
 * Create leads for companies in the new schema
 */
async function createLeadsForCompanies() {
  console.log("Creating leads for companies in new schema...");

  // Get all companies from new schema
  const companies = await newPrisma.company.findMany();
  console.log(`Found ${companies.length} companies in new schema.`);

  let successCount = 0;
  let existingCount = 0;
  let errorCount = 0;

  // Process companies in batches
  const batchSize = 50;
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        companies.length / batchSize
      )}...`
    );

    for (const company of batch) {
      try {
        // Check if a lead for this company already exists
        const existingLead = await newPrisma.lead.findFirst({
          where: { company_id: company.id },
        });

        if (existingLead) {
          console.log(
            `Lead for company ${company.id} already exists. Skipping.`
          );
          existingCount++;
          continue;
        }

        // Generate placeholder email for this company
        const email = generatePlaceholderEmail(company);

        // Create new lead for this company
        await newPrisma.lead.create({
          data: {
            id: undefined, // Let Prisma generate a new UUID
            email: email,
            company_id: company.id,
            company_name: company.name,
            company_website: company.website,
            status: "converted_to_company",
            version: 1.0,
            email_sent: false,
            email_opened: false,
            is_pending: false,
            is_processed: true,
            has_organization: true,
            has_positions: false,
            retry_count: 0,
            is_stuck: false,
            created_by: "migration_script",
            created_at: company.created_at,
            last_updated_by: "migration_script",
            last_updated_at: company.last_updated_at,
            is_deleted: company.is_deleted,
            deleted_at: company.deleted_at,
            deleted_by: company.deleted_by,
          },
        });

        successCount++;
      } catch (error: any) {
        // Check if error is due to unique constraint violation on email
        if (error.code === "P2002" && error.meta?.target?.includes("email")) {
          console.log(
            `Error: Email conflict when creating lead for company ${company.id}.`
          );
          existingCount++;
        } else {
          console.error(
            `Error creating lead for company ${company.id}:`,
            error
          );
          errorCount++;
        }
      }
    }
  }

  return { successCount, existingCount, errorCount };
}

/**
 * Main migration function
 */
async function migrateLeads() {
  console.log("Starting lead migration...");

  try {
    // Ensure lead statuses exist in the new schema
    await ensureLeadStatuses();

    // Migrate leads from old schema
    const oldLeadResults = await migrateOldLeads();

    // Create leads for companies in new schema
    const companyLeadResults = await createLeadsForCompanies();

    // Report results
    console.log("\nLead migration completed.");
    console.log("\nResults for migrating leads from old schema:");
    console.log(`Successfully migrated: ${oldLeadResults.successCount}`);
    console.log(`Already existing (skipped): ${oldLeadResults.existingCount}`);
    console.log(`Failed migrations: ${oldLeadResults.errorCount}`);

    console.log("\nResults for creating leads from companies:");
    console.log(`Successfully created: ${companyLeadResults.successCount}`);
    console.log(
      `Already existing (skipped): ${companyLeadResults.existingCount}`
    );
    console.log(`Failed creations: ${companyLeadResults.errorCount}`);

    console.log("\nTotal leads after migration:");
    const totalLeads = await newPrisma.lead.count();
    console.log(`Total leads in new schema: ${totalLeads}`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Disconnect Prisma clients
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}

// Execute migration
migrateLeads()
  .then(() => {
    console.log("Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
