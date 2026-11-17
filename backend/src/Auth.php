<?php

declare(strict_types=1);

final class Auth
{
    public function __construct(
        private readonly PDO $db,
        private readonly array $config,
        private readonly Gotify $gotify,
    ) {
    }

    /** POST /auth/register { name, email, password } */
    public function register(): never
    {
        $body = Http::body();
        $name = Http::requireString($body, 'name', 2, 100);
        $email = mb_strtolower(Http::requireString($body, 'email', 5, 190));
        $password = Http::requireString($body, 'password', 8, 72);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new HttpError(422, 'El correo no es válido.');
        }

        $exists = $this->db->prepare('SELECT 1 FROM users WHERE email = ?');
        $exists->execute([$email]);
        if ($exists->fetchColumn()) {
            throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
        }

        // Si falla Gotify, no queda un usuario "a medias" en la BD.
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
            $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) $this->db->lastInsertId();

            $appToken = $this->gotify->provisionUser($email, $password);
            $this->db->prepare('UPDATE users SET gotify_app_token = ? WHERE id = ?')->execute([$appToken, $userId]);

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        Http::json($this->session($userId, $name, $email), 201);
    }

    /** POST /auth/login { email, password } */
    public function login(): never
    {
        $body = Http::body();
        $email = mb_strtolower(Http::requireString($body, 'email'));
        $password = Http::requireString($body, 'password', 1, 72);

        $stmt = $this->db->prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new HttpError(401, 'Correo o contraseña incorrectos.');
        }

        Http::json($this->session((int) $user['id'], $user['name'], $user['email']));
    }

    /** GET /me */
    public function me(): never
    {
        $stmt = $this->db->prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
        $stmt->execute([$this->userId()]);
        Http::json($stmt->fetch() ?: throw new HttpError(404, 'Usuario no encontrado.'));
    }

    /** Lee "Authorization: Bearer <jwt>" y devuelve el id del usuario. */
    public function userId(): int
    {
        $header = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? (function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? '') : '');

        if (!preg_match('/^Bearer\s+(\S+)$/i', $header, $m)) {
            throw new HttpError(401, 'Falta el token de sesión.');
        }
        $payload = Jwt::decode($m[1], $this->config['jwt_secret']);
        return (int) $payload['sub'];
    }

    private function session(int $id, string $name, string $email): array
    {
        $token = Jwt::encode([
            'sub' => $id,
            'iat' => time(),
            'exp' => time() + $this->config['jwt_ttl'],
        ], $this->config['jwt_secret']);

        return ['token' => $token, 'user' => ['id' => $id, 'name' => $name, 'email' => $email]];
    }
}
