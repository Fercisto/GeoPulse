<?php

declare(strict_types=1);

/** Error que se convierte en una respuesta JSON con su código HTTP. */
final class HttpError extends Exception
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        if ($status === 204) {
            exit;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** Lee el cuerpo JSON de la petición como arreglo asociativo. */
    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'El cuerpo debe ser JSON válido.');
        }
        return $data;
    }

    public static function cors(array $allowedOrigins): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Content-Type, Authorization');
            header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 86400');
        }
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /** Validadores simples para los campos del cuerpo. */
    public static function requireString(array $body, string $field, int $min = 1, int $max = 190): string
    {
        $value = trim((string) ($body[$field] ?? ''));
        $len = mb_strlen($value);
        if ($len < $min || $len > $max) {
            throw new HttpError(422, "El campo '$field' debe tener entre $min y $max caracteres.");
        }
        return $value;
    }

    public static function requireFloat(array $body, string $field, float $min, float $max): float
    {
        if (!isset($body[$field]) || !is_numeric($body[$field])) {
            throw new HttpError(422, "El campo '$field' es obligatorio y debe ser numérico.");
        }
        $value = (float) $body[$field];
        if ($value < $min || $value > $max) {
            throw new HttpError(422, "El campo '$field' debe estar entre $min y $max.");
        }
        return $value;
    }
}
