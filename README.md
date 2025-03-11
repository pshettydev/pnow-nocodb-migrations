# NocoDB Companies Migration

This project provides a migration script to transfer data from the old `Companies` model to the new `Company` model in a PostgreSQL database.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Access to both source and destination PostgreSQL databases

## Setup

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd pnow-nocodb-migrations
   ```

2. Install dependencies and set up the project:
   ```bash
   npm run setup
   # or
   yarn setup
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

## Running the Migration

To run the migration script:

```bash
npm run migrate
# or
yarn migrate
```

This will:
1. Connect to both the old and new databases
2. Seed the company status data in the new database (if not already present)
3. Migrate companies from the old database to the new database
4. Log the progress and results

## Available Scripts

- `npm run setup` - Install dependencies, generate Prisma clients, and build the project
- `npm run generate` - Generate Prisma clients for both schemas
- `npm run build` - Build the TypeScript code
- `npm run migrate` - Run the migration script

## Migration Details

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

## Troubleshooting

If you encounter any issues:

1. Check that your database connection strings are correct
2. Ensure both databases are accessible from your environment
3. Check the console output for specific error messages
4. Verify that the Prisma schema files match your actual database schemas

## License

ISC 