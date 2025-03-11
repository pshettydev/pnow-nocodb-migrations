import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

/**
 * Setup function to prepare environment for migration
 */
async function setup() {
  console.log("Setting up migration environment...");

  // Create .env file with database URLs if it doesn't exist
  const envFilePath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envFilePath)) {
    console.log("Creating .env file...");

    const envContent = `
# Database URLs for migration
OLD_DATABASE_URL=${
      process.env.OLD_DATABASE_URL ||
      "postgresql://username:password@localhost:5432/old_database"
    }
NEW_DATABASE_URL=${
      process.env.NEW_DATABASE_URL ||
      "postgresql://username:password@localhost:5432/new_database"
    }
`;

    fs.writeFileSync(envFilePath, envContent.trim());
    console.log(
      ".env file created. Please update with actual database URLs before running migration."
    );
  } else {
    console.log(".env file already exists.");

    // Check if required environment variables are set
    if (!process.env.OLD_DATABASE_URL) {
      console.warn("Warning: OLD_DATABASE_URL is not set in .env file.");
    }

    if (!process.env.NEW_DATABASE_URL) {
      console.warn("Warning: NEW_DATABASE_URL is not set in .env file.");
    }
  }

  console.log("Setup completed.");
  console.log("Next steps:");
  console.log(
    "1. Ensure both old and new database URLs are correctly set in .env file"
  );
  console.log("2. Run the migration with: npm run migrate:companies");
}

// Run setup
setup()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
