FROM node:24-alpine AS frontend

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json .oxlintrc.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM composer:2 AS dependencies

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts

FROM php:8.2-apache

WORKDIR /var/www/html

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libsqlite3-dev libzip-dev unzip \
    && docker-php-ext-install pdo_pgsql pdo_sqlite zip \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/vendor ./vendor
COPY . .
COPY --from=frontend /app/public/app ./public/app

RUN printf '%s\n' '<VirtualHost *:80>' '    DocumentRoot /var/www/html/public' '    <Directory /var/www/html/public>' '        Options -MultiViews +FollowSymLinks' '        AllowOverride All' '        Require all granted' '        DirectoryIndex index.php' '        RewriteEngine On' '        RewriteCond %{REQUEST_FILENAME} !-f' '        RewriteCond %{REQUEST_FILENAME} !-d' '        RewriteRule ^ index.php [L]' '    </Directory>' '    ErrorDocument 404 /index.php' '</VirtualHost>' > /etc/apache2/sites-available/000-default.conf \
    && printf '%s\n' '<Directory /var/www/html/public>' '    AllowOverride All' '    Require all granted' '</Directory>' >> /etc/apache2/apache2.conf \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
    && touch database/database.sqlite \
    && chown -R www-data:www-data database storage bootstrap/cache

EXPOSE 10000

CMD ["sh", "-c", "set -e; port=${PORT:-10000}; sed -ri \"s/Listen 80/Listen ${port}/; s/<VirtualHost \\*:80>/<VirtualHost *:${port}>/\" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf; php artisan storage:link --force; php artisan config:cache; php artisan view:cache; php artisan migrate --force; php artisan db:seed --force; if [ -n \"${SUPERADMIN_EMAIL:-}\" ] && [ -n \"${SUPERADMIN_PASSWORD:-}\" ]; then php artisan superadmin:ensure --email=\"$SUPERADMIN_EMAIL\" --name=\"${SUPERADMIN_NAME:-System Administrator}\" --password=\"$SUPERADMIN_PASSWORD\" --organization=\"${SUPERADMIN_ORGANIZATION:-STOCKFLOW}\"; fi; exec apache2-foreground"]
