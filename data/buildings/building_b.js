/**
 * TEST BUILDING B — Metropolis Research & Commercial Complex
 *
 * Demonstrates complete zero-code building generalization across a totally novel architectural layout.
 */

export const BUILDING_B = {
  "id": "METROPOLIS_RESEARCH_FLOOR_3",
  "name": "Metropolis Research & Commercial Complex",
  "floor": 3,
  "description": "Floor 3 — Advanced Robotics & High-Density Compute Wing",
  "viewport": {
    "width": 920,
    "height": 520
  },
  "spaces": [
    {
      "id": "LAB_A",
      "type": "LABORATORY",
      "name": "Robotics Prototype Lab A",
      "floor": 3,
      "capacity": 35,
      "x": 30,
      "y": 40,
      "width": 190,
      "height": 140,
      "doors": ["DOOR_LAB_A"],
      "ifc_id": "IFC_SPACE_2001",
      "sensors": ["TEMP_LAB_A", "SMOKE_LAB_A", "OCC_LAB_A", "FA_LAB_A"]
    },
    {
      "id": "LAB_B",
      "type": "LABORATORY",
      "name": "Quantum Materials Lab B",
      "floor": 3,
      "capacity": 30,
      "x": 240,
      "y": 40,
      "width": 190,
      "height": 140,
      "doors": ["DOOR_LAB_B"],
      "ifc_id": "IFC_SPACE_2002",
      "sensors": ["TEMP_LAB_B", "SMOKE_LAB_B", "OCC_LAB_B", "FA_LAB_B"]
    },
    {
      "id": "SERVER_ROOM",
      "type": "SERVER_ROOM",
      "name": "High-Density Server Room 303",
      "floor": 3,
      "capacity": 6,
      "x": 450,
      "y": 40,
      "width": 190,
      "height": 140,
      "doors": ["DOOR_SERVER"],
      "ifc_id": "IFC_SPACE_2003",
      "sensors": ["TEMP_SRV", "SMOKE_SRV", "OCC_SRV", "FA_SRV"]
    },
    {
      "id": "AUDITORIUM",
      "type": "AUDITORIUM",
      "name": "Grand Presentation Auditorium",
      "floor": 3,
      "capacity": 80,
      "x": 660,
      "y": 40,
      "width": 230,
      "height": 280,
      "doors": ["DOOR_AUD_WEST", "DOOR_AUD_SOUTH"],
      "ifc_id": "IFC_SPACE_2004",
      "sensors": ["TEMP_AUD", "SMOKE_AUD", "OCC_AUD", "FA_AUD"]
    },
    {
      "id": "CORRIDOR_X",
      "type": "CORRIDOR",
      "name": "Central Arterial Corridor X",
      "floor": 3,
      "capacity": 150,
      "x": 30,
      "y": 200,
      "width": 610,
      "height": 80,
      "doors": ["DOOR_LAB_A", "DOOR_LAB_B", "DOOR_SERVER", "DOOR_AUD_WEST", "DOOR_STAIR_A", "DOOR_STAIR_B"],
      "ifc_id": "IFC_SPACE_2005",
      "sensors": ["SMOKE_CORR_X", "OCC_CORR_X"]
    },
    {
      "id": "STAIR_A",
      "type": "STAIR",
      "name": "Emergency West Stairwell A",
      "floor": 3,
      "capacity": 25,
      "x": 30,
      "y": 300,
      "width": 130,
      "height": 160,
      "doors": ["DOOR_STAIR_A"],
      "ifc_id": "IFC_SPACE_2006",
      "sensors": ["TEMP_STAIR_A", "SMOKE_STAIR_A"]
    },
    {
      "id": "STAIR_B",
      "type": "STAIR",
      "name": "Emergency East Stairwell B",
      "floor": 3,
      "capacity": 25,
      "x": 510,
      "y": 300,
      "width": 130,
      "height": 160,
      "doors": ["DOOR_STAIR_B"],
      "ifc_id": "IFC_SPACE_2007",
      "sensors": ["TEMP_STAIR_B", "SMOKE_STAIR_B"]
    }
  ],
  "doors": [
    { "id": "DOOR_LAB_A", "from": "LAB_A", "to": "CORRIDOR_X", "x1": 120, "y1": 180, "x2": 120, "y2": 200 },
    { "id": "DOOR_LAB_B", "from": "LAB_B", "to": "CORRIDOR_X", "x1": 330, "y1": 180, "x2": 330, "y2": 200 },
    { "id": "DOOR_SERVER", "from": "SERVER_ROOM", "to": "CORRIDOR_X", "x1": 540, "y1": 180, "x2": 540, "y2": 200 },
    { "id": "DOOR_AUD_WEST", "from": "AUDITORIUM", "to": "CORRIDOR_X", "x1": 640, "y1": 240, "x2": 660, "y2": 240 },
    { "id": "DOOR_STAIR_A", "from": "CORRIDOR_X", "to": "STAIR_A", "x1": 90, "y1": 280, "x2": 90, "y2": 300 },
    { "id": "DOOR_STAIR_B", "from": "CORRIDOR_X", "to": "STAIR_B", "x1": 570, "y1": 280, "x2": 570, "y2": 300 }
  ],
  "exits": [
    { "id": "EXIT_NORTH", "name": "North Primary Assembly Exit", "label": "EXIT NORTH", "x": 90, "y": 480, "accessible": true, "lead_to": "Assembly Area North" },
    { "id": "EXIT_EAST", "name": "East Ground Assembly Exit", "label": "EXIT EAST", "x": 570, "y": 480, "accessible": true, "lead_to": "Assembly Area East" }
  ],
  "graph": {
    "nodes": [
      { "id": "LAB_A", "x": 125, "y": 110, "type": "ROOM" },
      { "id": "LAB_B", "x": 335, "y": 110, "type": "ROOM" },
      { "id": "SERVER_ROOM", "x": 545, "y": 110, "type": "ROOM" },
      { "id": "AUDITORIUM", "x": 775, "y": 180, "type": "ROOM" },
      { "id": "JUNC_CX_1", "x": 125, "y": 240, "type": "JUNCTION" },
      { "id": "JUNC_CX_2", "x": 335, "y": 240, "type": "JUNCTION" },
      { "id": "JUNC_CX_3", "x": 545, "y": 240, "type": "JUNCTION" },
      { "id": "JUNC_CX_4", "x": 660, "y": 240, "type": "JUNCTION" },
      { "id": "STAIR_A", "x": 95, "y": 380, "type": "STAIR" },
      { "id": "STAIR_B", "x": 575, "y": 380, "type": "STAIR" },
      { "id": "EXIT_NORTH", "x": 90, "y": 480, "type": "EXIT" },
      { "id": "EXIT_EAST", "x": 570, "y": 480, "type": "EXIT" }
    ],
    "edges": [
      { "id": "E_LA_J1", "from": "LAB_A", "to": "JUNC_CX_1", "base_cost": 1 },
      { "id": "E_LB_J2", "from": "LAB_B", "to": "JUNC_CX_2", "base_cost": 1 },
      { "id": "E_SR_J3", "from": "SERVER_ROOM", "to": "JUNC_CX_3", "base_cost": 1 },
      { "id": "E_AUD_J4", "from": "AUDITORIUM", "to": "JUNC_CX_4", "base_cost": 1 },
      { "id": "E_J1_J2", "from": "JUNC_CX_1", "to": "JUNC_CX_2", "base_cost": 2 },
      { "id": "E_J2_J3", "from": "JUNC_CX_2", "to": "JUNC_CX_3", "base_cost": 2 },
      { "id": "E_J3_J4", "from": "JUNC_CX_3", "to": "JUNC_CX_4", "base_cost": 1 },
      { "id": "E_J1_SA", "from": "JUNC_CX_1", "to": "STAIR_A", "base_cost": 1 },
      { "id": "E_J3_SB", "from": "JUNC_CX_3", "to": "STAIR_B", "base_cost": 1 },
      { "id": "E_SA_EXN", "from": "STAIR_A", "to": "EXIT_NORTH", "base_cost": 1 },
      { "id": "E_SB_EXE", "from": "STAIR_B", "to": "EXIT_EAST", "base_cost": 1 }
    ]
  },
  "sensors": [
    { "id": "TEMP_LAB_A", "type": "TEMPERATURE", "room": "LAB_A", "source_system": "BMS", "x": 75, "y": 70 },
    { "id": "SMOKE_LAB_A", "type": "SMOKE", "room": "LAB_A", "source_system": "FAS", "x": 165, "y": 70 },
    { "id": "OCC_LAB_A", "type": "OCCUPANCY", "room": "LAB_A", "source_system": "OCCUPANCY", "x": 120, "y": 140 },
    { "id": "FA_LAB_A", "type": "FIRE_ALARM", "room": "LAB_A", "source_system": "FAS", "x": 175, "y": 140 },
    { "id": "TEMP_LAB_B", "type": "TEMPERATURE", "room": "LAB_B", "source_system": "ENV_IOT", "x": 285, "y": 70 },
    { "id": "SMOKE_LAB_B", "type": "SMOKE", "room": "LAB_B", "source_system": "FAS", "x": 375, "y": 70 },
    { "id": "OCC_LAB_B", "type": "OCCUPANCY", "room": "LAB_B", "source_system": "OCCUPANCY", "x": 330, "y": 140 },
    { "id": "TEMP_SRV", "type": "TEMPERATURE", "room": "SERVER_ROOM", "source_system": "BMS", "x": 495, "y": 70 },
    { "id": "SMOKE_SRV", "type": "SMOKE", "room": "SERVER_ROOM", "source_system": "FAS", "x": 585, "y": 70 },
    { "id": "TEMP_AUD", "type": "TEMPERATURE", "room": "AUDITORIUM", "source_system": "BMS", "x": 720, "y": 80 },
    { "id": "SMOKE_AUD", "type": "SMOKE", "room": "AUDITORIUM", "source_system": "FAS", "x": 820, "y": 80 },
    { "id": "OCC_AUD", "type": "OCCUPANCY", "room": "AUDITORIUM", "source_system": "OCCUPANCY", "x": 775, "y": 240 },
    { "id": "SMOKE_CORR_X", "type": "SMOKE", "room": "CORRIDOR_X", "source_system": "FAS", "x": 335, "y": 240 }
  ],
  "scenario": {
    "fire_room": "SERVER_ROOM",
    "fire_time": 2.0,
    "alarm_delay": 0.5,
    "smoke_spread_time": 4.0,
    "smoke_spread_rate": 0.08,
    "fire_temp_rate": 12.0,
    "adjacent_rooms": ["CORRIDOR_X", "LAB_B", "AUDITORIUM"]
  }
};

export default BUILDING_B;
