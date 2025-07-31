// src/notifier.js
const axios = require('axios');
const config = require('../config.json');
const logger = require('./logger');

async function sendWhatsAppNotification(message) {
  try {
    // Build the request URL
    const encodedMessage = encodeURIComponent(message);
    const url = `${config.whatsappApi}?phone=${config.whatsappPhone}&text=${encodedMessage}&apikey=${config.callmebotApikey}`;
    
    logger.logInfo(`Sending WhatsApp notification: ${message}`);
    const response = await axios.get(url);
    logger.logInfo(`WhatsApp notification sent successfully. Response: ${response.status}`);
    return response.data;
  } catch (error) {
    logger.logError(`Failed to send WhatsApp notification: ${error.message}`);
    throw error;
  }
}

module.exports = { sendWhatsAppNotification };
