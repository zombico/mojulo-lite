/**
 * Form Submission Helper
 *
 * Sends completed form data to the control plane
 */

let formSendHomeConfig = null;

/**
 * Initialize form submission config
 * @param {Object} config - Bot config object
 */
function initFormSubmission(config) {
    if (config.config.formSendHome && config.config.formSendHomeUrl) {
        formSendHomeConfig = {
            enabled: true,
            url: config.config.formSendHomeUrl,
            apiKey: process.env.DEPLOYMENT_API_KEY || config.config.formSendHomeApiKey,
        };
        console.log('Form send home enabled:', formSendHomeConfig.url);
        return true;
    }
    return false;
}

/**
 * Check if form submission is enabled
 */
function isFormSubmissionEnabled() {
    return formSendHomeConfig?.enabled || false;
}

/**
 * Send completed form data to control plane
 * @param {string} conversationId - The conversation ID
 * @param {Object} formData - The form field values
 * @param {Object} metadata - Additional metadata
 */
async function sendFormHome(conversationId, formData, metadata = {}) {
    if (!formSendHomeConfig?.enabled || !formSendHomeConfig?.url) {
        return { success: false, error: 'formSendHome is not enabled' };
    }

    try {
        const response = await fetch(formSendHomeConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${formSendHomeConfig.apiKey}`,
            },
            body: JSON.stringify({
                conversationId,
                formData,
                metadata: {
                    ...metadata,
                    submittedFromBot: true,
                    botHostname: process.env.HOSTNAME || 'unknown',
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to send form home:', response.status, errorText);
            return { success: false, error: errorText };
        }

        console.log('Form submission sent to control plane:', conversationId);
        return { success: true };
    } catch (error) {
        console.error('Error sending form home:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initFormSubmission,
    isFormSubmissionEnabled,
    sendFormHome,
};
