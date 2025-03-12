import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import dotenv from "dotenv";
import { v7 as uuidv7 } from "uuid";

// Load environment variables
dotenv.config();

// Define types for schemas
type NewSchema = any;

// Define lead status constants
const LEAD_STATUSES = {
  new_lead: "New Lead",
  converted_to_company: "Converted to Company",
  in_progress: "In Progress",
  failed: "Failed",
};

// Define company status for test company
const COMPANY_STATUS_KEY = "potential_client";
const COMPANY_STATUS_VALUE = "Potential Client";

// Default lead status to use if we can't determine a more appropriate one
const DEFAULT_LEAD_STATUS = "New Lead";

// Define sample lead record from old schema
const sampleLead = {
  id: uuidv7(),
  email: "testinglead@testmigration.com",
  emailSent: false,
  emailOpened: false,
  companyId: "bce215ad-7fcd-40d1-bae5-e3ff6a0791c9", // This will be updated with the test company ID
  createdBy: "tfarooq@proficientnow.com",
  isPending: false,
  isProcessed: false,
  hasOrganization: false,
  hasPositions: false,
  retryCount: 0,
  isStuck: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  deletedAt: null,
};

// Define test company data
const testCompany = {
  id: uuidv7(),
  name: "Test Migration Company",
  website: "https://testmigration.com",
  domain: "testmigration.com",
  size: "50-100",
  revenue: "1M-5M",
  industry: "Technology",
  created_by: "migration_script",
  created_at: new Date(),
  last_updated_by: "migration_script",
  last_updated_at: new Date(),
  status: COMPANY_STATUS_VALUE,
  is_deleted: false,
  deleted_at: null,
  deleted_by: null,
  organization_id: null,
  careers_page: null,
  linkedin_url: null,
  raw_body: {
    name: "Test Migration Company",
    industry: "Technology",
  },
  airtable_metadata: null,
};

/**
 * Determine the appropriate lead status based on available data
 */
function determineLeadStatus(oldLead: any): string {
  if (oldLead.isStuck) {
    return "failed";
  } else if (oldLead.isPending) {
    return "in_progress";
  } else if (oldLead.companyId) {
    return "converted_to_company"; // Always use this status when we have a company
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
async function ensureLeadStatuses(prisma: any) {
  console.log("Ensuring lead statuses exist...");

  try {
    for (const [key, value] of Object.entries(LEAD_STATUSES)) {
      // Try to find existing status
      const existingStatus = await prisma.leadStatus.findUnique({
        where: { key },
      });

      // If status doesn't exist, create it
      if (!existingStatus) {
        await prisma.leadStatus.create({
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
    throw error;
  }
}

/**
 * Ensure company status exists
 */
async function ensureCompanyStatus(prisma: any) {
  console.log("Ensuring company status exists...");

  try {
    // First check if status exists by key
    let existingStatus = await prisma.companyStatus.findUnique({
      where: { key: COMPANY_STATUS_KEY },
    });

    // If not found by key, check by value as a fallback
    if (!existingStatus) {
      existingStatus = await prisma.companyStatus.findUnique({
        where: { value: COMPANY_STATUS_VALUE },
      });
    }

    if (!existingStatus) {
      // Status doesn't exist, create it
      await prisma.companyStatus.create({
        data: {
          field_type: "SINGLE_SELECT",
          field_display_name: "company_status",
          key: COMPANY_STATUS_KEY,
          value: COMPANY_STATUS_VALUE,
          color: null,
          color_hex: null,
          created_by: "migration_script",
        },
      });
      console.log(
        `Created company status: ${COMPANY_STATUS_KEY} -> ${COMPANY_STATUS_VALUE}`
      );
    } else {
      console.log(
        `Using existing company status: ${existingStatus.key} -> ${existingStatus.value}`
      );
    }

    console.log("Company status check completed.");
  } catch (error) {
    console.error("Error ensuring company status:", error);
    throw error;
  }
}

/**
 * Create a test company in the new schema
 */
async function createTestCompany(prisma: any) {
  console.log("Creating test company...");

  try {
    // Check if company with this domain already exists
    const existingCompany = await prisma.company.findUnique({
      where: { domain: testCompany.domain },
    });

    if (existingCompany) {
      console.log(
        `Company with domain ${testCompany.domain} already exists. Using existing company.`
      );
      return existingCompany;
    }

    // Create the company
    const company = await prisma.company.create({
      data: testCompany,
    });

    console.log(`Created test company: ${company.name} (${company.id})`);
    return company;
  } catch (error) {
    console.error("Error creating test company:", error);
    throw error;
  }
}

/**
 * Test migration function for a single sample lead
 */
async function testMigrateLead() {
  console.log("Starting test lead migration...");

  // Initialize Prisma clients
  const oldPrisma = new OldPrismaClient({
    datasources: {
      db: {
        url: process.env.OLD_DATABASE_URL || process.env.DATABASE_URL,
      },
    },
  });

  const newPrisma = new NewPrismaClient({
    datasources: {
      db: {
        url: process.env.NEW_DATABASE_URL || process.env.DATABASE_URL,
      },
    },
  }) as unknown as NewSchema;

  try {
    // Ensure statuses exist
    await ensureLeadStatuses(newPrisma);
    await ensureCompanyStatus(newPrisma);

    // Test Part 1: Create a test company and migrate sample lead
    console.log(
      "\n=== Part 1: Create Test Company and Migrate Sample Lead ==="
    );

    // Create a test company
    const testCompanyInDb = await createTestCompany(newPrisma);

    // Update the sample lead to reference this company
    sampleLead.companyId = testCompanyInDb.id;

    // Determine lead status - should be "converted_to_company" since we have a company
    const status = determineLeadStatus(sampleLead);

    // Transform lead data with the test company
    const transformedLead = transformLead(sampleLead, status, testCompanyInDb);

    // Display transformation result
    console.log("Sample lead from old schema (updated with test company ID):");
    console.log(JSON.stringify(sampleLead, null, 2));

    console.log("\nTransformed lead for new schema:");
    console.log(JSON.stringify(transformedLead, null, 2));

    // Ask if user wants to insert into database
    console.log(
      "\nWould you like to insert this lead into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Check if lead with this email already exists
          const existingLead = await newPrisma.lead.findUnique({
            where: { email: transformedLead.email },
          });

          if (existingLead) {
            console.log(
              `A lead with email ${transformedLead.email} already exists.`
            );
            console.log("Would you like to update it or skip? (update/skip)");

            process.stdin.once("data", async (data) => {
              const updateAnswer = data.toString().trim().toLowerCase();

              if (updateAnswer === "update" || updateAnswer === "u") {
                try {
                  // Update existing lead
                  const result = await newPrisma.lead.update({
                    where: { id: existingLead.id },
                    data: {
                      ...transformedLead,
                      id: existingLead.id, // Keep the original ID
                    },
                  });

                  console.log("Lead successfully updated in the database.");
                } catch (error) {
                  console.error("Error updating lead:", error);
                }
              } else {
                console.log("Skipped updating existing lead.");
              }

              // Proceed to part 2
              testCreateLeadForCompany(newPrisma);
            });

            return; // Wait for user input on update/skip
          }

          // Create lead in new schema
          const result = await newPrisma.lead.create({
            data: transformedLead,
          });

          console.log("Lead successfully inserted into new database.");

          // Proceed to part 2
          testCreateLeadForCompany(newPrisma);
        } catch (error: any) {
          console.error("Error inserting lead:", error);
          await oldPrisma.$disconnect();
          await newPrisma.$disconnect();
          process.exit(1);
        }
      } else {
        // Skip insertion and proceed to part 2
        console.log("Skipped inserting sample lead.");
        testCreateLeadForCompany(newPrisma);
      }
    });
  } catch (error) {
    console.error("Test migration failed:", error);
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
    process.exit(1);
  }
}

/**
 * Test function for creating a lead for a company
 */
async function testCreateLeadForCompany(newPrisma: any) {
  try {
    console.log("\n=== Part 2: Create Lead for Existing Company ===");

    // Get a random company from the new schema
    const companies = await newPrisma.company.findMany({
      take: 1,
      orderBy: { created_at: "desc" },
      where: {
        domain: { not: testCompany.domain }, // Exclude our test company
      },
    });

    if (companies.length === 0) {
      console.log(
        "No additional companies found in the new schema. Skipping this test."
      );
      await newPrisma.$disconnect();
      process.exit(0);
      return;
    }

    const company = companies[0];
    console.log("Selected company from new schema:");
    console.log(
      JSON.stringify(
        {
          id: company.id,
          name: company.name,
          domain: company.domain,
          website: company.website,
        },
        null,
        2
      )
    );

    // Check if a lead for this company already exists
    const existingLead = await newPrisma.lead.findFirst({
      where: { company_id: company.id },
    });

    if (existingLead) {
      console.log(
        `A lead for this company already exists (email: ${existingLead.email}).`
      );
      console.log(
        "Creating another lead would cause a conflict. Skipping this test."
      );
      await newPrisma.$disconnect();
      process.exit(0);
      return;
    }

    // Generate placeholder email for this company
    const email = generatePlaceholderEmail(company);
    console.log(`Generated placeholder email: ${email}`);

    // Create new lead object for this company
    const newLead = {
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
      // New fields with no direct mapping
      person_name: null,
      linkedin: null,
      phone: null,
      job_title: null,
      company_size: null,
      revenue: null,
      industry: null,
    };

    console.log("\nNew lead to be created:");
    console.log(JSON.stringify(newLead, null, 2));

    // Ask if user wants to insert into database
    console.log(
      "\nWould you like to insert this company lead into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Create lead in new schema
          const result = await newPrisma.lead.create({
            data: newLead,
          });

          console.log("Company lead successfully inserted into new database.");
          console.log(`Generated ID: ${result.id}`);
        } catch (error) {
          console.error("Error inserting company lead:", error);
        }
      } else {
        console.log("Skipped inserting company lead.");
      }

      await newPrisma.$disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error("Test creating lead for company failed:", error);
    await newPrisma.$disconnect();
    process.exit(1);
  }
}

// Run test migration
testMigrateLead();
