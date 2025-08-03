// src/monitor-improved.js
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
    
    // IMPROVED: Check and click the privacy checkbox with specific selector
    logger.logInfo('Looking for privacy checkbox with specific selector...');
    
    const checkboxResult = await page.evaluate(() => {
      let foundCheckbox = null;
      let strategy = '';
      
      // Strategy 1: Look for span with exact text "Estoy informado/a sobre el tratamiento de mis datos personales"
      const spans = Array.from(document.querySelectorAll('span'));
      const targetSpan = spans.find(span => 
        span.textContent.trim().includes('Estoy informado/a sobre el tratamiento de mis datos personales')
      );
      
      if (targetSpan) {
        // Look for checkbox near this span
        const parentElement = targetSpan.closest('label') || targetSpan.parentElement;
        if (parentElement) {
          const checkbox = parentElement.querySelector('input[type="checkbox"]') || 
                          parentElement.previousElementSibling?.querySelector('input[type="checkbox"]') ||
                          parentElement.nextElementSibling?.querySelector('input[type="checkbox"]');
          
          if (checkbox) {
            foundCheckbox = checkbox;
            strategy = 'Strategy 1: Found via specific span text';
          }
        }
      }
      
      // Strategy 2: Fallback - Look for checkboxes with privacy-related text in surrounding elements
      if (!foundCheckbox) {
        const privacyKeywords = [
          'datos personales',
          'tratamiento de mis datos',
          'informado/a sobre el tratamiento',
          'privacidad',
          'protección de datos',
          'acepto',
          'términos',
          'condiciones',
          'consentimiento',
          'autorizo',
          'RGPD',
          'LOPD'
        ];
        
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        
        for (let checkbox of checkboxes) {
          // Check label associated with checkbox
          const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
          if (label) {
            const labelText = label.textContent.toLowerCase();
            if (privacyKeywords.some(keyword => labelText.includes(keyword))) {
              foundCheckbox = checkbox;
              strategy = 'Strategy 2: Label association with privacy keywords';
              break;
            }
          }
          
          // Check parent element
          const parent = checkbox.parentElement;
          if (parent) {
            const parentText = parent.textContent.toLowerCase();
            if (privacyKeywords.some(keyword => parentText.includes(keyword))) {
              foundCheckbox = checkbox;
              strategy = 'Strategy 2: Parent element with privacy keywords';
              break;
            }
          }
        }
      }
      
      // Strategy 3: Last resort - single checkbox or last checkbox
      if (!foundCheckbox) {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 1) {
          foundCheckbox = checkboxes[0];
          strategy = 'Strategy 3: Single checkbox assumption';
        } else if (checkboxes.length > 0) {
          foundCheckbox = checkboxes[checkboxes.length - 1];
          strategy = 'Strategy 3: Last checkbox assumption';
        }
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
          wasChecked: foundCheckbox.checked
        };
      }
      
      return {
        success: false,
        totalCheckboxes: document.querySelectorAll('input[type="checkbox"]').length,
        reason: 'No privacy checkbox found with any strategy'
      };
    });
    
    if (checkboxResult.success) {
      logger.logInfo(`Privacy checkbox found and clicked using: ${checkboxResult.strategy}`);
      logger.logInfo(`Checkbox details - ID: ${checkboxResult.checkboxId}, Name: ${checkboxResult.checkboxName}`);
    } else {
      logger.logError(`Could not find privacy checkbox. Total checkboxes found: ${checkboxResult.totalCheckboxes}. Reason: ${checkboxResult.reason}`);
    }
    
    // Wait a bit before clicking the final button
    await page.waitForTimeout(3000);
    
    // IMPROVED: Click "CREAR CITA" button with specific ID selector
    logger.logInfo('Looking for CREAR CITA button with specific ID...');
    
    const buttonResult = await page.evaluate(() => {
      let foundButton = null;
      let strategy = '';
      
      // Strategy 1: Look for button with specific ID "contactStepCreateAppointmentButton"
      foundButton = document.getElementById('contactStepCreateAppointmentButton');
      if (foundButton) {
        strategy = 'Strategy 1: Found via specific ID "contactStepCreateAppointmentButton"';
      }
      
      // Strategy 2: Look for buttons with "CREAR CITA" text
      if (!foundButton) {
        const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'));
        
        for (let btn of allButtons) {
          const buttonText = (btn.textContent || btn.value || '').trim().toLowerCase();
          if (buttonText.includes('crear cita')) {
            foundButton = btn;
            strategy = 'Strategy 2: Found via "crear cita" text match';
            break;
          }
        }
      }
      
      // Strategy 3: Look for buttons with related keywords
      if (!foundButton) {
        const buttonKeywords = [
          'crear',
          'confirmar',
          'reservar',
          'agendar',
          'solicitar',
          'enviar',
          'submit',
          'continuar',
          'siguiente',
          'finalizar'
        ];
        
        const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'));
        
        for (let btn of allButtons) {
          const buttonText = (btn.textContent || btn.value || '').trim().toLowerCase();
          if (buttonKeywords.some(keyword => buttonText.includes(keyword))) {
            foundButton = btn;
            strategy = `Strategy 3: Keyword match - "${buttonText}"`;
            break;
          }
        }
      }
      
      // Strategy 4: Look for buttons with specific classes or IDs containing relevant terms
      if (!foundButton) {
        const buttonSelectors = [
          'button[id*="create"]',
          'button[id*="appointment"]',
          'button[id*="submit"]',
          'button[id*="confirm"]',
          'button[class*="submit"]',
          'button[class*="confirm"]',
          'button[class*="create"]',
          'button[class*="appointment"]',
          '.btn-primary',
          '.btn-success',
          '.button-primary'
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
      
      // Strategy 5: Last resort - submit buttons or last button
      if (!foundButton) {
        const submitButtons = document.querySelectorAll('input[type="submit"], button[type="submit"]');
        if (submitButtons.length > 0) {
          foundButton = submitButtons[submitButtons.length - 1];
          strategy = 'Strategy 5: Last submit button';
        } else {
          const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
          if (allButtons.length > 0) {
            foundButton = allButtons[allButtons.length - 1];
            strategy = 'Strategy 5: Last button on page';
          }
        }
      }
      
      if (foundButton) {
        // Scroll to button to ensure it's visible
        foundButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Wait a moment for scroll to complete
        setTimeout(() => {
          // Try multiple click methods
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
        }, 500);
        
        return {
          success: true,
          strategy: strategy,
          buttonText: foundButton.textContent || foundButton.value || 'No text',
          buttonId: foundButton.id,
          buttonClass: foundButton.className,
          buttonType: foundButton.type || foundButton.tagName
        };
      }
      
      return {
        success: false,
        totalButtons: document.querySelectorAll('button, input[type="submit"], input[type="button"]').length,
        reason: 'No suitable button found with any strategy',
        availableButtons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(btn => ({
          text: btn.textContent || btn.value || 'No text',
          id: btn.id,
          class: btn.className,
          type: btn.type || btn.tagName
        }))
      };
    });
    
    if (buttonResult.success) {
      logger.logInfo(`CREAR CITA button found and clicked using: ${buttonResult.strategy}`);
      logger.logInfo(`Button details - Text: "${buttonResult.buttonText}", ID: ${buttonResult.buttonId}, Type: ${buttonResult.buttonType}`);
    } else {
      logger.logError(`Could not find CREAR CITA button. Total buttons found: ${buttonResult.totalButtons}`);
      logger.logError(`Available buttons: ${JSON.stringify(buttonResult.availableButtons, null, 2)}`);
    }
    
    // Wait longer for confirmation after clicking
    await page.waitForTimeout(8000);
    
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
        message: foundMessage || 'URL indicates success',
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
        checkboxStrategy: checkboxResult.strategy,
        buttonStrategy: buttonResult.strategy,
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
