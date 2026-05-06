/**
 * useModularStream Hook
 *
 * Manages the streaming connection to the builder inverted flow endpoint.
 * Handles SSE events, tool calls, and state management for the chat UI.
 */

import { useState, useCallback, useRef } from 'react';

/**
 * Message types for the chat log
 */
export const MESSAGE_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL_CALL: 'tool_call',
  SYSTEM: 'system',
};

/**
 * Tool status values
 */
export const TOOL_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Session status values
 */
export const SESSION_STATUS = {
  CREATED: 'created',
  PROCESSING: 'processing',
  AWAITING_CONFIRM: 'awaiting_confirm',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  EDITING: 'editing',
};

/**
 * Hook for managing builder streaming
 */
export function useModularStream(options = {}) {
  const { workspaceId, deploymentId, onError } = options;

  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState(SESSION_STATUS.CREATED);
  const [messages, setMessages] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState(null);
  const [moduloState, setModuloState] = useState('idle');
  const [disableModuloAnimation, setDisableModuloAnimation] = useState(false);

  // Session data from inference
  const [inferredIntent, setInferredIntent] = useState(null);
  const [recommendedProtocols, setRecommendedProtocols] = useState({});
  const [generatedConfigs, setGeneratedConfigs] = useState({});

  // Generation completion signal - ensures preview only renders after all data is stable
  const [generationComplete, setGenerationComplete] = useState(false);
  // Track if identity_composed event was received (has freshest data)
  const identityReceivedRef = useRef(false);

  // Ref for current streaming text
  const currentTextRef = useRef('');
  const abortControllerRef = useRef(null);

  /**
   * Send a message and process the streaming response
   */
  const sendMessage = useCallback(async (message, files = []) => {
    setError(null);
    setIsStreaming(true);
    currentTextRef.current = '';
    // Reset generation signals for new message
    setGenerationComplete(false);
    identityReceivedRef.current = false;

    // Add user message to chat
    const userMessage = {
      type: MESSAGE_TYPES.USER,
      content: message,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Add placeholder for assistant response
    const assistantPlaceholderId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantPlaceholderId,
        type: MESSAGE_TYPES.ASSISTANT,
        content: '',
        timestamp: Date.now(),
      },
    ]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/builder/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId,
          workspaceId,
          deploymentId: !sessionId ? deploymentId : undefined, // Only send on first message
          files: files.map((f) => ({
            name: f.name,
            base64: f.base64,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(line.slice(6));
            handleStreamEvent(event, assistantPlaceholderId);
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[useModularStream] Request aborted');
      } else {
        console.error('[useModularStream] Error:', err);
        setError(err.message);
        onError?.(err);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [sessionId, workspaceId, deploymentId, onError]);

  /**
   * Handle SSE events
   */
  const handleStreamEvent = useCallback((event, assistantPlaceholderId) => {
    switch (event.type) {
      case 'session':
        setSessionId(event.sessionId);
        setStatus(event.status || SESSION_STATUS.PROCESSING);
        if (event.disableModuloAnimation !== undefined) {
          setDisableModuloAnimation(event.disableModuloAnimation);
        }
        break;

      case 'status_change':
        setStatus(event.status);
        break;

      case 'text':
        currentTextRef.current += event.text;
        // Strip [expression:...] markers from displayed text
        const cleanText = currentTextRef.current.replace(/\[expression:\w+\]\s*/g, '');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: cleanText }
              : m
          )
        );
        break;

      case 'tool_started':
        setToolCalls((prev) => [
          ...prev,
          {
            id: `tool-${event.tool}-${Date.now()}`,
            tool: event.tool,
            displayName: event.toolDisplayName,
            status: TOOL_STATUS.RUNNING,
            input: event.input,
            timestamp: event.timestamp,
          },
        ]);
        // Also add to messages for chat display
        setMessages((prev) => [
          ...prev,
          {
            type: MESSAGE_TYPES.TOOL_CALL,
            tool: event.tool,
            displayName: event.toolDisplayName,
            status: TOOL_STATUS.RUNNING,
            timestamp: event.timestamp,
          },
        ]);
        break;

      case 'tool_completed':
        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.tool === event.tool && tc.status === TOOL_STATUS.RUNNING
              ? { ...tc, status: TOOL_STATUS.COMPLETED, result: event.result }
              : tc
          )
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.type === MESSAGE_TYPES.TOOL_CALL &&
            m.tool === event.tool &&
            m.status === TOOL_STATUS.RUNNING
              ? { ...m, status: TOOL_STATUS.COMPLETED, result: event.result }
              : m
          )
        );
        break;

      case 'tool_failed':
        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.tool === event.tool && tc.status === TOOL_STATUS.RUNNING
              ? { ...tc, status: TOOL_STATUS.FAILED, error: event.error }
              : tc
          )
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.type === MESSAGE_TYPES.TOOL_CALL &&
            m.tool === event.tool &&
            m.status === TOOL_STATUS.RUNNING
              ? { ...m, status: TOOL_STATUS.FAILED, error: event.error }
              : m
          )
        );
        break;

      case 'inference_complete':
        setInferredIntent(event.intent);
        break;

      case 'protocols_recommended':
        setRecommendedProtocols(event.protocols);
        break;

      case 'identity_composed':
        // Mark that we received fresh identity data from the tool
        identityReceivedRef.current = true;
        setGeneratedConfigs((prev) => ({
          ...prev,
          identity: event.identity,
        }));
        break;

      case 'prompts_set':
        // Update identity with new prompts (most authoritative source)
        identityReceivedRef.current = true;
        setGeneratedConfigs((prev) => ({
          ...prev,
          identity: event.identity,
        }));
        break;

      case 'bot_summary_generated':
        // Store botSummary at top level (beside objective, paradigm) - silent to user
        setGeneratedConfigs((prev) => ({
          ...prev,
          botSummary: event.botSummary,
        }));
        break;

      case 'awaiting_confirmation':
        setStatus(SESSION_STATUS.AWAITING_CONFIRM);
        break;

      case 'deployment_started':
        setIsDeploying(true);
        break;

      case 'deployment_complete':
        setIsDeploying(false);
        setStatus(SESSION_STATUS.DEPLOYED);
        // Store deployment info and start polling for URL
        if (event.deploymentId) {
          setGeneratedConfigs((prev) => ({
            ...prev,
            deployment: {
              deploymentId: event.deploymentId,
              botName: event.botName,
              status: 'deploying',
            },
          }));
          // Start polling for deployment URL
          pollDeploymentStatus(event.deploymentId);
        }
        break;

      case 'deployment_failed':
        setIsDeploying(false);
        setError(event.error);
        break;

      case 'done':
        if (event.inferredIntent) setInferredIntent(event.inferredIntent);
        if (event.recommendedProtocols) setRecommendedProtocols(event.recommendedProtocols);
        if (event.generatedConfigs) {
          // Merge with existing configs to preserve identity from identity_composed event
          // The identity_composed event fires with fresh data, but the 'done' event
          // may have stale data from the database - preserve ALL fresh identity fields
          setGeneratedConfigs((prev) => ({
            ...event.generatedConfigs,
            // If we received identity_composed, preserve the ENTIRE fresh identity
            // Otherwise fall back to the done event's identity
            identity: identityReceivedRef.current && prev.identity
              ? prev.identity
              : event.generatedConfigs?.identity,
          }));
        }
        if (event.status) setStatus(event.status);
        // Signal that generation is complete and data is stable
        setGenerationComplete(true);
        break;

      case 'modulo_expression':
        setModuloState(event.state);
        break;

      case 'error':
        setError(event.error);
        onError?.(new Error(event.error));
        break;
    }
  }, [onError]);

  /**
   * Deploy the bot with confirmed protocols
   */
  const deploy = useCallback(async (confirmedProtocols) => {
    if (!sessionId) {
      setError('No session ID');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      const response = await fetch('/api/builder/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'confirm_deploy',
          confirmedProtocols,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'deployment_complete') {
              setStatus(SESSION_STATUS.DEPLOYED);
              setGeneratedConfigs((prev) => ({
                ...prev,
                deployment: event,
              }));
            } else if (event.type === 'deployment_failed' || event.type === 'error') {
              setError(event.error);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      console.error('[useModularStream] Deploy error:', err);
      setError(err.message);
    } finally {
      setIsDeploying(false);
    }
  }, [sessionId]);

  /**
   * Poll deployment status to get URL when ready
   */
  const pollDeploymentStatus = useCallback(async (deploymentId) => {
    const pollInterval = 3000;
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const response = await fetch(`/api/deployments/${deploymentId}`);
        if (!response.ok) return;

        const data = await response.json();
        const deployment = data.deployment;
        const deploymentStatus = deployment?.status;
        const url = deployment?.url;
        const botName = deployment?.bot_name;
        const documentCount = data.documents?.length || 0;

        setGeneratedConfigs((prev) => ({
          ...prev,
          deployment: {
            deploymentId,
            botName: botName || prev.deployment?.botName,
            status: deploymentStatus,
            url,
            documentCount,
          },
        }));

        // Continue polling if still deploying
        if (deploymentStatus === 'deploying' && attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        }
      } catch (err) {
        console.error('[useModularStream] Poll error:', err);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        }
      }
    };

    // Start polling after initial delay
    setTimeout(poll, pollInterval);
  }, []);

  /**
   * Cancel ongoing streaming
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /**
   * Reset state for new session
   */
  const reset = useCallback(() => {
    setSessionId(null);
    setStatus(SESSION_STATUS.CREATED);
    setMessages([]);
    setToolCalls([]);
    setIsStreaming(false);
    setIsDeploying(false);
    setError(null);
    setInferredIntent(null);
    setRecommendedProtocols({});
    setGeneratedConfigs({});
    setGenerationComplete(false);
    setModuloState('idle');
    setDisableModuloAnimation(false);
    identityReceivedRef.current = false;
    currentTextRef.current = '';
  }, []);

  return {
    // State
    sessionId,
    status,
    messages,
    toolCalls,
    isStreaming,
    isDeploying,
    error,
    inferredIntent,
    recommendedProtocols,
    generatedConfigs,
    generationComplete,  // Signal that generation is done and data is stable
    moduloState,         // Avatar expression state
    disableModuloAnimation, // UI setting to disable avatar animations

    // Actions
    sendMessage,
    deploy,
    cancel,
    reset,
  };
}

export default useModularStream;
