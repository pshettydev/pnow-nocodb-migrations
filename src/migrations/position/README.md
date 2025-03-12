# Position Migration

This directory contains scripts for migrating position data from the old `Positions` model to the new `Position` model.

## Migration Details

The migration process transforms data from the old schema to the new schema with the following mappings:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `id` | `id` | Direct mapping |
| `apollo_id` | `apollo_id` | Direct mapping |
| `position_title` | `title` | Direct mapping |
| | `job_role_id` | Creates or links to a JobRole record based on the position title |
| `job_description` | `description` AND `jd_description` | Used for both fields |
| `link` | `jd_link` | Direct mapping |
| `location` | `location_*` fields | Parsed into components |
| `industry` | | Handled through keywords if applicable |
| `salary_range` | `salary_range` | Direct mapping |
| `companyId` | `company_id`, `company_name`, etc. | Links to company and extracts needed fields |
| `createdAt` | `created_at` | Direct mapping |
| `updatedAt` | `last_updated_at` | Direct mapping |
| `isDeleted` | `is_deleted` | Direct mapping |
| `deletedAt` | `deleted_at` | Direct mapping |

## Special Handling

### JobRole Creation
The migration script automatically creates JobRole records when needed, with the following steps:
1. Normalize the position title (lowercase, remove special characters, use underscores)
2. Create a hash of the normalized title
3. Look for existing JobRole with matching normalized title
4. If not found, create a new JobRole with appropriate attributes

### Company Relationship
The position must be associated with a company that exists in the new database:
1. The script looks up the company by its ID in the new database
2. If found, it extracts company name, status, and deletion state
3. If not found, the position migration is skipped with a warning

### Location Parsing
The script attempts to parse the location string (if provided) into components:
- `location_address`
- `location_city`
- `location_state`
- `location_country`
- `location_zip`

### Required Fields
The migration ensures all required fields in the new schema are populated:
- `jd_description` is set from `job_description` or a default
- `jd_link` is set from `link` or a default
- `airtable_metadata` is initialized as an empty object

## Running the Migration

To run the position migration:

```bash
npm run migrate:positions
# or
yarn migrate:positions
# or 
pnpm run migrate:positions
```

Note: It's recommended to run the company migration first, as positions need to be linked to existing companies.

## Testing

To test the migration process:

```bash
npm run test:position-migration
# or
yarn test:position-migration
# or
pnpm run test:position-migration
```

This will run tests for:
- Title normalization
- Hash creation
- Location parsing
- JobRole creation
- Company lookup
- Position migration (simulated)

## Error Handling

The migration script includes the following error handling:
- Skips positions with missing required data
- Skips positions with companies that don't exist in the new database
- Logs errors for individual positions without failing the entire migration
- Provides summary statistics at the end of the migration 