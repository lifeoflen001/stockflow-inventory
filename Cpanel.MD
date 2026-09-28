# StockFlow cPanel Hosting Guide

This guide covers production hosting for the StockFlow frontend and Laravel API on cPanel.

## Recommended layout

Use two HTTPS subdomains:

- Frontend: app.example.com
- API: api.example.com

The frontend is the Vite build in dist/. The API is the Laravel application in backend/, with its document root set to backend/public/.

Do not run the Vite development server in production.

## Hosting requirements

Confirm these requirements with the hosting provider:

- PHP 8.2 or newer
- MySQL 8 or MariaDB 10.6 or newer
- Composer 2
- Node.js 20 or newer for building the frontend
- PHP extensions: bcmath, ctype, curl, fileinfo, mbstring, openssl, pdo, pdo_mysql, tokenizer, xml, and zip
- SSH or cPanel Terminal access
- SSL certificates for both subdomains

## Build the frontend

Build locally or with cPanel Node.js Selector:

~~~bash
cd /path/to/Inventory
npm ci
npm run typecheck
npm run build
~~~

Set the API URL before building. For the recommended layout:

~~~bash
VITE_API_URL=https://api.example.com/api/v1 npm run build
~~~

Upload the contents of dist/ to the frontend subdomain document root, commonly:

~~~text
/home/CPANEL_USER/public_html/app/
~~~

Do not upload node_modules/ to the public frontend directory.

## Frontend rewrite and caching

Create public_html/app/.htaccess:

~~~apache
Options -MultiViews
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

RewriteRule ^ index.html [L]

<IfModule mod_headers.c>
  <FilesMatch "\.(js|mjs|css|png|jpg|jpeg|gif|svg|webp|woff2?)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "^index\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
~~~

If mod_headers is unavailable, configure equivalent cache rules in cPanel Cache Manager.

## Deploy the Laravel API

Upload backend outside the public frontend directory when possible:

~~~text
/home/CPANEL_USER/stockflow-api/
~~~

Set the API subdomain document root to:

~~~text
/home/CPANEL_USER/stockflow-api/public/
~~~

Install production dependencies:

~~~bash
cd /home/CPANEL_USER/stockflow-api
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
~~~

Never expose the Laravel project root, .env, storage/, or vendor/ directly. Only backend/public/ should be web-accessible.

## Configure the API environment

Copy .env.example to .env and generate the application key:

~~~bash
cd /home/CPANEL_USER/stockflow-api
cp .env.example .env
php artisan key:generate --force
~~~

Set production values:

~~~dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=CPANEL_DATABASE
DB_USERNAME=CPANEL_DATABASE_USER
DB_PASSWORD=STRONG_DATABASE_PASSWORD

FRONTEND_URL=https://app.example.com
SANCTUM_STATEFUL_DOMAINS=app.example.com
SESSION_SECURE_COOKIE=true
~~~

Use the environment variable names supported by the application. Never commit .env or database credentials.

## Database setup

Create the database and user in cPanel MySQL Databases, grant the user the required privileges, then run:

~~~bash
cd /home/CPANEL_USER/stockflow-api
php artisan migrate --force
~~~

Only seed a new installation when the owner intends to create the default data:

~~~bash
php artisan db:seed --force
~~~

Never run migrate:fresh or destructive seeders on a live installation.

## Storage and permissions

Create the public storage link:

~~~bash
cd /home/CPANEL_USER/stockflow-api
php artisan storage:link
chmod -R ug+rwX storage bootstrap/cache
~~~

If symlinks are disabled, ask the provider to enable them. Signature uploads, avatars, supplier documents, and other public files depend on the storage link.

## Production caches

Run after every release:

~~~bash
cd /home/CPANEL_USER/stockflow-api
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
~~~

If configuration or routes appear stale, run php artisan optimize:clear, verify .env, and rebuild the caches.

## Queue and scheduler

If queued mail or notifications are enabled, configure a cPanel cron job:

~~~cron
* * * * * cd /home/CPANEL_USER/stockflow-api && /usr/local/bin/php artisan queue:work --stop-when-empty --tries=3 --timeout=120 >> /home/CPANEL_USER/logs/stockflow-queue.log 2>&1
~~~

Configure Laravel's scheduler:

~~~cron
* * * * * cd /home/CPANEL_USER/stockflow-api && /usr/local/bin/php artisan schedule:run >> /home/CPANEL_USER/logs/stockflow-scheduler.log 2>&1
~~~

Use the PHP binary configured by cPanel; the path may differ from /usr/local/bin/php.

## API and web server checks

Verify that:

- https://api.example.com/up responds successfully.
- The login endpoint is reachable from the frontend origin.
- CORS allows only the production frontend origin.
- Both domains use HTTPS.
- Apache rewrite rules are enabled.
- PHP upload_max_filesize and post_max_size support document uploads.
- storage/logs/laravel.log is writable and monitored.

Do not use wildcard CORS credentials in production.

## Performance checklist

- Serve only the generated dist/ files.
- Keep APP_DEBUG=false.
- Run Laravel configuration, route, view, and event caches.
- Keep all migration database indexes applied.
- Use the cache-aware frontend query hooks instead of adding manual fetch timers.
- Refresh only visible pages.
- Avoid duplicate notification polling when the live SSE stream is connected.
- Keep large exports and PDF libraries lazy-loaded.
- Enable Brotli or gzip in cPanel.
- Cache hashed assets and always revalidate index.html.
- Monitor PHP workers, MySQL slow queries, disk space, and application logs.

For a faster production configuration, enable PHP OPcache in cPanel's PHP
options. If the host provides Redis, use it for the Laravel cache, sessions,
and queue; otherwise use the file cache and database queue with a continuously
running queue worker. Do not use the database cache for high-traffic
installations unless Redis is unavailable.

Recommended `.env` values when Redis is available:

~~~dotenv
APP_ENV=production
APP_DEBUG=false
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
~~~

After changing these values, clear and rebuild the application cache:

~~~bash
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
~~~

The Vite build splits React, charts, spreadsheets, PDF viewing, and PDF
generation vendor code into separately cacheable hashed chunks. Do not rename
or manually merge files in `dist/assets/`, and keep the `index.html` rule
`no-cache` so new releases are discovered immediately.

## Deployment verification

1. Open a direct frontend route such as /suppliers and refresh the browser.
2. Test login, lock-screen unlock, logout, and session expiry.
3. Confirm API requests return 200 and show no CORS errors.
4. Test an upload and open its /storage/ URL.
5. Test PDF downloads.
6. Confirm all migrations show as Ran.
7. Confirm queue and scheduler logs are being written.
8. Confirm hashed assets are served from browser cache on repeat visits.

## Rollback

Before each release:

- Take a database backup.
- Keep the previous frontend dist/ directory.
- Keep the previous backend release directory.
- Record migration status.

If a release fails, restore the previous frontend and backend release. Do not roll back database migrations unless the application owner has confirmed the rollback is safe.
