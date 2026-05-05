// ════════════════════════════════════════════════════════════════════════
// FJH 86→65 · State management · localStorage-backed
// Shared across all pages.
// ════════════════════════════════════════════════════════════════════════

const STORE_KEY = 'fjh-loss-2026';
const PLAN_START = '2026-05-11'; // Monday W1
const PLAN_END = '2026-09-06';
const START_KG = 86.0;
const TARGET_KG = 65.0;
const TOTAL_DAYS = 119;
const TOTAL_WEEKS = 17;

// ──── Storage helpers ────
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { weights: {}, completed: {}, meals: {} };
  } catch {
    return { weights: {}, completed: {}, meals: {} };
  }
}
function saveState(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

// ──── Date helpers ────
const fmtDate = (d) => d.toISOString().slice(0, 10);
const parseDate = (s) => new Date(s + 'T00:00:00Z');
const todayStr = () => fmtDate(new Date());

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function dayIndex() {
  // 0..118 (negative if before plan starts)
  return daysBetween(PLAN_START, todayStr());
}

function weekIndex() {
  // 1..17, or 0 if before
  const di = dayIndex();
  if (di < 0) return 0;
  return Math.min(TOTAL_WEEKS, Math.floor(di / 7) + 1);
}

// ──── Computed metrics ────
function getCurrentWeight(state) {
  const dates = Object.keys(state.weights).sort();
  if (!dates.length) return null;
  return state.weights[dates[dates.length - 1]];
}

function getStartingLogged(state) {
  const dates = Object.keys(state.weights).sort();
  return dates.length ? state.weights[dates[0]] : START_KG;
}

function progressPct(state) {
  const cur = getCurrentWeight(state) ?? START_KG;
  const lost = START_KG - cur;
  const goal = START_KG - TARGET_KG;
  return Math.max(0, Math.min(100, Math.round((lost / goal) * 100)));
}

// Target weight for given week (matches the gen.mjs logic exactly)
function targetForWeek(w) {
  if (w <= 4) return 86 - w * 1.5;
  if (w <= 8) return 80 - (w - 4) * 1.2;
  if (w === 9) return 75.2;
  if (w <= 13) return 75.2 - (w - 9) * 1.0;
  return 71.2 - (w - 13) * 1.55;
}

// Build target trajectory array [{date, kg}] for the full plan
function buildTargetTrajectory() {
  const arr = [];
  for (let w = 0; w <= TOTAL_WEEKS; w++) {
    const d = new Date(parseDate(PLAN_START));
    d.setUTCDate(d.getUTCDate() + w * 7);
    arr.push({ date: fmtDate(d), kg: w === 0 ? START_KG : targetForWeek(w) });
  }
  return arr;
}

// ──── Plan loading ────
let _planCache = null;
async function loadPlan() {
  if (_planCache) return _planCache;
  const r = await fetch('./assets/plan.json');
  _planCache = await r.json();
  return _planCache;
}

// ──── Workout completion ────
function isWorkoutDone(state, workoutId) {
  return !!state.completed[workoutId];
}
function toggleWorkout(state, workoutId) {
  if (state.completed[workoutId]) delete state.completed[workoutId];
  else state.completed[workoutId] = todayStr();
  saveState(state);
}

// ──── Meal check-ins ────
function getMealsForDate(state, date) {
  return state.meals[date] || {};
}
function toggleMeal(state, date, mealKey) {
  if (!state.meals[date]) state.meals[date] = {};
  if (state.meals[date][mealKey]) delete state.meals[date][mealKey];
  else state.meals[date][mealKey] = true;
  saveState(state);
}

// ──── Standard meals (for diet page check-in) ────
// p=protein, f=fat, c=carb (all grams)
const STANDARD_MEALS = [
  { k: 'breakfast', t: '07:00', name: '早餐 · 蛋 + Yogurt + 香蕉',     p: 28, f: 14, c: 35, kcal: 380 },
  { k: 'lunch',     t: '12:00', name: '午餐 · 食堂 鮭魚 + 半碗飯',     p: 35, f: 16, c: 50, kcal: 550 },
  { k: 'pre',       t: '17:30', name: '訓練前 · プロテインバー',         p: 15, f:  6, c: 20, kcal: 200 },
  { k: 'dinner',    t: '21:00', name: '晚餐 · 雞胸 200g + サラダ',       p: 50, f: 14, c: 30, kcal: 470 },
  { k: 'late',      t: '22:30', name: '加餐 · プロテインシェイク',       p: 25, f:  3, c:  5, kcal: 130 },
];

// Compute totals from a meals object {k: true/false}
function sumMacros(mealsState) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, count: 0 };
  STANDARD_MEALS.forEach(m => {
    if (mealsState[m.k]) {
      t.kcal += m.kcal; t.p += m.p; t.f += m.f; t.c += m.c; t.count++;
    }
  });
  return t;
}

// ──── Modal helpers ────
function openWeightModal() {
  document.getElementById('weightModal').classList.add('open');
  const inp = document.getElementById('weightInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}
function closeWeightModal() {
  document.getElementById('weightModal').classList.remove('open');
}
function submitWeight() {
  const v = parseFloat(document.getElementById('weightInput').value);
  if (isNaN(v) || v < 30 || v > 200) {
    alert('请输入合理的体重（30-200 kg）');
    return;
  }
  const state = loadState();
  state.weights[todayStr()] = v;
  saveState(state);
  closeWeightModal();
  // Re-render
  if (typeof renderAll === 'function') renderAll();
}

// Allow ESC to close modal, Enter to submit
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeWeightModal();
  const modal = document.getElementById('weightModal');
  if (modal && modal.classList.contains('open') && e.key === 'Enter') submitWeight();
});

// ──── Demo data injection (for first-time vision QA) ────
function injectDemoData() {
  const state = loadState();
  if (Object.keys(state.weights).length > 0) return;
  // Plant 5 days of decreasing weight
  const dates = [];
  const base = new Date('2026-05-11T00:00:00Z');
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(fmtDate(d));
  }
  const points = [86.0, 85.4, 84.7, 84.1, 83.5];
  dates.forEach((d, i) => state.weights[d] = points[i]);
  saveState(state);
}

// ──── Module export hooks ────
window.FJH = {
  STORE_KEY, PLAN_START, PLAN_END, START_KG, TARGET_KG, TOTAL_DAYS, TOTAL_WEEKS,
  STANDARD_MEALS,
  loadState, saveState, todayStr, parseDate, fmtDate, daysBetween,
  dayIndex, weekIndex, getCurrentWeight, getStartingLogged, progressPct,
  targetForWeek, buildTargetTrajectory, loadPlan,
  isWorkoutDone, toggleWorkout, getMealsForDate, toggleMeal, sumMacros,
  openWeightModal, closeWeightModal, submitWeight,
  injectDemoData,
};
