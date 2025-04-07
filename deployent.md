### 1. **Prepare Your Project**
Ensure your project is ready for deployment:
- Your project already has a requirements.txt file for dependencies.
- You have a gunicorn.conf.py file for configuring Gunicorn.
- Your .env file contains all necessary environment variables.

---

### 2. **Install Azure CLI**
Download and install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).

Log in to your Azure account:
```sh
az login
```

---

### 3. **Create an Azure App Service**
Run the following commands to create the necessary resources:

#### a. Create a Resource Group
```sh
az group create --name myResourceGroup --location eastus
```

#### b. Create an App Service Plan
```sh
az appservice plan create --name myAppServicePlan --resource-group myResourceGroup --sku B1 --is-linux
```

#### c. Create a Web App
```sh
az webapp create --resource-group myResourceGroup --plan myAppServicePlan --name myFlaskApp --runtime "PYTHON:3.11"
```

---

### 4. **Configure Deployment**
#### a. Enable Deployment from Local Git
```sh
az webapp deployment source config-local-git --name myFlaskApp --resource-group myResourceGroup
```
This will output a Git URL (e.g., `https://myFlaskApp.scm.azurewebsites.net/myFlaskApp.git`).

#### b. Add the Remote Repository
```sh
git remote add azure <GIT_URL_FROM_PREVIOUS_STEP>
```

---

### 5. **Deploy Your Code**
#### a. Push Your Code to Azure
```sh
git add .
git commit -m "Initial deployment"
git push azure main
```

---

### 6. **Set Environment Variables**
Set the environment variables from your .env file in Azure:
```sh
az webapp config appsettings set --resource-group myResourceGroup --name myFlaskApp --settings @.env
```

---

### 7. **Configure Gunicorn**
Azure App Service uses `gunicorn` to serve Python apps. Ensure your gunicorn.conf.py is correctly configured, and add the following startup command:
```sh
az webapp config set --resource-group myResourceGroup --name myFlaskApp --startup-file "gunicorn -c gunicorn.conf.py backend.app:app"
```

---

### 8. **Test Your Deployment**
Visit your app's URL:
```
https://myFlaskApp.azurewebsites.net
```

---
### 9. **Optional: Enable Continuous Deployment**
You can integrate your app with GitHub Actions or Azure DevOps for CI/CD.

