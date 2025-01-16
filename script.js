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
          ).filter((v, i, a) => i === 0 || v !== a[i-1]);
        }
      } catch (error) {
        console.error('Error generating sample sizes:', error);
        return [2, 4, 8, 16, 32];
      }
    }
  };
  
let currentState = {
  measurementType: 'success rate',
  customMeasurement: '',
  expectedRate: 50,
  minSize: 16,
  maxSize: 528,
  useLogScale: true
};

function updatePlot() {
  console.log('Updating plot...');
  
  // Get current values
  const expectedRate = Number(document.getElementById('expectedRate').value);
  const sampleSizes = stats.generateSampleSizes(
    currentState.minSize, 
    currentState.maxSize, 
    currentState.useLogScale
  );

  // Calculate precision for each sample size
  const precisions = sampleSizes.map(n => {
    const ci = stats.calculateBetaBinomialCI(n, expectedRate);
    return ci.halfWidth;
  });

  // Create plot data
  const trace = {
    x: sampleSizes,
    y: precisions,
    mode: 'lines+markers',
    line: { color: '#2563eb' },
    marker: { size: 8 }
  };

  // Plot layout
  const layout = {
    xaxis: {
      title: 'Sample Size',
      type: currentState.useLogScale ? 'log' : 'linear'
    },
    yaxis: {
      title: 'Margin of Error (±%)',
      rangemode: 'tozero'
    },
    margin: { t: 20, r: 20, b: 40, l: 60 },
    hovermode: 'closest'
  };

  // Create plot
  Plotly.newPlot('precisionPlot', [trace], layout, { 
    displayModeBar: false,
    responsive: true 
  });
}

// UI update functions
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

function updateSummary() {
  const measurementType = document.getElementById('measurementType');
  const customMeasurement = document.getElementById('customMeasurement');
  const designType = document.getElementById('designType').value;
  const expectedRate = Number(document.getElementById('expectedRate').value);
  const currentSize = Number(document.getElementById('summarySize').value);
  
  try {
    // Update measurement labels
    const measurementLabel = measurementType.value === 'custom' ? 
      customMeasurement.value || 'measurement' : 
      measurementType.value;
    
    document.querySelectorAll('.measurement-label').forEach(el => {
      el.textContent = measurementLabel;
    });

    // Update margin of error
    const ci = stats.calculateBetaBinomialCI(currentSize, expectedRate);
    document.getElementById('marginOfError').textContent = ci.halfWidth.toFixed(1);
    document.getElementById('summaryRate').textContent = expectedRate;

    // Update comparison section
    const isWithinSubjects = designType === 'within';
    const comparisonSize = document.getElementById('comparisonSize');
    comparisonSize.textContent = isWithinSubjects ? 
      currentSize : 
      `${currentSize} per condition (${currentSize * 2} total)`;

    // Update differences
    const significantDiff = stats.calculateDetectableDifference(
      currentSize, 
      expectedRate, 
      isWithinSubjects
    );
    document.getElementById('significantDiff').textContent = significantDiff.toFixed(1);

    document.getElementById('directionalDiff95').textContent = 
      stats.calculateDirectionalDifference(currentSize, expectedRate, 0.95, isWithinSubjects).toFixed(1);
    document.getElementById('directionalDiff80').textContent = 
      stats.calculateDirectionalDifference(currentSize, expectedRate, 0.80, isWithinSubjects).toFixed(1);

  } catch (error) {
    console.error('Error updating summary:', error);
    // Show error message to user
    const summaryDiv = document.getElementById('summaryStats');
    summaryDiv.innerHTML = `<div class="error-message">Error updating summary: ${error.message}</div>`;
  }
}

// Event listeners setup
document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const measurementType = document.getElementById('measurementType');
  const customMeasurement = document.getElementById('customMeasurement');
  const expectedRate = document.getElementById('expectedRate');
  const designType = document.getElementById('designType');

  // Update all summaries and plots when measurement type changes
  measurementType.addEventListener('change', function() {
    if (this.value === 'custom') {
      customMeasurement.classList.remove('hidden');
    } else {
      customMeasurement.classList.add('hidden');
    }
    updatePlot();
    updateSummary();
  });

  // Update on custom measurement input
  customMeasurement.addEventListener('input', function() {
    updatePlot();
    updateSummary();
  });

  // Initial setup
  const expectedRateValue = document.getElementById('expectedRateValue');
  const minSize = document.getElementById('minSize');
  const maxSize = document.getElementById('maxSize');
  const summarySize = document.getElementById('summarySize');

  // Debounced update functions
  const debouncedUpdatePlot = debounce(updatePlot, 250);
  const debouncedUpdateSummary = debounce(updateSummary, 250);

  // Event listeners
  measurementType.addEventListener('change', function() {
    if (this.value === 'custom') {
      customMeasurement.classList.remove('hidden');
      customMeasurement.focus();
    } else {
      customMeasurement.classList.add('hidden');
    }
    debouncedUpdateSummary();
  });

  customMeasurement.addEventListener('input', debouncedUpdateSummary);

  expectedRate.addEventListener('input', function() {
    expectedRateValue.textContent = this.value + '%';
    debouncedUpdatePlot();
    debouncedUpdateSummary();
  });

  [minSize, maxSize].forEach(input => {
    input.addEventListener('input', function() {
      const minVal = parseInt(minSize.value);
      const maxVal = parseInt(maxSize.value);
      if (maxVal < minVal) {
        maxSize.value = minVal;
      }
      debouncedUpdatePlot();
    });
  });

  summarySize.addEventListener('input', function() {
    this.value = stats.validateNumber(this.value, 2, 10000, 16);
    debouncedUpdateSummary();
  });

  document.querySelectorAll('input[name="scale"]').forEach(input => {
    input.addEventListener('change', debouncedUpdatePlot);
  });

  designType.addEventListener('change', debouncedUpdateSummary);

  // Initial updates
  updatePlot();
  updateSummary();
});