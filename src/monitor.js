// src/monitor.js
const puppeteer = require('puppeteer');
const config = require('../config.json');
const logger = require('./logger');

async function monitorAppointment() {
  let browser;
  try {
    logger.logInfo('Launching browser...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    logger.logInfo(`Navigating to ${config.bookingUrl}`);
    await page.goto(config.bookingUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for the page to load completely
    await page.waitForTimeout(5000);
    
    // Step 1: Seleccionar sucursal (should be automatically selected)
    logger.logInfo('Step 1: Sucursal should be automatically selected');
    
    // Step 2: Select the correct service option
    logger.logInfo(`Step 2: Looking for service option "${config.reservationOptionText}"`);
    
    // Wait for the step2 section to be available
    await page.waitForSelector('#step2', { timeout: 15000 });
    
    // Find and click the correct radio button for the service
    const optionFound = await page.evaluate((optionText) => {
      const step2Section = document.querySelector('#step2');
      if (!step2Section) return false;
      
      // Look for labels containing the service text
      const labels = Array.from(step2Section.querySelectorAll('label'));
      const targetLabel = labels.find(label => 
        label.textContent.trim().includes(optionText)
      );
      
      if (targetLabel) {
        // Find the associated radio button
        const radioButton = targetLabel.querySelector('input[type="radio"]') || 
                           step2Section.querySelector(`input[type="radio"][id="${targetLabel.getAttribute('for')}"]`);
        
        if (radioButton) {
          radioButton.click();
          return true;
        }
      }
      return false;
    }, config.reservationOptionText);
    
    if (!optionFound) {
      logger.logError('Could not find the service option');
      return null;
    }
    
    logger.logInfo('Service option selected, waiting for calendar to load...');
    await page.waitForTimeout(5000);
    
    // Step 3: Look for available dates with specific background color #3e4753
    logger.logInfo('Step 3: Looking for available dates in calendar...');
    
    // Wait for step3 (date selection) to become available
    await page.waitForSelector('#step3', { timeout: 15000 });
    
    // Look for available dates with the specific background color
    const availableDate = await page.evaluate(() => {
      const step3Section = document.querySelector('#step3');
      if (!step3Section) {
        return { available: false, reason: 'Step3 section not found' };
      }
      
      // Look for date elements with background color #3e4753
      const dateElements = Array.from(step3Section.querySelectorAll('*')).filter(el => {
        const computedStyle = window.getComputedStyle(el);
        const bgColor = computedStyle.backgroundColor;
        
        // Convert #3e4753 to rgb format: rgb(62, 71, 83)
        const targetColor = 'rgb(62, 71, 83)';
        
        // Check if background color matches the target color
        if (bgColor === targetColor) {
          const text = el.textContent.trim();
          // Check if it contains a valid date number
          if (/^\d{1,2}$/.test(text)) {
            const dateNum = parseInt(text);
            if (dateNum >= 1 && dateNum <= 31) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (dateElements.length === 0) {
        return { available: false, reason: 'No dates with background color #3e4753 found' };
      }
      
      // Click the first available date
      const chosenDate = dateElements[0];
      chosenDate.click();
      
      return { 
        available: true, 
        dateText: chosenDate.textContent.trim(),
        element: chosenDate.tagName,
        className: chosenDate.className,
        totalAvailableDates: dateElements.length
      };
    });
    
    if (!availableDate.available) {
      logger.logInfo(`No available dates found. Reason: ${availableDate.reason || 'Unknown'}`);
      return null;
    }
    
    logger.logInfo(`Found ${availableDate.totalAvailableDates} available dates. Selected date: ${availableDate.dateText}`);
    
    // Wait for time slots to load after selecting a date
    await page.waitForTimeout(5000);
    
    // Look for available time slots with color #20a571
    logger.logInfo('Looking for available time slots...');
    
    const availableTime = await page.evaluate(() => {
      // Look for time elements with background color #20a571 (green)
      const timeElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const computedStyle = window.getComputedStyle(el);
        const bgColor = computedStyle.backgroundColor;
        
        // Convert #20a571 to rgb format: rgb(32, 165, 113)
        const targetColor = 'rgb(32, 165, 113)';
        
        // Check if background color matches the target color
        if (bgColor === targetColor) {
          const text = el.textContent.trim();
          // Check if it contains a valid time format (HH:MM)
          if (/^\d{1,2}:\d{2}$/.test(text)) {
            return true;
          }
        }
        return false;
      });
      
      if (timeElements.length === 0) {
        return { available: false, reason: 'No time slots with background color #20a571 found' };
      }
      
      // Click the first available time slot
      const chosenSlot = timeElements[0];
      chosenSlot.click();
      
      return { 
        available: true,
        time: chosenSlot.textContent.trim(),
        element: chosenSlot.tagName,
        className: chosenSlot.className,
        totalSlotsFound: timeElements.length
      };
    });
    
    if (!availableTime.available) {
      logger.logInfo(`No time slots available. Reason: ${availableTime.reason || 'Unknown'}`);
      return null;
    }
    
    logger.logInfo(`Found available time slot: ${availableTime.time} (${availableTime.totalSlotsFound} total slots available)`);
    
    // Wait for form to appear
    await page.waitForTimeout(3000);
    
    // Fill the form with personal data
    logger.logInfo('Filling form with personal data...');
    
    const formFilled = await page.evaluate((personalData) => {
      try {
        // Fill Nombre
        const nombreField = document.querySelector('input[name*="nombre"], input[id*="nombre"], input[placeholder*="nombre"]');
        if (nombreField) {
          nombreField.value = personalData.nombre;
          nombreField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Fill Apellido
        const apellidoField = document.querySelector('input[name*="apellido"], input[id*="apellido"], input[placeholder*="apellido"]');
        if (apellidoField) {
          apellidoField.value = personalData.apellido;
          apellidoField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Fill Pasaporte
        const pasaporteField = document.querySelector('input[name*="pasaporte"], input[id*="pasaporte"], input[placeholder*="pasaporte"], input[name*="documento"], input[id*="documento"]');
        if (pasaporteField) {
          pasaporteField.value = personalData.pasaporte;
          pasaporteField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Fill Fecha de Nacimiento
        const fechaField = document.querySelector('input[name*="fecha"], input[id*="fecha"], input[type="date"], input[placeholder*="fecha"]');
        if (fechaField) {
          fechaField.value = personalData.fechaNacimiento;
          fechaField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Fill Email
        const emailFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[name*="correo"], input[id*="email"], input[id*="correo"]');
        emailFields.forEach(field => {
          field.value = personalData.correo;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        // Fill Phone/Contact
        const phoneFields = document.querySelectorAll('input[type="tel"], input[name*="telefono"], input[name*="contacto"], input[id*="telefono"], input[id*="contacto"], input[placeholder*="telefono"]');
        phoneFields.forEach(field => {
          field.value = personalData.contacto;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        return true;
      } catch (error) {
        console.error('Error filling form:', error);
        return false;
      }
    }, config.personalData);
    
    if (formFilled) {
      logger.logInfo('Form filled successfully');
    } else {
      logger.logError('Error filling form');
    }
    
    // Wait a bit for form to process
    await page.waitForTimeout(2000);
    
    // Check and click the privacy checkbox
    logger.logInfo('Looking for privacy checkbox...');
    
    const checkboxClicked = await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (let checkbox of checkboxes) {
        const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
        if (label && label.textContent.includes('datos personales')) {
          if (!checkbox.checked) {
            checkbox.click();
          }
          return true;
        }
      }
      return false;
    });
    
    if (checkboxClicked) {
      logger.logInfo('Privacy checkbox checked');
    } else {
      logger.logError('Could not find or check privacy checkbox');
    }
    
    // Wait a bit before clicking the final button
    await page.waitForTimeout(2000);
    
    // Click "CREAR CITA" button
    logger.logInfo('Looking for CREAR CITA button...');
    
    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const crearCitaButton = buttons.find(btn => 
        btn.textContent.trim().toUpperCase().includes('CREAR CITA') ||
        btn.value && btn.value.toUpperCase().includes('CREAR CITA')
      );
      
      if (crearCitaButton) {
        crearCitaButton.click();
        return true;
      }
      return false;
    });
    
    if (buttonClicked) {
      logger.logInfo('CREAR CITA button clicked');
    } else {
      logger.logError('Could not find CREAR CITA button');
    }
    
    // Wait for confirmation
    await page.waitForTimeout(5000);
    
    // Check if appointment was successfully created
    const appointmentCreated = await page.evaluate(() => {
      const confirmationMessages = [
        'cita creada',
        'cita confirmada',
        'reserva confirmada',
        'appointment created',
        'appointment confirmed',
        'éxito',
        'success'
      ];
      
      const bodyText = document.body.textContent.toLowerCase();
      return confirmationMessages.some(msg => bodyText.includes(msg));
    });
    
    const fullDate = availableDate.dateText;
    
    if (appointmentCreated) {
      logger.logInfo(`Appointment successfully created: Date: ${fullDate}, Time: ${availableTime.time}`);
      return {
        date: fullDate,
        time: availableTime.time,
        confirmed: true
      };
    } else {
      logger.logInfo('Appointment process completed - confirmation status unclear');
      return {
        date: fullDate,
        time: availableTime.time,
        confirmed: false
      };
    }
    
  } catch (error) {
    logger.logError(`Error during monitoring: ${error.message}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
      logger.logInfo('Browser closed.');
    }
  }
}

module.exports = { monitorAppointment };
