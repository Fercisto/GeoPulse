<?php

declare(strict_types=1);

require __DIR__ . '/../src/Env.php';
require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Http.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Jwt.php';
require __DIR__ . '/../src/Gotify.php';
require __DIR__ . '/../src/Auth.php';
require __DIR__ . '/../src/Places.php';
require __DIR__ . '/../src/Location.php';

try {
    Env::load(__DIR__ . '/../.env');
    $config = Config::fromEnv();
} catch (RuntimeException $e) {
    http_response_code(500);
    exit($e->getMessage());
}

Http::cors($config['cors_origins']);

try {
    $db = Database::connect($config['db']);
    $gotify = new Gotify($config['gotify']);
    $auth = new Auth($db, $config, $gotify);
    $places = new Places($db, $auth);
    $location = new Location($db, $auth, $gotify);

    $method = $_SERVER['REQUEST_METHOD'];
    $path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/') ?: '/';

    match (true) {
        $method === 'GET' && $path === '/' => Http::json(['name' => 'GeoPulse API', 'ok' => true]),
        $method === 'POST' && $path === '/auth/register' => $auth->register(),
        $method === 'POST' && $path === '/auth/login' => $auth->login(),
        $method === 'GET' && $path === '/me' => $auth->me(),
        $method === 'GET' && $path === '/places' => $places->list(),
        $method === 'POST' && $path === '/places' => $places->create(),
        $method === 'DELETE' && (bool) preg_match('#^/places/(\d+)$#', $path, $m) => $places->delete((int) $m[1]),
        $method === 'POST' && $path === '/location' => $location->report(),
        $method === 'GET' && $path === '/arrivals' => $location->arrivals(),
        default => throw new HttpError(404, "Ruta no encontrada: $method $path"),
    };
} catch (HttpError $e) {
    Http::json(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[GeoPulse] ' . $e);
    Http::json(['error' => 'Error interno del servidor.'], 500);
}
