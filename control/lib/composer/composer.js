import fs from 'fs/promises';
import path from 'path';
import { buildResponseFormatSection } from './response-builder.js';

const PROTOCOLS_DIR = path.join(process.cwd(), 'lib', 'composer', 'protocols');

/**
 * Protocol files in deterministic order
 */
const PROTOCOL_FILES = {
  base: '00_base.txt',
  knowledge: '01_knowledge.txt',
  formGathering: '02_form-gathering.txt',
  appointments: '03_appointments.txt',
  triage: '04_triage.txt',
};

/**
 * Deterministic protocol ordering for consistent composition
 */
const PROTOCOL_ORDER = ['base', 'knowledge', 'formGathering', 'appointments', 'triage'];

/**
 * Reads a protocol file from the protocols directory
 * @param {string} filename - The protocol filename
 * @returns {Promise<string>} - The file contents
 */
async function readProtocol(filename) {
  const filePath = path.join(PROTOCOLS_DIR, filename);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read protocol file: ${filename}`, error);
    throw new Error(`Protocol file not found: ${filename}`);
  }
}

/**
 * Builds the form structure section for form gathering protocol
 * @param {string|Object} formStructure - Form structure JSON string or object
 * @returns {string} - Form structure section text
 */
function buildFormStructureSection(formStructure) {
  if (!formStructure) return '';

  try {
    const parsed = typeof formStructure === 'string'
      ? JSON.parse(formStructure)
      : formStructure;

    // Create stripped version of formStructure (id, label, and conditions only)
    const strippedFormStructure = {
      sections: parsed.sections.map(section => ({
        id: section.id,
        label: section.label,
        ...(section.condition && { condition: section.condition }),
        fields: section.fields.map(field => ({
          id: field.id,
          label: field.label,
          ...(field.condition && { condition: field.condition }),
          ...(field.required !== undefined && { required: field.required }),
        }))
      }))
    };

    return `## FORM STRUCTURE - Use these exact field IDs when collecting data\n\n${JSON.stringify(strippedFormStructure, null, 2)}`;
  } catch (error) {
    console.warn('Invalid form structure JSON, skipping form section');
    return '';
  }
}

/**
 * Builds the calendar configuration section for appointments protocol
 * @param {Array} appointments - Array of appointment destination objects
 * @returns {string} - Calendar section text
 */
function buildCalendarSection(appointments) {
  if (!appointments || appointments.length === 0) return '';

  return `## AVAILABLE CALENDARS - Calendar providers for appointment booking\n\n${JSON.stringify(appointments, null, 2)}`;
}

/**
 * Builds the triage routes section for triage protocol
 * @param {Array} triageRoutes - Array of triage route objects
 * @returns {string} - Triage routes section text
 */
function buildTriageSection(triageRoutes) {
  if (!triageRoutes || triageRoutes.length === 0) return '';

  // Strip to fields the LLM needs to route. `url` is a client-side redirect handle and
  // is intentionally excluded so it can't leak into model output. Mirrors the
  // form-structure stripping in buildFormStructureSection.
  const strippedRoutes = triageRoutes.map(({ deploymentId, name, description }) => ({
    deploymentId,
    name,
    description,
  }));

  return `## TRIAGE ROUTES - Available routing destinations for user intent matching\n\n${JSON.stringify(strippedRoutes, null, 2)}`;
}

/**
 * Composes instructions.txt from enabled protocols
 * @param {Object} config
 * @param {string} config.objective - Bot objective
 * @param {Object} config.enabledProtocols - { knowledge: bool, formGathering: bool, appointments: bool, triage: bool }
 * @param {Object} config.protocolData - Protocol-specific data (formStructure, appointments, etc.)
 * @returns {Promise<string>} - Complete instructions.txt content
 */
async function composeInstructions(config) {
  const { objective, enabledProtocols, protocolData = {} } = config;
  const sections = [];

  console.log('📜 Modular composer enabled protocols:', enabledProtocols);

  // 1. Always include base protocol
  sections.push(await readProtocol(PROTOCOL_FILES.base));

  // 2. Add enabled protocols in deterministic order
  if (enabledProtocols.knowledge) {
    sections.push(await readProtocol(PROTOCOL_FILES.knowledge));
  }

  if (enabledProtocols.formGathering) {
    sections.push(await readProtocol(PROTOCOL_FILES.formGathering));
    const formSection = buildFormStructureSection(protocolData.formStructure);
    if (formSection) {
      sections.push(formSection);
    }
  }

  if (enabledProtocols.appointments) {
    sections.push(await readProtocol(PROTOCOL_FILES.appointments));
    const calendarSection = buildCalendarSection(protocolData.appointments);
    if (calendarSection) {
      sections.push(calendarSection);
    }
  }

  if (enabledProtocols.triage) {
    sections.push(await readProtocol(PROTOCOL_FILES.triage));
    const triageSection = buildTriageSection(protocolData.triage);
    if (triageSection) {
      sections.push(triageSection);
    }
  }

  // 3. Add user objective
  sections.push(`## USER CUSTOM INSTRUCTIONS\n\n## OBJECTIVE: ${objective}`);

  // 4. Add composed response format
  const responseFormat = await buildResponseFormatSection(enabledProtocols);
  sections.push(responseFormat);

  return sections.join('\n\n');
}

/**
 * Validates that at least one protocol is enabled
 * @param {Object} enabledProtocols - Protocol toggles
 * @returns {boolean} - True if valid
 */
function validateEnabledProtocols(enabledProtocols) {
  return enabledProtocols.knowledge ||
         enabledProtocols.formGathering ||
         enabledProtocols.appointments ||
         enabledProtocols.triage;
}

/**
 * Gets the list of enabled protocol names
 * @param {Object} enabledProtocols - Protocol toggles
 * @returns {string[]} - Array of enabled protocol names
 */
function getEnabledProtocolNames(enabledProtocols) {
  return PROTOCOL_ORDER.filter(name => {
    if (name === 'base') return true; // Base is always enabled
    return enabledProtocols[name];
  });
}

export {
  composeInstructions,
  validateEnabledProtocols,
  getEnabledProtocolNames,
  buildFormStructureSection,
  buildCalendarSection,
  buildTriageSection,
  readProtocol,
  PROTOCOL_FILES,
  PROTOCOL_ORDER,
};
