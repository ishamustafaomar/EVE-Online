/** Discipline (skill) tree roots — doc 02 §3. */

import { disciplineId } from '../kernel/ids.js';
import type { DisciplineDef } from './types.js';

const d = (id: string, name: string, description: string): DisciplineDef => ({
  id: disciplineId(`disc.${id}`),
  name,
  description,
});

export const DISCIPLINES: readonly DisciplineDef[] = [
  d('spaceframes', 'Spaceframes', 'Hull handling fundamentals; gates ship classes.'),
  d('gunnery', 'Gunnery', 'Turret weapons: mass drivers, lances, projectors.'),
  d('warheads', 'Warheads', 'Launcher weapons and warhead logistics.'),
  d('engineering', 'Engineering', 'Power, compute, and flux system management.'),
  d('shields', 'Shield Systems', 'Shield emitters, boosters, and hardening.'),
  d('armaturics', 'Armaturics', 'Armor plating, menders, and hull integrity.'),
  d('navigation', 'Navigation', 'Sublight handling, arc drives, and propulsion.'),
  d('subterfuge', 'Subterfuge', 'Veils, electronic warfare, and dirty tricks.'),
  d('industry', 'Industry', 'Manufacturing throughput and parallel job control.'),
  d('extraction', 'Extraction', 'Mining equipment and ore handling.'),
  d('refining', 'Refining', 'Ore reprocessing efficiency.'),
  d('trade', 'Trade', 'Market operations, fees, and order capacity.'),
  d('sounding', 'Sounding', 'Probe scanning and signal resolution.'),
  d('command', 'Command', 'Fleet coordination and doctrine auras.'),
];
