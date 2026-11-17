# GeoPulse API (PHP)

API en PHP puro + MySQL. Guarda los lugares de cada usuario y, cuando la app reporta
que llegaste a uno, envía una notificación push con Gotify.

```
App (ubicación en 2º plano) ── POST /location ──► API PHP ──► MySQL
                                                     │ ¿dentro del radio de un lugar?
                                                     ▼
                                                  Gotify ──► app Gotify del teléfono
```

## Requisitos
- PHP 8.1+ con `pdo_mysql` y `curl` (Laragon ya los trae)
- MySQL 8 (Laragon)
- Gotify en Docker:
  ```
  docker run -d --name gotify -p 8080:80 -e GOTIFY_DEFAULTUSER_PASS="Pruebas2026!" -v gotify_data:/app/data --restart unless-stopped gotify/server
  ```

## Instalación
Todos los comandos se ejecutan desde la carpeta `backend/`.

1. Crear la base de datos:
   ```
   mysql -uroot < database/schema.sql
   ```
2. Copiar `.env.example` como `.env` y completar `JWT_SECRET` (genera una con
   `php -r "echo bin2hex(random_bytes(32));"`) y `GOTIFY_ADMIN_PASS`.
3. Levantar el servidor:
   ```
   php -S 0.0.0.0:8000 -t public public/index.php
   ```
4. Permitir el puerto 8000 en el Firewall de Windows (PowerShell como administrador):
   ```
   New-NetFirewallRule -DisplayName "GeoPulse API (8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -RemoteAddress LocalSubnet
   ```

## Endpoints
Todas las rutas excepto `/auth/*` requieren `Authorization: Bearer <token>`.

| Método | Ruta | Cuerpo | Descripción |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, password}` | Crea la cuenta y su usuario en Gotify (mismo correo y contraseña) |
| POST | `/auth/login` | `{email, password}` | Devuelve `{token, user}` (JWT válido 30 días) |
| GET | `/me` | — | Datos del usuario |
| GET | `/places` | — | Lugares del usuario |
| POST | `/places` | `{name, lat, lng, radius?}` | Crea un lugar (radio por defecto 50 m) |
| DELETE | `/places/{id}` | — | Borra un lugar propio |
| POST | `/location` | `{lat, lng, accuracy?}` | Reporta la ubicación; si entras al radio de un lugar, envía la notificación |
| GET | `/arrivals` | — | Últimas 50 llegadas |

## Cómo se evitan avisos repetidos
Cada lugar guarda `inside` (si la última ubicación estaba dentro del radio). Solo se
notifica al pasar de **fuera → dentro**. Para "salir" hay que alejarse el radio + 20 m,
así no se repite el aviso por estar justo en el borde. Las lecturas con precisión peor
que 100 m se ignoran.
