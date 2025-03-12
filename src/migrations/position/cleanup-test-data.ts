import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Prisma client for new schema
const newPrisma = new NewPrismaClient({
  datasources: {
    db: {
      url: process.env.NEW_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

/**
 * Find test positions based on specific patterns in titles or descriptions
 */
async function findTestPositions(): Promise<any[]> {
  try {
    console.log("Looking for test positions...");

    const testPositions = await newPrisma.position.findMany({
      where: {
        OR: [
          {
            title: { contains: "Test Migration Position", mode: "insensitive" },
          },
          { title: { contains: "Test Position", mode: "insensitive" } },
          { title: { contains: "Second Test Position", mode: "insensitive" } },
          {
            description: {
              contains: "test position created for migration testing",
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: "This is a test position",
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: "This is a second test position",
              mode: "insensitive",
            },
          },
          {
            company_name: {
              contains: "Test Position Migration Company",
              mode: "insensitive",
            },
          },
          {
            company_name: {
              contains: "Test Migration Company",
              mode: "insensitive",
            },
          },
        ],
        created_at: {
          // Only look at recently created test records (within the last 24 hours)
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        title: true,
        company_name: true,
        company_id: true,
        job_role_id: true,
        created_at: true,
      },
    });

    console.log(`Found ${testPositions.length} potential test positions`);
    return testPositions;
  } catch (error) {
    console.error("Error finding test positions:", error);
    return [];
  }
}

/**
 * Find test companies based on specific patterns in names or domains
 */
async function findTestCompanies(): Promise<any[]> {
  try {
    console.log("Looking for test companies...");

    const testCompanies = await newPrisma.company.findMany({
      where: {
        OR: [
          {
            name: {
              contains: "Test Position Migration Company",
              mode: "insensitive",
            },
          },
          { name: { contains: "Test Migration Company", mode: "insensitive" } },
          {
            domain: {
              contains: "testpositionmigration.com",
              mode: "insensitive",
            },
          },
          { domain: { contains: "testmigration.com", mode: "insensitive" } },
        ],
        created_at: {
          // Only look at recently created test records (within the last 24 hours)
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        name: true,
        domain: true,
        created_at: true,
      },
    });

    console.log(`Found ${testCompanies.length} potential test companies`);
    return testCompanies;
  } catch (error) {
    console.error("Error finding test companies:", error);
    return [];
  }
}

/**
 * Find test job roles based on specific patterns in titles or descriptions
 */
async function findTestJobRoles(): Promise<any[]> {
  try {
    console.log("Looking for test job roles...");

    const testJobRoles = await newPrisma.jobRole.findMany({
      where: {
        OR: [
          {
            title_display: {
              contains: "Test Position Role",
              mode: "insensitive",
            },
          },
          { title_display: { contains: "Test Position", mode: "insensitive" } },
          {
            role_description: {
              contains: "This is a test position role",
              mode: "insensitive",
            },
          },
          {
            job_role_description_detailed: {
              contains: "test position",
              mode: "insensitive",
            },
          },
        ],
        // Only look at recently created test records (within the last 24 hours)
        // No created_at in JobRole schema, so we have to rely on title patterns
      },
      select: {
        id: true,
        title_display: true,
        title_normalized: true,
      },
    });

    console.log(`Found ${testJobRoles.length} potential test job roles`);
    return testJobRoles;
  } catch (error) {
    console.error("Error finding test job roles:", error);
    return [];
  }
}

/**
 * Delete test positions
 */
async function deleteTestPositions(positions: any[]): Promise<void> {
  if (positions.length === 0) {
    console.log("No test positions to delete");
    return;
  }

  console.log("\nPositions that will be deleted:");
  positions.forEach((position, index) => {
    console.log(`${index + 1}. ${position.title} (ID: ${position.id})`);
    console.log(`   Company: ${position.company_name}`);
    console.log(`   Created: ${position.created_at.toISOString()}`);
  });

  console.log(
    `\nAre you sure you want to delete these ${positions.length} test positions? (yes/no)`
  );
  process.stdin.once("data", async (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === "yes" || answer === "y") {
      try {
        let count = 0;
        for (const position of positions) {
          await newPrisma.position.delete({
            where: { id: position.id },
          });
          count++;
          console.log(
            `Deleted position ${count}/${positions.length}: ${position.title}`
          );
        }

        console.log(`\nSuccessfully deleted ${count} test positions`);
        await cleanupTestCompanies();
      } catch (error) {
        console.error("Error deleting test positions:", error);
        await cleanupTestCompanies();
      }
    } else {
      console.log("Skipped deleting test positions");
      await cleanupTestCompanies();
    }
  });
}

/**
 * Delete test companies
 */
async function cleanupTestCompanies(): Promise<void> {
  const companies = await findTestCompanies();

  if (companies.length === 0) {
    console.log("No test companies to delete");
    await cleanupTestJobRoles();
    return;
  }

  console.log("\nCompanies that will be deleted:");
  companies.forEach((company, index) => {
    console.log(`${index + 1}. ${company.name} (ID: ${company.id})`);
    console.log(`   Domain: ${company.domain}`);
    console.log(`   Created: ${company.created_at.toISOString()}`);
  });

  console.log(
    `\nAre you sure you want to delete these ${companies.length} test companies? (yes/no)`
  );
  process.stdin.once("data", async (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === "yes" || answer === "y") {
      try {
        let count = 0;
        for (const company of companies) {
          try {
            await newPrisma.company.delete({
              where: { id: company.id },
            });
            count++;
            console.log(
              `Deleted company ${count}/${companies.length}: ${company.name}`
            );
          } catch (error) {
            console.error(
              `Error deleting company ${company.name} (ID: ${company.id}):`,
              error
            );
            console.log("This might be due to existing references. Skipping.");
          }
        }

        console.log(`\nSuccessfully deleted ${count} test companies`);
        await cleanupTestJobRoles();
      } catch (error) {
        console.error("Error deleting test companies:", error);
        await cleanupTestJobRoles();
      }
    } else {
      console.log("Skipped deleting test companies");
      await cleanupTestJobRoles();
    }
  });
}

/**
 * Delete test job roles
 */
async function cleanupTestJobRoles(): Promise<void> {
  const jobRoles = await findTestJobRoles();

  if (jobRoles.length === 0) {
    console.log("No test job roles to delete");
    finishCleanup();
    return;
  }

  console.log("\nJob roles that will be deleted:");
  jobRoles.forEach((role, index) => {
    console.log(`${index + 1}. ${role.title_display} (ID: ${role.id})`);
    console.log(`   Normalized: ${role.title_normalized}`);
  });

  console.log(
    `\nAre you sure you want to delete these ${jobRoles.length} test job roles? (yes/no)`
  );
  process.stdin.once("data", async (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === "yes" || answer === "y") {
      try {
        let count = 0;
        for (const role of jobRoles) {
          try {
            await newPrisma.jobRole.delete({
              where: { id: role.id },
            });
            count++;
            console.log(
              `Deleted job role ${count}/${jobRoles.length}: ${role.title_display}`
            );
          } catch (error) {
            console.error(
              `Error deleting job role ${role.title_display} (ID: ${role.id}):`,
              error
            );
            console.log("This might be due to existing references. Skipping.");
          }
        }

        console.log(`\nSuccessfully deleted ${count} test job roles`);
        finishCleanup();
      } catch (error) {
        console.error("Error deleting test job roles:", error);
        finishCleanup();
      }
    } else {
      console.log("Skipped deleting test job roles");
      finishCleanup();
    }
  });
}

/**
 * Finish cleanup process
 */
function finishCleanup(): void {
  console.log("\nCleanup process completed. Disconnecting from database...");
  newPrisma
    .$disconnect()
    .then(() => {
      console.log("Disconnected from database");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error disconnecting from database:", error);
      process.exit(1);
    });
}

/**
 * Main cleanup function
 */
async function runCleanup(): Promise<void> {
  console.log("Starting test data cleanup process...");

  try {
    // First find and delete positions
    const positions = await findTestPositions();
    await deleteTestPositions(positions);
  } catch (error) {
    console.error("Cleanup failed:", error);
    await newPrisma.$disconnect();
    process.exit(1);
  }
}

// Run the cleanup script
runCleanup();
