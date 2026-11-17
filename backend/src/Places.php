<?php

declare(strict_types=1);

final class Places
{
    public function __construct(private readonly PDO $db, private readonly Auth $auth)
    {
    }

    /** GET /places */
    public function list(): never
    {
        $stmt = $this->db->prepare(
            'SELECT id, name, lat, lng, radius, created_at FROM places WHERE user_id = ? ORDER BY created_at'
        );
        $stmt->execute([$this->auth->userId()]);
        Http::json(array_map([self::class, 'format'], $stmt->fetchAll()));
    }

    /** POST /places { name, lat, lng, radius? } */
    public function create(): never
    {
        $userId = $this->auth->userId();
        $body = Http::body();
        $name = Http::requireString($body, 'name', 1, 100);
        $lat = Http::requireFloat($body, 'lat', -90, 90);
        $lng = Http::requireFloat($body, 'lng', -180, 180);
        $radius = isset($body['radius']) ? (int) Http::requireFloat($body, 'radius', 20, 1000) : 50;

        $stmt = $this->db->prepare('INSERT INTO places (user_id, name, lat, lng, radius) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $name, $lat, $lng, $radius]);

        $id = (int) $this->db->lastInsertId();
        $stmt = $this->db->prepare('SELECT id, name, lat, lng, radius, created_at FROM places WHERE id = ?');
        $stmt->execute([$id]);
        Http::json(self::format($stmt->fetch()), 201);
    }

    /** DELETE /places/{id} */
    public function delete(int $id): never
    {
        // El WHERE con user_id impide borrar lugares de otra persona.
        $stmt = $this->db->prepare('DELETE FROM places WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $this->auth->userId()]);
        if ($stmt->rowCount() === 0) {
            throw new HttpError(404, 'Lugar no encontrado.');
        }
        Http::json(null, 204);
    }

    private static function format(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'lat' => (float) $row['lat'],
            'lng' => (float) $row['lng'],
            'radius' => (int) $row['radius'],
            'created_at' => $row['created_at'],
        ];
    }
}
