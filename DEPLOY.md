# Deployment Guide

This guide describes how to deploy the Barge game server and frontend on a Linux server (Ubuntu/Debian) using Nginx and Systemd.

## Prerequisites

- Linux Server (Ubuntu 20.04+ recommended)
- Go 1.25+
- Node.js 18+ & npm
- Nginx

## 1. Build the Application

### Backend (Go)

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o barge-server ./cmd/server/main.go
```

### Frontend (Web)

```bash
cd web
npm install
npm run build
# Output is in web/dist
```

## 2. Server Setup

### Directory Structure

Create a directory `/var/www/barge` and copy the built artifacts:

```
/var/www/barge/
├── barge-server      # Binary from step 1
├── config.json       # From project root
└── web/
    └── dist/         # Generated frontend assets
```

### Configuration (`config.json`)

Ensure `config.json` is present next to the binary:

```json
{
  "port": ":8080",
  "game_duration": 300,
  "base_radius": 17.0,
  "radius_step": 3.0
}
```

## 3. Systemd Service (Backend)

1. Copy `deploy/barge.service` to `/etc/systemd/system/barge.service`.
2. Reload and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable barge
   sudo systemctl start barge
   ```
3. Check status:
   ```bash
   sudo systemctl status barge
   ```

## 4. Nginx Configuration (Frontend & Proxy)

1. Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/barge`.
2. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/barge /etc/nginx/sites-enabled/
   ```
3. Test and reload Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## 5. Firewall

Allow traffic on port 80:

```bash
sudo ufw allow 80/tcp
```
