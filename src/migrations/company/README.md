# NocoDB Schema Migration

This directory contains scripts for migrating data from the old NocoDB schema to the new PNATS V2 schema.

## Getting Started

1. **Set up environment variables**

   Run the setup script to create a `.env` file with the required database URLs:

   ```bash
   npx ts-node src/prisma/migrations/setup.ts
   ```

   Then edit the `.env` file to provide the correct database URLs for your old and new databases:

   ```
   OLD_DATABASE_URL=postgresql://localhost:12345@localhost:5445/leads_db
   NEW_DATABASE_URL=postgresql://localhost:12345@localhost:5445/tenant_db
   ```

2. **Test the migration with a sample record**

   You can test the migration process with a sample company record:

   ```bash
   npx ts-node src/prisma/migrations/test-company-migration.ts
   ```

   This will show you how a specific company record would be transformed and give you the option to insert it into the new database.

3. **Run the full company migration**

   Once you're satisfied with the test results, run the full migration:

   ```bash
   npx ts-node src/prisma/migrations/company-migrator.ts
   ```

   This will:
   - Ensure all required company statuses exist in the new database
   - Retrieve all companies from the old database
   - Transform them to the new schema format
   - Insert them into the new database

## Migration Details

### Company Migration

The company migration (`company-migrator.ts`) handles the following mappings:

- **Direct field mappings:**
  - `id` → `id`
  - `domain` → `domain`
  - `organizationId` → `organization_id`
  - `careers_page` → `careers_page`
  - `linkedin_url` → `linkedin_url`
  - `industry` → `industry`
  - `createdAt` → `created_at`
  - `updatedAt` → `last_updated_at`
  - `isDeleted` → `is_deleted`
  - `deletedAt` → `deleted_at`

- **Fields extracted from the `raw_body` JSON:**
  - `raw_body.name` → `name`
  - `raw_body.website_url` → `website`
  - `raw_body.estimated_num_employees` → `size` (converted to string)

- **New required fields:**
  - `status` → Set to a default value of "Potential Client"

### Company Statuses

The migration ensures all company statuses are created in the new database:

```
"dh/contract_agreement_signed"   "DH/Contract Agreement Signed"   
"no_recruitment_services_required"  "No Recruitment Services Required"  
"potential_client"   "Potential Client"   
"client_inactive/not_responding" "Client Inactive/Not Responding" 
"do_not_contact_email_received"  "Do Not Contact Email Received"  
"position_not_being_filled_by_recruiters" "Position Not Being Filled By Recruiters" 
"client_backed_out"  "Client Backed Out"  
"dh/contract_agreement_sent"  "DH/Contract Agreement Sent"  
"clients_will_work_in_the_future"   "Clients Will Work in the Future"   
"not_happy_with_terms"  "Not happy With Terms"  
"pro-rated_refund_agreement"  "Pro-Rated Refund Agreement"  
"job_closed_internally" "Job Closed Internally" 
"ready_to_dh_agreement" "Ready To DH Agreement" 
"client_wants_refund_policy"  "Client Wants Refund Policy"  
"contract_terminated"   "Contract Terminated" 
```

## Troubleshooting

- If you encounter errors during migration, check the console output for specific error messages.
- Ensure the database URLs in the `.env` file are correct.
- Verify that both databases are accessible from your environment.
- If specific records fail to migrate, you can examine them individually using the test script.

## Additional Notes

- The migration handles batching to prevent memory issues with large datasets.
- Error handling ensures that a failure with one record doesn't stop the entire migration.
- The scripts maintain a count of successful and failed migrations for reporting. 