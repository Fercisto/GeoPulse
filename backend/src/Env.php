<?php

declare(strict_types=1);

/**
 * Lector mínimo de archivos .env (sin librerías externas).
 * Formato: CLAVE=valor por línea. Ignora líneas vacías y comentarios (#).
 * Los valores pueden ir entre comillas simples o dobles.
 */
final class Env
{
    private static array $values = [];

    public static function load(string $file): void
    {
        if (!is_file($file)) {
            throw new RuntimeException("No existe $file (copia .env.example como .env).");
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (preg_match('/^(["\'])(.*)\1$/', $value, $m)) {
                $value = $m[2];
            }
            self::$values[$key] = $value;
        }
    }

    public static function get(string $key, ?string $default = null): string
    {
        $value = self::$values[$key] ?? getenv($key);
        if ($value === false || $value === null) {
            if ($default === null) {
                throw new RuntimeException("Falta la variable $key en .env");
            }
            return $default;
        }
        return $value;
    }

    /** Lista separada por comas: "a, b, c" -> ['a', 'b', 'c'] */
    public static function list(string $key, string $default = ''): array
    {
        return array_values(array_filter(array_map('trim', explode(',', self::get($key, $default)))));
    }
}
