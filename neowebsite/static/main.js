const API_URL = 'https://kw0uic6dhe.execute-api.us-east-2.amazonaws.com/get-neo-data';

const state = {
    data: null,
    neos: [],
    activeSortId: 'visual_interest'
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        const fetchDate = getUtcDate(new Date());
        const response = await fetch(`${API_URL}?fetch_date=${fetchDate}`);

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        state.data = await response.json();
        state.neos = [...(state.data.neos || [])];

        renderSummary(state.data);
        renderSortControls(state.data.sort_options || []);
        renderCards(sortNeos(state.neos, state.activeSortId));
        hideStatus();
    } catch (error) {
        showStatus(`Unable to load NEO data. ${error.message}`);
    }
}

function getUtcDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function renderSummary(data) {
    const summary = data.summary || {};

    setText('windowRange', `${formatDate(data.window_start_date)} - ${formatDate(data.window_end_date)}`);
    setText('returnedCount', `${summary.returned_count || data.neos?.length || 0} of ${summary.candidate_count || '--'}`);
    setText('largestNeo', summary.largest_neo_name || '--');
    setText('closestNeo', summary.closest_neo_name || '--');
}

function renderSortControls(sortOptions) {
    const container = document.getElementById('sortControls');
    container.innerHTML = '';

    sortOptions.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sort-button';
        button.textContent = option.label;
        button.dataset.sortId = option.id;
        button.setAttribute('aria-pressed', option.id === state.activeSortId ? 'true' : 'false');

        if (option.id === state.activeSortId) {
            button.classList.add('active');
        }

        button.addEventListener('click', () => {
            state.activeSortId = option.id;
            updateActiveSortButton();
            renderCards(sortNeos(state.neos, state.activeSortId));
        });

        container.appendChild(button);
    });
}

function updateActiveSortButton() {
    document.querySelectorAll('.sort-button').forEach(button => {
        const isActive = button.dataset.sortId === state.activeSortId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function sortNeos(neos, sortId) {
    const sortOption = (state.data?.sort_options || []).find(option => option.id === sortId);
    if (!sortOption) return neos;

    return [...neos].sort((a, b) => {
        const aValue = getValueByPath(a, sortOption.field);
        const bValue = getValueByPath(b, sortOption.field);

        if (typeof aValue === 'boolean' || typeof bValue === 'boolean') {
            return sortOption.direction === 'asc'
                ? Number(aValue) - Number(bValue)
                : Number(bValue) - Number(aValue);
        }

        const aNumber = Number(aValue);
        const bNumber = Number(bValue);

        if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
            return sortOption.direction === 'asc' ? aNumber - bNumber : bNumber - aNumber;
        }

        return String(aValue).localeCompare(String(bValue));
    });
}

function renderCards(neos) {
    const grid = document.getElementById('neoGrid');
    grid.innerHTML = '';

    neos.forEach(neo => {
        grid.appendChild(createNeoCard(neo));
    });
}

function createNeoCard(neo) {
    const card = document.createElement('article');
    card.className = 'neo-card';

    const visualization = neo.visualization || {};
    const metrics = neo.metrics || {};
    const ranking = neo.ranking || {};
    const approach = neo.close_approach || {};
    const visualVars = getVisualVariables(neo);

    card.style.setProperty('--asteroid-size', `${visualVars.asteroidSize}px`);
    card.style.setProperty('--reference-size', `${visualVars.referenceSize}px`);
    card.style.setProperty('--blob-radius', visualVars.blobRadius);
    card.style.setProperty('--spin-speed', `${visualVars.spinSpeed}s`);

    card.innerHTML = `
        <div class="visual-panel" aria-hidden="true">
            <div class="asteroid-wrap">
                <div class="asteroid"></div>
            </div>
            <div class="reference-marker">
                <div class="reference-scale-line"></div>
                <div class="reference-object" title="${escapeAttribute(visualization.primary_reference_name || 'Reference object')}">
                    <span class="reference-crown"></span>
                    <span class="reference-tower"></span>
                    <span class="reference-base"></span>
                </div>
            </div>
        </div>
        <div class="neo-content">
            <div class="card-topline">
                <span class="rank-pill">#${ranking.visual_interest_rank || '--'} Interesting</span>
                ${metrics.is_hazardous ? '<span class="hazard-pill">Potentially hazardous</span>' : ''}
            </div>
            <h3>${escapeHtml(neo.name || 'Unnamed NEO')}</h3>
            <p class="comparison-label">${escapeHtml(visualization.comparison_label || 'Size comparison unavailable')}</p>
            <div class="metric-grid">
                ${metricMarkup('Avg Diameter', `${formatNumber(metrics.diameter_avg_m)} m`)}
                ${metricMarkup('Closest Pass', `${formatNumber(metrics.miss_distance_lunar)} lunar`)}
                ${metricMarkup('Speed', `${formatNumber(metrics.velocity_kph)} km/h`)}
                ${metricMarkup('Approach', formatApproach(approach))}
            </div>
            <div class="neo-footer">
                <span>#${ranking.size_rank || '--'} largest</span>
                <span>#${ranking.closest_rank || '--'} closest</span>
                <span>#${ranking.fastest_rank || '--'} fastest</span>
                <a href="${escapeAttribute(neo.nasa_jpl_url || '#')}" target="_blank" rel="noreferrer">NASA JPL</a>
            </div>
        </div>
    `;

    return card;
}

function metricMarkup(label, value) {
    return `
        <div class="metric">
            <span class="meta-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function getVisualVariables(neo) {
    const metrics = neo.metrics || {};
    const visualization = neo.visualization || {};
    const diameter = Number(metrics.diameter_avg_m || visualization.diameter_avg_m || 50);
    const ratio = Number(visualization.primary_reference_ratio || 1);
    const seed = seedFromString(visualization.asteroid_shape_seed || neo.neo_id || neo.name || 'neo');

    const asteroidSize = clamp(84 + Math.log10(Math.max(diameter, 2)) * 58, 110, 250);

    return {
        asteroidSize,
        referenceSize: clamp(asteroidSize / Math.sqrt(Math.max(ratio, 0.3)), 54, 158),
        blobRadius: `${42 + (seed % 18)}% ${58 - (seed % 12)}% ${48 + (seed % 20)}% ${52 - (seed % 16)}%`,
        spinSpeed: 10 + (seed % 9)
    };
}

function seedFromString(value) {
    return String(value).split('').reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

function getValueByPath(object, path) {
    return path.split('.').reduce((value, key) => value?.[key], object);
}

function formatDate(value) {
    if (!value) return '--';
    const date = new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function formatApproach(approach) {
    if (!approach.date) return '--';
    const days = Number(approach.days_until);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${formatDate(approach.date)} (${days} days)`;
}

function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return new Intl.NumberFormat('en', { maximumFractionDigits: number >= 100 ? 0 : 1 }).format(number);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setText(id, value) {
    document.getElementById(id).textContent = value;
}

function hideStatus() {
    document.getElementById('statusMessage').classList.add('hidden');
}

function showStatus(message) {
    const status = document.getElementById('statusMessage');
    status.innerHTML = escapeHtml(message);
    status.classList.remove('hidden');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
