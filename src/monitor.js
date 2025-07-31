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
    await page.waitForTimeout(3000);
    
    // Look for the "Reconocimiento de Firmas para Legalizaciones" option
    logger.logInfo(`Looking for option "${config.reservationOptionText}"`);
    
    // Wait for the step2 section to be available
    await page.waitForSelector('#step2', { timeout: 10000 });
    
    // Find and click the correct radio button using step2 ID
    const optionFound = await page.evaluate((optionText) => {
      const step2Section = document.querySelector('#step2');
      if (!step2Section) return false;
      
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
      logger.logError('Could not find the reservation option');
      return null;
    }
    
    logger.logInfo('Option selected, waiting for calendar to load...');
    await page.waitForTimeout(3000);
    
    // Wait for step3 (date selection) to become available
    await page.waitForSelector('#step3', { timeout: 10000 });
    
    // Click on step3 to expand date selection if needed
    await page.evaluate(() => {
      const step3Section = document.querySelector('#step3');
      if (step3Section) {
        const step3Header = step3Section.querySelector('h3, h4, .panel-heading, .step-header');
        if (step3Header) {
          step3Header.click();
        }
      }
    });
    await page.waitForTimeout(3000);
    
    // Look for available dates in the calendar within step3
    const availableAppointment = await page.evaluate(() => {
      const step3Section = document.querySelector('#step3');
      if (!step3Section) {
        return { available: false, reason: 'Step3 section not found' };
      }
      
      // First, check if there's a "No hay citas disponibles" message
      const noAppointmentsMessages = [
        'no hay citas disponibles',
        'no disponible',
        'sin citas',
        'no appointments available',
        'no hay horarios',
        'no hay fechas disponibles',
        'sin disponibilidad'
      ];
      
      const step3Text = step3Section.textContent.toLowerCase();
      const hasNoAppointmentsMessage = noAppointmentsMessages.some(msg => 
        step3Text.includes(msg)
      );
      
      if (hasNoAppointmentsMessage) {
        return { available: false, reason: 'No appointments message found in step3' };
      }
      
      // Look for calendar table within step3
      const calendarTable = step3Section.querySelector('table, .calendar, .date-picker');
      if (!calendarTable) {
        return { available: false, reason: 'Calendar table not found in step3' };
      }
      
      // Look for ALL clickable date cells that are not disabled
      const dateCells = Array.from(calendarTable.querySelectorAll('td, button, .v-btn')).filter(el => {
        const text = el.textContent.trim();
        const isNumber = /^\d{1,2}$/.test(text);
        
        if (!isNumber) return false;
        
        const dateNum = parseInt(text);
        if (dateNum < 1 || dateNum > 31) return false;
        
        // Check if element is disabled (more comprehensive check)
        if (el.disabled || 
            el.classList.contains('disabled') || 
            el.classList.contains('unavailable') ||
            el.hasAttribute('disabled') ||
            el.classList.contains('past') ||
            el.classList.contains('v-btn--disabled') ||
            el.getAttribute('aria-disabled') === 'true') {
          return false;
        }
        
        // Check if it's clickable (has click events or is a button)
        const computedStyle = window.getComputedStyle(el);
        const isClickable = computedStyle.cursor === 'pointer' || 
                           el.tagName === 'BUTTON' ||
                           el.onclick !== null ||
                           el.classList.contains('available') ||
                           el.classList.contains('selectable') ||
                           (el.classList.contains('v-btn') && !el.classList.contains('v-btn--disabled'));
        
        // Additional check for background color (available dates often have different styling)
        const bgColor = computedStyle.backgroundColor;
        const color = computedStyle.color;
        const hasAvailableStyling = !bgColor.includes('gray') && 
                                   !bgColor.includes('rgb(211, 211, 211)') && // Light gray
                                   !bgColor.includes('rgb(169, 169, 169)') && // Dark gray
                                   !bgColor.includes('rgb(128, 128, 128)');   // Medium gray
        
        // Check if the element has classes that indicate it's available
        const hasAvailableClass = el.classList.contains('available') ||
                                 el.classList.contains('selectable') ||
                                 el.classList.contains('active') ||
                                 (el.classList.contains('v-btn') && !el.classList.contains('v-btn--disabled'));
        
        return (isClickable || hasAvailableClass) && hasAvailableStyling;
      });
      
      if (dateCells.length === 0) {
        return { available: false, reason: 'No available date cells found in calendar' };
      }
      
      // Log all available dates for debugging
      const allAvailableDates = dateCells.map(cell => ({
        date: cell.textContent.trim(),
        classes: cell.className,
        tagName: cell.tagName
      }));
      
      // Click the first available date
      const chosenDate = dateCells[0];
      chosenDate.click();
      
      // Get the current month/year for better date formatting
      const monthYearElement = step3Section.querySelector('.month, .year, .current-month');
      const monthYear = monthYearElement ? monthYearElement.textContent.trim() : '';
      
      return { 
        available: true, 
        dateText: chosenDate.textContent.trim(),
        monthYear: monthYear,
        element: chosenDate.tagName,
        className: chosenDate.className,
        totalAvailableDates: dateCells.length,
        allDates: allAvailableDates
      };
    });
    
    if (!availableAppointment.available) {
      logger.logInfo(`No available appointment dates found. Reason: ${availableAppointment.reason || 'Unknown'}`);
      return null;
    }
    
    logger.logInfo(`Found ${availableAppointment.totalAvailableDates} available dates. Selected date: ${availableAppointment.dateText} ${availableAppointment.monthYear} (${availableAppointment.element}, class: ${availableAppointment.className})`);
    
    // Wait for time slots to load after selecting a date
    await page.waitForTimeout(3000);
    
    // Look for available time slots within step3 after date selection
    const appointmentDetails = await page.evaluate(() => {
      const step3Section = document.querySelector('#step3');
      if (!step3Section) {
        return { available: false, reason: 'Step3 section not found for time selection' };
      }
      
      // Check if there's a message saying no times are available
      const noTimesMessages = [
        'no hay horarios disponibles',
        'sin horarios',
        'no times available',
        'no hay horas'
      ];
      
      const step3Text = step3Section.textContent.toLowerCase();
      const hasNoTimesMessage = noTimesMessages.some(msg => 
        step3Text.includes(msg)
      );
      
      if (hasNoTimesMessage) {
        return { available: false, reason: 'No times available message found in step3' };
      }
      
      // Look for time slot buttons within step3
      const timeElements = Array.from(step3Section.querySelectorAll('button, .time-slot, .hour-button')).filter(el => {
        const text = el.textContent.trim();
        const isTimeFormat = /^\d{1,2}:\d{2}$/.test(text);
        
        if (!isTimeFormat) return false;
        
        // Check if element is disabled
        if (el.disabled || 
            el.classList.contains('disabled') || 
            el.classList.contains('unavailable') ||
            el.classList.contains('booked')) {
          return false;
        }
        
        // Check if it's available (green background or available class)
        const computedStyle = window.getComputedStyle(el);
        const bgColor = computedStyle.backgroundColor;
        const hasAvailableColor = bgColor.includes('green') || 
                                 bgColor.includes('rgb(40, 167, 69)') ||
                                 el.classList.contains('available') ||
                                 el.classList.contains('free');
        
        const isClickable = computedStyle.cursor === 'pointer' || el.tagName === 'BUTTON';
        
        return hasAvailableColor && isClickable;
      });
      
      if (timeElements.length === 0) {
        return { available: false, reason: 'No available time slots found in step3' };
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
    
    if (!appointmentDetails || !appointmentDetails.available) {
      logger.logInfo(`No time slots available for the selected date. Reason: ${appointmentDetails?.reason || 'Unknown'}`);
      return null;
    }
    
    logger.logInfo(`Found available time slot: ${appointmentDetails.time} (${appointmentDetails.totalSlotsFound} total slots available)`);
    
    // Wait a bit more to ensure the reservation is processed
    await page.waitForTimeout(2000);
    
    // Check if reservation was actually successful by looking for confirmation
    const reservationConfirmed = await page.evaluate(() => {
      const confirmationMessages = [
        'reserva confirmada',
        'cita reservada',
        'appointment confirmed',
        'reservado',
        'confirmado'
      ];
      
      const bodyText = document.body.textContent.toLowerCase();
      return confirmationMessages.some(msg => bodyText.includes(msg));
    });
    
    const fullDate = `${availableAppointment.dateText} ${availableAppointment.monthYear}`.trim();
    
    if (reservationConfirmed) {
      logger.logInfo(`Appointment successfully reserved: Date: ${fullDate}, Time: ${appointmentDetails.time}`);
      return {
        date: fullDate,
        time: appointmentDetails.time,
        confirmed: true
      };
    } else {
      logger.logInfo('Appointment selection completed but confirmation not detected - this may be normal for this booking system');
      return {
        date: fullDate,
        time: appointmentDetails.time,
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
