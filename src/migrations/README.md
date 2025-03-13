# NocoDB Database Migration Process

This directory contains migration scripts for transferring data from the old database schema to the new NocoDB schema. The migrations are organized by entity type (companies, leads, positions, contacts) and include both test and production migration scripts.

## Running Migrations

### Interactive Sequential Migration (Recommended)

The recommended way to run migrations is using the interactive sequential process, which runs each migration in order and prompts for confirmation between each one:

```bash
pnpm migrate
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

## Migration Directory Structure

- `company/` - Company migration scripts
- `lead/` - Lead migration scripts
- `position/` - Position migration scripts
- `contact/` - Contact migration scripts
- `run-migrations.ts` - Main script for sequential interactive migrations

Each entity directory typically contains:
- `*-migrator.ts` - Main migration script
- `test-*-migration.ts` - Test migration script
- `cleanup-test-data.ts` - Script to clean up test data
- `README.md` - Entity-specific migration documentation

## Troubleshooting

If you encounter issues during migration:

1. Check the detailed error messages in the console
2. Review the entity-specific README files for known issues and solutions
3. Ensure that both the old and new database connections are properly configured in your `.env` file
4. For UUID-related errors, check that the data being migrated has valid UUID formats

## Environment Setup

Make sure your `.env` file includes:

```
OLD_DATABASE_URL=postgresql://...
NEW_DATABASE_URL=postgresql://...
```

These connection strings should point to your old database and new NocoDB database, respectively. 