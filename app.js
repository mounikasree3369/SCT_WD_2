/**
 * AetherCalc - Main Controller and User Interaction Orchestrator
 * Manages the UI lifecycle, responsive layouts, theme switching, history drawers, 
 * button ripples, keyboard bindings, and connects user input to the safe MathParser.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE VARIABLES ---
  let expressionBuffer = '';    // Current active mathematical string (using standard operators like *, /)
  let lastResult = null;         // Remembers the last successful calculation
  let historyLog = [];           // Array storing calculation history objects {expr, result}
  let isScientificActive = false; // Drawer state tracking

  // --- DOM SELECTORS ---
  const appContainer = document.getElementById('app-container');
  const calcCard = document.getElementById('calculator-card');
  const displayExpr = document.getElementById('display-expression');
  const displayRes = document.getElementById('display-result');
  
  const statusSciIndicator = document.getElementById('status-scientific-indicator');
  const statusErrorMsg = document.getElementById('status-error-msg');
  
  const sciPanel = document.getElementById('scientific-panel');
  const btnToggleScientific = document.getElementById('btn-toggle-scientific');
  
  const historySidebar = document.getElementById('history-sidebar');
  const btnToggleHistory = document.getElementById('btn-toggle-history');
  const btnCloseHistory = document.getElementById('btn-close-history');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const historyItemsContainer = document.getElementById('history-items-container');
  const emptyHistoryMsg = document.getElementById('empty-history-msg');
  
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');

  // --- KEYBOARD MAPPING CONFIG ---
  const KEY_MAP = {
    '0': 'btn-0', '1': 'btn-1', '2': 'btn-2', '3': 'btn-3', '4': 'btn-4',
    '5': 'btn-5', '6': 'btn-6', '7': 'btn-7', '8': 'btn-8', '9': 'btn-9',
    '.': 'btn-decimal',
    '+': 'btn-add',
    '-': 'btn-subtract',
    '*': 'btn-multiply', 'x': 'btn-multiply', 'X': 'btn-multiply',
    '/': 'btn-divide',
    '%': 'btn-modulo',
    '^': 'btn-power',
    '(': 'btn-bracket-open',
    ')': 'btn-bracket-close',
    'Enter': 'btn-equals',
    '=': 'btn-equals',
    'Backspace': 'btn-backspace',
    'Delete': 'btn-clear',
    'Escape': 'btn-clear'
  };

  // --- THEME SELECTOR CONFIG ---
  const themeOptions = document.querySelectorAll('.theme-option');
  
  // Load saved theme or fall back to default
  const savedTheme = localStorage.getItem('aethercalc-theme') || 'theme-glass-dark';
  document.body.className = savedTheme;
  themeOptions.forEach(opt => {
    if (opt.getAttribute('data-theme') === savedTheme.replace('theme-', '')) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });

  // Load saved history log
  try {
    const savedHistory = localStorage.getItem('aethercalc-history');
    if (savedHistory) {
      historyLog = JSON.parse(savedHistory);
      renderHistory();
    }
  } catch (err) {
    console.error('Failed to parse calculation history:', err);
  }

  // --- INTERNAL HELPER FUNCTIONS ---

  /**
   * Translates internal characters to gorgeous high-end formatted screen views
   */
  function formatScreenDisplay(expr) {
    if (!expr) return '';
    
    // Convert operators to rich HTML tokens for sleek aesthetic contrast
    return expr
      .replace(/\*/g, ' <span class="display-op">×</span> ')
      .replace(/\//g, ' <span class="display-op">÷</span> ')
      .replace(/\+/g, ' <span class="display-op">+</span> ')
      .replace(/-/g, ' <span class="display-op">-</span> ')
      .replace(/%/g, ' <span class="display-op">%</span> ')
      .replace(/\^/g, ' <span class="display-op">^</span> ')
      .replace(/sqrt\(/g, '<span class="display-fn">√</span>(')
      .replace(/sin\(/g, '<span class="display-fn">sin</span>(')
      .replace(/cos\(/g, '<span class="display-fn">cos</span>(')
      .replace(/tan\(/g, '<span class="display-fn">tan</span>(')
      .replace(/log\(/g, '<span class="display-fn">log</span>(')
      .replace(/ln\(/g, '<span class="display-fn">ln</span>(')
      .replace(/π/g, '<span class="display-const">π</span>')
      .replace(/e/g, '<span class="display-const">e</span>');
  }

  /**
   * Refreshes display components with current expression state and dynamic sizing
   */
  function updateUI() {
    displayExpr.innerHTML = formatScreenDisplay(expressionBuffer);
    
    // Auto-scroll expression display to the right as it gets long
    displayExpr.scrollLeft = displayExpr.scrollWidth;

    // Reset results font size for high numbers
    if (displayRes.textContent.length > 10) {
      displayRes.style.fontSize = '1.7rem';
    } else if (displayRes.textContent.length > 7) {
      displayRes.style.fontSize = '2.0rem';
    } else {
      displayRes.style.fontSize = '';
    }

    // Bracket balance checker: helper warning on status bar
    const openBrackets = (expressionBuffer.match(/\(/g) || []).length;
    const closeBrackets = (expressionBuffer.match(/\)/g) || []).length;
    
    if (openBrackets > closeBrackets) {
      statusSciIndicator.innerHTML = `<i class="fa-solid fa-calculator"></i> Brackets: ${openBrackets - closeBrackets} open`;
    } else {
      statusSciIndicator.innerHTML = isScientificActive 
        ? `<i class="fa-solid fa-flask"></i> Scientific Mode` 
        : `<i class="fa-solid fa-calculator"></i> Standard`;
    }
  }

  /**
   * Displays temporary toast banner (useful for successes and errors)
   */
  function showToast(message, isError = false) {
    toastMsg.innerHTML = isError 
      ? `<i class="fa-solid fa-circle-exclamation" style="color:var(--btn-spec-text);"></i> ${message}`
      : `<i class="fa-solid fa-circle-check" style="color:var(--btn-sci-text);"></i> ${message}`;
    
    toast.className = 'toast-notification show';
    
    // Automatically hide after 2.5 seconds
    clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  /**
   * Handles character deletion, cleaning full groupings (e.g. "sin(") rather than just "("
   */
  function handleBackspace() {
    const multiCharTokens = ['sqrt(', 'sin(', 'cos(', 'tan(', 'log(', 'ln('];
    
    for (const token of multiCharTokens) {
      if (expressionBuffer.endsWith(token)) {
        expressionBuffer = expressionBuffer.substring(0, expressionBuffer.length - token.length);
        statusErrorMsg.style.display = 'none';
        updateUI();
        return;
      }
    }
    
    // Normal single backspace
    expressionBuffer = expressionBuffer.slice(0, -1);
    statusErrorMsg.style.display = 'none';
    updateUI();
  }

  /**
   * Processes the math equation inside expressionBuffer, flashes screen, and saves history
   */
  function handleEvaluation() {
    if (!expressionBuffer) return;

    try {
      // Calculate
      const mathResult = MathParser.calculate(expressionBuffer);
      const formatted = MathParser.format(mathResult);
      
      // Flash screen animation for premium feedback
      displayRes.style.transform = 'scale(0.95)';
      setTimeout(() => { displayRes.style.transform = ''; }, 100);

      // Save valid calculations to history log
      const calculationRecord = {
        expression: expressionBuffer,
        result: formatted
      };
      
      // Avoid duplication of the immediate last calculation in history
      const lastHistory = historyLog[0];
      if (!lastHistory || lastHistory.expression !== expressionBuffer) {
        historyLog.unshift(calculationRecord);
        if (historyLog.length > 30) historyLog.pop(); // keep limit
        localStorage.setItem('aethercalc-history', JSON.stringify(historyLog));
        renderHistory();
      }

      // Update screen representation
      displayRes.textContent = formatted;
      lastResult = formatted;
      expressionBuffer = formatted; // Allow continuing operations
      
      statusErrorMsg.style.display = 'none';
      updateUI();
    } catch (error) {
      // Shake screen feedback on syntax failure
      calcCard.classList.add('error-shake');
      setTimeout(() => { calcCard.classList.remove('error-shake'); }, 400);
      
      // Update displays
      statusErrorMsg.textContent = error.message;
      statusErrorMsg.style.display = 'inline-flex';
      showToast(error.message, true);
    }
  }

  /**
   * Clears state buffers
   */
  function handleClear() {
    expressionBuffer = '';
    lastResult = null;
    displayRes.textContent = '0';
    statusErrorMsg.style.display = 'none';
    updateUI();
  }

  // --- RECONCILE BUTTON CLICK ACTIONS ---

  function triggerButtonAction(btn) {
    // Add satisfying ripple click animation
    btn.classList.add('btn-ripple');
    setTimeout(() => btn.classList.remove('btn-ripple'), 400);

    const insertVal = btn.getAttribute('data-insert');
    const actionVal = btn.getAttribute('data-action');

    if (insertVal !== null) {
      // Logic for building math strings
      expressionBuffer += insertVal;
      statusErrorMsg.style.display = 'none';
      updateUI();
    } 
    else if (actionVal !== null) {
      switch (actionVal) {
        case 'clear':
          handleClear();
          break;
        case 'backspace':
          handleBackspace();
          break;
        case 'evaluate':
          handleEvaluation();
          break;
      }
    }
  }

  // Map clicks on keypad buttons
  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => triggerButtonAction(btn));
  });

  // --- DYNAMIC SLIDE DRAWERS TOGGLES ---

  // Scientific Mode Expansion Drawer
  function toggleScientificMode() {
    isScientificActive = !isScientificActive;
    if (isScientificActive) {
      sciPanel.classList.remove('collapsed');
      btnToggleScientific.classList.add('active');
      sciPanel.setAttribute('aria-expanded', 'true');
    } else {
      sciPanel.classList.add('collapsed');
      btnToggleScientific.classList.remove('active');
      sciPanel.setAttribute('aria-expanded', 'false');
    }
    updateUI();
  }
  btnToggleScientific.addEventListener('click', toggleScientificMode);

  // History Panel Drawer Slider
  function toggleHistorySidebar() {
    historySidebar.classList.toggle('collapsed');
  }
  btnToggleHistory.addEventListener('click', toggleHistorySidebar);
  btnCloseHistory.addEventListener('click', toggleHistorySidebar);

  // Clear History Log
  btnClearHistory.addEventListener('click', () => {
    historyLog = [];
    localStorage.removeItem('aethercalc-history');
    renderHistory();
    showToast('Calculation logs cleared!');
  });

  /**
   * Renders calculations dynamically to history sidebar
   */
  function renderHistory() {
    if (historyLog.length === 0) {
      emptyHistoryMsg.style.display = 'flex';
      btnClearHistory.style.display = 'none';
      historyItemsContainer.querySelectorAll('.history-log-item').forEach(el => el.remove());
      return;
    }

    emptyHistoryMsg.style.display = 'none';
    btnClearHistory.style.display = 'block';

    // Remove existing rows
    historyItemsContainer.querySelectorAll('.history-log-item').forEach(el => el.remove());

    // Generate new list elements
    historyLog.forEach(item => {
      const row = document.createElement('button');
      row.className = 'history-log-item';
      row.setAttribute('aria-label', `Expression ${item.expression} equals ${item.result}`);
      
      const exprDiv = document.createElement('div');
      exprDiv.className = 'hist-expr';
      exprDiv.textContent = item.expression;
      
      const resDiv = document.createElement('div');
      resDiv.className = 'hist-res';
      resDiv.textContent = item.result;
      
      row.appendChild(exprDiv);
      row.appendChild(resDiv);
      
      // Load calculation back to expression board on click
      row.addEventListener('click', () => {
        expressionBuffer = item.expression;
        displayRes.textContent = item.result;
        statusErrorMsg.style.display = 'none';
        updateUI();
        toggleHistorySidebar(); // close drawer
        showToast('Calculation reloaded!');
      });

      historyItemsContainer.appendChild(row);
    });
  }

  // --- THEME SELECTOR SWITCHER ---

  themeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      themeOptions.forEach(opt => opt.classList.remove('active'));
      btn.classList.add('active');
      
      const selectedTheme = `theme-${btn.getAttribute('data-theme')}`;
      document.body.className = selectedTheme;
      localStorage.setItem('aethercalc-theme', selectedTheme);
      
      // Micro impact feedback
      showToast(`Switched theme to ${btn.title.replace(' Theme', '')}`);
    });
  });

  // --- CLIPBOARD CLICK-TO-COPY FEATURE ---

  displayRes.addEventListener('click', () => {
    const copyValue = displayRes.textContent;
    if (copyValue === '0' || copyValue === '') return;
    
    navigator.clipboard.writeText(copyValue)
      .then(() => {
        showToast('Result copied to clipboard!');
        // Click effect flash
        displayRes.style.opacity = '0.5';
        setTimeout(() => displayRes.style.opacity = '', 150);
      })
      .catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
  });

  // --- PHYSICAL KEYBOARD INTERCEPTIONS & GLOW FEEDBACK ---

  document.addEventListener('keydown', (e) => {
    // Prevent default spacing scrolling or enter submits if inputs focused
    if (['Space', 'Enter', 'Backspace', 'Tab'].includes(e.key) && document.activeElement === document.body) {
      e.preventDefault();
    }

    const matchedBtnId = KEY_MAP[e.key];
    if (!matchedBtnId) return;

    const targetBtn = document.getElementById(matchedBtnId);
    if (!targetBtn) return;

    // Trigger visual button highlight
    targetBtn.classList.add('btn-active-highlight');
    
    // Execute action
    triggerButtonAction(targetBtn);
  });

  document.addEventListener('keyup', (e) => {
    const matchedBtnId = KEY_MAP[e.key];
    if (!matchedBtnId) return;

    const targetBtn = document.getElementById(matchedBtnId);
    if (targetBtn) {
      targetBtn.classList.remove('btn-active-highlight');
    }
  });

  // --- INITIAL LAUNCH ---
  updateUI();
});
