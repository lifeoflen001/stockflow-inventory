# StockFlow Inventory

StockFlow is a Laravel 12 application with a React/TypeScript frontend. Laravel
is the project root and serves both the REST API and the compiled single-page
application.

## Local development

Copy `.env.example` to `.env`, then install the PHP and JavaScript dependencies:

```powershell
composer install
npm install
php artisan key:generate
php artisan migrate --seed
npm run build
php artisan serve --host=127.0.0.1 --port=8000
```

For frontend hot reload, run `npm run dev` in a second terminal. The Vite
development proxy forwards `/api` and `/storage` to Laravel on port 8000.

The production build is written to `public/app`; Laravel's fallback route
serves that SPA for frontend routes while `/api/v1/*` remains the JSON API.

Run backend tests with `php artisan test`, the frontend check with `npm run
build`, and the linter with `npm run lint`. Never commit `.env`; use Railway
service variables for production secrets and database configuration.

## Railway deployment

Railway builds the included `Dockerfile`. Set `APP_KEY`, `APP_URL`,
`FRONTEND_URL`, and the database variables in the Railway service. Attach a
Railway PostgreSQL service for production and set `DB_CONNECTION=pgsql` plus
the generated `PG*` connection values. The container runs migrations during
startup and exposes Laravel's `/up` health endpoint.
