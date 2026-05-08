// Stats utility object
const stats = {
  validateNumber: (value, min, max, defaultValue) => {
    const num = Number(value);
    if (isNaN(num) || num < min || num > max) return defaultValue;
    return num;
  },

  calculateBetaBinomialCI: (n, p) => {
    if (n < 2 || p < 0 || p > 100) {
      throw new Error('Invalid parameters for CI calculation');
    }
    const pct = p / 100;
    const alpha = n * pct + 1;
    const beta = n * (1 - pct) + 1;
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stdDev = Math.sqrt(variance);
    const z = 1.96; // 95% CI
    const lower = Math.max(0, mean - z * stdDev) * 100;
    const upper = Math.min(1, mean + z * stdDev) * 100;
    return { lower, upper, halfWidth: (upper - lower) / 2 };
  },

  calculateDetectableDifference: (n, baselineP, isWithinSubjects = false, rho = 0.5) => {
    if (n < 2 || baselineP < 0 || baselineP > 100) {
      throw new Error('Invalid parameters for difference calculation');
    }
    const pct = baselineP / 100;
    const alpha = n * pct + 1;
    const beta = n * (1 - pct) + 1;
    const var1 = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const pooledVar = isWithinSubjects ? 2 * var1 * (1 - rho) : 2 * var1;
    const pooledSD = Math.sqrt(pooledVar);
    return 1.96 * pooledSD * 100;
  },

  calculateDirectionalDifference: (n, baselineP, confidenceLevel = 0.95, isWithinSubjects = false) => {
    if (n < 2 || baselineP < 0 || baselineP > 100) {
      throw new Error('Invalid parameters for directional difference calculation');
    }
    const pct = baselineP / 100;
    const alpha = n * pct + 1;
    const beta = n * (1 - pct) + 1;
    const var1 = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const rho = 0.5;
    const pooledVar = isWithinSubjects ? 2 * var1 * (1 - rho) : 2 * var1;
    const pooledSD = Math.sqrt(pooledVar);
    const zScores = { 0.95: 1.645, 0.80: 0.84 };
    return zScores[confidenceLevel] * pooledSD * 100;
  },

  generateSampleSizes: (minSize, maxSize, useLogScale) => {
    try {
      const validMin = Math.max(2, minSize);
      const validMax = Math.max(validMin, maxSize);

      if (useLogScale) {
        const sizes = [];
        let size = validMin;
        while (size <= validMax) {
          sizes.push(Math.round(size));
          size = Math.min(size * 1.5, validMax);
          if (sizes.length > 0 && sizes[sizes.length - 1] === validMax) break;
        }
        if (sizes[sizes.length - 1] !== validMax) sizes.push(validMax);
        return sizes;
      } else {
        const numPoints = 20;
        const stepSize = Math.max(1, Math.floor((validMax - validMin) / (numPoints - 1)));
        return Array.from({ length: numPoints }, (_, i) =>
          Math.min(validMin + i * stepSize, validMax)
        ).filter((v, i, a) => i === 0 || v !== a[i - 1]);
      }
    } catch (error) {
      console.error('Error generating sample sizes:', error);
      return [2, 4, 8, 16, 32];
    }
  }
};

// ── Theme helpers ─────────────────────────────────────────────────────────────

function getThemeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colors() {
  return {
    accent:     getThemeColor('--accent-blue')            || '#2563eb',
    accentFill: getThemeColor('--accent-blue-fill')       || 'rgba(37,99,235,0.12)',
    gridColor:  getThemeColor('--border')                 || '#e2e8f0',
    mutedText:  getThemeColor('--text-muted')             || '#475569',
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentState = {
  measurementType: 'success rate',
  customMeasurement: '',
  expectedRate: 50,
  minSize: 6,
  maxSize: 100,
  useLogScale: false,
};

// ── Plot ──────────────────────────────────────────────────────────────────────

function updatePlot() {
  const { accent, accentFill, gridColor, mutedText } = colors();
  const expectedRate = currentState.expectedRate;
  const sampleSizes = stats.generateSampleSizes(
    currentState.minSize,
    currentState.maxSize,
    currentState.useLogScale
  );

  const precisions = sampleSizes.map(n => {
    const ci = stats.calculateBetaBinomialCI(n, expectedRate);
    return ci.halfWidth;
  });

  const trace = {
    x: sampleSizes,
    y: precisions,
    mode: 'lines+markers',
    line: { color: accent },
    marker: { size: 8, color: accent },
  };

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: {
      title: 'Sample Size',
      type: currentState.useLogScale ? 'log' : 'linear',
      tickformat: 'd',
      color: mutedText,
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
    },
    yaxis: {
      title: 'Margin of Error (±%)',
      rangemode: 'tozero',
      color: mutedText,
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
    },
    font: { color: mutedText },
    margin: { t: 20, r: 20, b: 50, l: 60 },
    hovermode: 'closest',
  };

  Plotly.newPlot('precisionPlot', [trace], layout, {
    displayModeBar: false,
    responsive: true,
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

function updateSummary() {
  const measurementTypeEl = document.getElementById('measurementType');
  const customMeasurementEl = document.getElementById('customMeasurement');
  const designType = document.getElementById('designType').value;
  const expectedRate = Number(document.getElementById('expectedRate').value);
  const currentSize = Number(document.getElementById('summarySize').value);

  try {
    const measurementLabel = measurementTypeEl.value === 'custom'
      ? customMeasurementEl.value || 'measurement'
      : measurementTypeEl.value;

    document.querySelectorAll('.measurement-label').forEach(el => {
      el.textContent = measurementLabel;
    });

    const ci = stats.calculateBetaBinomialCI(currentSize, expectedRate);
    document.getElementById('marginOfError').textContent = ci.halfWidth.toFixed(1);
    document.getElementById('summaryRate').textContent = expectedRate;

    const isWithinSubjects = designType === 'within';
    const comparisonSize = document.getElementById('comparisonSize');
    comparisonSize.textContent = isWithinSubjects
      ? currentSize
      : `${currentSize} per condition (${currentSize * 2} total)`;

    const significantDiff = stats.calculateDetectableDifference(
      currentSize, expectedRate, isWithinSubjects
    );
    document.getElementById('significantDiff').textContent = significantDiff.toFixed(1);

    document.getElementById('directionalDiff95').textContent =
      stats.calculateDirectionalDifference(currentSize, expectedRate, 0.95, isWithinSubjects).toFixed(1);
    document.getElementById('directionalDiff80').textContent =
      stats.calculateDirectionalDifference(currentSize, expectedRate, 0.80, isWithinSubjects).toFixed(1);

  } catch (error) {
    console.error('Error updating summary:', error);
    const summaryDiv = document.getElementById('summaryStats');
    summaryDiv.innerHTML = `<div class="error-message">Error updating summary: ${error.message}</div>`;
  }
}

// ── Debounce ──────────────────────────────────────────────────────────────────

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── Init (single listener) ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  // ── Theme init ──────────────────────────────────────────────────────────────
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      // Re-render the plot so it picks up new theme colors
      updatePlot();
    });
  }

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const measurementType   = document.getElementById('measurementType');
  const customMeasurement = document.getElementById('customMeasurement');
  const expectedRate      = document.getElementById('expectedRate');
  const expectedRateValue = document.getElementById('expectedRateValue');
  const minSize           = document.getElementById('minSize');
  const maxSize           = document.getElementById('maxSize');
  const summarySize       = document.getElementById('summarySize');
  const designType        = document.getElementById('designType');

  const debouncedUpdatePlot    = debounce(updatePlot, 250);
  const debouncedUpdateSummary = debounce(updateSummary, 250);

  // ── Validation helper ───────────────────────────────────────────────────────
  function validateAndUpdateSizes() {
    const minVal = Math.max(2, Number(minSize.value));
    const maxVal = Math.max(minVal, Number(maxSize.value));

    currentState.minSize = minVal;
    currentState.maxSize = maxVal;

    minSize.value = minVal;
    maxSize.value = maxVal;

    updatePlot();
  }

  // ── Measurement type ────────────────────────────────────────────────────────
  measurementType.addEventListener('change', function () {
    if (this.value === 'custom') {
      customMeasurement.classList.remove('hidden');
      customMeasurement.focus();
    } else {
      customMeasurement.classList.add('hidden');
    }
    currentState.measurementType = this.value;
    debouncedUpdatePlot();
    debouncedUpdateSummary();
  });

  customMeasurement.addEventListener('input', function () {
    currentState.customMeasurement = this.value;
    debouncedUpdateSummary();
  });

  // ── Expected rate slider ────────────────────────────────────────────────────
  expectedRate.addEventListener('input', function () {
    expectedRateValue.textContent = this.value + '%';
    currentState.expectedRate = Number(this.value);
    debouncedUpdatePlot();
    debouncedUpdateSummary();
  });

  // ── Sample size range inputs ────────────────────────────────────────────────
  [minSize, maxSize].forEach(input => {
    input.addEventListener('input', function () {
      const minVal = parseInt(minSize.value);
      const maxVal = parseInt(maxSize.value);
      if (maxVal < minVal) {
        maxSize.value = minVal;
      }
      currentState.minSize = minVal;
      currentState.maxSize = maxVal;
      debouncedUpdatePlot();
    });

    input.addEventListener('blur', validateAndUpdateSizes);
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') validateAndUpdateSizes();
    });
  });

  // ── Summary size inline input ───────────────────────────────────────────────
  summarySize.addEventListener('input', function () {
    this.value = stats.validateNumber(this.value, 2, 10000, 16);
    currentState.summarySize = Number(this.value);
    debouncedUpdateSummary();
  });

  // ── Scale toggle ────────────────────────────────────────────────────────────
  document.querySelectorAll('input[name="scale"]').forEach(input => {
    input.addEventListener('change', function () {
      currentState.useLogScale = this.value === 'log';
      debouncedUpdatePlot();
    });
  });

  // ── Design type ─────────────────────────────────────────────────────────────
  designType.addEventListener('change', debouncedUpdateSummary);

  // ── Initial render ──────────────────────────────────────────────────────────
  updatePlot();
  updateSummary();
});
