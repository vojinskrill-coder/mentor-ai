/**
 * Railway deployment via GraphQL API (bypasses CLI auth issues)
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';
const TOKEN = '1efaa776-4369-4c37-8185-39a6252881fa';
const PROJECT_ID = 'ffcc2ecc-d975-49e6-b03b-51dd73c814e0';
const ENV_ID = 'f646a496-a9fc-4dd2-bd48-dbc3c5c45734'; // production

// Load .env
const env = dotenv.config({ path: 'apps/api/.env' }).parsed || {};

async function gql(query, variables) {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

async function deploy() {
  console.log('🚀 Railway Deployment via API\n');

  // 1. Create service
  console.log('1. Creating service...');
  let serviceId;
  try {
    const result = await gql(`
      mutation($input: ServiceCreateInput!) {
        serviceCreate(input: $input) { id name }
      }
    `, { input: { projectId: PROJECT_ID, name: 'mentor-ai-app' } });
    serviceId = result.serviceCreate.id;
    console.log('   Service:', serviceId);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('duplicate')) {
      // Get existing service
      const proj = await gql(`{ project(id: "${PROJECT_ID}") { services { edges { node { id name } } } } }`);
      const svc = proj.project.services.edges[0]?.node;
      if (svc) {
        serviceId = svc.id;
        console.log('   Existing service:', serviceId);
      } else throw e;
    } else throw e;
  }

  // 2. Set environment variables
  console.log('\n2. Setting environment variables...');
  const vars = {
    NODE_ENV: 'production',
    PORT: '3000',
    DEV_MODE: 'true', // Keep dev mode for now (no Auth0 configured)
    LOG_LEVEL: 'info',
    DATABASE_URL: env.DATABASE_URL || '',
    JWT_SECRET: env.JWT_SECRET || '',
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || '',
    OPENAI_API_KEY: env.OPENAI_API_KEY || '',
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || '',
    DEEPSEEK_ENDPOINT: env.DEEPSEEK_ENDPOINT || '',
    DEEPSEEK_MODEL_ID: env.DEEPSEEK_MODEL_ID || '',
    QDRANT_URL: env.QDRANT_URL || '',
    QDRANT_API_KEY: env.QDRANT_API_KEY || '',
    SERPER_API_KEY: env.SERPER_API_KEY || '',
    OPENCLAW_RELAY_URL: env.OPENCLAW_RELAY_URL || '',
    OPENCLAW_AUTH_TOKEN: env.OPENCLAW_AUTH_TOKEN || '',
    OPENCLAW_DEFAULT_TENANT_ID: env.OPENCLAW_DEFAULT_TENANT_ID || '',
    FAL_KEY: env.FAL_KEY || '',
    HETZNER_HOST: env.HETZNER_HOST || '91.98.231.87',
  };

  // Filter empty values
  const validVars = Object.fromEntries(Object.entries(vars).filter(([, v]) => v));

  await gql(`
    mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `, {
    input: {
      projectId: PROJECT_ID,
      environmentId: ENV_ID,
      serviceId: serviceId,
      variables: validVars,
    }
  });
  console.log('   Set', Object.keys(validVars).length, 'variables');

  // 3. Generate domain
  console.log('\n3. Generating domain...');
  try {
    const domResult = await gql(`
      mutation($input: CustomDomainCreateInput!) {
        serviceDomainCreate(input: $input) { domain }
      }
    `, { input: { serviceId, environmentId: ENV_ID } });
    console.log('   Domain:', domResult.serviceDomainCreate.domain);
  } catch (e) {
    console.log('   Domain already exists or error:', e.message.slice(0, 100));
  }

  // 4. Get deploy instructions
  console.log('\n4. Deploy...');
  console.log('   Railway API does not support direct code upload.');
  console.log('   You need to deploy via GitHub or CLI.');
  console.log('');
  console.log('   OPTION A — Connect GitHub repo:');
  console.log('   Go to https://railway.com and connect a GitHub repo to this project.');
  console.log('');
  console.log('   OPTION B — Use CLI from your terminal:');
  console.log('   cd C:\\Users\\tanjav\\Downloads\\BMAD-METHOD-main\\mentor-ai');
  console.log('   railway link --project ' + PROJECT_ID);
  console.log('   railway up --detach');
  console.log('');
  console.log('   Project ID: ' + PROJECT_ID);
  console.log('   Service ID: ' + serviceId);

  // Get project domain
  const proj = await gql(`{ project(id: "${PROJECT_ID}") { services { edges { node { id name serviceInstances { edges { node { domains { serviceDomains { domain } } } } } } } } } }`);
  const domains = proj.project.services.edges[0]?.node?.serviceInstances?.edges[0]?.node?.domains?.serviceDomains;
  if (domains?.length) {
    console.log('\n   🌐 URL: https://' + domains[0].domain);
  }
}

deploy().catch(e => console.error('❌', e.message));
