# Azure Web App Deployment Guide

## Prerequisites

1. Azure Account with an active subscription
2. GitHub repository with your Next.js application
3. Azure CLI installed (for generating credentials)

## Setup Steps

### 1. Create Azure Web App

1. Go to Azure Portal (https://portal.azure.com)
2. Create a new Web App with these settings:
   - Publish: Code
   - Runtime stack: Node.js 20 LTS
   - Operating System: Linux
   - Region: (Choose nearest to your users)

### 2. Generate Azure Credentials

Run this command in Azure CLI, replacing the placeholders:

```bash
az ad sp create-for-rbac --name "meetingtracker" \
                         --role contributor \
                         --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Web/sites/meetingtracker \
                         --sdk-auth
```

### 3. Configure GitHub Secrets

Add these secrets in your GitHub repository (Settings > Secrets and variables > Actions):

1. `AZURE_CREDENTIALS`: (JSON output from the az command above)
2. `AZURE_AD_CLIENT_ID`: Azure AD application client ID
3. `AZURE_AD_CLIENT_SECRET`: Azure AD application client secret
4. `AZURE_AD_TENANT_ID`: Azure AD tenant ID
5. `NEXTAUTH_URL`: Your application URL (e.g., https://meetingtracker.azurewebsites.net)
6. `NEXTAUTH_SECRET`: Random string for NextAuth.js
7. `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint
8. `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
9. `AZURE_OPENAI_DEPLOYMENT`: Azure OpenAI deployment name

### 4. GitHub Actions Workflow

Create `.github/workflows/azure-deploy.yml`:

```yaml
name: Azure Web App Deploy

on:
  push:
    branches: [ main ]
  workflow_dispatch:

env:
  NODE_VERSION: '20.x'
  AZURE_WEBAPP_NAME: meetingtracker

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'

    - name: Install dependencies
      run: |
        npm install --force
        npm ls || echo "Warning: Issues with dependency resolution."

    - name: Create .env.local
      run: |
        cat << EOF > .env.local
        PORT=8080
        AZURE_AD_CLIENT_ID=${{ secrets.AZURE_AD_CLIENT_ID }}
        AZURE_AD_CLIENT_SECRET=${{ secrets.AZURE_AD_CLIENT_SECRET }}
        AZURE_AD_TENANT_ID=${{ secrets.AZURE_AD_TENANT_ID }}
        AZURE_AD_APP_CLIENT_ID=${{ secrets.AZURE_AD_CLIENT_ID }}
        AZURE_AD_APP_CLIENT_SECRET=${{ secrets.AZURE_AD_CLIENT_SECRET }}
        AZURE_AD_APP_TENANT_ID=${{ secrets.AZURE_AD_TENANT_ID }}
        NEXTAUTH_URL=${{ secrets.NEXTAUTH_URL }}
        NEXTAUTH_SECRET=${{ secrets.NEXTAUTH_SECRET }}
        AZURE_OPENAI_ENDPOINT=${{ secrets.AZURE_OPENAI_ENDPOINT }}
        AZURE_OPENAI_API_KEY=${{ secrets.AZURE_OPENAI_API_KEY }}
        AZURE_OPENAI_DEPLOYMENT=${{ secrets.AZURE_OPENAI_DEPLOYMENT }}
        EOF

    - name: Build Next.js app
      run: npm run build

    - name: Prepare for production
      run: |
        mkdir -p prod
        cp -r .next prod/
        cp -r public prod/
        cp -r node_modules prod/
        cp package.json prod/
        cp package-lock.json prod/
        cp .env.local prod/
        cp next.config.ts prod/
        # Create a server.js file for Azure
        cat << EOF > prod/server.js
        const { createServer } = require('http');
        const { parse } = require('url');
        const next = require('next');
        
        const dev = false;
        const hostname = 'localhost';
        const port = process.env.PORT || 8080;
        
        const app = next({ dev, hostname, port });
        const handle = app.getRequestHandler();
        
        app.prepare().then(() => {
          createServer(async (req, res) => {
            try {
              const parsedUrl = parse(req.url, true);
              await handle(req, res, parsedUrl);
            } catch (err) {
              console.error('Error occurred handling', req.url, err);
              res.statusCode = 500;
              res.end('internal server error');
            }
          })
          .once('error', (err) => {
            console.error(err);
            process.exit(1);
          })
          .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
          });
        });
        EOF
        chmod +x prod/server.js

    - name: Package application
      run: |
        cd prod
        zip -r ../app.zip .

    - name: Upload artifact for deployment
      uses: actions/upload-artifact@v3
      with:
        name: node-app
        path: app.zip

  deploy:
    needs: build
    runs-on: ubuntu-latest

    steps:
    - name: Download artifact
      uses: actions/download-artifact@v3
      with:
        name: node-app
        path: app

    - name: Login to Azure
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}

    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: ${{ env.AZURE_WEBAPP_NAME }}
        package: app/app.zip
```

## Deployment Process

1. The workflow is triggered automatically on push to main branch
2. It can also be triggered manually from GitHub Actions tab
3. Build job (~5-7 minutes):
   - Sets up Node.js
   - Installs dependencies
   - Creates environment file
   - Builds Next.js app
   - Packages everything into a ZIP
4. Deploy job (~2-5 minutes):
   - Downloads the built package
   - Logs into Azure
   - Deploys to Azure Web App

## Troubleshooting

1. If deployment fails with credential errors:
   - Verify AZURE_CREDENTIALS secret is properly set
   - Regenerate credentials if necessary

2. If app fails to start:
   - Check Azure Web App logs
   - Verify all environment variables are set
   - Check if server.js is properly copied

3. If build fails:
   - Check if all dependencies are properly installed
   - Verify Node.js version compatibility
   - Check for any build errors in the GitHub Actions logs

## Monitoring

- Monitor your app through Azure Portal
- Check application logs in Azure Portal > Your App > Logs
- View deployment history in GitHub Actions tab 