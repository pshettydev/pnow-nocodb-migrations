import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define sample company record from old schema
const sampleCompany = {
  id: "0627caad-6165-48ca-8c74-aac1d9783d92",
  organizationId: null,
  domain: "superiorphm.com",
  careers_page: null,
  linkedin_url: null,
  company_size: null,
  industry: null,
  raw_body: `{"id":"618e2aa20fa7f5000145d12f","name":"Superior Plumbing, Heating, & Mechanical, LLC","website_url":"http://www.superiorphm.com","blog_url":null,"angellist_url":null,"linkedin_url":"http://www.linkedin.com/company/superior-plumbing-heating-mechanical-llc","twitter_url":null,"facebook_url":"https://www.facebook.com/people/Superior-Plumbing-Heating-Mechanical/100069132161177/","primary_phone":{"number":"+1 212-995-1396","source":"Scraped","sanitized_number":"+12129951396"},"languages":[],"alexa_ranking":null,"phone":"+1 212-995-1396","linkedin_uid":"12580674","founded_year":2003,"publicly_traded_symbol":null,"publicly_traded_exchange":null,"logo_url":"https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66482d621e82f40001428f2e/picture","crunchbase_url":null,"primary_domain":"superiorphm.com","sanitized_phone":"+12129951396","industry":"construction","keywords":["plumbing","heating","fire sprinkler","backflow prevention","ua local 1","customer service","gas","pumps"],"estimated_num_employees":16,"industries":["construction"],"secondary_industries":[],"snippets_loaded":true,"industry_tag_id":"5567cd4773696439dd350000","industry_tag_hash":{"construction":"5567cd4773696439dd350000"},"retail_location_count":0,"raw_address":"87-16 101st Ave, Ozone Park, NY 11416, US","street_address":"87-16 101st Ave","city":"New York","state":"New York","postal_code":"11416","country":"United States","owned_by_organization_id":null,"seo_description":"Superior Plumbing, Heating, & Mechanical has been delivering plumbing excellence to building and property managers in NYC for 20 years.","short_description":"Our courteous and skilled staff provides 24 hour emergency service to all 5 boroughs, Long Island & Westchester. With over 30 years of experience in all phases of plumbing, heating, gas, fire sprinkler, & state certified backflow testing, Superior has the tools and the talent to serve New York.","suborganizations":[],"num_suborganizations":0,"total_funding":null,"total_funding_printed":null,"latest_funding_round_date":null,"latest_funding_stage":null,"funding_events":[],"technology_names":["Adobe Media Optimizer","Cedexis Radar","CloudFlare Hosting","Cloudflare DNS","Google Analytics","Google Font API","Google Tag Manager","Mobile Friendly","Outlook","Remote","Vimeo","WordPress.org","reCAPTCHA"],"current_technologies":[{"uid":"adobe_media_optimizer","name":"Adobe Media Optimizer","category":"Search Marketing"},{"uid":"cedexis_radar","name":"Cedexis Radar","category":"Web Performance Monitoring"},{"uid":"cloudflare_hosting","name":"CloudFlare Hosting","category":"Hosting"},{"uid":"cloudflare_dns","name":"Cloudflare DNS","category":"Domain Name Services"},{"uid":"google_analytics","name":"Google Analytics","category":"Analytics and Tracking"},{"uid":"google_font_api","name":"Google Font API","category":"Fonts"},{"uid":"google_tag_manager","name":"Google Tag Manager","category":"Tag Management"},{"uid":"mobile_friendly","name":"Mobile Friendly","category":"Other"},{"uid":"outlook","name":"Outlook","category":"Email Providers"},{"uid":"remote","name":"Remote","category":"Other"},{"uid":"vimeo","name":"Vimeo","category":"Online Video Platforms"},{"uid":"wordpress_org","name":"WordPress.org","category":"CMS"},{"uid":"recaptcha","name":"reCAPTCHA","category":"Captcha"}],"org_chart_root_people_ids":[],"org_chart_sector":"OrgChart::SectorHierarchy::Rules::Construction","org_chart_removed":null,"org_chart_show_department_filter":null,"departmental_head_count":{"business_development":1,"accounting":0,"sales":0,"operations":0,"finance":0,"marketing":0,"human_resources":0,"information_technology":0,"legal":0,"engineering":0,"product_management":0,"consulting":0,"education":0,"administrative":0,"media_and_commmunication":0,"arts_and_design":0,"entrepreneurship":0,"support":0,"data_science":0}}`,
  assignee: null,
  email_sent: false,
  createdAt: new Date("2024-11-18T10:17:11.488"),
  updatedAt: new Date("2024-11-18T10:17:11.488"),
  isDeleted: false,
  deletedAt: null,
};

// Define types for schemas
type NewSchema = any;

// Company status definitions
const COMPANY_STATUSES = {
  "dh/contract_agreement_signed": "DH/Contract Agreement Signed",
  no_recruitment_services_required: "No Recruitment Services Required",
  potential_client: "Potential Client",
  "client_inactive/not_responding": "Client Inactive/Not Responding",
  do_not_contact_email_received: "Do Not Contact Email Received",
  position_not_being_filled_by_recruiters:
    "Position Not Being Filled By Recruiters",
  client_backed_out: "Client Backed Out",
  "dh/contract_agreement_sent": "DH/Contract Agreement Sent",
  clients_will_work_in_the_future: "Clients Will Work in the Future",
  not_happy_with_terms: "Not happy With Terms",
  "pro-rated_refund_agreement": "Pro-Rated Refund Agreement",
  job_closed_internally: "Job Closed Internally",
  ready_to_dh_agreement: "Ready To DH Agreement",
  client_wants_refund_policy: "Client Wants Refund Policy",
  contract_terminated: "Contract Terminated",
};

const DEFAULT_COMPANY_STATUS = "potential_client";

/**
 * Parse the raw_body JSON string from old schema
 */
function parseRawBody(rawBodyStr: string | null): any {
  if (!rawBodyStr) return null;

  try {
    return JSON.parse(rawBodyStr);
  } catch (error) {
    console.error("Error parsing raw_body JSON:", error);
    return null;
  }
}

/**
 * Transform a company from old schema to new schema format
 */
function transformCompany(oldCompany: any): any {
  // Parse raw_body JSON
  const rawBody = parseRawBody(oldCompany.raw_body);

  // Extract name and website from raw_body if available
  const name = rawBody?.name || `Unknown Company (${oldCompany.domain})`;
  const website = rawBody?.website_url || `http://${oldCompany.domain}`;

  // Convert company_size to string format if needed
  let size = null;
  if (oldCompany.company_size !== null) {
    size = String(oldCompany.company_size);
  } else if (rawBody?.estimated_num_employees) {
    size = String(rawBody.estimated_num_employees);
  }

  // Create transformed company object for new schema
  return {
    id: oldCompany.id, // Keep the same ID
    name: name,
    website: website,
    domain: oldCompany.domain,

    // Optional fields
    size: size,
    revenue: null, // No direct mapping in old schema
    industry: oldCompany.industry || rawBody?.industry || null,

    // Metadata and timestamps
    created_by: "migration_script",
    created_at: oldCompany.createdAt,
    last_updated_by: "migration_script",
    last_updated_at: oldCompany.updatedAt || oldCompany.createdAt,

    // Status field (required in new schema)
    status: DEFAULT_COMPANY_STATUS,

    // Deletion tracking
    is_deleted: oldCompany.isDeleted,
    deleted_at: oldCompany.deletedAt,
    deleted_by: oldCompany.isDeleted ? "migration_script" : null,

    // Additional fields from old schema
    organization_id: oldCompany.organizationId,
    careers_page: oldCompany.careers_page,
    linkedin_url: oldCompany.linkedin_url,
    raw_body: rawBody, // Store as a JSON object

    // New fields with no direct mapping
    airtable_metadata: null,
  };
}

/**
 * Ensure that company statuses exist in the new schema
 */
async function ensureCompanyStatuses(prisma: any) {
  console.log("Ensuring company statuses exist...");

  try {
    for (const [key, value] of Object.entries(COMPANY_STATUSES)) {
      // Try to find existing status
      const existingStatus = await prisma.companyStatus.findUnique({
        where: { key },
      });

      // If status doesn't exist, create it
      if (!existingStatus) {
        await prisma.companyStatus.create({
          data: {
            field_type: "SINGLE_SELECT",
            field_display_name: "company_status",
            key,
            value,
            color: null,
            color_hex: null,
            created_by: "migration_script",
          },
        });
        console.log(`Created company status: ${key}`);
      }
    }

    console.log("Company statuses check completed.");
  } catch (error) {
    console.error("Error ensuring company statuses:", error);
    throw error;
  }
}

/**
 * Test migration function for a single sample company
 */
async function testMigrateCompany() {
  console.log("Starting test company migration...");

  // Initialize Prisma client for new schema
  const newPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.NEW_DATABASE_URL || process.env.DATABASE_URL,
      },
    },
  }) as unknown as NewSchema;

  try {
    // Ensure company statuses exist
    await ensureCompanyStatuses(newPrisma);

    // Transform the sample company
    const transformedCompany = transformCompany(sampleCompany);

    // Display transformation result
    console.log("Sample company from old schema:");
    console.log(
      JSON.stringify(sampleCompany, null, 2).substring(0, 500) + "..."
    );

    console.log("\nTransformed company for new schema:");
    console.log(JSON.stringify(transformedCompany, null, 2));

    // Ask if user wants to insert into database
    console.log(
      "\nWould you like to insert this company into the new database? (yes/no)"
    );
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === "yes" || answer === "y") {
        try {
          // Create company in new schema
          const result = await newPrisma.company.upsert({
            where: { id: transformedCompany.id },
            update: transformedCompany,
            create: transformedCompany,
          });

          console.log("Company successfully inserted into new database:");
          console.log(`ID: ${result.id}, Name: ${result.name}`);
        } catch (error) {
          console.error("Error inserting company:", error);
        }
      } else {
        console.log("Migration test completed without database insertion.");
      }

      // Disconnect Prisma client
      await newPrisma.$disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error("Test migration failed:", error);
    await newPrisma.$disconnect();
    process.exit(1);
  }
}

// Run test migration
testMigrateCompany();
