// src/logger.js
module.exports = {
  logInfo: (msg) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`);
  },
  logError: (msg) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`);
  }
};
