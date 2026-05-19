# LeadBlast — Web Deployment Guide

Three platforms to choose from. **Railway** is the easiest and recommended.

---

## Option A — Railway (Recommended · Free tier available)

Railway detects the Dockerfile automatically and handles everything.

### Steps

**1. Push code to GitHub**
```bash
git init
git add .
git commit -m "initial commit"
gh repo create leadblast --public --push   # needs GitHub CLI
# OR create repo on github.com then:
# git remote add origin https://github.com/YOUR_NAME/leadblast.git
# git push -u origin main
```

**2. Create Railway project**
- Go to https://railway.app → **New Project → Deploy from GitHub repo**
- Select your `leadblast` repository
- Railway detects the `Dockerfile` automatically

**3. Set environment variable (optional)**
In Railway dashboard → Variables:
```
PORT = 3001
NODE_ENV = production
```
Railway sets `PORT` automatically, so this is optional.

**4. Get your URL**
Railway gives you a public URL like:
```
https://leadblast-production-xxxx.up.railway.app
```

Done. Every `git push` to `main` auto-redeploys.

---

## Option B — Render.com (Free tier · Sleeps after inactivity)

**1. Push to GitHub** (same as above)

**2. Go to https://render.com → New → Web Service**
- Connect your GitHub repo
- Render detects `render.yaml` automatically
- OR configure manually:
  - **Runtime:** Docker
  - **Dockerfile Path:** `./Dockerfile`
  - **Instance Type:** Free

**3. Deploy**
Click "Create Web Service". Render builds and deploys.

Your URL:
```
https://leadblast.onrender.com
```

> ⚠️ Free tier sleeps after 15 min of inactivity. First request after sleep takes ~30s to wake up. Upgrade to Starter ($7/mo) to keep it always-on.

---

## Option C — Fly.io (Good performance · Pay-as-you-go)

**1. Install Fly CLI**
```bash
# macOS
brew install flyctl

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Linux
curl -L https://fly.io/install.sh | sh
```

**2. Login and deploy**
```bash
fly auth login
fly launch        # reads fly.toml automatically
fly deploy
```

**3. Your URL**
```
https://leadblast.fly.dev
```

Scale up anytime:
```bash
fly scale memory 2048    # 2GB RAM for heavy campaigns
fly scale count 2        # 2 instances
```

---

## Option D — Any VPS (DigitalOcean, Hetzner, AWS EC2)

```bash
# On your server:
sudo apt update && sudo apt install -y docker.io docker-compose git

git clone https://github.com/YOUR_NAME/leadblast.git
cd leadblast

docker build -t leadblast .
docker run -d -p 80:3001 --name leadblast --restart always leadblast
```

Your app runs on `http://YOUR_SERVER_IP`.

Add a domain + SSL with Nginx + Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Environment Variables

| Variable    | Default | Description                        |
|-------------|---------|-------------------------------------|
| `PORT`      | `3001`  | HTTP port (auto-set by most platforms) |
| `NODE_ENV`  | `production` | Node environment               |

No API keys or secrets required — the app is self-contained.

---

## Resource Requirements

| Resource | Minimum | Recommended          |
|----------|---------|----------------------|
| RAM      | 512 MB  | 1 GB+ (1 GB per concurrent browser) |
| CPU      | 1 vCPU  | 2 vCPU for concurrency > 2 |
| Storage  | 500 MB  | 1 GB (Chromium + app) |

> **Concurrency tip:** Each parallel Playwright browser uses ~200–300 MB RAM. With 3 concurrent workers you need ~1 GB RAM.

---

## Updating the App

```bash
# Make your changes, then:
git add .
git commit -m "your changes"
git push
# → Railway / Render auto-redeploys in ~2 min
```

---

## Troubleshooting

**Build fails on Railway/Render**
- Check build logs for memory errors — free tiers have 512 MB build RAM
- If Chromium download fails, ensure you're using the `mcr.microsoft.com/playwright` base image (already in Dockerfile)

**App crashes after deploy**
- Check runtime logs in Railway/Render dashboard
- Common cause: not enough RAM for Playwright. Upgrade instance tier.

**Health check failing**
- The app exposes `GET /api/health` — ensure port `3001` is not blocked
- Railway auto-detects this from `railway.toml`
