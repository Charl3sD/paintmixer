import './styles.css';
import { loadState, Store, type AppState } from './state/store';
import { debounce } from './ui/dom';
import { mountPalette } from './ui/palette';
import { mountRecipe } from './ui/recipe';
import { mountTarget } from './ui/target';
import { SolverClient } from './worker/client';

const store = new Store(loadState());

mountPalette(document.getElementById('paints')!, store);
mountTarget(document.getElementById('target')!, store);
const recipe = mountRecipe(document.getElementById('recipe')!, store);

const solver = new SolverClient((outcome) => {
  if (outcome.ok) recipe.showResult(outcome.result);
  else recipe.showError(outcome.error);
});

function requestMix(s: AppState) {
  const paints = s.paints.filter((p) => p.enabled).map(({ id, hex, strength }) => ({ id, hex, strength }));
  if (paints.length === 0) {
    recipe.showError('Turn on at least one of your paints to start mixing.');
    return;
  }
  recipe.showPending();
  solver.request(paints, s.targetHex, s.maxPaints);
}

const requestMixSoon = debounce(requestMix, 60);

/** Only these fields change the answer; renames and batch size don't need a new solve. */
const mixKey = (s: AppState) =>
  JSON.stringify([s.targetHex, s.maxPaints, s.paints.filter((p) => p.enabled).map((p) => [p.id, p.hex, p.strength])]);

let lastKey = mixKey(store.get());
store.subscribe((s) => {
  const key = mixKey(s);
  if (key === lastKey) return;
  lastKey = key;
  requestMixSoon(s);
});
requestMix(store.get());
