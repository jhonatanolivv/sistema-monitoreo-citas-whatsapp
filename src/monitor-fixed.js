// src/monitor-fixed.js
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
    
    // CRITICAL FIX: Wait longer for form elements to load
    logger.logInfo('Waiting for form elements to fully load...');
    await page.waitForTimeout(5000);
    
    // IMPROVED: Check and click the privacy checkbox with better waiting and debugging
    logger.logInfo('Looking for privacy checkbox with enhanced detection...');
    
    const checkboxResult = await page.evaluate(() => {
      let foundCheckbox = null;
      let strategy = '';
      let debugInfo = {
        totalCheckboxes: 0,
        totalSpans: 0,
        spanTexts: [],
        checkboxDetails: []
      };
      
      // Debug: Count all elements
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      const allSpans = document.querySelectorAll('span');
      
      debugInfo.totalCheckboxes = allCheckboxes.length;
      debugInfo.totalSpans = allSpans.length;
      debugInfo.spanTexts = Array.from(allSpans).map(span => span.textContent.trim()).slice(0, 10); // First 10 spans
      debugInfo.checkboxDetails = Array.from(allCheckboxes).map(cb => ({
        id: cb.id,
        name: cb.name,
        className: cb.className,
        parentText: cb.parentElement ? cb.parentElement.textContent.trim().substring(0, 100) : 'No parent'
      }));
      
      // Strategy 1: Look for span with exact text "Estoy informado/a sobre el tratamiento de mis datos personales"
      const spans = Array.from(document.querySelectorAll('span'));
      const targetSpan = spans.find(span => 
        span.textContent.trim().includes('Estoy informado/a sobre el tratamiento de mis datos personales') ||
        span.textContent.trim().includes('informado') ||
        span.textContent.trim().includes('datos personales') ||
        span.textContent.trim().includes('tratamiento')
      );
      
      if (targetSpan) {
        // Look for checkbox near this span - expand search area
        let searchElement = targetSpan;
        for (let i = 0; i < 5; i++) { // Go up 5 levels
          if (searchElement) {
            const checkbox = searchElement.querySelector('input[type="checkbox"]') || 
                            searchElement.previousElementSibling?.querySelector('input[type="checkbox"]') ||
                            searchElement.nextElementSibling?.querySelector('input[type="checkbox"]');
            
            if (checkbox) {
              foundCheckbox = checkbox;
              strategy = `Strategy 1: Found via span text (level ${i})`;
              break;
            }
            searchElement = searchElement.parentElement;
          }
        }
      }
      
      // Strategy 2: Look for any checkbox and check surrounding text
      if (!foundCheckbox && allCheckboxes.length > 0) {
        const privacyKeywords = [
          'datos personales',
          'tratamiento',
          'informado',
          'privacidad',
          'protección',
          'acepto',
          'términos',
          'condiciones',
          'consentimiento',
          'autorizo',
          'RGPD',
          'LOPD'
        ];
        
        for (let checkbox of allCheckboxes) {
          // Check multiple levels of parent elements
          let currentElement = checkbox;
          for (let level = 0; level < 5; level++) {
            if (currentElement) {
              const elementText = currentElement.textContent.toLowerCase();
              if (privacyKeywords.some(keyword => elementText.includes(keyword))) {
                foundCheckbox = checkbox;
                strategy = `Strategy 2: Found via privacy keywords at level ${level}`;
                break;
              }
              currentElement = currentElement.parentElement;
            }
          }
          if (foundCheckbox) break;
        }
      }
      
      // Strategy 3: If only one checkbox, assume it's the privacy checkbox
      if (!foundCheckbox && allCheckboxes.length === 1) {
        foundCheckbox = allCheckboxes[0];
        strategy = 'Strategy 3: Single checkbox assumption';
      }
      
      if (foundCheckbox) {
        // Scroll to checkbox to ensure it's visible
        foundCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        if (!foundCheckbox.checked) {
          foundCheckbox.click();
          // Also try triggering change event
          foundCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return {
          success: true,
          strategy: strategy,
          checkboxId: foundCheckbox.id,
          checkboxName: foundCheckbox.name,
          wasChecked: foundCheckbox.checked,
          debugInfo: debugInfo
        };
      }
      
      return {
        success: false,
        reason: 'No privacy checkbox found with any strategy',
        debugInfo: debugInfo
      };
    });
    
    if (checkboxResult.success) {
      logger.logInfo(`Privacy checkbox found and clicked using: ${checkboxResult.strategy}`);
      logger.logInfo(`Checkbox details - ID: ${checkboxResult.checkboxId}, Name: ${checkboxResult.checkboxName}`);
    } else {
      logger.logError(`Could not find privacy checkbox. Reason: ${checkboxResult.reason}`);
      logger.logError(`Debug info: Total checkboxes: ${checkboxResult.debugInfo.totalCheckboxes}, Total spans: ${checkboxResult.debugInfo.totalSpans}`);
      logger.logError(`Sample span texts: ${JSON.stringify(checkboxResult.debugInfo.spanTexts)}`);
      logger.logError(`Checkbox details: ${JSON.stringify(checkboxResult.debugInfo.checkboxDetails)}`);
    }
    
    // CRITICAL FIX: Wait longer before looking for the button
    logger.logInfo('Waiting for final form step to load...');
    await page.waitForTimeout(5000);
    
    // IMPROVED: Click "CREAR CITA" button with better debugging and exclusion of cancel buttons
    logger.logInfo('Looking for CREAR CITA button with enhanced detection...');
    
    const buttonResult = await page.evaluate(() => {
      let foundButton = null;
      let strategy = '';
      let debugInfo = {
        totalButtons: 0,
        buttonDetails: []
      };
      
      // Debug: Get all buttons
      const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      debugInfo.totalButtons = allButtons.length;
      debugInfo.buttonDetails = allButtons.map(btn => ({
        text: (btn.textContent || btn.value || '').trim(),
        id: btn.id,
        className: btn.className,
        type: btn.type || btn.tagName
      }));
      
      // Strategy 1: Look for button with specific ID "contactStepCreateAppointmentButton"
      foundButton = document.getElementById('contactStepCreateAppointmentButton');
      if (foundButton) {
        strategy = 'Strategy 1: Found via specific ID "contactStepCreateAppointmentButton"';
      }
      
      // Strategy 2: Look for buttons with "CREAR CITA" text (exclude cancel buttons)
      if (!foundButton) {
        for (let btn of allButtons) {
          const buttonText = (btn.textContent || btn.value || '').trim().toLowerCase();
          if (buttonText.includes('crear cita') && !buttonText.includes('cancel')) {
            foundButton = btn;
            strategy = 'Strategy 2: Found via "crear cita" text match';
            break;
          }
        }
      }
      
      // Strategy 3: Look for buttons with positive keywords (exclude negative ones)
      if (!foundButton) {
        const positiveKeywords = ['crear', 'confirmar', 'reservar', 'agendar', 'solicitar', 'enviar', 'submit', 'continuar', 'siguiente', 'finalizar'];
        const negativeKeywords = ['cancel', 'cancelar', 'volver', 'atrás', 'back', 'close', 'cerrar'];
        
        for (let btn of allButtons) {
          const buttonText = (btn.textContent || btn.value || '').trim().toLowerCase();
          
          // Skip if contains negative keywords
          if (negativeKeywords.some(keyword => buttonText.includes(keyword))) {
            continue;
          }
          
          // Check for positive keywords
          if (positiveKeywords.some(keyword => buttonText.includes(keyword))) {
            foundButton = btn;
            strategy = `Strategy 3: Positive keyword match - "${buttonText}"`;
            break;
          }
        }
      }
      
      // Strategy 4: Look for buttons with specific classes or IDs (exclude cancel-related)
      if (!foundButton) {
        const buttonSelectors = [
          'button[id*="create"]:not([id*="cancel"])',
          'button[id*="appointment"]:not([id*="cancel"])',
          'button[id*="submit"]:not([id*="cancel"])',
          'button[id*="confirm"]:not([id*="cancel"])',
          'button[class*="submit"]:not([class*="cancel"])',
          'button[class*="confirm"]:not([class*="cancel"])',
          'button[class*="create"]:not([class*="cancel"])',
          'button[class*="appointment"]:not([class*="cancel"])',
          '.btn-primary:not([class*="cancel"])',
          '.btn-success:not([class*="cancel"])',
          '.button-primary:not([class*="cancel"])'
        ];
        
        for (let selector of buttonSelectors) {
          const btn = document.querySelector(selector);
          if (btn) {
            foundButton = btn;
            strategy = `Strategy 4: CSS selector - ${selector}`;
            break;
          }
        }
      }
      
      // Strategy 5: Submit buttons (exclude cancel-related)
      if (!foundButton) {
        const submitButtons = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"]'));
        const validSubmitButtons = submitButtons.filter(btn => {
          const buttonText = (btn.textContent || btn.value || '').trim().toLowerCase();
          return !buttonText.includes('cancel') && !buttonText.includes('cancelar');
        });
        
        if (validSubmitButtons.length > 0) {
          foundButton = validSubmitButtons[validSubmitButtons.length - 1];
          strategy = 'Strategy 5: Last valid submit button';
        }
      }
      
      if (foundButton) {
        // Scroll to button to ensure it's visible
        foundButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Click immediately without setTimeout to avoid timing issues
        try {
          foundButton.click();
        } catch (e) {
          // If regular click fails, try dispatching click event
          foundButton.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
        }
        
        return {
          success: true,
          strategy: strategy,
          buttonText: foundButton.textContent || foundButton.value || 'No text',
          buttonId: foundButton.id,
          buttonClass: foundButton.className,
          buttonType: foundButton.type || foundButton.tagName,
          debugInfo: debugInfo
        };
      }
      
      return {
        success: false,
        reason: 'No suitable button found with any strategy',
        debugInfo: debugInfo
      };
    });
    
    if (buttonResult.success) {
      logger.logInfo(`CREAR CITA button found and clicked using: ${buttonResult.strategy}`);
      logger.logInfo(`Button details - Text: "${buttonResult.buttonText}", ID: ${buttonResult.buttonId}, Type: ${buttonResult.buttonType}`);
    } else {
      logger.logError(`Could not find CREAR CITA button. Reason: ${buttonResult.reason}`);
      logger.logError(`Debug info: Total buttons: ${buttonResult.debugInfo.totalButtons}`);
      logger.logError(`Available buttons: ${JSON.stringify(buttonResult.debugInfo.buttonDetails, null, 2)}`);
    }
    
    // Wait longer for confirmation after clicking
    await page.waitForTimeout(10000);
    
    // IMPROVED: Check if appointment was successfully created with more comprehensive detection
    const appointmentCreated = await page.evaluate(() => {
      const confirmationMessages = [
        'cita creada',
        'cita confirmada',
        'cita registrada',
        'reserva confirmada',
        'reserva creada',
        'appointment created',
        'appointment confirmed',
        'éxito',
        'success',
        'confirmación',
        'confirmation',
        'completado',
        'completed',
        'procesado',
        'processed'
      ];
      
      const bodyText = document.body.textContent.toLowerCase();
      const foundMessage = confirmationMessages.find(msg => bodyText.includes(msg));
      
      // Also check for success indicators in the URL
      const urlIndicatesSuccess = window.location.href.includes('success') || 
                                 window.location.href.includes('confirmation') ||
                                 window.location.href.includes('complete');
      
      return {
        confirmed: !!foundMessage || urlIndicatesSuccess,
        message: foundMessage || (urlIndicatesSuccess ? 'URL indicates success' : 'No confirmation found'),
        url: window.location.href
      };
    });
    
    const fullDate = availableDate.dateText;
    
    if (appointmentCreated.confirmed) {
      logger.logInfo(`Appointment successfully created: Date: ${fullDate}, Time: ${availableTime.time}`);
      logger.logInfo(`Confirmation detected: ${appointmentCreated.message}`);
      return {
        date: fullDate,
        time: availableTime.time,
        confirmed: true,
        confirmationMessage: appointmentCreated.message,
        checkboxStrategy: checkboxResult.strategy,
        buttonStrategy: buttonResult.strategy
      };
    } else {
      logger.logInfo('Appointment process completed - confirmation status unclear');
      logger.logInfo(`Current URL: ${appointmentCreated.url}`);
      return {
        date: fullDate,
        time: availableTime.time,
        confirmed: false,
        checkboxStrategy: checkboxResult.strategy || 'Failed',
        buttonStrategy: buttonResult.strategy || 'Failed',
        checkboxSuccess: checkboxResult.success,
        buttonSuccess: buttonResult.success
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
