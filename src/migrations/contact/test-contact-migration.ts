import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import dotenv from "dotenv";
import { v7 as uuidv7 } from "uuid";

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

// Define sample contact record for testing
const testContact = {
  id: uuidv7(),
  apollo_id: "test123456",
  first_name: "Test",
  last_name: "Contact",
  full_name: "Test Contact",
  linkedin_url: "https://www.linkedin.com/in/testcontact",
  title: "Test Migration Specialist",
  email_status: "verified",
  email: "test.contact@example.com",
  photo_url: "https://example.com/photo.jpg",
  organization_id: null,
  state: "CA",
  city: "San Francisco",
  country: "USA",
  departments: ["master_engineering_technical"],
  subdepartments: ["software_development"],
  seniority: "senior",
  functions: ["engineering"],
  raw_body: JSON.stringify({
    id: "test123456",
    name: "Test Contact",
    title: "Test Migration Specialist",
    organization: {
      name: "Test Company",
      website_url: "https://testcompany.com",
    },
  }),
  companyId: null, // Will be updated with test company ID
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  deletedAt: null,
};

// Define test company data
const testCompany = {
  id: uuidv7(),
  name: "Test Contact Migration Company",
  website: "https://testcontactmigration.com",
  domain: "testcontactmigration.com",
  size: "50-100",
  industry: "Technology",
  created_by: "contact_migration_script",
  created_at: new Date(),
  last_updated_by: "contact_migration_script",
  last_updated_at: new Date(),
  status: "Potential Client",
  is_deleted: false,
  deleted_at: null,
  deleted_by: null,
  organization_id: null,
  careers_page: null,
  linkedin_url: null,
  raw_body: {
    name: "Test Contact Migration Company",
    industry: "Technology",
  },
  airtable_metadata: {},
};

// Test utilities
function log(message: string, isError = false): void {
  if (isError) {
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

/**
 * Ensure a UUID is in the format required by Prisma (with dashes)
 * This function handles both dash and no-dash formats and ensures proper formatting
 */
function ensureValidUuid(id: string | null): string | null {
  if (!id) return null;

  // If it's already a valid UUID format (8-4-4-4-12), return it
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return id;
  }

  // If it's a UUID without dashes (32 hex chars), add dashes in the right places
  if (/^[0-9a-f]{32}$/i.test(id)) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(
      16,
      20
    )}-${id.slice(20)}`;
  }

  console.warn(`Invalid UUID format: ${id} - generating a new one`);
  return uuidv7();
}

/**
 * Normalize domain for better matching
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
 * Find or create ContactEmailStatus
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
      log(`Found existing email status: ${emailStatus}`);
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
        created_by: "test_script",
      },
      select: {
        value: true,
        key: true,
      },
    });

    log(`Created new ContactEmailStatus: ${emailStatus}`);
    return newStatus;
  } catch (error) {
    log(`Error in findOrCreateEmailStatus for ${status}: ${error}`, true);
    return null;
  }
}

/**
 * Ensure company status exists
 */
async function ensureCompanyStatus(prisma: any) {
  console.log("Ensuring company status exists...");

  try {
    // First check if status exists by value
    let existingStatus = await prisma.companyStatus.findFirst({
      where: { value: "Potential Client" },
    });

    if (!existingStatus) {
      // Status doesn't exist, create it
      existingStatus = await prisma.companyStatus.create({
        data: {
          field_type: "SINGLE_SELECT",
          field_display_name: "company_status",
          key: "potential_client",
          value: "Potential Client",
          color: null,
          color_hex: null,
          created_by: "test_script",
        },
      });
      log(`Created company status: "Potential Client"`);
    } else {
      log(`Using existing company status: "${existingStatus.value}"`);
    }

    return existingStatus;
  } catch (error) {
    log("Error ensuring company status:", true);
    console.error(error);
    throw error;
  }
}

/**
 * Create a test company in the new database
 */
async function createTestCompany(prisma: any): Promise<any> {
  console.log("Creating test company...");

  try {
    // Check if company with this domain already exists
    const existingCompany = await prisma.company.findFirst({
      where: { domain: testCompany.domain },
    });

    if (existingCompany) {
      log(
        `Company with domain ${testCompany.domain} already exists. Using existing company.`
      );
      return existingCompany;
    }

    // Ensure the company ID is a valid UUID with dashes
    const companyId = uuidv7();
    console.log(`Generated new company ID: ${companyId}`);

    // Create a clean company object
    const cleanCompanyData = {
      ...testCompany,
      id: companyId,
    };

    // Create the company
    const company = await prisma.company.create({
      data: cleanCompanyData,
    });

    log(`Created test company: ${company.name} (${company.id})`);
    return company;
  } catch (error) {
    log("Error creating test company:", true);
    console.error(error);
    throw error;
  }
}

/**
 * Test finding a company
 */
async function testFindCompany(companyId: string): Promise<any> {
  console.log("\n--- Testing Company Finding ---");
  console.log(`Looking for company with ID: ${companyId}`);

  async function findCompany(companyId: string | null): Promise<any> {
    if (!companyId) {
      return null;
    }

    try {
      // Ensure ID is in correct format
      const validCompanyId = ensureValidUuid(companyId);
      console.log(`Searching for company with formatted ID: ${validCompanyId}`);

      if (!validCompanyId) {
        console.warn(`Cannot search with invalid company ID: ${companyId}`);
        return null;
      }

      const company = await newPrisma.company.findFirst({
        where: {
          id: validCompanyId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          is_deleted: true,
          domain: true,
        },
      });

      if (company) {
        return company;
      }

      // If not found by ID, we'd implement domain lookup here in the real migrator
      console.log(
        `Company with ID ${validCompanyId} not found, would try domain lookup in real migration.`
      );
      return null;
    } catch (error) {
      console.error(`Error finding company:`, error);
      return null;
    }
  }

  try {
    const company = await findCompany(companyId);
    if (company) {
      log(`Successfully found company with ID: ${companyId}`);
      return company;
    } else {
      log(`Company with ID ${companyId} not found in new database.`, true);
      return null;
    }
  } catch (error) {
    log(`Error in company test: ${error}`, true);
    return null;
  }
}

/**
 * Test Email Status creation and lookup
 */
async function testEmailStatusCreation(): Promise<void> {
  console.log("\n--- Testing Email Status Creation ---");

  const statuses = ["verified", "unavailable"];

  for (const status of statuses) {
    try {
      const emailStatus = await findOrCreateEmailStatus(status);
      if (emailStatus) {
        log(`Successfully found/created email status: ${status}`);
      } else {
        log(`Failed to find/create email status: ${status}`, true);
      }
    } catch (error) {
      log(`Error in email status test for "${status}": ${error}`, true);
    }
  }
}

/**
 * Transform contact data for new schema
 */
function transformContact(
  oldContact: any,
  company: any,
  emailStatus: any
): any {
  console.log(`Transforming contact with ID: ${oldContact.id}`);

  // Generate a UUID in the correct format (with dashes)
  const contactId = uuidv7();
  console.log(`Generated new contact ID: ${contactId}`);

  // Ensure company ID is in correct format (with dashes)
  const companyId = ensureValidUuid(company.id);
  if (!companyId) {
    throw new Error(`Invalid company ID: ${company.id}`);
  }
  console.log(`Using formatted company ID: ${companyId}`);

  return {
    id: contactId,
    name:
      oldContact.full_name ||
      `${oldContact.first_name || ""} ${oldContact.last_name || ""}`.trim() ||
      "Unknown Contact",
    job_title: oldContact.title || "Unknown Title",
    company_id: companyId,
    email: oldContact.email,
    phone: null, // Not available in old schema
    linkedin: oldContact.linkedin_url,
    apollo_id: oldContact.apollo_id,
    first_name: oldContact.first_name,
    last_name: oldContact.last_name,
    full_name: oldContact.full_name,
    linkedin_url: oldContact.linkedin_url,
    title: oldContact.title,
    email_status: emailStatus.value,
    photo_url: oldContact.photo_url,
    organization_id: null,
    departments: oldContact.departments || [],
    subdepartments: oldContact.subdepartments || [],
    seniority: oldContact.seniority,
    functions: oldContact.functions || [],
    raw_body: oldContact.raw_body,
    airtable_metadata: {},
    created_at: oldContact.createdAt,
    last_updated_at: oldContact.updatedAt,
    is_deleted: oldContact.isDeleted,
    deleted_at: oldContact.deletedAt,
  };
}

/**
 * Test contact migration with a sample contact
 */
async function testContactMigration(): Promise<void> {
  console.log("\n--- Testing Contact Migration with Interactive Prompts ---");

  try {
    // Ensure company status exists
    await ensureCompanyStatus(newPrisma);

    // Create test company
    console.log("\n=== Part 1: Create Test Company ===");
    const testCompanyInDb = await createTestCompany(newPrisma);

    // Create email statuses
    console.log("\n=== Part 2: Create Email Statuses ===");
    await testEmailStatusCreation();
    const emailStatus = await findOrCreateEmailStatus(testContact.email_status);

    if (!testCompanyInDb || !emailStatus) {
      log("Failed to set up test prerequisites.", true);
      return;
    }

    // Update sample contact with test company ID
    testContact.companyId = testCompanyInDb.id;
    console.log(`Using test company ID: ${testCompanyInDb.id}`);

    console.log("\n=== Part 3: Test Contact Migration ===");

    // Find company in new DB to ensure it exists
    const company = await testFindCompany(testCompanyInDb.id);

    if (!company) {
      log(
        "Company not found in new database for test contact. Cannot proceed.",
        true
      );
      return;
    }

    // Transform contact data
    const transformedContact = transformContact(
      testContact,
      company,
      emailStatus
    );

    // Display sample and transformed data
    console.log("Sample contact from old schema (with test company ID):");
    console.log(JSON.stringify(testContact, null, 2));

    console.log("\nTransformed contact for new schema:");
    console.log(JSON.stringify(transformedContact, null, 2));

    // Ask user if they want to insert the test contact
    console.log(
      "\nWould you like to insert this test contact into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Check if contact already exists
          const existingContact = await newPrisma.contact.findUnique({
            where: { id: transformedContact.id },
          });

          if (existingContact) {
            console.log(
              `A contact with ID ${transformedContact.id} already exists.`
            );
            console.log("Would you like to update it or skip? (update/skip)");

            process.stdin.once("data", async (data) => {
              const updateAnswer = data.toString().trim().toLowerCase();

              if (updateAnswer === "update" || updateAnswer === "u") {
                try {
                  // Update existing contact
                  await newPrisma.contact.update({
                    where: { id: existingContact.id },
                    data: {
                      ...transformedContact,
                      id: existingContact.id, // Keep the original ID
                    },
                  });

                  console.log(
                    "Test contact successfully updated in the database."
                  );
                  await testCreateSecondContact(newPrisma, emailStatus);
                } catch (error) {
                  console.error("Error updating test contact:", error);
                  await cleanup();
                }
              } else {
                console.log("Skipped updating existing contact.");
                await testCreateSecondContact(newPrisma, emailStatus);
              }
            });

            return; // Wait for user input on update/skip
          }

          // Add debugging before creation
          console.log("About to create contact with these IDs:");
          console.log(`Contact ID: ${transformedContact.id}`);
          console.log(`Company ID: ${transformedContact.company_id}`);

          // Log ID formats for debugging
          console.log(`Contact ID format: ${transformedContact.id}`);
          console.log(`Company ID format: ${transformedContact.company_id}`);

          // Create contact in new schema
          await newPrisma.contact.create({
            data: transformedContact,
          });

          console.log("Test contact successfully inserted into the database.");

          // Proceed to test creating a second contact
          await testCreateSecondContact(newPrisma, emailStatus);
        } catch (error) {
          console.error("Error inserting test contact:", error);
          await cleanup();
        }
      } else {
        console.log("Skipped inserting test contact.");
        // Proceed to second test anyway
        await testCreateSecondContact(newPrisma, emailStatus);
      }
    });
  } catch (error) {
    console.error("Test contact migration failed:", error);
    await cleanup();
  }
}

/**
 * Test creating a second contact for an existing company
 */
async function testCreateSecondContact(
  prisma: any,
  emailStatus: any
): Promise<void> {
  try {
    console.log("\n=== Part 4: Create Second Contact for Existing Company ===");

    // Get a random company from the new schema
    const companies = await prisma.company.findMany({
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
      await cleanup();
      return;
    }

    const company = companies[0];
    console.log("Selected company from new schema:");
    console.log(
      JSON.stringify(
        {
          id: company.id,
          name: company.name,
          domain: company.domain || "N/A",
          status: company.status,
        },
        null,
        2
      )
    );

    // Ensure company ID is in correct format
    const companyId = ensureValidUuid(company.id);
    if (!companyId) {
      throw new Error(`Invalid company ID: ${company.id}`);
    }
    console.log(`Using formatted company ID: ${companyId}`);

    // Create second contact with correct company ID format
    const secondContact = createSecondTestContact(companyId, emailStatus);

    // Prompt to create the second contact
    await promptToCreateSecondContact(prisma, secondContact, emailStatus);
  } catch (error) {
    console.error("Test creating second contact failed:", error);
    await cleanup();
  }
}

/**
 * Create a second test contact with proper ID formatting
 */
function createSecondTestContact(companyId: string, emailStatus: any) {
  // Generate a new UUID in the correct format (with dashes)
  const contactId = uuidv7();
  console.log(`Generated new second contact ID: ${contactId}`);

  return {
    id: contactId,
    name: "Second Test Contact",
    job_title: "Development Manager",
    company_id: companyId,
    email: "second.test@example.com",
    phone: null,
    linkedin: "https://www.linkedin.com/in/secondtest",
    apollo_id: "test987654",
    first_name: "Second",
    last_name: "Test",
    full_name: "Second Test Contact",
    linkedin_url: "https://www.linkedin.com/in/secondtest",
    title: "Development Manager",
    email_status: emailStatus.value,
    photo_url: "https://example.com/photo2.jpg",
    organization_id: null,
    departments: ["master_engineering_technical"],
    subdepartments: ["software_development"],
    seniority: "manager",
    functions: ["engineering", "management"],
    raw_body: JSON.stringify({
      name: "Second Test Contact",
      title: "Development Manager",
    }),
    airtable_metadata: {},
    created_at: new Date(),
    last_updated_at: new Date(),
    is_deleted: false,
    deleted_at: null,
  };
}

/**
 * Prompt the user to create the second contact
 */
async function promptToCreateSecondContact(
  prisma: any,
  secondContact: any,
  emailStatus: any
): Promise<void> {
  console.log("\nSecond test contact to be created:");
  console.log(JSON.stringify(secondContact, null, 2));

  // Ask if user wants to insert into database
  console.log(
    "\nWould you like to insert this second test contact into the new database? (yes/no)"
  );
  process.stdin.once("data", async (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === "yes" || answer === "y") {
      try {
        // Add debugging before creation
        console.log("About to create second contact with these IDs:");
        console.log(`Contact ID: ${secondContact.id}`);
        console.log(`Company ID: ${secondContact.company_id}`);

        // Log ID formats for debugging
        console.log(`Contact ID format: ${secondContact.id}`);
        console.log(`Company ID format: ${secondContact.company_id}`);

        // Create contact in new schema
        const result = await prisma.contact.create({
          data: secondContact,
        });

        console.log(
          "Second test contact successfully inserted into new database."
        );
        console.log(`Generated ID: ${result.id}`);
      } catch (error) {
        console.error("Error inserting second test contact:", error);
      }
    } else {
      console.log("Skipped inserting second test contact.");
    }

    console.log(
      "\nTest contact migration completed. Remember to run cleanup script to remove test data."
    );
    await cleanup();
  });
}

/**
 * Cleanup connections
 */
async function cleanup(): Promise<void> {
  try {
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
}

// Run the test migration
async function runTests() {
  console.log("Starting Contact Migration Tests with Interactive Prompts...");

  // Test contact migration with interactive prompts
  await testContactMigration();
}

// Execute tests
runTests().catch((error) => {
  console.error("Test execution failed:", error);
  oldPrisma.$disconnect();
  newPrisma.$disconnect();
  process.exit(1);
});
