# Lead Migration

This directory contains scripts for migrating leads from the old schema to the new schema, as well as creating leads for companies in the new schema.

## Migration Overview

The lead migration consists of two main tasks:

1. **Migrate existing leads** from the old schema to the new schema
2. **Create leads for companies** in the new schema that don't have corresponding leads

The migration ensures that:
- All existing leads are properly migrated with their data
- Every company in the new schema has a corresponding lead with status "Converted to Company"
- Lead statuses are properly created and assigned

## Lead Statuses

The migration creates the following lead statuses in the new schema:

1. **New Lead** (`new_lead`) - For newly migrated leads that haven't been processed
2. **Converted to Company** (`converted_to_company`) - For leads that have been converted to companies
3. **In Progress** (`in_progress`) - For leads that are being processed (isPending=true)
4. **Failed** (`failed`) - For leads that are stuck (isStuck=true)

## Getting Started

### Prerequisites

Before running the migration, make sure you have:
1. Set up the database connection strings in your `.env` file
2. Generated the Prisma clients for both old and new schemas

### Running the Migration

1. **Test the migration with a sample lead**

   Run the test script to see how a sample lead would be migrated and to test creating a lead for a company:

   ```bash
   pnpm run test:lead-migration
   ```

   This script has two parts:
   - Part 1: Migrates a sample lead from the old schema
   - Part 2: Creates a lead for a random company from the new schema

2. **Run the full migration**

   Once you're satisfied with the test results, run the full migration:

   ```bash
   pnpm run migrate:leads
   ```

   This will:
   - Ensure all required lead statuses exist in the new database
   - Migrate all leads from the old schema
   - Create leads for all companies in the new schema that don't have leads

## Migration Details

### Field Mappings

The migration maps fields from the old schema to the new schema as follows:

- **Direct mappings:**
  - `id` → `id`
  - `email` → `email`
  - `companyId` → `company_id`
  - `emailSent` → `email_sent`
  - `emailOpened` → `email_opened`
  - `isPending` → `is_pending`
  - `isProcessed` → `is_processed`
  - `hasOrganization` → `has_organization`
  - `hasPositions` → `has_positions`
  - `retryCount` → `retry_count`
  - `isStuck` → `is_stuck`
  - `createdBy` → `created_by`
  - `createdAt` → `created_at`
  - `updatedAt` → `last_updated_at`
  - `isDeleted` → `is_deleted`
  - `deletedAt` → `deleted_at`

- **New required fields:**
  - `status` → Determined based on lead data
  - `version` → Set to 1.0
  - `company_name`, `company_website` → Extracted from related company if available

### Special Handling

- **Email uniqueness**: The migration handles the unique constraint on the `email` field by:
  - Checking if a lead with the email already exists before inserting
  - For companies without corresponding leads, generating a unique placeholder email in the format `noreply+{timestamp}@{company.domain}`

- **Company relationships**: For leads with a company reference:
  - If the company exists in the new schema, the lead is linked to it and gets status "Converted to Company"
  - If the company doesn't exist, the lead retains its original status

## Troubleshooting

- If you encounter errors during migration, check the console output for specific error messages.
- If specific records fail to migrate, you can examine them individually using the test script.
- For companies without valid domains, the placeholder email generation might fail - these will be reported in the error count.

## Additional Notes

- The migration handles batching to prevent memory issues with large datasets.
- Error handling ensures that a failure with one record doesn't stop the entire migration.
- The scripts maintain counts of successful, existing, and failed migrations for reporting. 