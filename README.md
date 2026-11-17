# GeoPulse

App de geolocalización que avisa con una notificación push cuando llegas a uno de tus
lugares guardados, incluso con la app en segundo plano.

```
app/      App móvil: Ionic + Angular + Capacitor (Android)
backend/  API REST en PHP puro + MySQL; envía las notificaciones con Gotify
```

```
App (ubicación en 2º plano) -- POST /location --> API PHP --> MySQL
                                                     | ¿dentro del radio de un lugar?
                                                     v
                                                  Gotify --> app Gotify del teléfono
```

## Levantar todo

1. **Gotify** (Docker):
   ```
   docker run -d --name gotify -p 8080:80 -e GOTIFY_DEFAULTUSER_PASS="<contraseña>" -v gotify_data:/app/data --restart unless-stopped gotify/server
   ```
2. **Backend**: ver [backend/README.md](backend/README.md).
   ```
   cd backend
   php -S 0.0.0.0:8000 -t public public/index.php
   ```
3. **App**: ajusta `apiUrl` y `gotifyUrl` en `app/src/environments/` con la IP de tu PC.
   ```
   cd app
   npm install
   npm start                 # navegador
   npm run build
   npx cap sync android
   cd android
   .\gradlew.bat assembleDebug
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```

## Recibir las notificaciones
Instala la app **Gotify** en el teléfono e inicia sesión en el servidor
`http://<IP-de-tu-PC>:8080` con el mismo correo y contraseña de tu cuenta de GeoPulse.
