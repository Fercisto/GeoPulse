<?php

declare(strict_types=1);

/** Arma la configuración de la API a partir de las variables de .env */
final class Config
{
    public static function fromEnv(): array
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            Env::get('DB_HOST', '127.0.0.1'),
            Env::get('DB_PORT', '3306'),
            Env::get('DB_NAME', 'geopulse'),
        );

        return [
            'db' => [
                'dsn' => $dsn,
                'user' => Env::get('DB_USER', 'root'),
                'pass' => Env::get('DB_PASS', ''),
            ],
            'jwt_secret' => Env::get('JWT_SECRET'),
            'jwt_ttl' => (int) Env::get('JWT_TTL', (string) (60 * 60 * 24 * 30)),
            'gotify' => [
                'url' => Env::get('GOTIFY_URL', 'http://localhost:8080'),
                'admin_user' => Env::get('GOTIFY_ADMIN_USER', 'admin'),
                'admin_pass' => Env::get('GOTIFY_ADMIN_PASS'),
            ],
            'cors_origins' => Env::list('CORS_ORIGINS'),
        ];
    }
}
