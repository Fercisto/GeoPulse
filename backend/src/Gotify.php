<?php

declare(strict_types=1);

/**
 * Cliente de la API REST de Gotify.
 *
 * Cada usuario de GeoPulse tiene su propio usuario en Gotify (mismo correo y contraseña).
 * Así, al iniciar sesión en la app de Gotify del teléfono, cada quien ve solo sus avisos.
 */
final class Gotify
{
    public function __construct(private readonly array $config)
    {
    }

    /**
     * Crea el usuario en Gotify y una "Application" suya para enviarle mensajes.
     * Devuelve el token de esa Application.
     */
    public function provisionUser(string $username, string $password): string
    {
        $admin = [$this->config['admin_user'], $this->config['admin_pass']];

        $this->request('POST', '/user', [
            'name' => $username,
            'pass' => $password,
            'admin' => false,
        ], basicAuth: $admin);

        // La Application se crea autenticado COMO el usuario nuevo, para que le pertenezca.
        $app = $this->request('POST', '/application', [
            'name' => 'GeoPulse',
            'description' => 'Avisos de llegada a tus lugares guardados',
        ], basicAuth: [$username, $password]);

        return $app['token'];
    }

    /** Envía una notificación usando el token de la Application del usuario. */
    public function send(string $appToken, string $title, string $message, int $priority = 8): void
    {
        $this->request('POST', '/message', [
            'title' => $title,
            'message' => $message,
            'priority' => $priority, // >= 8 hace sonar/vibrar en la app de Android
        ], appToken: $appToken);
    }

    private function request(string $method, string $path, array $body, ?array $basicAuth = null, ?string $appToken = null): array
    {
        $ch = curl_init(rtrim($this->config['url'], '/') . $path);
        $headers = ['Content-Type: application/json'];
        if ($appToken !== null) {
            $headers[] = "X-Gotify-Key: $appToken";
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
        ]);
        if ($basicAuth !== null) {
            curl_setopt($ch, CURLOPT_USERPWD, $basicAuth[0] . ':' . $basicAuth[1]);
        }

        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        if ($response === false) {
            throw new HttpError(502, "No se pudo conectar con Gotify: $curlError");
        }
        $data = json_decode($response, true) ?? [];
        if ($status >= 400) {
            $detail = $data['errorDescription'] ?? $response;
            throw new HttpError(502, "Gotify respondió $status: $detail");
        }
        return $data;
    }
}
