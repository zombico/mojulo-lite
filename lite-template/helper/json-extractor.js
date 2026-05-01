/**
 * Extracts JSON object from a string that may contain additional text
 * Searches for the first complete JSON object in the string
 *
 * This is useful for parsing LLM responses that sometimes include
 * conversational text before or after the JSON object.
 *
 * @param {string} text - The text that may contain JSON
 * @returns {object} - Parsed JSON object
 * @throws {Error} - If no valid JSON object is found
 *
 * @example
 * // LLM response with text before JSON
 * const response = "Here's the data you requested:\n{\"answer\": \"test\"}";
 * const json = extractJSON(response);
 * // Returns: { answer: "test" }
 */
function extractJSON(text) {
    // Try to parse the entire string first (fastest path)
    try {
        return JSON.parse(text);
    } catch (e) {
        // If that fails, look for JSON object boundaries
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error('No JSON object found in response');
        }

        // Extract the substring that looks like JSON
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);

        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            // If still failing, try to find the first complete JSON object
            // by matching braces properly
            let braceCount = 0;
            let actualEnd = jsonStart;

            for (let i = jsonStart; i < text.length; i++) {
                if (text[i] === '{') braceCount++;
                if (text[i] === '}') braceCount--;

                if (braceCount === 0 && i > jsonStart) {
                    actualEnd = i;
                    break;
                }
            }

            const correctedJsonStr = text.substring(jsonStart, actualEnd + 1);
            return JSON.parse(correctedJsonStr);
        }
    }
}

module.exports = { extractJSON };
