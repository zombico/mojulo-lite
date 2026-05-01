// helper/widget-generator.js

/**
 * Generate embeddable widget script for a bot
 * @param {string} baseUrl - The deployment base URL (e.g., 'https://your-domain.com')
 * @param {string} botName - The bot display name from config
 * @param {Object} options - Additional options
 * @param {boolean} options.isCalendar - Whether calendar integration is enabled
 * @returns {string} JavaScript code to inject widget into page
 */
function generateWidgetScript(baseUrl, botName = 'Chat', options = {}) {
  const { isCalendar = false } = options;
  // Hardcoded widget config (can be moved to config later)
  const widgetConfig = {
    launcherColor: '#3b3e5a',
    launcherIcon: '💬',
    width: '720px',
    height: '600px',
    position: 'bottom-right'
  };

  // Position mapping
  const positions = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' }
  };

  const pos = positions[widgetConfig.position] || positions['bottom-right'];
  const launcherPos = `bottom: ${pos.bottom || 'auto'}; right: ${pos.right || 'auto'}; left: ${pos.left || 'auto'}; top: ${pos.top || 'auto'};`;
  const iframePos = widgetConfig.position.includes('bottom')
    ? `bottom: 33px;`
    : `top: 33px;`;
  const iframeSide = widgetConfig.position.includes('right')
    ? `right: ${pos.right};`
    : `left: ${pos.left};`;

  return `
(function() {
  // Prevent duplicate widget injection
  if (document.getElementById('mojulo-bot-widget')) return;

  // Event handler references for cleanup
  function handleResize() { updateWidgetSize(); }
  function handleMessage(event) {
    const isSameOrigin = event.origin === window.location.origin;
    const isExpectedOrigin = event.origin === '${baseUrl}';
    if (!isSameOrigin && !isExpectedOrigin) {
      console.warn('Blocked postMessage from unauthorized origin:', event.origin);
      return;
    }
    if (event.data.type === 'mojulo-bot-close') {
      toggleWidget(false);
    } else if (event.data.type === 'mojulo-bot-open') {
      toggleWidget(true);
    } else if (event.data.type === 'mojulo-bot-toggle') {
      toggleWidget();
    }${isCalendar ? ` else if (event.data.type === 'mojulo-bot-open-calendly') {
      loadCalendly(() => {
        Calendly.initPopupWidget({
          url: event.data.url,
          prefill: event.data.prefill || {}
        });
      });
    }` : ''}
  }

  // Global cleanup function - call this to fully remove the widget
  window.__mojuloBotCleanup = function() {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('message', handleMessage);
    const launcher = document.getElementById('mojulo-bot-launcher');
    const container = document.getElementById('mojulo-bot-widget-container');
    if (launcher) launcher.remove();
    if (container) container.remove();
    delete window.__mojuloBotCleanup;
  };

  // Create launcher button
  const launcher = document.createElement('div');
  launcher.id = 'mojulo-bot-launcher';
  launcher.innerHTML = '${widgetConfig.launcherIcon}';
  launcher.setAttribute('role', 'button');
  launcher.setAttribute('aria-label', 'Open chat widget');
  launcher.style.cssText = \`
    position: fixed;
    ${launcherPos}
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: ${widgetConfig.launcherColor};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 9999;
    font-size: 24px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
  \`;

  // Hover effect
  launcher.addEventListener('mouseenter', () => {
    launcher.style.transform = 'scale(1.1)';
    launcher.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  });
  launcher.addEventListener('mouseleave', () => {
    launcher.style.transform = 'scale(1)';
    launcher.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });

  // Create widget container
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'mojulo-bot-widget-container';
  widgetContainer.style.cssText = \`
    position: fixed;
    ${iframePos}
    ${iframeSide}
    width: ${widgetConfig.width};
    height: ${widgetConfig.height};
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 9998;
    display: none;
    flex-direction: column;
    overflow: hidden;
  \`;

  // Create header bar
  const header = document.createElement('div');
  header.style.cssText = \`
    background: transparent;
    font-weight: 900;
    font-size: 1em;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 0px;
    flex-shrink: 0;
  \`;

  const minimizeBtn = document.createElement('button');
  minimizeBtn.setAttribute('aria-label', 'Minimize chat');
  minimizeBtn.setAttribute('title', 'Minimize');
  minimizeBtn.style.cssText = \`
    width: 15px;
    height: 15px;
    background: rgb(249 206 2);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    color: rgb(249 206 2);
    position: relative;
    top: 15px;
    right: 18px;
    box-shadow: rgba(0, 0, 0, 0.5) 0px 3px 5px;
    display: flex;
    align-items: center;
    justify-content: center;
  \`;

  const minimizeIcon = document.createElement('span');
  minimizeIcon.textContent = '−';
  minimizeIcon.style.cssText = \`
    font-size: 14px;
    user-select: none;
    font-weight: bold;
    line-height: 1;
  \`;
  minimizeBtn.appendChild(minimizeIcon);
  header.appendChild(minimizeBtn);

  // Hover effect
  minimizeBtn.addEventListener('mouseenter', () => {
    minimizeBtn.style.color = 'darkslategray';
  });
  minimizeBtn.addEventListener('mouseleave', () => {
    minimizeBtn.style.color = 'rgb(249 206 2)';
  });

  // Create iframe (hidden by default)
  const iframe = document.createElement('iframe');
  iframe.id = 'mojulo-bot-widget';
  iframe.src = '${baseUrl}/';
  iframe.setAttribute('title', 'Chat widget');
  iframe.style.cssText = \`
    width: 100%;
    height: 100%;
    border: none;
    flex: 1;
  \`;

  widgetContainer.appendChild(header);
  widgetContainer.appendChild(iframe);

  // Function to update widget size based on window size
  function updateWidgetSize() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Mobile: full screen
    if (windowWidth < 600) {
      widgetContainer.style.width = '100%';
      widgetContainer.style.height = '100%';
      widgetContainer.style.top = '0';
      widgetContainer.style.bottom = '0';
      widgetContainer.style.left = '0';
      widgetContainer.style.right = '0';
      widgetContainer.style.borderRadius = '0';
    }
    // Tablet/Desktop: fixed size with max constraints
    else {
      const maxWidth = Math.min(720, windowWidth - 40); // 20px margin on each side
      const maxHeight = Math.min(600, windowHeight - 100); // Leave room for launcher
      
      widgetContainer.style.width = maxWidth + 'px';
      widgetContainer.style.height = maxHeight + 'px';
      widgetContainer.style.bottom = '33px';
      widgetContainer.style.right = '20px';
      widgetContainer.style.borderRadius = '12px';
    }
  }

  // Update size on window resize
  window.addEventListener('resize', handleResize);

  // Set initial size
  updateWidgetSize();

  // Minimize button click handler
  minimizeBtn.addEventListener('click', () => {
    toggleWidget(false);
  });

  // Toggle widget on click
  let isOpen = false;
  function toggleWidget(forceState) {

    if (forceState !== undefined) {
      isOpen = forceState;
    } else {
      isOpen = !isOpen;
    }
    widgetContainer.style.display = isOpen ? 'flex' : 'none';
    launcher.style.display = isOpen ? 'none' : 'flex';
    launcher.setAttribute('aria-label', isOpen ? 'Close chat widget' : 'Open chat widget');

    // Focus on input element when widget opens
    if (isOpen) {
      // Wait a bit for iframe to be ready, then send focus message
      setTimeout(() => {
        iframe.contentWindow.postMessage({ type: 'mojulo-bot-focus-input' }, '${baseUrl}');
      }, 100);
    }
  }

  launcher.addEventListener('click', () => toggleWidget());
${isCalendar ? `
  // Calendly loader (lazy, only loads when needed)
  let calendlyLoaded = false;
  function loadCalendly(callback) {
    if (calendlyLoaded && window.Calendly) {
      return callback();
    }

    // Add Calendly CSS
    const link = document.createElement('link');
    link.href = 'https://assets.calendly.com/assets/external/widget.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Add Calendly JS
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.onload = () => {
      calendlyLoaded = true;
      callback();
    };
    document.head.appendChild(script);
  }
` : ''}
  // Listen for messages from iframe to close/open widget
  window.addEventListener('message', handleMessage);

  // Keyboard accessibility
  launcher.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      launcher.click();
    }
  });
  launcher.setAttribute('tabindex', '0');

  // Inject into page
  document.body.appendChild(launcher);
  document.body.appendChild(widgetContainer);
})();
  `.trim();
}

module.exports = { generateWidgetScript };
