<?php

declare(strict_types=1);

final class Location
{
    /** Ubicaciones con precisión peor que esto (m) no cambian el estado: evitan "llegadas" falsas. */
    private const MAX_ACCURACY = 100;
    /** Margen extra (m) para considerar que saliste; evita avisos repetidos al estar justo en el borde. */
    private const EXIT_MARGIN = 20;

    public function __construct(
        private readonly PDO $db,
        private readonly Auth $auth,
        private readonly Gotify $gotify,
    ) {
    }

    /**
     * POST /location { lat, lng, accuracy? }
     *
     * La app lo llama cada vez que cambia la ubicación (también en segundo plano).
     * Si el usuario acaba de ENTRAR al radio de un lugar guardado, se le envía una notificación.
     */
    public function report(): never
    {
        $userId = $this->auth->userId();
        $body = Http::body();
        $lat = Http::requireFloat($body, 'lat', -90, 90);
        $lng = Http::requireFloat($body, 'lng', -180, 180);
        $accuracy = isset($body['accuracy']) && is_numeric($body['accuracy']) ? (float) $body['accuracy'] : 0.0;

        $this->db->prepare('UPDATE users SET last_lat = ?, last_lng = ?, last_seen_at = NOW() WHERE id = ?')
            ->execute([$lat, $lng, $userId]);

        if ($accuracy > self::MAX_ACCURACY) {
            Http::json(['arrived' => [], 'ignored' => 'Precisión insuficiente']);
        }

        $stmt = $this->db->prepare('SELECT id, name, lat, lng, radius, inside FROM places WHERE user_id = ?');
        $stmt->execute([$userId]);
        $places = $stmt->fetchAll();

        $arrived = [];
        foreach ($places as $place) {
            $distance = self::distance($lat, $lng, (float) $place['lat'], (float) $place['lng']);
            $wasInside = (bool) $place['inside'];

            if (!$wasInside && $distance <= $place['radius']) {
                $this->setInside((int) $place['id'], true);
                $notified = $this->notifyArrival($userId, $place['name']);
                $this->db->prepare('INSERT INTO arrivals (user_id, place_id, notified) VALUES (?, ?, ?)')
                    ->execute([$userId, $place['id'], (int) $notified]);
                $arrived[] = ['id' => (int) $place['id'], 'name' => $place['name'], 'distance' => round($distance)];
            } elseif ($wasInside && $distance > $place['radius'] + self::EXIT_MARGIN) {
                $this->setInside((int) $place['id'], false);
            }
        }

        Http::json(['arrived' => $arrived]);
    }

    /** GET /arrivals — últimas 50 llegadas del usuario. */
    public function arrivals(): never
    {
        $stmt = $this->db->prepare(
            'SELECT a.id, a.arrived_at, a.notified, p.id AS place_id, p.name AS place_name
             FROM arrivals a JOIN places p ON p.id = a.place_id
             WHERE a.user_id = ? ORDER BY a.arrived_at DESC LIMIT 50'
        );
        $stmt->execute([$this->auth->userId()]);
        Http::json($stmt->fetchAll());
    }

    private function setInside(int $placeId, bool $inside): void
    {
        $this->db->prepare('UPDATE places SET inside = ? WHERE id = ?')->execute([(int) $inside, $placeId]);
    }

    /** Si Gotify falla, la llegada se registra igual (notified = 0) en vez de romper la petición. */
    private function notifyArrival(int $userId, string $placeName): bool
    {
        $stmt = $this->db->prepare('SELECT gotify_app_token FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $token = $stmt->fetchColumn();
        if (!$token) {
            return false;
        }
        try {
            $this->gotify->send($token, 'GeoPulse', "Llegaste a \"$placeName\"");
            return true;
        } catch (HttpError $e) {
            error_log('[GeoPulse] ' . $e->getMessage());
            return false;
        }
    }

    /** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
    public static function distance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        return 2 * $earthRadius * asin(min(1, sqrt($a)));
    }
}
