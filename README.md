# NocoDB Database Migration Suite

This project provides a comprehensive suite of migration scripts to transfer data from the old database schema which was used by NocoDB to the new PNow ATS Tenant schema in PostgreSQL. The migration covers multiple entity types: Companies, Leads, Positions, and Contacts.

## Prerequisites

- Node.js (v14 or higher)
- pnpm (recommended) or npm
- Access to both source and destination PostgreSQL databases

## Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/pshettydev/pnow-nocodb-migrations.git
   cd pnow-nocodb-migrations
   ```

2. Install dependencies and set up the project:
   ```bash
   pnpm run setup
   # or
   npm run setup
   ```
   This will:
   - Install all dependencies
   - Generate the Prisma clients for both schemas
   - Build the TypeScript code

3. Create a `.env` file based on the provided `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your database connection details:
   ```
   OLD_DATABASE_URL="postgresql://username:password@hostname:port/old_database"
   NEW_DATABASE_URL="postgresql://username:password@hostname:port/new_database"
   ```

## Running the Migrations

### Interactive Sequential Migration (Recommended)

The recommended way to run migrations is using the interactive sequential process:

```bash
pnpm migrate
# or
npm run migrate
```

This will:
1. Set up the environment (install dependencies, generate clients, build)
2. Run the company migration
3. Prompt for confirmation before proceeding to the lead migration
4. Run the lead migration (if confirmed)
5. Prompt for confirmation before proceeding to the position migration
6. Run the position migration (if confirmed)
7. Prompt for confirmation before proceeding to the contact migration
8. Run the contact migration (if confirmed)

After each migration, you'll see a detailed report of the results, allowing you to assess whether to proceed with the next one.

### Running All Migrations Without Prompts

If you prefer to run all migrations without interactive prompts:

```bash
pnpm migrate:all
# or
npm run migrate:all
```

### Running Individual Migrations

You can also run migrations for specific entity types:

```bash
pnpm migrate:companies  # Run only the company migration
pnpm migrate:leads      # Run only the lead migration
pnpm migrate:positions  # Run only the position migration
pnpm migrate:contacts   # Run only the contact migration
```

## Testing Migrations

Before running production migrations, you can test with sample data:

```bash
pnpm test:company-migration
pnpm test:lead-migration
pnpm test:position-migration
pnpm test:contact-migration
```

These test scripts will guide you through the migration process interactively with sample data.

## Cleaning Up Test Data

After testing, you can clean up the test data:

```bash
pnpm cleanup:position-tests
pnpm cleanup:contact-tests
```

## Migration Details

### Companies Migration

The migration script performs the following transformations:

- Maps `Companies.id` to `Company.id`
- Generates a company name from the domain
- Creates a website URL from the domain
- Maps `Companies.domain` to `Company.domain`
- Converts `Companies.company_size` (number) to `Company.size` (string range)
- Maps `Companies.industry` to `Company.industry`
- Maps `Companies.organizationId` to `Company.organization_id`
- Maps `Companies.careers_page` to `Company.careers_page`
- Maps `Companies.linkedin_url` to `Company.linkedin_url`
- Converts `Companies.raw_body` (string) to `Company.raw_body` (JSON)
- Sets a default status for all companies
- Maps `Companies.createdAt` to `Company.created_at`
- Maps `Companies.updatedAt` to `Company.last_updated_at`
- Maps `Companies.isDeleted` to `Company.is_deleted`
- Maps `Companies.deletedAt` to `Company.deleted_at`

### Leads, Positions, and Contacts Migrations

Similar transformation logic is applied to other entity types, with entity-specific handling for:

- UUID normalization and validation
- Entity relationships (e.g., linking contacts to companies)
- Field mapping between old and new schemas
- Data validation and cleanup
- Enum and status field handling

## Key Features

- **Multi-strategy entity lookups**: Finds related entities using ID or alternative fields (e.g., domain for companies)
- **Batch processing**: Efficiently processes large datasets in manageable chunks
- **Detailed reporting**: Provides comprehensive statistics on migration results
- **Interactive confirmations**: Allows reviewing results before proceeding to the next migration step
- **Error categorization**: Classifies failures for better diagnostics and resolution
- **Data validation**: Ensures migrated data meets new schema requirements

## Troubleshooting

If you encounter any issues:

1. Check that your database connection strings are correct
2. Ensure both databases are accessible from your environment
3. Check the console output for specific error messages
4. Verify that the Prisma schema files match your actual database schemas
5. For UUID-related errors, check the detailed failure logs
6. Review entity-specific documentation in the src/migrations directory

## Project Structure

```
pnow-nocodb-migrations/
├── src/
│   ├── migrations/        # Migration scripts directory
│   │   ├── company/       # Company migration scripts
│   │   ├── lead/          # Lead migration scripts 
│   │   ├── position/      # Position migration scripts
│   │   ├── contact/       # Contact migration scripts
│   │   └── run-migrations.ts # Sequential migration runner
└── ... other project files
```
