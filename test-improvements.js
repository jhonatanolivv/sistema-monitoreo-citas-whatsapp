// test-improvements.js
const { monitorAppointment } = require('./src/monitor-improved');
const logger = require('./src/logger');

async function testImprovements() {
  logger.logInfo('🧪 TESTANDO MELHORIAS DO SISTEMA');
  logger.logInfo('='.repeat(50));
  
  try {
    const result = await monitorAppointment();
    
    if (result) {
      logger.logInfo('✅ TESTE CONCLUÍDO COM SUCESSO!');
      logger.logInfo(`📅 Data encontrada: ${result.date}`);
      logger.logInfo(`⏰ Horário encontrado: ${result.time}`);
      logger.logInfo(`✅ Confirmado: ${result.confirmed ? 'SIM' : 'NÃO'}`);
      
      if (result.checkboxStrategy) {
        logger.logInfo(`🔲 Estratégia checkbox: ${result.checkboxStrategy}`);
      }
      
      if (result.buttonStrategy) {
        logger.logInfo(`🔘 Estratégia botão: ${result.buttonStrategy}`);
      }
      
      logger.logInfo(`🔲 Checkbox encontrada: ${result.checkboxSuccess ? 'SIM' : 'NÃO'}`);
      logger.logInfo(`🔘 Botão encontrado: ${result.buttonSuccess ? 'SIM' : 'NÃO'}`);
      
    } else {
      logger.logInfo('ℹ️ Nenhuma cita disponível no momento');
    }
    
  } catch (error) {
    logger.logError(`❌ ERRO NO TESTE: ${error.message}`);
  }
  
  logger.logInfo('='.repeat(50));
  logger.logInfo('🏁 TESTE FINALIZADO');
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testImprovements();
}

module.exports = { testImprovements };
