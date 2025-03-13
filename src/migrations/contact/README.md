# Contact Migration

This module handles the migration of contacts from the old database schema to the new NocoDB schema.

## Overview

The contact migration process:
1. Retrieves contacts from the old database
2. Transforms data according to the new schema requirements
3. Creates email statuses based on the old email_status values
4. Looks up companies in the new database (first by ID, then by domain)
5. Creates new contact records with proper associations
6. Handles edge cases like UUID formatting and email uniqueness

## Setup

Before running the migration, ensure:

1. You have set up `.env` with the database connection strings:
   ```
   OLD_DATABASE_URL="postgres://user:password@hostname:port/old_db"
   NEW_DATABASE_URL="postgres://user:password@hostname:port/new_db"
   ```

2. The new database has the required schema with `Contact`, `ContactEmailStatus`, and related tables.

## Test Migration

To test the migration process:

```bash
# Compile TypeScript
npm run build

# Run test migration
node dist/migrations/contact/test-contact-migration.js
```

The test migration will:
1. Create test company if needed
2. Set up email statuses
3. Transform a sample contact record
4. Provide interactive prompts to insert test records
5. Allow you to verify the migration logic with sample data

## Full Migration

To run the complete migration:

```bash
# Compile TypeScript
npm run build

# Run full migration
node dist/migrations/contact/contact-migrator.js
```

The migration will:
1. Process contacts in batches of 50
2. Provide progress updates throughout
3. Generate a detailed report at the end showing:
   - Total contacts processed
   - Successfully migrated contacts
   - Duplicate contacts skipped
   - Failed migrations with reasons
   - Company matching statistics
   - Runtime duration

## Cleanup Test Data

After testing, you can clean up test data:

```bash
# Compile TypeScript
npm run build

# Run cleanup script
node dist/migrations/contact/cleanup-test-data.js
```

The cleanup script will:
1. Find test contacts based on name patterns
2. Find test companies created during testing
3. Find email statuses created for testing
4. Provide interactive prompts to delete these items

## Key Features

- **Multi-strategy company lookup**: First tries to find by ID, then falls back to domain lookup
- **Email Status Management**: Creates or reuses email statuses as needed
- **Email Uniqueness Handling**: Modifies emails with conflicts to ensure uniqueness
- **Robust Error Handling**: Categorizes failures and maintains statistics
- **Batch Processing**: Processes records in batches to avoid memory issues
- **Detailed Reporting**: Provides comprehensive statistics and logs

## Troubleshooting

Common issues:

- **UUID Format Errors**: Ensure IDs are in the correct format (32 hex chars)
- **Company Not Found**: Check that companies have been migrated with correct IDs/domains
- **Email Status Errors**: Verify that email statuses can be created in the new schema
- **Duplicate Emails**: The script will attempt to modify emails to make them unique

For more detailed errors, check the console output during migration. 