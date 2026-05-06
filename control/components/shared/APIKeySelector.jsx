'use client';

import { useState, useEffect } from 'react';
import { LLM_PROVIDERS } from '@/lib/llm-providers';

export default function APIKeySelector({
  provider,
  apiKey,
  apiKeyId,
  onApiKeyChange,
  onApiKeyIdChange,
  error,
}) {
  const [savedApiKeys, setSavedApiKeys] = useState([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const selectedSavedKeyId = apiKeyId || null;
  const selectedSavedKey = savedApiKeys.find((k) => k.id === selectedSavedKeyId) || null;

  // Bedrock inference region (lives inside the pasted credential JSON — NOT a
  // deployment region). Defaults to us-east-1 if the user hasn't typed one.
  const [bedrockCredentials, setBedrockCredentials] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    useIamRole: false
  });

  useEffect(() => {
    if (provider === 'bedrock') {
      if (apiKey) {
        try {
          const parsed = JSON.parse(apiKey);
          setBedrockCredentials({
            accessKeyId: parsed.accessKeyId || '',
            secretAccessKey: parsed.secretAccessKey || '',
            region: parsed.region || 'us-east-1',
            useIamRole: parsed.useIamRole || false
          });
        } catch {
          setBedrockCredentials({
            accessKeyId: '',
            secretAccessKey: '',
            region: 'us-east-1',
            useIamRole: false
          });
        }
      }
    }
  }, [provider, apiKey]);

  // Update parent when Bedrock credentials change
  const updateBedrockCredentials = (updates) => {
    const newCreds = { ...bedrockCredentials, ...updates };
    // Ensure region is always set
    if (!newCreds.region) {
      newCreds.region = 'us-east-1';
    }
    setBedrockCredentials(newCreds);

    // Only emit if we have minimum required fields
    if (newCreds.useIamRole || (newCreds.accessKeyId && newCreds.secretAccessKey)) {
      onApiKeyChange(JSON.stringify(newCreds));
    } else if (!newCreds.accessKeyId && !newCreds.secretAccessKey && !newCreds.useIamRole) {
      onApiKeyChange('');
    }
  };

  // Fetch saved API keys when provider changes
  useEffect(() => {
    if (provider) {
      fetchSavedApiKeys();
    } else {
      setSavedApiKeys([]);
    }
  }, [provider]);

  const fetchSavedApiKeys = async () => {
    try {
      setLoadingApiKeys(true);
      const response = await fetch(`/api/settings/api-keys?provider=${provider}`);
      if (response.ok) {
        const data = await response.json();
        setSavedApiKeys(data.keys || []);
      }
    } catch (error) {
      console.error('Error fetching saved API keys:', error);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  // Picking a saved key stores only the opaque id — the plaintext value is
  // resolved server-side at deploy time so it never enters browser memory.
  const handleSelectSavedKey = (keyId) => {
    onApiKeyIdChange?.(keyId);
    onApiKeyChange('');
    if (provider === 'bedrock') {
      setBedrockCredentials({
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1',
        useIamRole: false
      });
    }
  };

  const handleClearSavedKey = () => {
    onApiKeyIdChange?.(null);
    onApiKeyChange('');
    if (provider === 'bedrock') {
      setBedrockCredentials({
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1',
        useIamRole: false
      });
    }
  };

  const handleManualInput = (e) => {
    onApiKeyIdChange?.(null);
    onApiKeyChange(e.target.value);
  };

  // Render Bedrock-specific UI
  if (provider === 'bedrock') {
    const bedrockConfig = LLM_PROVIDERS.bedrock;
    const isCredentialsSet = bedrockCredentials.useIamRole ||
      (bedrockCredentials.accessKeyId && bedrockCredentials.secretAccessKey);

    return (
      <div className="space-y-4">
        {selectedSavedKey && (
          <div className="p-3 bg-teal-900/20 border border-teal-800 rounded-md flex items-center justify-between">
            <p className="text-xs text-teal-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Using saved AWS credentials: <span className="font-medium">{selectedSavedKey.name}</span>
            </p>
            <button
              type="button"
              onClick={handleClearSavedKey}
              className="text-xs text-red-400 hover:text-red-300 font-medium"
            >
              Clear
            </button>
          </div>
        )}

        {/* IAM Role Toggle */}
        {!selectedSavedKey && (
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="useIamRole"
            checked={bedrockCredentials.useIamRole}
            onChange={(e) => updateBedrockCredentials({ useIamRole: e.target.checked })}
            className="mt-1 h-4 w-4 text-teal-500 focus:ring-teal-500 bg-gray-700 border-gray-600 rounded"
          />
          <div>
            <label htmlFor="useIamRole" className="text-sm font-medium text-gray-300 cursor-pointer">
              Use IAM Role (recommended for EKS/EC2)
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              Uses the instance/pod IAM role instead of explicit credentials
            </p>
          </div>
        </div>
        )}

        {/* Credentials Fields (hidden when using IAM role or a saved key is selected) */}
        {!selectedSavedKey && !bedrockCredentials.useIamRole && (
          <>
            <div>
              <label htmlFor="accessKeyId" className="block text-sm font-medium text-gray-300 mb-1">
                AWS Access Key ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="accessKeyId"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                value={bedrockCredentials.accessKeyId}
                onChange={(e) => updateBedrockCredentials({ accessKeyId: e.target.value })}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  error && !bedrockCredentials.accessKeyId ? 'border-red-500' : 'border-gray-600'
                }`}
                placeholder="AKIAIOSFODNN7EXAMPLE"
              />
            </div>

            <div>
              <label htmlFor="secretAccessKey" className="block text-sm font-medium text-gray-300 mb-1">
                AWS Secret Access Key <span className="text-red-400">*</span>
              </label>
              <input
                id="secretAccessKey"
                autoComplete="none"
                data-1p-ignore="true"
                data-lpignore="true"
                value={bedrockCredentials.secretAccessKey}
                onChange={(e) => updateBedrockCredentials({ secretAccessKey: e.target.value })}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  error && !bedrockCredentials.secretAccessKey ? 'border-red-500' : 'border-gray-600'
                }`}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              />
            </div>
          </>
        )}

        {/* Region Selector — hidden for saved keys; the saved record carries its own region */}
        {!selectedSavedKey && (
        <div>
          <label htmlFor="bedrockRegion" className="block text-sm font-medium text-gray-300 mb-1">
            Bedrock Region <span className="text-red-400">*</span>
          </label>
          <select
            id="bedrockRegion"
            value={bedrockCredentials.region}
            onChange={(e) => updateBedrockCredentials({ region: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {bedrockConfig.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name} ({region.geoPrefix.toUpperCase()} cross-region)
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Cross-region inference routes requests to available capacity across the {bedrockCredentials.region?.startsWith('us') ? 'US' : bedrockCredentials.region?.startsWith('eu') ? 'EU' : 'APAC'} region
          </p>
        </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Status indicator */}
        {!selectedSavedKey && isCredentialsSet && !error && (
          <div className="flex items-center gap-2 text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">
              {bedrockCredentials.useIamRole ? 'Using IAM Role' : 'AWS credentials configured'}
            </span>
          </div>
        )}

        {/* Saved Credentials */}
        {loadingApiKeys ? (
          <div className="text-sm text-gray-500">Loading saved credentials...</div>
        ) : savedApiKeys.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
              Or use saved AWS credentials:
            </p>
            <div className="flex flex-wrap gap-2">
              {savedApiKeys.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  onClick={() => handleSelectSavedKey(key.id)}
                  className={`px-3 py-2 text-sm rounded-md border transition ${
                    selectedSavedKeyId === key.id
                      ? 'bg-teal-900/50 border-teal-500 text-teal-300 font-medium'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    {key.name}
                    {selectedSavedKeyId === key.id && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Standard API Key UI for other providers
  return (
    <div>
      <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-1">
        API Key <span className="text-red-400">*</span>
      </label>

      <div className="relative">
        <input
          id="apiKey"
          name="mojulo-api-key"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          value={selectedSavedKey ? '' : (apiKey || '')}
          onChange={handleManualInput}
          className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
            error ? 'border-red-500' : 'border-gray-600'
          }`}
          placeholder={selectedSavedKey ? '•••••••• (using saved key)' : provider ? `Enter your API key` : 'Select a provider first'}
          disabled={!provider || !!selectedSavedKey}
        />
      </div>

      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}

      {selectedSavedKey ? (
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-teal-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Using saved API key: <span className="font-medium">{selectedSavedKey.name}</span>
          </p>
          <button
            type="button"
            onClick={handleClearSavedKey}
            className="text-xs text-red-400 hover:text-red-300 font-medium"
          >
            Clear
          </button>
        </div>
      ) : apiKey && !error ? (
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-green-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            API key is set
          </p>
          <div className="group relative">
            <button
              type="button"
              className="text-teal-400 hover:text-teal-300 transition"
              title="About API Keys"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-gray-700 border border-gray-600 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
              <p className="text-xs text-gray-300">
                Your API key is encrypted and stored securely. It will be used to power your chatbot's responses.
                You can manage your saved API keys in the settings.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-500">
          Your API key is encrypted and stored securely
        </p>
      )}

      {/* Saved API Keys */}
      {loadingApiKeys ? (
        <div className="mt-3 text-sm text-gray-500">Loading saved keys...</div>
      ) : savedApiKeys.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-300 mb-2">
            Or use a saved API key:
          </p>
          <div className="flex flex-wrap gap-2">
            {savedApiKeys.map((key) => (
              <button
                key={key.id}
                type="button"
                onClick={() => handleSelectSavedKey(key.id)}
                className={`px-3 py-2 text-sm rounded-md border transition ${
                  selectedSavedKeyId === key.id
                    ? 'bg-teal-900/50 border-teal-500 text-teal-300 font-medium'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  {key.name}
                  {selectedSavedKeyId === key.id && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
