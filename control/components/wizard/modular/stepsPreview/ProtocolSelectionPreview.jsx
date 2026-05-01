'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';

/**
 * Available industry contexts for inspiration
 */
const CONTEXTS = {
  generic: {
    key: 'generic',
    labelKey: 'contextGeneric',
    color: 'gray',
  },
  medical: {
    key: 'medical',
    labelKey: 'contextMedical',
    color: 'blue',
  },
  legal: {
    key: 'legal',
    labelKey: 'contextLegal',
    color: 'slate',
  },
  retail: {
    key: 'retail',
    labelKey: 'contextRetail',
    color: 'emerald',
  },
  realestate: {
    key: 'realestate',
    labelKey: 'contextRealEstate',
    color: 'orange',
  },
  education: {
    key: 'education',
    labelKey: 'contextEducation',
    color: 'indigo',
  },
  hospitality: {
    key: 'hospitality',
    labelKey: 'contextHospitality',
    color: 'pink',
  },
  finance: {
    key: 'finance',
    labelKey: 'contextFinance',
    color: 'cyan',
  },
};

/**
 * Context-specific examples - domain-specific scenarios for each protocol combination
 */
const CONTEXT_EXAMPLES = {
  medical: {
    knowledge: {
      titleKey: 'medicalKnowledge',
      descKey: 'medicalKnowledgeDesc',
      scenarios: ['symptomChecker', 'drugInfo', 'treatmentFAQ', 'insuranceCoverage', 'prepInstructions'],
    },
    formGathering: {
      titleKey: 'medicalForms',
      descKey: 'medicalFormsDesc',
      scenarios: ['patientIntake', 'medicalHistory', 'consentForms', 'insuranceVerification', 'symptomQuestionnaire'],
    },
    appointments: {
      titleKey: 'medicalAppointments',
      descKey: 'medicalAppointmentsDesc',
      scenarios: ['doctorBooking', 'labScheduling', 'followUpReminders', 'specialistReferral', 'telehealth'],
    },
    triage: {
      titleKey: 'medicalTriage',
      descKey: 'medicalTriageDesc',
      scenarios: ['urgencyAssessment', 'departmentRouting', 'nurseEscalation', 'emergencyDetection', 'specialistMatch'],
    },
    'knowledge+formGathering': {
      titleKey: 'medicalKnowledgeForm',
      descKey: 'medicalKnowledgeFormDesc',
      scenarios: ['smartIntake', 'guidedSymptoms', 'educatedConsent', 'preVisitPrep'],
    },
    'knowledge+appointments': {
      titleKey: 'medicalKnowledgeAppt',
      descKey: 'medicalKnowledgeApptDesc',
      scenarios: ['informedBooking', 'prepThenSchedule', 'serviceExplainer', 'waitTimeInfo'],
    },
    'knowledge+formGathering+appointments': {
      titleKey: 'medicalTriple',
      descKey: 'medicalTripleDesc',
      scenarios: ['fullPatientJourney', 'newPatientOnboarding', 'referralWorkflow'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'medicalAll',
      descKey: 'medicalAllDesc',
      scenarios: ['virtualFrontDesk', 'completePatientPortal', 'urgentCareBot'],
    },
  },
  legal: {
    knowledge: {
      titleKey: 'legalKnowledge',
      descKey: 'legalKnowledgeDesc',
      scenarios: ['legalFAQ', 'caseTypesInfo', 'feeStructure', 'processExplainer', 'jurisdictionInfo'],
    },
    formGathering: {
      titleKey: 'legalForms',
      descKey: 'legalFormsDesc',
      scenarios: ['clientIntake', 'caseDetails', 'documentCollection', 'conflictCheck', 'retainerInfo'],
    },
    appointments: {
      titleKey: 'legalAppointments',
      descKey: 'legalAppointmentsDesc',
      scenarios: ['consultationBooking', 'depositionSchedule', 'courtDateReminders', 'meetingCoordination'],
    },
    triage: {
      titleKey: 'legalTriage',
      descKey: 'legalTriageDesc',
      scenarios: ['caseTypeRouting', 'urgencyAssessment', 'attorneyMatch', 'departmentRouting'],
    },
    'knowledge+formGathering': {
      titleKey: 'legalKnowledgeForm',
      descKey: 'legalKnowledgeFormDesc',
      scenarios: ['guidedIntake', 'informedConsent', 'caseEvaluation'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'legalAll',
      descKey: 'legalAllDesc',
      scenarios: ['virtualParalegal', 'clientPortal', 'caseManagement'],
    },
  },
  retail: {
    knowledge: {
      titleKey: 'retailKnowledge',
      descKey: 'retailKnowledgeDesc',
      scenarios: ['productInfo', 'stockAvailability', 'returnPolicy', 'shippingFAQ', 'sizeGuide'],
    },
    formGathering: {
      titleKey: 'retailForms',
      descKey: 'retailFormsDesc',
      scenarios: ['orderLookup', 'returnRequest', 'warrantyRegistration', 'feedbackSurvey', 'wishlist'],
    },
    appointments: {
      titleKey: 'retailAppointments',
      descKey: 'retailAppointmentsDesc',
      scenarios: ['personalShopping', 'storePickup', 'serviceBooking', 'consultations', 'fittingRoom'],
    },
    triage: {
      titleKey: 'retailTriage',
      descKey: 'retailTriageDesc',
      scenarios: ['departmentRouting', 'issueEscalation', 'vipCustomers', 'languageRouting'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'retailAll',
      descKey: 'retailAllDesc',
      scenarios: ['virtualConcierge', 'omniChannelSupport', 'personalShopperBot'],
    },
  },
  realestate: {
    knowledge: {
      titleKey: 'realestateKnowledge',
      descKey: 'realestateKnowledgeDesc',
      scenarios: ['listingInfo', 'neighborhoodGuide', 'mortgageFAQ', 'buyingProcess', 'marketTrends'],
    },
    formGathering: {
      titleKey: 'realestateForms',
      descKey: 'realestateFormsDesc',
      scenarios: ['buyerQualification', 'sellerIntake', 'propertyPreferences', 'preApprovalInfo', 'contactCapture'],
    },
    appointments: {
      titleKey: 'realestateAppointments',
      descKey: 'realestateAppointmentsDesc',
      scenarios: ['showingSchedule', 'openHouseRSVP', 'agentMeeting', 'virtualTour', 'inspectionBooking'],
    },
    triage: {
      titleKey: 'realestateTriage',
      descKey: 'realestateTriageDesc',
      scenarios: ['buyerVsSeller', 'locationRouting', 'agentMatch', 'propertyTypeSpecialist'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'realestateAll',
      descKey: 'realestateAllDesc',
      scenarios: ['virtualAgent', 'leadQualification', 'propertyMatchmaker'],
    },
  },
  education: {
    knowledge: {
      titleKey: 'educationKnowledge',
      descKey: 'educationKnowledgeDesc',
      scenarios: ['courseCatalog', 'admissionsFAQ', 'financialAid', 'campusInfo', 'programRequirements'],
    },
    formGathering: {
      titleKey: 'educationForms',
      descKey: 'educationFormsDesc',
      scenarios: ['applicationForm', 'enrollmentInfo', 'transcriptRequest', 'financialAidApp', 'courseRegistration'],
    },
    appointments: {
      titleKey: 'educationAppointments',
      descKey: 'educationAppointmentsDesc',
      scenarios: ['advisorMeeting', 'campusTour', 'admissionsInterview', 'tutoringSessions', 'officeHours'],
    },
    triage: {
      titleKey: 'educationTriage',
      descKey: 'educationTriageDesc',
      scenarios: ['departmentRouting', 'studentVsProspect', 'academicVsAdmin', 'urgencyLevel'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'educationAll',
      descKey: 'educationAllDesc',
      scenarios: ['virtualAdvisor', 'admissionsBot', 'studentServicesHub'],
    },
  },
  hospitality: {
    knowledge: {
      titleKey: 'hospitalityKnowledge',
      descKey: 'hospitalityKnowledgeDesc',
      scenarios: ['amenitiesInfo', 'localAttractions', 'diningOptions', 'policyFAQ', 'eventInfo'],
    },
    formGathering: {
      titleKey: 'hospitalityForms',
      descKey: 'hospitalityFormsDesc',
      scenarios: ['roomPreferences', 'dietaryRestrictions', 'pillowMenu', 'arrivalDetails', 'specialOccasions'],
    },
    appointments: {
      titleKey: 'hospitalityAppointments',
      descKey: 'hospitalityAppointmentsDesc',
      scenarios: ['reservationBooking', 'spaAppointment', 'diningReservation', 'roomService', 'activityBooking'],
    },
    triage: {
      titleKey: 'hospitalityTriage',
      descKey: 'hospitalityTriageDesc',
      scenarios: ['guestVsProspect', 'urgentRequests', 'departmentRouting', 'vipHandling'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'hospitalityAll',
      descKey: 'hospitalityAllDesc',
      scenarios: ['virtualConcierge', 'guestServicesBot', 'preArrivalConcierge'],
    },
  },
  finance: {
    knowledge: {
      titleKey: 'financeKnowledge',
      descKey: 'financeKnowledgeDesc',
      scenarios: ['productInfo', 'ratesFAQ', 'eligibilityGuide', 'kycRequirements', 'complianceInfo'],
    },
    formGathering: {
      titleKey: 'financeForms',
      descKey: 'financeFormsDesc',
      scenarios: ['kycCollection', 'identityVerification', 'amlScreening', 'accountOpening', 'riskProfiling'],
    },
    appointments: {
      titleKey: 'financeAppointments',
      descKey: 'financeAppointmentsDesc',
      scenarios: ['advisorMeeting', 'loanConsultation', 'accountReview', 'planningSession', 'branchVisit'],
    },
    triage: {
      titleKey: 'financeTriage',
      descKey: 'financeTriageDesc',
      scenarios: ['productRouting', 'complianceEscalation', 'advisorMatch', 'fraudEscalation'],
    },
    'knowledge+formGathering+appointments+triage': {
      titleKey: 'financeAll',
      descKey: 'financeAllDesc',
      scenarios: ['digitalOnboarding', 'kycBot', 'wealthAdvisorAssistant'],
    },
  },
};

/**
 * Protocol metadata with icons and colors
 */
const PROTOCOL_CONFIG = {
  knowledge: {
    key: 'knowledge',
    color: 'teal',
    fillColor: '#0d9488',
    bgGradient: 'from-teal-900/60 to-teal-800/40',
    borderColor: '#14b8a6',
    textClass: 'text-teal-300',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  formGathering: {
    key: 'formGathering',
    color: 'purple',
    fillColor: '#7c3aed',
    bgGradient: 'from-purple-900/60 to-purple-800/40',
    borderColor: '#a855f7',
    textClass: 'text-purple-300',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  appointments: {
    key: 'appointments',
    color: 'amber',
    fillColor: '#d97706',
    bgGradient: 'from-amber-900/60 to-amber-800/40',
    borderColor: '#f59e0b',
    textClass: 'text-amber-300',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  triage: {
    key: 'triage',
    color: 'rose',
    fillColor: '#e11d48',
    bgGradient: 'from-rose-900/60 to-rose-800/40',
    borderColor: '#f43f5e',
    textClass: 'text-rose-300',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
};

/**
 * Single protocol examples
 */
const SINGLE_PROTOCOL_EXAMPLES = {
  knowledge: {
    titleKey: 'singleKnowledge',
    descKey: 'singleKnowledgeDesc',
    scenarios: ['scenarioFAQ', 'scenarioProductInfo', 'scenarioDocumentation', 'scenarioInternalKB', 'scenarioPolicyLookup'],
  },
  formGathering: {
    titleKey: 'singleFormGathering',
    descKey: 'singleFormGatheringDesc',
    scenarios: ['scenarioLeadCapture', 'scenarioSurvey', 'scenarioContactForm', 'scenarioFeedback', 'scenarioRegistration'],
  },
  appointments: {
    titleKey: 'singleAppointments',
    descKey: 'singleAppointmentsDesc',
    scenarios: ['scenarioBookMeeting', 'scenarioScheduleDemo', 'scenarioConsultation', 'scenarioServiceAppt', 'scenarioOfficeHours'],
  },
  triage: {
    titleKey: 'singleTriage',
    descKey: 'singleTriageDesc',
    scenarios: ['scenarioRouteToAgent', 'scenarioDepartmentRouting', 'scenarioEscalation', 'scenarioLanguageRouting', 'scenarioVIPRouting'],
  },
};

/**
 * Combined synergy descriptions when multiple protocols are selected
 */
const COMBINATION_EXAMPLES = {
  // === PAIRS (6 combinations) ===
  'knowledge+formGathering': {
    titleKey: 'synergyKnowledgeForm',
    descKey: 'synergyKnowledgeFormDesc',
    scenarios: ['scenarioQualifyThenCapture', 'scenarioAnswerThenCollect', 'scenarioContextualForms', 'scenarioEducateThenConvert', 'scenarioSupportToLead'],
  },
  'knowledge+appointments': {
    titleKey: 'synergyKnowledgeAppointments',
    descKey: 'synergyKnowledgeAppointmentsDesc',
    scenarios: ['scenarioInformThenBook', 'scenarioSmartScheduling', 'scenarioPreQualifyBooking', 'scenarioServiceExplainer', 'scenarioPricingToDemo'],
  },
  'knowledge+triage': {
    titleKey: 'synergyKnowledgeTriage',
    descKey: 'synergyKnowledgeTriageDesc',
    scenarios: ['scenarioAnswerOrEscalate', 'scenarioSmartRouting', 'scenarioTieredSupport', 'scenarioDeflectOrRoute', 'scenarioL1Automation'],
  },
  'formGathering+appointments': {
    titleKey: 'synergyFormAppointments',
    descKey: 'synergyFormAppointmentsDesc',
    scenarios: ['scenarioIntakeSchedule', 'scenarioBookAndCapture', 'scenarioQualifyBook', 'scenarioPreVisitForm', 'scenarioNeedsAssessment'],
  },
  'formGathering+triage': {
    titleKey: 'synergyFormTriage',
    descKey: 'synergyFormTriageDesc',
    scenarios: ['scenarioCollectThenRoute', 'scenarioFormBasedRouting', 'scenarioLeadDistribution', 'scenarioSkillBasedRouting', 'scenarioTerritoryAssignment'],
  },
  'appointments+triage': {
    titleKey: 'synergyAppointmentsTriage',
    descKey: 'synergyAppointmentsTriageDesc',
    scenarios: ['scenarioRouteToCalendar', 'scenarioSpecialistBooking', 'scenarioSmartDelegation', 'scenarioExpertMatch', 'scenarioAvailabilityRouting'],
  },

  // === TRIPLES (4 combinations) ===
  'knowledge+formGathering+appointments': {
    titleKey: 'synergyTriple1',
    descKey: 'synergyTriple1Desc',
    scenarios: ['scenarioFullSalesFlow', 'scenarioCompleteOnboarding', 'scenarioNurtureToClose', 'scenarioInboundSales'],
  },
  'knowledge+formGathering+triage': {
    titleKey: 'synergyTriple2',
    descKey: 'synergyTriple2Desc',
    scenarios: ['scenarioSupportEscalation', 'scenarioIntelligentTicketing', 'scenarioHelpDeskAuto', 'scenarioIssueCapture'],
  },
  'knowledge+appointments+triage': {
    titleKey: 'synergyTriple3',
    descKey: 'synergyTriple3Desc',
    scenarios: ['scenarioMultiSpecialistBooking', 'scenarioSmartConsultation', 'scenarioAdvisoryFlow', 'scenarioExpertConnect'],
  },
  'formGathering+appointments+triage': {
    titleKey: 'synergyTriple4',
    descKey: 'synergyTriple4Desc',
    scenarios: ['scenarioIntakeRouteBook', 'scenarioCompleteLeadFlow', 'scenarioPatientIntake', 'scenarioClientOnboarding'],
  },

  // === QUAD (all 4 protocols) ===
  'knowledge+formGathering+appointments+triage': {
    titleKey: 'synergyAll',
    descKey: 'synergyAllDesc',
    scenarios: ['scenarioEnterpriseBot', 'scenarioFullServiceAssistant', 'scenarioDigitalConcierge', 'scenarioVirtualReceptionist', 'scenarioUnifiedSupport'],
  },
};

/**
 * SVG Puzzle Piece - Simple shape with flat left edge and tab on right
 * Right side: outward tab (plug) that touches next piece's flat edge
 * Left side: always flat
 */
function PuzzlePiece({ config, isFirst, isLast, index }) {
  const pieceWidth = 80;
  const pieceHeight = 70;
  const tabSize = 12;
  const tabOffset = (pieceHeight - tabSize * 2) / 2;

  // Build the puzzle piece path - flat left edge, tab on right
  const buildPath = () => {
    const w = pieceWidth;
    const h = pieceHeight;
    const t = tabSize;
    const to = tabOffset;

    let path = '';

    // Top edge
    path += `M 0 0 L ${w} 0`;

    // Right edge with tab (plug) - curves outward
    if (!isLast) {
      path += ` L ${w} ${to}`;
      path += ` C ${w + t * 0.5} ${to}, ${w + t} ${to + t * 0.3}, ${w + t} ${h / 2}`;
      path += ` C ${w + t} ${h - to - t * 0.3}, ${w + t * 0.5} ${h - to}, ${w} ${h - to}`;
      path += ` L ${w} ${h}`;
    } else {
      path += ` L ${w} ${h}`;
    }

    // Bottom edge
    path += ` L 0 ${h}`;

    // Left edge - always flat
    path += ` L 0 0`;

    path += ' Z';
    return path;
  };

  // SVG dimensions - extra space on right for the tab
  const svgWidth = pieceWidth + (isLast ? 0 : tabSize);
  const svgHeight = pieceHeight;

  return (
    <div
      className="relative flex-shrink-0 transition-all duration-500 ease-out"
      style={{
        width: `${svgWidth}px`,
        height: `${pieceHeight}px`,
        marginLeft: isFirst ? 0 : `-${tabSize}px`, // Tab overlaps with next piece's flat edge
        zIndex: 10 - index,
        animation: `puzzleSlideIn 0.4s ease-out ${index * 0.1}s both`,
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="absolute"
      >
        <defs>
          <linearGradient id={`grad-${config.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.fillColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={config.fillColor} stopOpacity="0.3" />
          </linearGradient>
          <filter id={`glow-${config.key}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={buildPath()}
          fill={`url(#grad-${config.key})`}
          stroke={config.borderColor}
          strokeWidth="2"
          filter={`url(#glow-${config.key})`}
        />
        {/* Black circle socket on left side for non-first pieces */}
        {!isFirst && (
          <circle
            cx={0}
            cy={pieceHeight / 2}
            r={tabSize}
            fill="#111827"
            stroke={config.borderColor}
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Icon centered in the main body of the piece (not including tab) */}
      <div
        className={`absolute flex items-center justify-center ${config.textClass}`}
        style={{
          left: `${pieceWidth / 2}px`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {config.icon}
      </div>
    </div>
  );
}

/**
 * Connected puzzle chain showing all enabled protocols
 */
function PuzzleChain({ enabledKeys }) {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="flex items-center">
        {enabledKeys.map((key, index) => (
          <PuzzlePiece
            key={key}
            config={PROTOCOL_CONFIG[key]}
            isFirst={index === 0}
            isLast={index === enabledKeys.length - 1}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Generate synergy key using predefined protocol order (not alphabetical)
 */
function getSynergyKey(protocols) {
  const order = ['knowledge', 'formGathering', 'appointments', 'triage'];
  return order.filter(p => protocols.includes(p)).join('+');
}

/**
 * Context selector pills
 */
function ContextSelector({ selectedContext, onSelect, t }) {
  const contextKeys = Object.keys(CONTEXTS);

  return (
    <div className="flex flex-wrap justify-center gap-2 mb-4">
      {contextKeys.map((key) => {
        const ctx = CONTEXTS[key];
        const isSelected = selectedContext === key;
        const colorClasses = {
          gray: isSelected ? 'bg-gray-600 text-white border-gray-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-gray-600',
          blue: isSelected ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-blue-600',
          slate: isSelected ? 'bg-slate-600 text-white border-slate-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-slate-600',
          emerald: isSelected ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-emerald-600',
          orange: isSelected ? 'bg-orange-600 text-white border-orange-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-orange-600',
          indigo: isSelected ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-indigo-600',
          pink: isSelected ? 'bg-pink-600 text-white border-pink-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-pink-600',
          cyan: isSelected ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:border-cyan-600',
        };

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${colorClasses[ctx.color]}`}
          >
            {t(`preview.contexts.${ctx.labelKey}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Examples panel - shows scenarios based on current combination and context
 */
function ExamplesPanel({ enabledKeys, selectedContext, isOpen, onClose, t }) {
  const examplesData = useMemo(() => {
    if (enabledKeys.length === 0) return null;

    const synergyKey = enabledKeys.length === 1 ? enabledKeys[0] : getSynergyKey(enabledKeys);

    // Check for context-specific examples first
    if (selectedContext !== 'generic' && CONTEXT_EXAMPLES[selectedContext]) {
      const contextData = CONTEXT_EXAMPLES[selectedContext][synergyKey];
      if (contextData) {
        return {
          type: 'context',
          context: selectedContext,
          data: contextData,
        };
      }
    }

    // Fall back to generic examples
    if (enabledKeys.length === 1) {
      return {
        type: 'single',
        data: SINGLE_PROTOCOL_EXAMPLES[enabledKeys[0]],
        protocolKey: enabledKeys[0],
      };
    }

    const synergy = COMBINATION_EXAMPLES[synergyKey];
    if (synergy) {
      return {
        type: 'combination',
        data: synergy,
        protocolKeys: enabledKeys,
      };
    }

    return null;
  }, [enabledKeys, selectedContext]);

  if (!examplesData || !isOpen) return null;

  const { type, data, context } = examplesData;

  // Determine translation path based on type
  const getTitle = () => {
    if (type === 'context') return t(`preview.contexts.${context}.${data.titleKey}`);
    if (type === 'single') return t(`preview.singles.${data.titleKey}`);
    return t(`preview.synergies.${data.titleKey}`);
  };

  const getDesc = () => {
    if (type === 'context') return t(`preview.contexts.${context}.${data.descKey}`);
    if (type === 'single') return t(`preview.singles.${data.descKey}`);
    return t(`preview.synergies.${data.descKey}`);
  };

  const getScenario = (scenario) => {
    if (type === 'context') return t(`preview.contexts.${context}.${scenario}`);
    if (type === 'single') return t(`preview.singles.${scenario}`);
    return t(`preview.synergies.${scenario}`);
  };

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-600 rounded-lg p-4 shadow-lg relative">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-center gap-2 mb-3 pr-6">
        <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h4 className="font-semibold text-cyan-300">
          {getTitle()}
        </h4>
      </div>

      <p className="text-gray-400 text-sm mb-3">
        {getDesc()}
      </p>

      <div className="space-y-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {t('preview.exampleUseCases')}
        </span>
        <div className="flex flex-wrap gap-2">
          {data.scenarios.map((scenario, i) => (
            <span
              key={i}
              className="text-xs px-2.5 py-1 rounded-full bg-cyan-900/40 text-cyan-300 border border-cyan-800/50"
            >
              {getScenario(scenario)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no protocols selected
 */
function EmptyState({ t }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <div className="relative w-32 h-20 mb-4 opacity-30">
        {/* Ghost puzzle pieces */}
        <svg width="120" height="70" viewBox="0 0 120 70" className="absolute">
          <rect
            x="5"
            y="10"
            width="50"
            height="50"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <rect
            x="45"
            y="10"
            width="50"
            height="50"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        </svg>
      </div>
      <p className="text-sm text-center max-w-xs">
        {t('preview.selectProtocolPrompt')}
      </p>
    </div>
  );
}

/**
 * Main preview component for protocol selection step
 */
export default function ProtocolSelectionPreview() {
  const t = useTranslations('wizard.protocols');
  const { enabledProtocols } = useModularWizard();

  // State for context selection and panel visibility
  const [selectedContext, setSelectedContext] = useState('generic');
  const [isExamplesPanelOpen, setIsExamplesPanelOpen] = useState(true);

  // Get list of enabled protocol keys in order
  const enabledKeys = useMemo(() => {
    const order = ['knowledge', 'formGathering', 'appointments', 'triage'];
    return order.filter((key) => enabledProtocols[key]);
  }, [enabledProtocols]);

  // Get the capability title based on selected protocols and context
  const capabilityTitle = useMemo(() => {
    if (enabledKeys.length === 0) return '';

    const synergyKey = enabledKeys.length === 1 ? enabledKeys[0] : getSynergyKey(enabledKeys);

    // Check for context-specific title first
    if (selectedContext !== 'generic' && CONTEXT_EXAMPLES[selectedContext]?.[synergyKey]) {
      return t(`preview.contexts.${selectedContext}.${CONTEXT_EXAMPLES[selectedContext][synergyKey].titleKey}`);
    }

    // Fall back to generic titles
    if (enabledKeys.length === 1) {
      return t(`preview.singles.${SINGLE_PROTOCOL_EXAMPLES[enabledKeys[0]].titleKey}`);
    }

    const synergy = COMBINATION_EXAMPLES[synergyKey];
    if (synergy) {
      return t(`preview.synergies.${synergy.titleKey}`);
    }

    return '';
  }, [enabledKeys, selectedContext, t]);

  const hasAnyEnabled = enabledKeys.length > 0;

  if (!hasAnyEnabled) {
    return <EmptyState t={t} />;
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* CSS for animations */}
      <style jsx>{`
        @keyframes puzzleSlideIn {
          from {
            opacity: 0;
            transform: translateX(-20px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>

      {/* Header - shows capability title based on selected protocols */}
      <h3 className="text-lg font-semibold text-white mb-2 text-center">
        {capabilityTitle}
      </h3>

      {/* Context selector */}
      <ContextSelector
        selectedContext={selectedContext}
        onSelect={(ctx) => {
          setSelectedContext(ctx);
          setIsExamplesPanelOpen(true);
        }}
        t={t}
      />

      {/* Puzzle chain visualization */}
      <PuzzleChain enabledKeys={enabledKeys} />

      {/* Examples panel */}
      <div className="pt-2">
        <ExamplesPanel
          enabledKeys={enabledKeys}
          selectedContext={selectedContext}
          isOpen={isExamplesPanelOpen}
          onClose={() => setIsExamplesPanelOpen(false)}
          t={t}
        />
        {/* Reopen button when closed */}
        {!isExamplesPanelOpen && (
          <button
            onClick={() => setIsExamplesPanelOpen(true)}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {t('preview.showExamples')}
          </button>
        )}
      </div>
    </div>
  );
}
