# Sistema de Monitoreo de Citas - Reconocimiento de Firmas para Legalizaciones

Este sistema monitorea automáticamente la página de citas del Ministerio de Ciencia, Innovación y Universidades de España y te envía notificaciones por WhatsApp cuando encuentra citas disponibles.

## 🎯 Funcionalidades

- ✅ Monitoreo automático cada 60 segundos
- ✅ Selección automática del servicio "Reconocimiento de Firmas para Legalizaciones"
- ✅ Detección de fechas y horarios disponibles
- ✅ Reserva automática de citas
- ✅ Notificaciones por WhatsApp usando CallMeBot API
- ✅ Dashboard web para monitorear el estado del sistema
- ✅ Logs detallados de todas las operaciones

## 📋 Requisitos

- Node.js (versión 14 o superior)
- Conexión a internet estable
- API Key de CallMeBot configurada

## 🚀 Instalación y Uso

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar el sistema:**
   - El archivo `config.json` ya está configurado con tus credenciales de WhatsApp
   - Puedes modificar el intervalo de verificación si es necesario

3. **Ejecutar el sistema:**
   ```bash
   npm start
   ```

4. **Ver el dashboard (opcional):**
   - Abre `dashboard.html` en tu navegador para ver el estado del sistema en tiempo real

## 📁 Estructura del Proyecto

```
/
├── package.json          # Configuración del proyecto y dependencias
├── config.json          # Configuración del sistema
├── dashboard.html        # Dashboard web para monitoreo
├── README.md            # Este archivo
└── src/
    ├── index.js         # Punto de entrada principal
    ├── monitor.js       # Lógica de monitoreo y reserva
    ├── notifier.js      # Sistema de notificaciones WhatsApp
    └── logger.js        # Sistema de logging
```

## ⚙️ Configuración

El archivo `config.json` contiene:

- `bookingUrl`: URL del sistema de citas
- `reservationOptionText`: Texto del servicio a seleccionar
- `whatsappApi`: URL de la API de CallMeBot
- `whatsappPhone`: Tu número de teléfono
- `callmebotApikey`: Tu API key de CallMeBot
- `checkInterval`: Intervalo entre verificaciones (en milisegundos)

## 📱 Notificaciones WhatsApp

El sistema te enviará notificaciones en los siguientes casos:

1. **Inicio del sistema**: Confirmación de que el monitoreo ha comenzado
2. **Cita encontrada y reservada**: Detalles completos de la cita reservada
3. **Errores**: Si ocurre algún problema durante el monitoreo

## 🔧 Funcionamiento

1. El sistema abre la página de citas usando Puppeteer
2. Selecciona automáticamente "Reconocimiento de Firmas para Legalizaciones"
3. Busca fechas disponibles en el calendario
4. Si encuentra una fecha disponible, selecciona el primer horario disponible
5. Intenta reservar la cita automáticamente
6. Te envía una notificación por WhatsApp con los detalles
7. El sistema se detiene después de una reserva exitosa

## 📊 Monitoreo

- **Logs en consola**: Todos los eventos se registran con timestamps
- **Dashboard web**: Interfaz visual para ver el estado del sistema
- **Notificaciones WhatsApp**: Actualizaciones importantes en tiempo real

## 🛠️ Solución de Problemas

### El sistema no encuentra citas disponibles
- Esto es normal, el sistema seguirá verificando automáticamente
- Las citas suelen liberarse en horarios específicos

### Error de conexión
- Verifica tu conexión a internet
- El sistema reintentará automáticamente

### No recibo notificaciones WhatsApp
- Verifica que tu API key de CallMeBot esté correcta
- Asegúrate de que tu número de teléfono esté en el formato correcto

## 🔒 Seguridad

- El sistema usa navegación headless para mayor discreción
- No almacena datos personales
- Las credenciales están en archivos de configuración locales

## ⚠️ Importante

- Mantén el sistema ejecutándose continuamente para mejor efectividad
- El sistema se detendrá automáticamente después de reservar una cita exitosamente
- Revisa los logs regularmente para asegurar el funcionamiento correcto

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en la consola
2. Verifica la configuración en `config.json`
3. Asegúrate de que todas las dependencias estén instaladas correctamente

---

**¡El sistema está listo para monitorear y reservar tu cita automáticamente!** 🎉
