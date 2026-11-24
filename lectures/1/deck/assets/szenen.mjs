// ES-Modul der Deck-Szenen für die Publikation: export { SZENEN, starte, stoppe, fmt }.
// Quelle ist szenen.js (dieselben Funktionen wie im Live-Deck); dieses Modul lädt sie und reicht sie weiter.
//   import { starte } from './assets/szenen.mjs';
//   starte(el, { basis: '../deck/', standbild: false });   // el: <div data-szene="tempo" data-dauer="6000">
// Voraussetzung: window.FACTS (assets/facts.js) ist geladen oder wird als { facts } übergeben; stapel braucht
// assets/szenen.css. Welche Dateien jede Szene braucht: publikation/szenen-manifest.json.
import './szenen.js';
const S = globalThis.FamulusSzenen;
export const SZENEN = S.SZENEN, starte = S.starte, stoppe = S.stoppe, fmt = S.fmt;
export default S;
