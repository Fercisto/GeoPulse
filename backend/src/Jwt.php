<?php

declare(strict_types=1);

/**
 * JWT mínimo con HS256 (HMAC-SHA256), sin librerías externas.
 * Formato: base64url(header).base64url(payload).base64url(firma)
 */
final class Jwt
{
    public static function encode(array $payload, string $secret): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $segments = [
            self::b64(json_encode($header)),
            self::b64(json_encode($payload)),
        ];
        $signature = hash_hmac('sha256', implode('.', $segments), $secret, true);
        $segments[] = self::b64($signature);
        return implode('.', $segments);
    }

    /** Devuelve el payload si la firma es válida y no ha expirado; si no, lanza 401. */
    public static function decode(string $token, string $secret): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new HttpError(401, 'Token inválido.');
        }
        [$h, $p, $s] = $parts;

        $expected = self::b64(hash_hmac('sha256', "$h.$p", $secret, true));
        if (!hash_equals($expected, $s)) {
            throw new HttpError(401, 'Token inválido.');
        }

        $header = json_decode(self::unb64($h), true);
        if (($header['alg'] ?? null) !== 'HS256') {
            throw new HttpError(401, 'Token inválido.');
        }

        $payload = json_decode(self::unb64($p), true);
        if (!is_array($payload) || !isset($payload['sub'], $payload['exp'])) {
            throw new HttpError(401, 'Token inválido.');
        }
        if ($payload['exp'] < time()) {
            throw new HttpError(401, 'La sesión expiró. Inicia sesión de nuevo.');
        }
        return $payload;
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function unb64(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'), true) ?: '';
    }
}
