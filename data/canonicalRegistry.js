/**
 * CANONICAL BUILDING ENTITY REGISTRY & MULTI-BUILDING GENERALIZATION
 *
 * Central Single Source of Truth for building models:
 *   - Building A: College Engineering Block (Reference Floor Plan)
 *   - Building B: Metropolis Commercial Office (Corporate Generalization)
 *   - Building C: Quantum Research Facility (High-Tech Laboratory Generalization)
 *
 * Supports runtime dynamic mutation, semantic versioning (v1.0, v1.1...),
 * and zero-shot schema generalization.
 */

import { BUILDING_A } from './buildings/building_a.js';

const ALIAS_MAP = {
  'ROOM_101': ['Room 101', 'AI Lab', 'AIML Lab', 'Robotics Lab', 'LAB-AI', 'AIML-LAB-A', 'IfcSpace_1003', 'Z101', 'R101'],
  'ROOM_102': ['Room 102', 'Networks Lab', 'CN Lab', 'Systems Lab', 'NET-LAB-B', 'LAB-CN', 'IfcSpace_1002', 'Z102', 'R102'],
  'ROOM_103': ['Room 103', 'IoT Lab', 'Embedded Lab', 'Hardware Lab', 'IOT-LAB-C', 'LAB-EMB', 'IfcSpace_1001', 'Z103', 'R103'],
  'STAFF_ROOM': ['Staff Room', 'Faculty Room', 'Staff Lounge', 'Professors Room', 'FACULTY-LOUNGE', 'STAFF-OFFICE', 'IfcSpace_1004', 'Z_STAFF', 'R_STAFF'],
  'DEPT_OFFICE': ['Department Office', 'Dept Office', 'Admin Office', 'Main Office', 'ADMIN-OFFICE', 'DEPT-ADMIN', 'IfcSpace_1008', 'Z_ADMIN', 'R_ADMIN'],
  'HOD_CABIN_2': ['HOD Cabin 2', 'Deputy HOD', 'Vice HOD Cabin', 'HOD-OFFICE-2', 'CABIN-HOD-2', 'IfcSpace_1009', 'Z_HOD2', 'R_HOD2'],
  'HOD_CABIN_1': ['HOD Cabin 1', 'Head Cabin', 'HOD Office', 'Chairperson Office', 'HOD-OFFICE-1', 'CABIN-HOD-1', 'IfcSpace_1010', 'Z_HOD1', 'R_HOD1'],
  'CORRIDOR_MAIN': ['Main Corridor', 'Central Hallway', 'Main Hall', 'CORRIDOR-1', 'IfcSpace_1005', 'Z_CORR', 'R_CORR'],
  'CORRIDOR_LEFT': ['West Pathway', 'West Corridor', 'Left Corridor', 'CORRIDOR-L', 'CORR-LEFT', 'IfcSpace_1006', 'Z_CORR_L', 'R_CORR_L', 'ROOM-CORR-L'],
  'LIFT_1': ['Lift 1', 'Elevator 1', 'LIFT-01', 'ELEV-A', 'IfcSpace_1006'],
  'LIFT_2': ['Lift 2', 'Elevator 2', 'LIFT-02', 'ELEV-B', 'IfcSpace_1007'],
  'STAIR_01': ['Staircase', 'Stairwell', 'Emergency Stairs', 'STAIR-01', 'FIRE-STAIR', 'IfcSpace_1011', 'EXIT_STAIR']
};

export const BUILDING_A_SPACES = BUILDING_A.spaces.map(space => ({
  ...space,
  aliases: ALIAS_MAP[space.id] || []
}));

// ── Building B: Metropolis Commercial Office (Generalization) ─
export const BUILDING_B_SPACES = [
  {
    id: 'CONF_A',
    name: 'Boardroom & Conference Suite A',
    type: 'CONFERENCE',
    description: 'Executive boardroom and international client presentation suite.',
    floor: 3,
    capacity: 30,
    aliases: ['Boardroom', 'Conference A', 'CONF-SUITE-A', 'IfcSpace_2001', 'Z301'],
    connections: ['OFFICE_CORRIDOR_EAST'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } }
  },
  {
    id: 'OPEN_WORKSPACE_B',
    name: 'Open Engineering Workspace B',
    type: 'OFFICE',
    description: 'High-density agile software development workspace with 60 open desks.',
    floor: 3,
    capacity: 60,
    aliases: ['Engineering Bay', 'Dev Floor', 'OPEN-BAY-B', 'IfcSpace_2002', 'Z302'],
    connections: ['OFFICE_CORRIDOR_MAIN'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } }
  },
  {
    id: 'SERVER_ROOM_303',
    name: 'Data Center & Telecom Server Room',
    type: 'DATA_CENTER',
    description: 'Mission-critical enterprise server racks with FM-200 gas suppression.',
    floor: 3,
    capacity: 4,
    aliases: ['Data Center', 'Server Room', 'NOC', 'TELCO-303', 'IfcSpace_2003', 'Z303'],
    connections: ['OFFICE_CORRIDOR_MAIN'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, fire_alarm: { type: 'boolean' } }
  },
  {
    id: 'CAFETERIA_EAST',
    name: 'Employee Cafeteria & Lounge',
    type: 'LOUNGE',
    description: 'Dining and cafeteria area with commercial kitchen appliances.',
    floor: 3,
    capacity: 80,
    aliases: ['Cafeteria', 'Dining Hall', 'Kitchen Area', 'CAFE-E', 'IfcSpace_2004', 'Z304'],
    connections: ['OFFICE_CORRIDOR_EAST'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } }
  }
];

// ── Building C: Quantum Research Facility (Generalization) ─
export const BUILDING_C_SPACES = [
  {
    id: 'CLEANROOM_201',
    name: 'ISO-Class 5 Nanofabrication Cleanroom',
    type: 'LABORATORY',
    description: 'Semiconductor lithography cleanroom with HEPA air filtration and laminar flow.',
    floor: 2,
    capacity: 12,
    aliases: ['Cleanroom', 'Fab Lab', 'NANO-FAB-201', 'IfcSpace_3001', 'Q_ZONE_01'],
    connections: ['CLEAN_CORRIDOR'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } }
  },
  {
    id: 'CRYOGENICS_BAY',
    name: 'Cryogenic Superconducting Magnet Bay',
    type: 'LABORATORY',
    description: 'Liquid helium cooling plant and superconducting quantum processor bay.',
    floor: 2,
    capacity: 6,
    aliases: ['Cryo Lab', 'Superconductor Bay', 'CRYO-BAY-A', 'IfcSpace_3002', 'Q_ZONE_02'],
    connections: ['CLEAN_CORRIDOR'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, fire_alarm: { type: 'boolean' } }
  },
  {
    id: 'QUANTUM_OPTICS',
    name: 'Femtosecond Laser & Quantum Optics Lab',
    type: 'LABORATORY',
    description: 'Optical isolation tables with high-power pulsed infrared lasers.',
    floor: 2,
    capacity: 8,
    aliases: ['Optics Lab', 'Laser Lab', 'OPTICS-203', 'IfcSpace_3003', 'Q_ZONE_03'],
    connections: ['CLEAN_CORRIDOR'],
    attributes: { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' } }
  }
];

// ── Active Building State Container ──────────────────────
export class CanonicalBuildingRegistry {
  constructor() {
    this.activeBuildingKey = 'BUILDING_A';
    this.modelVersion       = 'v1.0';
    this.buildings = {
      BUILDING_A: { name: 'College Engineering Block', spaces: [...BUILDING_A_SPACES], floor: 1 },
      BUILDING_B: { name: 'Metropolis Commercial Office', spaces: [...BUILDING_B_SPACES], floor: 3 },
      BUILDING_C: { name: 'Quantum Research Facility', spaces: [...BUILDING_C_SPACES], floor: 2 },
    };
    this.customSpaces = [...BUILDING_A_SPACES];
  }

  getActiveSpaces() {
    return this.customSpaces;
  }

  getActiveBuildingName() {
    return this.buildings[this.activeBuildingKey]?.name || 'College Engineering Block';
  }

  getModelVersion() {
    return this.modelVersion;
  }

  setBuilding(buildingKey) {
    if (this.buildings[buildingKey]) {
      this.activeBuildingKey = buildingKey;
      this.customSpaces = [...this.buildings[buildingKey].spaces];
      this._bumpVersion();
      return true;
    }
    return false;
  }

  registerCustomBuilding(buildingModel) {
    if (!buildingModel || !buildingModel.spaces) return;
    const key = buildingModel.building_id || 'CUSTOM';
    const spaces = (buildingModel.spaces || []).map(s => ({
      ...s,
      aliases: Array.isArray(s.aliases) && s.aliases.length > 0 ? s.aliases : [
        s.name,
        `Z_${s.id}`,
        `R_${s.id}`,
        `ROOM-${s.id}`,
        s.ifc_id || `IFC_${s.id}`,
        s.id.replace(/_/g, ' ')
      ],
      attributes: s.attributes || { temperature: { type: 'number' }, smoke: { type: 'number' }, occupancy: { type: 'number' }, fire_alarm: { type: 'boolean' } }
    }));

    this.buildings[key] = {
      name: buildingModel.name || 'Custom Building',
      description: buildingModel.description || '',
      spaces
    };
    this.activeBuildingKey = key;
    this.customSpaces = [...spaces];
    this._bumpVersion();
  }

  updateSpaces(newSpaces) {
    this.customSpaces = newSpaces;
    this._bumpVersion();
  }

  addSpace(space) {
    this.customSpaces.push(space);
    this._bumpVersion();
  }

  updateSpace(id, patch) {
    const idx = this.customSpaces.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.customSpaces[idx] = { ...this.customSpaces[idx], ...patch };
      this._bumpVersion();
      return true;
    }
    return false;
  }

  removeSpace(id) {
    this.customSpaces = this.customSpaces.filter(s => s.id !== id);
    this._bumpVersion();
  }

  _bumpVersion() {
    const parts = this.modelVersion.replace('v', '').split('.');
    const major = parseInt(parts[0] || '1', 10);
    const minor = parseInt(parts[1] || '0', 10) + 1;
    this.modelVersion = `v${major}.${minor}`;
  }

  /**
   * Generates a compact canonical context array for LLM prompting.
   */
  getPromptContext() {
    return this.customSpaces.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      floor: e.floor,
      aliases: e.aliases || [],
      attributes: Object.keys(e.attributes || {}),
    }));
  }
}

export const canonicalRegistryInstance = new CanonicalBuildingRegistry();
export const getCanonicalEntities = () => canonicalRegistryInstance.getActiveSpaces();

// Dynamic proxy that always reflects the currently active building spaces
export const CANONICAL_ENTITIES = new Proxy([], {
  get(target, prop) {
    const spaces = canonicalRegistryInstance.getActiveSpaces();
    if (prop === Symbol.iterator) {
      return spaces[Symbol.iterator].bind(spaces);
    }
    const val = spaces[prop];
    return typeof val === 'function' ? val.bind(spaces) : val;
  },
  has(target, prop) {
    return prop in canonicalRegistryInstance.getActiveSpaces();
  },
  ownKeys() {
    return Reflect.ownKeys(canonicalRegistryInstance.getActiveSpaces());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Object.getOwnPropertyDescriptor(canonicalRegistryInstance.getActiveSpaces(), prop);
  }
});
