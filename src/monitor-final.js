// src/monitor-final.js
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
    
    // Step 1: Sucursal is automatically selected
    logger.logInfo('Step 1: Sucursal should be automatically selected');
    
    // Step 2: Select the correct service option
    logger.logInfo(`Step 2: Looking for service option "${config.reservationOptionText}"`);
    
    // Wait for the service options to be available and click the correct one
    const serviceSelected = await page.evaluate((optionText) => {
      // Look for the radio button with the specific service text
      const radioButtons = Array.from(document.querySelectorAll('input[type="radio"]'));
      
      for (let radio of radioButtons) {
        // Check the label or parent element for the service text
        const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
        const parent = radio.parentElement;
        
        let textToCheck = '';
        if (label) {
          textToCheck = label.textContent;
        } else if (parent) {
          textToCheck = parent.textContent;
        }
        
        if (textToCheck.includes(optionText)) {
          radio.click();
          return true;
        }
      }
      return false;
    }, config.reservationOptionText);
    
    if (!serviceSelected) {
      logger.logError('Could not find the service option');
      return null;
    }
    
    logger.logInfo('Service option selected, waiting for calendar to load...');
    await page.waitForTimeout(5000);
    
    // Step 3: Look for available dates
    logger.logInfo('Step 3: Looking for available dates in calendar...');
    
    // Check if there are available dates
    const dateAvailability = await page.evaluate(() => {
      // Look for the calendar and check for available dates
      const calendar = document.querySelector('[class*="calendar"], [id*="calendar"], .fc-calendar, .calendar');
      
      if (!calendar) {
        // Look for any date elements that might be clickable
        const dateElements = Array.from(document.querySelectorAll('td, div, span')).filter(el => {
          const text = el.textContent.trim();
          return /^\d{1,2}$/.test(text) && parseInt(text) >= 1 && parseInt(text) <= 31;
        });
        
        // Check if any dates have different styling (indicating availability)
        const availableDates = dateElements.filter(el => {
          const style = window.getComputedStyle(el);
          const bgColor = style.backgroundColor;
          const color = style.color;
          const cursor = style.cursor;
          
          // Look for dates that are not grayed out or disabled
          return cursor === 'pointer' || 
                 bgColor !== 'rgb(128, 128, 128)' && bgColor !== 'rgb(211, 211, 211)' &&
                 color !== 'rgb(128, 128, 128)' && color !== 'rgb(211, 211, 211)';
        });
        
        if (availableDates.length > 0) {
          // Click the first available date
          availableDates[0].click();
          return {
            available: true,
            dateText: availableDates[0].textContent.trim(),
            totalAvailable: availableDates.length
          };
        }
      }
      
      // Check for "No hay horas disponibles" message
      const noAvailabilityMessage = document.body.textContent.toLowerCase();
      if (noAvailabilityMessage.includes('no hay horas disponibles') || 
          noAvailabilityMessage.includes('no hay citas disponibles')) {
        return { available: false, reason: 'No appointments available message found' };
      }
      
      return { available: false, reason: 'No available dates found' };
    });
    
    if (!dateAvailability.available) {
      logger.logInfo(`No available dates found. Reason: ${dateAvailability.reason}`);
      return null;
    }
    
    logger.logInfo(`Found available date: ${dateAvailability.dateText}`);
    
    // Wait for time slots to load
    await page.waitForTimeout(3000);
    
    // Look for available time slots
    logger.logInfo('Looking for available time slots...');
    
    const timeSlotSelected = await page.evaluate(() => {
      // Look for time slot elements
      const timeElements = Array.from(document.querySelectorAll('button, div, span')).filter(el => {
        const text = el.textContent.trim();
        return /^\d{1,2}:\d{2}$/.test(text); // Format HH:MM
      });
      
      // Find clickable time slots
      const availableTimeSlots = timeElements.filter(el => {
        const style = window.getComputedStyle(el);
        return style.cursor === 'pointer' || el.tagName === 'BUTTON';
      });
      
      if (availableTimeSlots.length > 0) {
        availableTimeSlots[0].click();
        return {
          available: true,
          time: availableTimeSlots[0].textContent.trim(),
          totalSlots: availableTimeSlots.length
        };
      }
      
      return { available: false, reason: 'No time slots found' };
    });
    
    if (!timeSlotSelected.available) {
      logger.logInfo(`No time slots available. Reason: ${timeSlotSelected.reason}`);
      return null;
    }
    
    logger.logInfo(`Selected time slot: ${timeSlotSelected.time}`);
    
    // Wait for form to appear
    await page.waitForTimeout(5000);
    
    // Step 4: Fill the contact details form
    logger.logInfo('Step 4: Filling contact details form...');
    
    const formFilled = await page.evaluate((personalData) => {
      try {
        // Look for all input fields and fill them based on type/name/placeholder
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input:not([type])');
        
        for (let input of inputs) {
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const label = document.querySelector(`label[for="${input.id}"]`);
          const labelText = label ? label.textContent.toLowerCase() : '';
          
          // Determine what field this is based on attributes
          if (name.includes('nombre') || id.includes('nombre') || placeholder.includes('nombre') || labelText.includes('nombre')) {
            input.value = personalData.nombre;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          else if (name.includes('apellido') || id.includes('apellido') || placeholder.includes('apellido') || labelText.includes('apellido')) {
            input.value = personalData.apellido;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          else if (name.includes('pasaporte') || id.includes('pasaporte') || placeholder.includes('pasaporte') || 
                   name.includes('documento') || id.includes('documento') || placeholder.includes('documento')) {
            input.value = personalData.pasaporte;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          else if (input.type === 'email' || name.includes('email') || name.includes('correo') || 
                   id.includes('email') || id.includes('correo') || placeholder.includes('email')) {
            input.value = personalData.correo;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          else if (input.type === 'tel' || name.includes('telefono') || name.includes('contacto') || 
                   id.includes('telefono') || id.includes('contacto') || placeholder.includes('telefono')) {
            input.value = personalData.contacto;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          else if (input.type === 'date' || name.includes('fecha') || id.includes('fecha') || placeholder.includes('fecha')) {
            input.value = personalData.fechaNacimiento;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error filling form:', error);
        return false;
      }
    }, config.personalData);
    
    if (formFilled) {
      logger.logInfo('Contact form filled successfully');
    } else {
      logger.logError('Error filling contact form');
    }
    
    // Wait for form to process
    await page.waitForTimeout(3000);
    
    // Look for and handle privacy checkbox
    logger.logInfo('Looking for privacy checkbox...');
    
    const checkboxHandled = await page.evaluate(() => {
      // Look for checkboxes
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      
      for (let checkbox of checkboxes) {
        // Check surrounding text for privacy-related content
        const parent = checkbox.parentElement;
        const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
        
        let contextText = '';
        if (label) contextText += label.textContent.toLowerCase();
        if (parent) contextText += parent.textContent.toLowerCase();
        
        // Look for privacy-related keywords
        const privacyKeywords = [
          'datos personales', 'tratamiento', 'informado', 'privacidad', 
          'protección', 'acepto', 'términos', 'condiciones', 'consentimiento'
        ];
        
        if (privacyKeywords.some(keyword => contextText.includes(keyword))) {
          if (!checkbox.checked) {
            checkbox.click();
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return {
            success: true,
            checkboxId: checkbox.id,
            contextText: contextText.substring(0, 100)
          };
        }
      }
      
      // If no specific privacy checkbox found but there's only one checkbox, check it
      if (checkboxes.length === 1) {
        const checkbox = checkboxes[0];
        if (!checkbox.checked) {
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return {
          success: true,
          checkboxId: checkbox.id,
          contextText: 'Single checkbox - assumed privacy'
        };
      }
      
      return {
        success: false,
        totalCheckboxes: checkboxes.length,
        reason: 'No privacy checkbox identified'
      };
    });
    
    if (checkboxHandled.success) {
      logger.logInfo(`Privacy checkbox handled successfully. ID: ${checkboxHandled.checkboxId}`);
    } else {
      logger.logError(`Could not handle privacy checkbox. ${checkboxHandled.reason}. Total checkboxes: ${checkboxHandled.totalCheckboxes}`);
    }
    
    // Wait before looking for submit button
    await page.waitForTimeout(3000);
    
    // Look for and click the submit button
    logger.logInfo('Looking for submit button...');
    
    const submitClicked = await page.evaluate(() => {
      // Look for submit buttons with various approaches
      let submitButton = null;
      
      // Strategy 1: Look for button with specific ID
      submitButton = document.getElementById('contactStepCreateAppointmentButton');
      if (submitButton) {
        submitButton.click();
        return {
          success: true,
          strategy: 'Found by specific ID',
          buttonText: submitButton.textContent || submitButton.value || 'No text',
          buttonId: submitButton.id
        };
      }
      
      // Strategy 2: Look for buttons with submit-related text
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      const submitKeywords = ['crear cita', 'crear', 'confirmar', 'reservar', 'agendar', 'enviar', 'submit'];
      const excludeKeywords = ['cancel', 'cancelar', 'volver', 'atrás', 'back'];
      
      for (let btn of buttons) {
        const buttonText = (btn.textContent || btn.value || '').toLowerCase();
        
        // Skip buttons with exclude keywords
        if (excludeKeywords.some(keyword => buttonText.includes(keyword))) {
          continue;
        }
        
        // Check for submit keywords
        if (submitKeywords.some(keyword => buttonText.includes(keyword))) {
          btn.click();
          return {
            success: true,
            strategy: 'Found by text keywords',
            buttonText: btn.textContent || btn.value || 'No text',
            buttonId: btn.id
          };
        }
      }
      
      // Strategy 3: Look for submit input types
      const submitInputs = document.querySelectorAll('input[type="submit"]');
      if (submitInputs.length > 0) {
        const btn = submitInputs[submitInputs.length - 1]; // Take last submit button
        btn.click();
        return {
          success: true,
          strategy: 'Found submit input',
          buttonText: btn.value || 'Submit',
          buttonId: btn.id
        };
      }
      
      // Strategy 4: Last resort - any button that's not a cancel button
      const validButtons = buttons.filter(btn => {
        const buttonText = (btn.textContent || btn.value || '').toLowerCase();
        return !excludeKeywords.some(keyword => buttonText.includes(keyword));
      });
      
      if (validButtons.length > 0) {
        const btn = validButtons[validButtons.length - 1];
        btn.click();
        return {
          success: true,
          strategy: 'Last valid button',
          buttonText: btn.textContent || btn.value || 'No text',
          buttonId: btn.id
        };
      }
      
      return {
        success: false,
        reason: 'No submit button found',
        totalButtons: buttons.length,
        buttonDetails: buttons.map(btn => ({
          text: (btn.textContent || btn.value || '').trim(),
          id: btn.id,
          type: btn.type || btn.tagName
        }))
      };
    });
    
    if (submitClicked.success) {
      logger.logInfo(`Submit button clicked successfully using: ${submitClicked.strategy}`);
      logger.logInfo(`Button details - Text: "${submitClicked.buttonText}", ID: ${submitClicked.buttonId}`);
    } else {
      logger.logError(`Could not find submit button. ${submitClicked.reason}`);
      logger.logError(`Button details: ${JSON.stringify(submitClicked.buttonDetails, null, 2)}`);
    }
    
    // Wait for confirmation
    await page.waitForTimeout(8000);
    
    // Check for confirmation
    const confirmationResult = await page.evaluate(() => {
      const confirmationKeywords = [
        'cita creada', 'cita confirmada', 'reserva confirmada', 'éxito', 'success',
        'confirmación', 'completado', 'procesado'
      ];
      
      const bodyText = document.body.textContent.toLowerCase();
      const foundKeyword = confirmationKeywords.find(keyword => bodyText.includes(keyword));
      
      const urlIndicatesSuccess = window.location.href.includes('success') || 
                                 window.location.href.includes('confirmation');
      
      return {
        confirmed: !!foundKeyword || urlIndicatesSuccess,
        message: foundKeyword || (urlIndicatesSuccess ? 'URL indicates success' : 'No confirmation found'),
        url: window.location.href
      };
    });
    
    // Return result
    return {
      date: dateAvailability.dateText,
      time: timeSlotSelected.time,
      confirmed: confirmationResult.confirmed,
      confirmationMessage: confirmationResult.message,
      checkboxSuccess: checkboxHandled.success,
      submitSuccess: submitClicked.success
    };
    
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
