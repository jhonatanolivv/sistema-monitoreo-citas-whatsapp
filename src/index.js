// src/index.js
const { monitorAppointment } = require('./monitor');
const { sendWhatsAppNotification } = require('./notifier');
const config = require('../config.json');
const logger = require('./logger');

let isRunning = false;
let appointmentFound = false;

async function checkAppointments() {
  if (isRunning) {
    logger.logInfo('Previous check still running, skipping this cycle...');
    return;
  }
  
  if (appointmentFound) {
    logger.logInfo('Appointment already found and reserved. Stopping monitoring.');
    process.exit(0);
  }
  
  isRunning = true;
  logger.logInfo('Starting appointment availability check...');
  
  try {
    const appointment = await monitorAppointment();
    
    if (appointment) {
      // Only consider it a success if we have valid date and time
      if (appointment.date && appointment.time && 
          appointment.date.length > 1 && // Filter out single digit dates like "1"
          !appointment.date.match(/^[1-9]$/) && // Filter out single digits 1-9
          /^\d{1,2}:\d{2}$/.test(appointment.time)) {
        
        appointmentFound = true;
        const confirmationStatus = appointment.confirmed ? '✅ CONFIRMADA' : '⏳ PENDIENTE DE CONFIRMACIÓN';
        const message = `🎉 ¡CITA ENCONTRADA Y AGENDADA! 🎉\n\n📅 Fecha: ${appointment.date}\n⏰ Hora: ${appointment.time}\n📋 Estado: ${confirmationStatus}\n\n👤 Datos registrados:\n• Nombre: ${config.personalData.nombre} ${config.personalData.apellido}\n• Pasaporte: ${config.personalData.pasaporte}\n• Email: ${config.personalData.correo}\n• Teléfono: ${config.personalData.contacto}\n\n📍 Servicio: Asistencia telefónica para la homologación y equivalencia de títulos universitarios extranjeros\n🏢 Ministerio de Ciencia, Innovación y Universidades\n\n${appointment.confirmed ? '✅ Tu cita ha sido creada automáticamente con tus datos.' : '⚠️ Por favor verifica la reserva en el sitio web.'}`;
        
        await sendWhatsAppNotification(message);
        logger.logInfo('SUCCESS: Appointment found and notification sent!');
        
        // Send a second confirmation message
        setTimeout(async () => {
          await sendWhatsAppNotification('✅ Confirmación: El sistema de monitoreo detectó una cita disponible. Revisa el sitio web para confirmar los detalles.');
        }, 5000);
        
        // Exit after successful detection
        setTimeout(() => {
          logger.logInfo('Exiting application after successful appointment detection.');
          process.exit(0);
        }, 10000);
        
      } else {
        logger.logInfo(`Invalid appointment data detected (Date: ${appointment.date}, Time: ${appointment.time}). Continuing monitoring...`);
      }
    } else {
      logger.logInfo('No appointment slots available at this time. Will check again in the next cycle.');
    }
    
  } catch (error) {
    logger.logError(`Error in appointment check: ${error.message}`);
    
    // Only send error notification for repeated failures (not every single error)
    // This prevents spam if there are temporary network issues
  } finally {
    isRunning = false;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.logInfo('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.logInfo('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Log startup information
logger.logInfo('='.repeat(60));
logger.logInfo('APPOINTMENT MONITORING SYSTEM STARTED');
logger.logInfo('='.repeat(60));
logger.logInfo(`Target URL: ${config.bookingUrl}`);
logger.logInfo(`Service: ${config.reservationOptionText}`);
logger.logInfo(`Check interval: ${config.checkInterval / 1000} seconds`);
logger.logInfo(`WhatsApp notifications: ${config.whatsappPhone}`);
logger.logInfo(`Personal Data: ${config.personalData.nombre} ${config.personalData.apellido}`);
logger.logInfo('='.repeat(60));

// Send startup notification
sendWhatsAppNotification('🚀 Sistema de monitoreo de citas iniciado!\n\n📋 Servicio: Asistencia telefónica para la homologación y equivalencia de títulos universitarios extranjeros\n⏱️ Verificando cada minuto\n\nTe notificaré cuando encuentre una cita disponible y la agendaré automáticamente.').catch(err => {
  logger.logError(`Failed to send startup notification: ${err.message}`);
});

// Schedule the monitoring at regular intervals
const intervalId = setInterval(checkAppointments, config.checkInterval);

// Run the first check immediately
checkAppointments();

// Keep the process alive
process.on('exit', () => {
  clearInterval(intervalId);
  logger.logInfo('Application terminated.');
});
