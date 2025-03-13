import { PrismaClient as NewPrismaClient } from "@prisma/new-client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize Prisma client for new database
const newPrisma = new NewPrismaClient({
  datasources: {
    db: {
      url: process.env.NEW_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

/**
 * Delete test contacts created during test migrations
 */
async function deleteTestContacts(): Promise<void> {
  console.log("Looking for test contacts to delete...");

  try {
    // Find contacts created by test scripts
    const testContacts = await newPrisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: "Test Contact" } },
          { name: { contains: "Migration Test" } },
          { job_title: { contains: "Test Migration" } },
          { name: { contains: "Second Test Contact" } },
          { created_by: "test_script" },
        ],
      },
      select: {
        id: true,
        name: true,
        job_title: true,
      },
    });

    if (testContacts.length === 0) {
      console.log("No test contacts found.");
      await cleanupEmailStatuses();
      return;
    }

    console.log(`Found ${testContacts.length} test contacts to delete:`);
    testContacts.forEach((contact) => {
      console.log(`- ${contact.name} (${contact.id})`);
    });

    // Ask for confirmation
    console.log("\nDo you want to delete these test contacts? (yes/no)");
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        // Delete each contact
        let successCount = 0;
        let errorCount = 0;

        for (const contact of testContacts) {
          try {
            await newPrisma.contact.delete({
              where: { id: contact.id },
            });
            console.log(`Deleted contact: ${contact.name}`);
            successCount++;
          } catch (error) {
            console.error(`Error deleting contact ${contact.name}:`, error);
            errorCount++;
          }
        }

        console.log(
          `Test contacts deleted: ${successCount}, failed: ${errorCount}`
        );
      } else {
        console.log("Contact deletion cancelled.");
      }

      // Continue to email status cleanup
      await cleanupEmailStatuses();
    });
  } catch (error) {
    console.error("Error finding test contacts:", error);
    await cleanupEmailStatuses();
  }
}

/**
 * Delete test companies created during test migrations
 */
async function deleteTestCompanies(): Promise<void> {
  console.log("\nLooking for test companies to delete...");

  try {
    // Find companies created by test scripts
    const testCompanies = await newPrisma.company.findMany({
      where: {
        OR: [
          { name: { contains: "Test Contact Migration" } },
          { domain: { contains: "testcontactmigration" } },
          { created_by: "contact_migration_script" },
          { created_by: "test_script" },
        ],
      },
      select: {
        id: true,
        name: true,
        domain: true,
      },
    });

    if (testCompanies.length === 0) {
      console.log("No test companies found.");
      await cleanupEmailStatuses();
      return;
    }

    console.log(`Found ${testCompanies.length} test companies to delete:`);
    testCompanies.forEach((company) => {
      console.log(`- ${company.name} (${company.domain})`);
    });

    // Ask for confirmation
    console.log("\nDo you want to delete these test companies? (yes/no)");
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        // Delete each company
        let successCount = 0;
        let errorCount = 0;

        for (const company of testCompanies) {
          try {
            // Check if company has any contacts
            const contactCount = await newPrisma.contact.count({
              where: { company_id: company.id },
            });

            if (contactCount > 0) {
              console.log(
                `Company ${company.name} has ${contactCount} contacts. Cannot delete.`
              );
              errorCount++;
              continue;
            }

            await newPrisma.company.delete({
              where: { id: company.id },
            });
            console.log(`Deleted company: ${company.name}`);
            successCount++;
          } catch (error) {
            console.error(`Error deleting company ${company.name}:`, error);
            errorCount++;
          }
        }

        console.log(
          `Test companies deleted: ${successCount}, failed: ${errorCount}`
        );
      } else {
        console.log("Company deletion cancelled.");
      }

      // Continue to email status cleanup
      await cleanupEmailStatuses();
    });
  } catch (error) {
    console.error("Error finding test companies:", error);
    await cleanupEmailStatuses();
  }
}

/**
 * Clean up test email statuses
 */
async function cleanupEmailStatuses(): Promise<void> {
  console.log("\nChecking for test email statuses to clean up...");

  try {
    // Find email statuses created by test script
    const testStatuses = await newPrisma.contactEmailStatus.findMany({
      where: {
        created_by: "test_script",
      },
      select: {
        id: true,
        value: true,
      },
    });

    if (testStatuses.length === 0) {
      console.log("No test email statuses found.");
      await cleanup();
      return;
    }

    console.log(`Found ${testStatuses.length} test email statuses:`);
    testStatuses.forEach((status) => {
      console.log(`- ${status.value} (${status.id})`);
    });

    // Ask for confirmation
    console.log("\nDo you want to delete these test email statuses? (yes/no)");
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        // Try to delete each status (may fail if referenced by contacts)
        let successCount = 0;
        let errorCount = 0;

        for (const status of testStatuses) {
          try {
            // Check if any contacts use this status
            const contactCount = await newPrisma.contact.count({
              where: { email_status: status.value },
            });

            if (contactCount > 0) {
              console.log(
                `Status ${status.value} is used by ${contactCount} contacts. Cannot delete.`
              );
              errorCount++;
              continue;
            }

            await newPrisma.contactEmailStatus.delete({
              where: { id: status.id },
            });
            console.log(`Deleted email status: ${status.value}`);
            successCount++;
          } catch (error) {
            console.error(
              `Could not delete email status ${status.value}:`,
              error
            );
            errorCount++;
          }
        }

        console.log(
          `Email statuses deleted: ${successCount}, failed: ${errorCount}`
        );
      } else {
        console.log("Email status cleanup cancelled.");
      }

      await cleanup();
    });
  } catch (error) {
    console.error("Error cleaning up email statuses:", error);
    await cleanup();
  }
}

/**
 * Final cleanup - close connections
 */
async function cleanup(): Promise<void> {
  try {
    console.log("\nCleanup completed.");
    await newPrisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function runCleanup(): Promise<void> {
  console.log("Starting cleanup of test contact migration data...");
  console.log(
    "This will remove test contacts, companies, and email statuses created during testing."
  );

  // Ask for confirmation before proceeding
  console.log("\nDo you want to proceed with cleanup? (yes/no)");
  process.stdin.once("data", async (data) => {
    const answer = data.toString().trim().toLowerCase();

    if (answer === "yes" || answer === "y") {
      // First delete test contacts (which reference companies and email statuses)
      await deleteTestContacts();
    } else {
      console.log("Cleanup cancelled.");
      process.exit(0);
    }
  });
}

// Run the cleanup
runCleanup().catch((error) => {
  console.error("Cleanup failed:", error);
  newPrisma.$disconnect();
  process.exit(1);
});
