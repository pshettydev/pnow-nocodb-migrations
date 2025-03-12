import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import { PrismaClient as OldPrismaClient } from "@prisma/old-client";
import crypto from "crypto";
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

// Define sample position record for testing
const samplePosition = {
  id: uuidv7(),
  apollo_id: null,
  position_title: "Test Migration Position",
  job_description:
    "This is a test position created for migration testing purposes.",
  link: "https://example.com/test-position",
  location: "Remote, CA, USA",
  industry: "Technology",
  salary_range: "$80,000 - $120,000",
  companyId: null, // Will be updated with test company ID
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  deletedAt: null,
};

// Define test company data
const testCompany = {
  id: uuidv7(),
  name: "Test Position Migration Company",
  website: "https://testpositionmigration.com",
  domain: "testpositionmigration.com",
  size: "50-100",
  industry: "Technology",
  created_by: "position_migration_script",
  created_at: new Date(),
  last_updated_by: "position_migration_script",
  last_updated_at: new Date(),
  status: "Potential Client",
  is_deleted: false,
  deleted_at: null,
  deleted_by: null,
  organization_id: null,
  careers_page: null,
  linkedin_url: null,
  raw_body: {
    name: "Test Position Migration Company",
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

// Test utility functions
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function createTitleHash(normalizedTitle: string): Buffer {
  return Buffer.from(
    crypto.createHash("sha256").update(normalizedTitle).digest("hex"),
    "hex"
  );
}

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

  const parts = location.split(",").map((part) => part.trim());

  return {
    address: parts[0] || null,
    city: parts[0] || null,
    state: parts.length > 1 ? parts[1] : null,
    country: parts.length > 2 ? parts[2] : "US",
    zip: null,
  };
}

// Test title normalization
function testNormalizeTitle(): void {
  console.log("\n--- Testing Title Normalization ---");

  const testCases = [
    { input: "Software Engineer", expected: "software_engineer" },
    {
      input: "Senior Java Developer (Remote)",
      expected: "senior_java_developer_remote",
    },
    { input: "UI/UX Designer", expected: "uiux_designer" },
    { input: "  Project Manager  ", expected: "project_manager" },
  ];

  let passCount = 0;
  for (const { input, expected } of testCases) {
    const result = normalizeTitle(input);
    if (result === expected) {
      log(`Normalized "${input}" => "${result}"`);
      passCount++;
    } else {
      log(
        `Failed to normalize "${input}" - got "${result}", expected "${expected}"`,
        true
      );
    }
  }

  console.log(
    `${passCount}/${testCases.length} title normalization tests passed.`
  );
}

// Test hash creation
function testCreateTitleHash(): void {
  console.log("\n--- Testing Title Hash Creation ---");

  const testCases = [
    "software_engineer",
    "senior_java_developer",
    "project_manager",
  ];

  let passCount = 0;
  for (const input of testCases) {
    try {
      const hash = createTitleHash(input);
      if (hash && hash.length > 0) {
        log(
          `Created hash for "${input}": ${hash
            .toString("hex")
            .substring(0, 10)}...`
        );
        passCount++;
      } else {
        log(`Failed to create valid hash for "${input}"`, true);
      }
    } catch (error) {
      log(`Error creating hash for "${input}": ${error}`, true);
    }
  }

  console.log(`${passCount}/${testCases.length} hash creation tests passed.`);
}

// Test location parsing
function testLocationParsing(): void {
  console.log("\n--- Testing Location Parsing ---");

  const testCases = [
    {
      input: "San Francisco, CA, USA",
      expected: {
        address: "San Francisco",
        city: "San Francisco",
        state: "CA",
        country: "USA",
        zip: null,
      },
    },
    {
      input: "Remote",
      expected: {
        address: "Remote",
        city: "Remote",
        state: null,
        country: "US",
        zip: null,
      },
    },
    {
      input: null,
      expected: {
        address: null,
        city: null,
        state: null,
        country: null,
        zip: null,
      },
    },
  ];

  let passCount = 0;
  for (const { input, expected } of testCases) {
    const result = parseLocation(input);
    if (
      result.city === expected.city &&
      result.state === expected.state &&
      result.country === expected.country
    ) {
      log(`Parsed "${input}" correctly`);
      passCount++;
    } else {
      log(
        `Failed to parse "${input}" - got ${JSON.stringify(
          result
        )}, expected ${JSON.stringify(expected)}`,
        true
      );
    }
  }

  console.log(
    `${passCount}/${testCases.length} location parsing tests passed.`
  );
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
          created_by: "migration_script",
        },
      });
      console.log(`Created company status: "Potential Client"`);
    } else {
      console.log(`Using existing company status: "${existingStatus.value}"`);
    }

    return existingStatus;
  } catch (error) {
    console.error("Error ensuring company status:", error);
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
 * Find or create a JobRole for testing
 */
async function testFindOrCreateJobRole(): Promise<any> {
  console.log("\n--- Testing Job Role Creation ---");

  async function findOrCreateJobRole(
    title: string,
    description: string | null
  ): Promise<any> {
    try {
      const normalizedTitle = normalizeTitle(title);
      const titleHash = createTitleHash(normalizedTitle);

      // Try to find existing JobRole
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
        log(
          `Found existing job role for "${title}" with ID: ${existingJobRole.id}`
        );
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
          role_description: jobRoleDescription.substring(0, 500),
          job_role_description_detailed: detailedDescription,
        },
        select: {
          id: true,
          title_display: true,
          title_normalized: true,
        },
      });

      log(`Created new job role for "${title}" with ID: ${newJobRole.id}`);
      return newJobRole;
    } catch (error) {
      log(`Error in findOrCreateJobRole for ${title}: ${error}`, true);
      throw error;
    }
  }

  const testCases = [
    {
      title: "Test Position Role",
      description: "This is a test position role for migration testing.",
    },
  ];

  let result = null;
  for (const { title, description } of testCases) {
    try {
      const jobRole = await findOrCreateJobRole(title, description);
      if (jobRole && jobRole.id) {
        log(
          `Successfully found/created job role for "${title}" with ID: ${jobRole.id}`
        );
        result = jobRole;
      } else {
        log(`Failed to find/create job role for "${title}"`, true);
      }
    } catch (error) {
      log(`Error in job role test for "${title}": ${error}`, true);
    }
  }

  return result;
}

/**
 * Test finding a company
 */
async function testFindCompany(companyId: string): Promise<any> {
  console.log("\n--- Testing Company Finding ---");

  async function findCompany(companyId: string | null): Promise<any> {
    if (!companyId) {
      return null;
    }

    try {
      const company = await newPrisma.company.findFirst({
        where: {
          id: companyId,
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
 * Prepare position data for migration test
 */
function transformPosition(oldPosition: any, company: any, jobRole: any): any {
  const locationInfo = parseLocation(oldPosition.location);

  return {
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
}

/**
 * Test position migration with a sample position
 */
async function testPositionMigration(): Promise<void> {
  console.log("\n--- Testing Position Migration with Interactive Prompts ---");

  try {
    // Ensure company status exists
    await ensureCompanyStatus(newPrisma);

    // Create test company
    console.log("\n=== Part 1: Create Test Company ===");
    const testCompanyInDb = await createTestCompany(newPrisma);

    // Create test job role
    console.log("\n=== Part 2: Create Test Job Role ===");
    const jobRole = await testFindOrCreateJobRole();

    if (!testCompanyInDb || !jobRole) {
      log("Failed to set up test prerequisites.", true);
      return;
    }

    // Update sample position with test company ID
    samplePosition.companyId = testCompanyInDb.id;

    console.log("\n=== Part 3: Test Position Migration ===");

    // Find company in new DB to ensure it exists
    const company = await testFindCompany(testCompanyInDb.id);

    if (!company) {
      log(
        "Company not found in new database for test position. Cannot proceed.",
        true
      );
      return;
    }

    // Transform position data
    const transformedPosition = transformPosition(
      samplePosition,
      company,
      jobRole
    );

    // Display sample and transformed data
    console.log("Sample position from old schema (with test company ID):");
    console.log(JSON.stringify(samplePosition, null, 2));

    console.log("\nTransformed position for new schema:");
    console.log(JSON.stringify(transformedPosition, null, 2));

    // Ask user if they want to insert the test position
    console.log(
      "\nWould you like to insert this test position into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Check if position already exists
          const existingPosition = await newPrisma.position.findUnique({
            where: { id: transformedPosition.id },
          });

          if (existingPosition) {
            console.log(
              `A position with ID ${transformedPosition.id} already exists.`
            );
            console.log("Would you like to update it or skip? (update/skip)");

            process.stdin.once("data", async (data) => {
              const updateAnswer = data.toString().trim().toLowerCase();

              if (updateAnswer === "update" || updateAnswer === "u") {
                try {
                  // Update existing position
                  await newPrisma.position.update({
                    where: { id: existingPosition.id },
                    data: {
                      ...transformedPosition,
                      id: existingPosition.id, // Keep the original ID
                    },
                  });

                  console.log(
                    "Test position successfully updated in the database."
                  );
                  await testCreateSecondPosition(newPrisma, jobRole);
                } catch (error) {
                  console.error("Error updating test position:", error);
                  await cleanup();
                }
              } else {
                console.log("Skipped updating existing position.");
                await testCreateSecondPosition(newPrisma, jobRole);
              }
            });

            return; // Wait for user input on update/skip
          }

          // Create position in new schema
          await newPrisma.position.create({
            data: transformedPosition,
          });

          console.log("Test position successfully inserted into the database.");

          // Proceed to test creating a second position
          await testCreateSecondPosition(newPrisma, jobRole);
        } catch (error) {
          console.error("Error inserting test position:", error);
          await cleanup();
        }
      } else {
        console.log("Skipped inserting test position.");
        // Proceed to second test anyway
        await testCreateSecondPosition(newPrisma, jobRole);
      }
    });
  } catch (error) {
    console.error("Test position migration failed:", error);
    await cleanup();
  }
}

/**
 * Test creating a second position for an existing company
 */
async function testCreateSecondPosition(
  prisma: any,
  jobRole: any
): Promise<void> {
  try {
    console.log(
      "\n=== Part 4: Create Second Position for Existing Company ==="
    );

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

    // Create a second test position
    const secondPosition = {
      id: uuidv7(),
      title: "Second Test Position",
      description: "This is a second test position for an existing company.",

      is_active: true,
      company_id: company.id,
      company_name: company.name,
      is_company_deleted: company.is_deleted || false,
      company_status: company.status,

      location_address: "New York City",
      location_city: "New York City",
      location_state: "NY",
      location_country: "USA",
      location_zip: null,

      jd_description: "This is a test description for the second position.",
      jd_link: "https://example.com/second-position",

      job_role_id: jobRole.id,

      apollo_id: null,
      salary_range: "$90,000 - $130,000",

      airtable_metadata: {},

      created_at: new Date(),
      last_updated_at: new Date(),
      is_deleted: false,
      deleted_at: null,
    };

    console.log("\nSecond test position to be created:");
    console.log(JSON.stringify(secondPosition, null, 2));

    // Ask if user wants to insert into database
    console.log(
      "\nWould you like to insert this second test position into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Create position in new schema
          const result = await prisma.position.create({
            data: secondPosition,
          });

          console.log(
            "Second test position successfully inserted into new database."
          );
          console.log(`Generated ID: ${result.id}`);
        } catch (error) {
          console.error("Error inserting second test position:", error);
        }
      } else {
        console.log("Skipped inserting second test position.");
      }

      console.log(
        "\nTest position migration completed. Remember to run cleanup script to remove test data."
      );
      await cleanup();
    });
  } catch (error) {
    console.error("Test creating second position failed:", error);
    await cleanup();
  }
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
  console.log("Starting Position Migration Tests with Interactive Prompts...");

  // Test utility functions
  testNormalizeTitle();
  testCreateTitleHash();
  testLocationParsing();

  // Test migration with interactive prompts
  await testPositionMigration();
}

// Execute tests
runTests().catch((error) => {
  console.error("Test execution failed:", error);
  oldPrisma.$disconnect();
  newPrisma.$disconnect();
  process.exit(1);
});
