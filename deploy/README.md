# Deployment Scripts

## set-backend-base.ps1

Update frontend runtime backend URL:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\set-backend-base.ps1 -BackendApiBase "https://your-backend.onrender.com"
```

## verify-deployment.ps1

Check backend health + frontend availability:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\verify-deployment.ps1 -BackendApiBase "https://your-backend.onrender.com" -FrontendUrl "https://your-frontend.pages.dev"
```