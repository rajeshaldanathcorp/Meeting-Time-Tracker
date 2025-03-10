import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { AuthProvider } from '@microsoft/microsoft-graph-client';

// Get environment variables with validation
const clientId = process.env.AZURE_AD_APP_CLIENT_ID;
const clientSecret = process.env.AZURE_AD_APP_CLIENT_SECRET;
const tenantId = process.env.AZURE_AD_APP_TENANT_ID;

// Validate required environment variables
if (!clientId || !clientSecret || !tenantId) {
  throw new Error(
    'Missing required environment variables for app authentication. ' +
    'Please ensure AZURE_AD_APP_CLIENT_ID, AZURE_AD_APP_CLIENT_SECRET, and AZURE_AD_APP_TENANT_ID are set in .env.local'
  );
}

// Create credential using client credentials flow
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

// Get access token for Microsoft Graph
export async function getAppGraphToken() {
  try {
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    return token.token;
  } catch (error) {
    console.error("Error getting app token:", error);
    throw error;
  }
}

// Create Microsoft Graph client with app authentication
export async function getAppGraphClient() {
  const token = await getAppGraphToken();
  
  return Client.init({
    authProvider: ((done: (error: Error | null, accessToken?: string) => void) => {
      done(null, token);
    }) as AuthProvider,
  });
}
