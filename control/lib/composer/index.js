/**
 * Modular Protocol Composer
 *
 * Composes instructions.txt from stackable, optional protocols.
 * Instead of choosing "conversational OR form OR appointments",
 * users can enable any combination of capabilities.
 *
 * Usage:
 *   import { composeInstructions } from '@/lib/composer';
 *
 *   const instructions = await composeInstructions({
 *     objective: 'Help users book consultations',
 *     enabledProtocols: {
 *       knowledge: true,
 *       formGathering: true,
 *       appointments: false,
 *     },
 *     protocolData: {
 *       formStructure: { ... },
 *       appointments: [ ... ],
 *     },
 *   });
 */

export {
  composeInstructions,
  validateEnabledProtocols,
  getEnabledProtocolNames,
  buildFormStructureSection,
  buildCalendarSection,
  PROTOCOL_FILES,
  PROTOCOL_ORDER,
} from './composer.js';

export {
  buildResponseFormatSection,
  CORE_ATTRIBUTES,
  FORM_GATHERING_ATTRIBUTES,
  APPOINTMENTS_ATTRIBUTES,
} from './response-builder.js';
