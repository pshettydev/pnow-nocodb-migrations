import { exec } from "child_process";
import * as readline from "readline";

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Promisify the readline question method
 */
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Run a migration script and return a promise
 */
function runMigration(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n\n=========================================`);
    console.log(`🚀 Starting migration: ${scriptPath}`);
    console.log(`=========================================\n`);

    const process = exec(`ts-node ${scriptPath}`, {
      maxBuffer: 1024 * 1024 * 10,
    }); // 10MB buffer for large outputs

    // Stream stdout directly to console
    process.stdout?.on("data", (data) => {
      console.log(data.toString().trim());
    });

    // Stream stderr directly to console as well
    process.stderr?.on("data", (data) => {
      console.error(data.toString().trim());
    });

    // Handle process completion
    process.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ Migration completed successfully: ${scriptPath}`);
        resolve();
      } else {
        console.error(`\n❌ Migration failed with code ${code}: ${scriptPath}`);
        reject(new Error(`Migration failed with code ${code}`));
      }
    });
  });
}

/**
 * Main function to run all migrations in sequence
 */
async function runMigrations() {
  try {
    // Define migration scripts in the order they should run
    const migrations = [
      {
        name: "Company Migration",
        path: "src/migrations/company/company-migrator.ts",
      },
      {
        name: "Lead Migration",
        path: "src/migrations/lead/lead-migrator.ts",
      },
      {
        name: "Position Migration",
        path: "src/migrations/position/position-migrator.ts",
      },
      {
        name: "Contact Migration",
        path: "src/migrations/contact/contact-migrator.ts",
      },
    ];

    // Run each migration with confirmation
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];

      if (i > 0) {
        // Ask for confirmation before proceeding to the next migration
        const answer = await question(
          `\nProceed with ${migration.name}? (y/n): `
        );
        if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
          console.log(`Skipping ${migration.name}`);
          continue;
        }
      }

      // Run the migration
      try {
        await runMigration(migration.path);
        console.log(`\n✅ ${migration.name} completed successfully`);
      } catch (error) {
        console.error(`\n❌ ${migration.name} failed:`, error);

        // Ask if user wants to continue despite the error
        const answer = await question(
          `\nContinue with the next migration despite the error? (y/n): `
        );
        if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
          console.log("Migration process aborted by user after error.");
          break;
        }
      }
    }

    console.log("\n🎉 Migration process completed!");
  } catch (error) {
    console.error("Migration process failed:", error);
  } finally {
    // Close the readline interface
    rl.close();
  }
}

// Start the migration process
runMigrations().catch((err) => {
  console.error("Unhandled error during migration:", err);
  process.exit(1);
});
