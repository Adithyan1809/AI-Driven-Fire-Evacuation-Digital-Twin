/**
 * OCCUPANT SIMULATOR
 *
 * Manages simulated autonomous occupants with:
 *   - Dynamic count & room distribution from ConfigManager
 *   - Deterministic seeded placement
 *   - Pathfinding-driven egress along graph edges
 *   - Real-time reaction delay & speed variation
 *   - Status tracking: IDLE → EVACUATING → REDIRECTED → EVACUATED
 */

import { BUILDING, NODE_MAP, SPATIAL_GRAPH_MAPPING, NODE_TO_SPACE_MAP } from '../data/building.js';

const BASE_SPEED_PX_PER_TICK = 4.5;

function buildRoomEntryNodes(building, mapping) {
  const entryNodes = {};
  if (!building || !building.spaces) return entryNodes;
  building.spaces.forEach(space => {
    if (space.type !== 'CORRIDOR' && space.type !== 'STAIR' && space.type !== 'LIFT') {
      if (mapping && mapping[space.id] && mapping[space.id].primaryJunction) {
        entryNodes[space.id] = mapping[space.id].primaryJunction;
      } else if (building.graph && building.graph.edges) {
        const edge = building.graph.edges.find(e => 
          (e.from === space.id && e.to.startsWith('JUNC')) || 
          (e.to === space.id && e.from.startsWith('JUNC'))
        ) || building.graph.edges.find(e => e.from === space.id || e.to === space.id);
        if (edge) entryNodes[space.id] = edge.from === space.id ? edge.to : edge.from;
        else entryNodes[space.id] = space.id;
      } else {
        entryNodes[space.id] = space.id;
      }
    }
  });
  return entryNodes;
}

function buildDistributionWeights(building) {
  const weights = {};
  if (!building || !building.spaces) return weights;
  const occupiableSpaces = building.spaces.filter(s => s.type !== 'CORRIDOR' && s.type !== 'STAIR' && s.type !== 'LIFT');
  let totalCap = 0;
  occupiableSpaces.forEach(space => {
    totalCap += (space.capacity || 10);
  });
  if (totalCap > 0) {
    occupiableSpaces.forEach(space => {
      weights[space.id] = (space.capacity || 10) / totalCap;
    });
  }
  return weights;
}

export class OccupantSimulator {
  /**
   * @param {Object}         opts
   * @param {EventBus}       opts.bus
   * @param {Function}       opts.rand         — seeded PRNG
   * @param {RouteOptimizer} opts.routeOptimizer
   * @param {Object}         [opts.config]
   * @param {Function}       opts.signalComplete — called when last occupant exits
   */
  constructor({ bus, rand, routeOptimizer, router, dtState = null, config = null, signalComplete }) {
    this.bus             = bus;
    this.rand            = rand;
    this.router          = routeOptimizer || router;
    this.dtState         = dtState;
    this.config          = config;
    this.signalComplete  = signalComplete;
    this.occupants       = [];
    this.evacuating      = false;
    this._reactionTimer  = {};
    this.roomEntryNodes  = buildRoomEntryNodes(BUILDING, SPATIAL_GRAPH_MAPPING);
    this.distributionWeights = buildDistributionWeights(BUILDING);

    this.bus.on('sim:tick',           e => this._onTick(e));
    this.bus.on('sim:evacuation',     () => this._beginEvacuation());
    this.bus.on('routes:graph_changed',() => this._rerouteAll());
    this.bus.on('sim:reset',          () => this._reset());
    this.bus.on('config:changed',     ({ config }) => {
      if (!(this.config && typeof this.config.get === 'function')) {
        this.config = config;
      }
      if (!this.evacuating) {
        this.initialise(this.rand);
        this.bus.emit('occupants:reinitialized', { count: this.occupants.length });
      }
    });
  }

  // ── Public ─────────────────────────────────────────────

  _getConfig() {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get();
    }
    return this.config || {};
  }

  _getOccupantSpace(occ) {
    if (occ.status === 'EVACUATED') return 'OUTSIDE';
    if (!BUILDING.spaces) return occ.homeRoom;
    const match = BUILDING.spaces.find(s =>
      occ.svgX >= s.x && occ.svgX <= s.x + s.width &&
      occ.svgY >= s.y && occ.svgY <= s.y + s.height
    );
    if (match) return match.id;
    if (BUILDING.exits && BUILDING.exits.some(e => {
      const ex = e.x || 0;
      const ey = e.y || 0;
      const ew = e.width || 20;
      const eh = e.height || 20;
      return occ.svgX >= ex - 15 && occ.svgX <= ex + ew + 15 &&
             occ.svgY >= ey - 15 && occ.svgY <= ey + eh + 15;
    })) {
      return 'OUTSIDE';
    }
    return occ.homeRoom;
  }

  initialise(rand) {
    this.rand = rand || this.rand;
    this.distributionWeights = buildDistributionWeights(BUILDING);
    this.roomEntryNodes = buildRoomEntryNodes(BUILDING, SPATIAL_GRAPH_MAPPING);
    this.occupants = [];
    let idCounter = 1;

    const cfg = this._getConfig();
    const totalCount = cfg.occupants?.count || 50;
    const speedMult  = cfg.occupants?.walkingSpeedMultiplier || 1.0;
    const speedVar   = (cfg.occupants?.speedVariationPct || 15) / 100;

    // Distribute occupants across spaces
    const rooms = Object.keys(this.distributionWeights);
    let assigned = 0;

    rooms.forEach((room, idx) => {
      const isLast = idx === rooms.length - 1;
      const count = isLast
        ? Math.max(0, totalCount - assigned)
        : Math.floor(totalCount * this.distributionWeights[room]);
      assigned += count;

      const space = BUILDING.spaces.find(s => s.id === room);
      if (!space) return;

      for (let i = 0; i < count; i++) {
        const padX = Math.min(20, (space.width || 100) * 0.15);
        const padY = Math.min(28, (space.height || 100) * 0.25);
        const availW = Math.max(10, (space.width || 100) - padX * 2);
        const availH = Math.max(10, (space.height || 100) - padY * 2 - 20);
        const px = padX + this.rand() * availW;
        const py = padY + this.rand() * availH;
        const varianceFactor = 1 + (this.rand() * 2 - 1) * speedVar;

        this.occupants.push({
          id:                  `OCC_${String(idCounter++).padStart(3,'0')}`,
          homeRoom:            room,
          svgX:                space.x + px,
          svgY:                space.y + py,
          startNode:           room,
          path:                [],
          pathIndex:           0,
          progress:            0,
          speed:               BASE_SPEED_PX_PER_TICK * speedMult * varianceFactor,
          status:              'IDLE',
          routeStatus:         'SAFE',
          exitReached:         null,
          exposedToHazard:     false,
          unsafeExposureTicks: 0,
          timeInWarning:       0,
          timeInCritical:      0,
          timeInPredictedHazard: 0,
          maxTemp:             27.4,
          maxSmoke:            0.01,
          distanceTravelled:   0,
          rerouteCount:        0,
          proactiveReroutes:   0,
          reactiveReroutes:    0,
          routeCommittedUntil: 0,
        });
      }
    });

    this.bus.emit('occupants:initialised', { count: this.occupants.length, occupants: this._snapshot() });
  }

  getAll()   { return this.occupants; }
  getCount() {
    const evacuated = this.occupants.filter(o => o.status === 'EVACUATED').length;
    const trapped   = this.occupants.filter(o => o.status === 'TRAPPED').length;
    const total     = this.occupants.length;
    return { total, evacuated, trapped, remaining: Math.max(0, total - evacuated - trapped) };
  }

  // ── Internal ───────────────────────────────────────────

  _onTick({ tick }) {
    this._currentTick = tick;
    if (!this.evacuating) return;
    let anyMoving = false;
    const cfg = this._getConfig();
    const maxAsetTicks = Math.round((cfg.occupants?.maxAsetSeconds ?? 45.0) * 10); // 45.0s realistic ASET before untenable flashover

    this.occupants.forEach(occ => {
      if (occ.status === 'EVACUATED' || occ.status === 'TRAPPED' || occ.status === 'IDLE') return;

      // Track ISO 13571 Fractional Effective Dose (FED) & Thermal exposure
      const currentSpaceId = this._getOccupantSpace(occ);
      const entity = this.dtState ? this.dtState.getEntity(currentSpaceId) : null;
      if (entity) {
        const spaceSmoke = entity.smoke || 0.01;
        const spaceTemp = entity.temperature || 28;
        occ.maxTemp = Math.max(occ.maxTemp || 27.4, spaceTemp);
        occ.maxSmoke = Math.max(occ.maxSmoke || 0.01, spaceSmoke);

        if (entity.hazard_level === 'CRITICAL' || entity.hazard_level === 'BLOCKED') {
          occ.timeInCritical = +( (occ.timeInCritical || 0) + 0.1 ).toFixed(2);
        } else if (entity.hazard_level === 'WARNING') {
          occ.timeInWarning = +( (occ.timeInWarning || 0) + 0.1 ).toFixed(2);
        }

        if (entity.predicted_state === 'PREDICTED_WARNING' || entity.predicted_state === 'PREDICTED_CRITICAL') {
          occ.timeInPredictedHazard = +( (occ.timeInPredictedHazard || 0) + 0.1 ).toFixed(2);
        }

        const isHazardous = entity.hazard_level === 'CRITICAL' || entity.hazard_level === 'BLOCKED' || entity.fire_alarm || spaceSmoke >= 0.20 || spaceTemp >= 48.0;

        if (isHazardous) {
          occ.exposedToHazard = true;
          occ.unsafeExposureTicks = (occ.unsafeExposureTicks || 0) + 1;

          // ISO 13571: Toxic smoke accumulation + thermal convective/radiant burn dose
          const toxicRate = Math.pow(Math.max(0, spaceSmoke - 0.08) / 0.55, 1.25) * (1.0 / maxAsetTicks);
          const thermalRate = Math.max(0, (spaceTemp - 48.0) / 36.0) * (1.0 / Math.max(30, maxAsetTicks * 0.7));
          occ.fed = (occ.fed || 0) + toxicRate + thermalRate;

          if (occ.fed >= 1.0 || occ.unsafeExposureTicks >= maxAsetTicks) {
            occ.status = 'TRAPPED';
            this.bus.emit('occupants:trapped', { occupantId: occ.id, location: currentSpaceId, tick, fed: +(occ.fed || 1.0).toFixed(2) });
            this.bus.emit('log', {
              tag: 'hazard',
              msg: `🚨 [ASET / FED EXCEEDED] ${occ.id} INCAPACITATED in ${currentSpaceId} (FED: ${occ.fed.toFixed(2)}, Temp: ${spaceTemp.toFixed(1)}°C, Smoke: ${spaceSmoke.toFixed(2)})!`
            });
            return;
          }
        }
      }

      if (this._reactionTimer[occ.id] > 0) {
        this._reactionTimer[occ.id]--;
        return;
      }

      if (occ.path.length < 2) { this._assignRoute(occ, tick); return; }

      anyMoving = true;
      this._moveOccupant(occ, tick);
    });

    this.bus.emit('occupants:positions', { occupants: this._snapshot() });

    const evacuated = this.occupants.filter(o => o.status === 'EVACUATED').length;
    const trapped   = this.occupants.filter(o => o.status === 'TRAPPED').length;
    if (this.occupants.length > 0 && (evacuated + trapped) >= this.occupants.length) {
      this.bus.emit('occupants:all_evacuated', { count: evacuated, trapped });
      if (typeof this.signalComplete === 'function') {
        this.signalComplete();
      }
    }
  }

  _beginEvacuation() {
    this.evacuating = true;
    const cfg = this._getConfig();
    const reactBaseSec = cfg.occupants?.reactionDelaySeconds ?? 0.8;
    const reactTicks = Math.round(reactBaseSec * 10);

    this.occupants.forEach(occ => {
      if (occ.status === 'IDLE') {
        occ.status = 'EVACUATING';
        this._assignRoute(occ, this._currentTick || 0);
        this._reactionTimer[occ.id] = Math.floor(this.rand() * reactTicks);
      }
    });
    this.bus.emit('log', { tag: 'evac', msg: `🚨 Evacuation started — ${this.occupants.length} occupants routing to exits` });
  }

  _rerouteAll() {
    if (!this.evacuating) return;
    let redirected = 0;
    let proactiveCount = 0;
    const simTime = (this._currentTick || 0) * 0.1;

    const cfg = this._getConfig ? this._getConfig() : {};
    const isPredictive = cfg.routing?.predictiveRouting ?? this.predictiveRouting ?? true;
    const HYSTERESIS_THRESHOLD = cfg.routing?.hysteresisThreshold ?? this.hysteresisThreshold ?? 0.20;
    const COMMITMENT_SECONDS = cfg.routing?.routeCommitmentSeconds ?? 2.0;

    this.occupants.forEach(occ => {
      if (occ.status === 'EVACUATED' || occ.status === 'TRAPPED') return;

      // 1. Determine occupant's current forward navigation node
      let currentNode = null;
      if (occ.path && occ.path.length > 0 && occ.pathIndex < occ.path.length) {
        currentNode = occ.path[occ.pathIndex];
      } else {
        currentNode = this._findNearestNode(occ.svgX, occ.svgY);
      }

      const currentRemainingPath = (occ.path || []).slice(occ.pathIndex);
      const oldExit = occ.exitReached || (occ.path && occ.path.length ? occ.path[occ.path.length - 1] : null);

      // 2. Calculate current path total cost & scan for upcoming hazards
      let currentRemainingCost = 0;
      let currentPathBlocked = false;
      let currentPathHasCriticalHazard = false;
      let currentPathHasPredictedHazard = false;
      let predictedHazardSpace = null;
      let predictedHazardRisk = 0;
      let predictedHazardReason = null;

      for (let i = 0; i < currentRemainingPath.length; i++) {
        const node = currentRemainingPath[i];
        const cost = this.router.graph.getNodeCost(node);
        if (!isFinite(cost) || cost >= 1000) {
          currentPathBlocked = true;
          currentRemainingCost = Infinity;
          break;
        }
        currentRemainingCost += cost;

        if (this.dtState) {
          const spaceId = NODE_TO_SPACE_MAP[node] || node;
          const ent = this.dtState.getEntity(spaceId) || this.dtState.getEntity(node);
          if (ent) {
            if (ent.hazard_level === 'CRITICAL' || ent.hazard_level === 'BLOCKED') {
              currentPathHasCriticalHazard = true;
            }
            if (isPredictive && (ent.predicted_state === 'PREDICTED_WARNING' || ent.predicted_state === 'PREDICTED_CRITICAL')) {
              currentPathHasPredictedHazard = true;
              predictedHazardSpace = spaceId;
              predictedHazardRisk = ent.predicted_risk || 0.85;
              predictedHazardReason = (ent.prediction_reasons && ent.prediction_reasons[0]) || `Predicted ${ent.predicted_state} within ${ent.prediction_horizon || 15}s`;
            }
          }
        }
      }

      // 3. Query Dijkstra for optimal route from currentNode to reachable exit
      const result = this.router.findPath(currentNode);

      if (!result || !result.path || !result.path.length) {
        occ.routeStatus = 'BLOCKED';
        occ.status = 'TRAPPED';
        this.bus.emit('occupants:trapped', { occupantId: occ.id, location: currentNode, tick: this._currentTick || 0 });
        return;
      }

      const newExit = result.path[result.path.length - 1];
      const newPath = [currentNode, ...result.path.filter(n => n !== currentNode)];
      const newCost = result.cost;

      // 4. Route Stability / Hysteresis & Minimum Route Commitment Rule
      const isPathChanged = newExit !== oldExit || JSON.stringify(newPath) !== JSON.stringify(currentRemainingPath);
      if (!isPathChanged) return;

      const isSignificantlyBetter = newCost < currentRemainingCost * (1.0 - HYSTERESIS_THRESHOLD);
      const isCommitted = occ.routeCommittedUntil && simTime < occ.routeCommittedUntil;
      const improvementRatio = isFinite(currentRemainingCost) && currentRemainingCost > 0
        ? (currentRemainingCost - newCost) / currentRemainingCost
        : 1.0;

      // Hard safety events (fire/blockage/critical hazard) bypass commitment
      let shouldReroute = false;
      let isProactive = false;

      if (currentPathBlocked || currentPathHasCriticalHazard) {
        shouldReroute = true;
        isProactive = false;
      } else if (!isCommitted || !occ.routeCommittedUntil) {
        if (isPredictive && currentPathHasPredictedHazard) {
          if (isSignificantlyBetter) {
            shouldReroute = true;
            isProactive = true;
          }
        } else if (isSignificantlyBetter) {
          shouldReroute = true;
          isProactive = false;
        }
      }

      if (shouldReroute) {
        occ.path = newPath;
        occ.pathIndex = 0;
        occ.routeStatus = result.status;
        occ.status = 'REDIRECTED';
        occ.rerouteCount = (occ.rerouteCount || 0) + 1;
        occ.routeCommittedUntil = simTime + COMMITMENT_SECONDS;

        if (isProactive) {
          occ.proactiveReroutes = (occ.proactiveReroutes || 0) + 1;
          proactiveCount++;
          occ.proactiveReroute = {
            fromExit: oldExit,
            toExit: newExit,
            avoidedSpace: predictedHazardSpace,
            predictedRisk: predictedHazardRisk,
            reason: predictedHazardReason || `ML predicted ${(predictedHazardRisk * 100).toFixed(0)}% risk along previous corridor`,
            safetyScore: result.evaluation?.routeSafetyScore || 85,
            horizon: 15,
            currentRouteCost: +currentRemainingCost.toFixed(1),
            candidateRouteCost: +newCost.toFixed(1),
            improvementRatio: +improvementRatio.toFixed(3),
            hysteresisThreshold: HYSTERESIS_THRESHOLD,
          };

          const proactiveRerouteEvent = {
            occupantId: occ.id,
            spaceId: predictedHazardSpace,
            oldRoute: currentRemainingPath,
            newRoute: newPath,
            oldExit,
            newExit,
            predictedRisk: predictedHazardRisk,
            horizon: 15,
            reason: occ.proactiveReroute.reason,
            safetyScore: occ.proactiveReroute.safetyScore,
            simTime,
            diagnostics: {
              currentRouteCost: +currentRemainingCost.toFixed(1),
              candidateRouteCost: +newCost.toFixed(1),
              improvementRatio: +improvementRatio.toFixed(3),
              hysteresisThreshold: HYSTERESIS_THRESHOLD,
            },
          };

          this.bus.emit('route:proactive_reroute', proactiveRerouteEvent);
          this.bus.emit('route:proactive-reroute', proactiveRerouteEvent);
        } else {
          occ.reactiveReroutes = (occ.reactiveReroutes || 0) + 1;
        }

        redirected++;
      }
    });

    if (redirected > 0) {
      if (proactiveCount > 0) {
        this.bus.emit('log', {
          tag: 'route',
          msg: `⚡ PROACTIVE REROUTE: ${proactiveCount} occupants redirected before upcoming hazard (Hysteresis stabilized)`,
          priority: 'high',
        });
      } else {
        this.bus.emit('log', { tag: 'route', msg: `↺ ${redirected} occupants dynamically rerouted to safer exits` });
      }
    }
  }

  _assignRoute(occ, tick = this._currentTick || 0) {
    let startNode = this.roomEntryNodes[occ.homeRoom] || occ.homeRoom;
    const currentSpace = this._getOccupantSpace(occ);
    const spaceObj = (BUILDING.spaces || []).find(s => s.id === currentSpace);

    if (spaceObj && (spaceObj.type === 'CORRIDOR' || spaceObj.type === 'STAIR' || spaceObj.type === 'LIFT')) {
      startNode = this._findNearestNode(occ.svgX, occ.svgY);
    }

    const result = this.router.findPath(startNode);
    if (!result || !result.path || !result.path.length) {
      occ.routeStatus = 'BLOCKED';
      occ.status = 'TRAPPED';
      this.bus.emit('occupants:trapped', { occupantId: occ.id, location: occ.homeRoom, tick });
      return;
    }
    occ.path        = result.path[0] === startNode ? result.path : [startNode, ...result.path];
    occ.pathIndex   = 0;
    occ.progress    = 0;
    occ.routeStatus = result.status;
  }

  _findNearestNode(x, y) {
    let bestNode = null;
    let minDist = Infinity;
    for (const [id, node] of Object.entries(NODE_MAP)) {
      if (BUILDING.exits && BUILDING.exits.some(e => e.id === id)) continue;
      const dx = node.x - x;
      const dy = node.y - y;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        bestNode = id;
      }
    }
    return bestNode || Object.keys(NODE_MAP)[0] || 'JUNC_W';
  }

  _getNodeSpace(nodeId) {
    if (!nodeId) return null;
    if (NODE_TO_SPACE_MAP && NODE_TO_SPACE_MAP[nodeId]) {
      return NODE_TO_SPACE_MAP[nodeId];
    }
    if (BUILDING.spaces && BUILDING.spaces.some(s => s.id === nodeId)) {
      return nodeId;
    }
    const node = NODE_MAP[nodeId];
    if (node && BUILDING.spaces) {
      const match = BUILDING.spaces.find(s =>
        node.x >= s.x && node.x <= s.x + s.width &&
        node.y >= s.y && node.y <= s.y + s.height
      );
      if (match) return match.id;
    }
    return null;
  }

  _moveOccupant(occ, tick) {
    if (occ.pathIndex >= occ.path.length) return;

    const targetNodeId = occ.path[occ.pathIndex];
    const targetNode   = NODE_MAP[targetNodeId];
    if (!targetNode) { occ.pathIndex++; return; }

    const currentSpaceId = this._getOccupantSpace(occ);
    const targetSpaceId = this._getNodeSpace(targetNodeId);

    // Deterministic Physical Tenability Safety Check:
    // Occupants refuse to step into spaces with critical temperature (>= 60°C / 75°C), high smoke (>= 0.50), or BLOCKED state!
    if (targetSpaceId && targetSpaceId !== currentSpaceId) {
      const targetEntity = this.dtState ? this.dtState.getEntity(targetSpaceId) : null;
      if (targetEntity) {
        const tTemp = targetEntity.temperature || 28;
        const tSmoke = targetEntity.smoke || 0.01;
        const isUntenable = targetEntity.hazard_level === 'BLOCKED' ||
                            targetEntity.hazard_level === 'CRITICAL' ||
                            tTemp >= 60.0 ||
                            tSmoke >= 0.50;

        if (isUntenable) {
          // Refuse entry into dangerous space & immediately find alternative safe route
          this._assignRoute(occ, tick);
          const newTarget = occ.path && occ.path.length > occ.pathIndex ? occ.path[occ.pathIndex] : null;
          const newTargetSpace = this._getNodeSpace(newTarget);
          if (!newTarget || newTargetSpace === targetSpaceId) {
            occ.status = 'TRAPPED';
            occ.routeStatus = 'BLOCKED';
            this.bus.emit('occupants:trapped', {
              occupantId: occ.id,
              location: currentSpaceId,
              tick,
              reason: `Refused entry into untenable ${targetSpaceId} (${tTemp.toFixed(1)}°C)`
            });
            this.bus.emit('log', {
              tag: 'hazard',
              msg: `🛑 [TENABILITY REFUSAL] ${occ.id} refused entry into ${targetSpaceId} (${tTemp.toFixed(1)}°C) — untenable hazard!`,
              priority: 'high'
            });
          }
          return;
        }
      }
    }

    const dx = targetNode.x - occ.svgX;
    const dy = targetNode.y - occ.svgY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Dynamic smoke-induced walking speed reduction (Jin's visibility formulation)
    const spaceEntity = this.dtState ? this.dtState.getEntity(currentSpaceId) : null;
    const localSmoke = spaceEntity ? (spaceEntity.smoke || 0) : 0;
    const smokeSpeedFactor = Math.max(0.35, 1.0 - (localSmoke * 0.70));
    const effectiveSpeed = occ.speed * smokeSpeedFactor;

    if (dist < effectiveSpeed) {
      occ.svgX = targetNode.x;
      occ.svgY = targetNode.y;
      occ.distanceTravelled = +( (occ.distanceTravelled || 0) + dist ).toFixed(1);
      occ.pathIndex++;

      if (BUILDING.exits.some(e => e.id === targetNodeId)) {
        const cfg = this._getConfig();
        const exitEntity = this.dtState ? this.dtState.getEntity(targetNodeId) : null;
        const isBlocked = cfg.building?.blockedExits?.[targetNodeId] === true ||
                          (exitEntity && (exitEntity.accessible === false || exitEntity.hazard_level === 'BLOCKED' || exitEntity.hazard_level === 'CRITICAL'));

        if (isBlocked) {
          occ.status = 'TRAPPED';
          occ.routeStatus = 'BLOCKED';
          this.bus.emit('occupants:trapped', { occupantId: occ.id, location: targetNodeId, tick });
          this.bus.emit('log', { tag: 'hazard', msg: `🚨 ${occ.id} reached ${targetNodeId} but the exit is BLOCKED/CRITICAL! Occupant trapped!` });
          return;
        }

        occ.status = 'EVACUATED';
        occ.exitReached = targetNodeId;
        this.bus.emit('occupants:evacuated', { occupantId: occ.id, exitId: targetNodeId, tick });
      }
    } else {
      const step = Math.min(dist, effectiveSpeed);
      occ.svgX += (dx / dist) * step;
      occ.svgY += (dy / dist) * step;
      occ.distanceTravelled = +( (occ.distanceTravelled || 0) + step ).toFixed(1);
    }
  }

  _snapshot() {
    return this.occupants.map(o => ({
      id:                  o.id,
      svgX:                +o.svgX.toFixed(1),
      svgY:                +o.svgY.toFixed(1),
      status:              o.status,
      routeStatus:         o.routeStatus,
      homeRoom:            o.homeRoom,
      path:                (o.path || []).slice(o.pathIndex || 0),
      currentPath:         (o.path || []).slice(o.pathIndex || 0),
      exposedToHazard:     o.exposedToHazard,
      unsafeExposureTicks: o.unsafeExposureTicks,
      timeInWarning:       o.timeInWarning || 0,
      timeInCritical:      o.timeInCritical || 0,
      timeInPredictedHazard: o.timeInPredictedHazard || 0,
      maxTemp:             +(o.maxTemp || 27.4).toFixed(1),
      maxSmoke:            +(o.maxSmoke || 0.01).toFixed(2),
      distanceTravelled:   +(o.distanceTravelled || 0).toFixed(1),
      rerouteCount:        o.rerouteCount || 0,
      proactiveReroutes:   o.proactiveReroutes || 0,
      reactiveReroutes:    o.reactiveReroutes || 0,
    }));
  }

  reset() {
    this._reset();
  }

  _reset() {
    this.occupants   = [];
    this.evacuating  = false;
    this._reactionTimer = {};
  }
}
