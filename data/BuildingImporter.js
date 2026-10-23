export class BuildingImporter {
  static async loadFromJSON(jsonOrPath) {
    let data;
    if (typeof jsonOrPath === 'string') {
      // In a real implementation this would fetch or fs.readFile
      // For now we assume the caller requires it or fetches it and passes the JSON
      throw new Error("Loading from path not fully implemented in stub. Pass JSON object.");
    } else {
      data = jsonOrPath;
    }

    const validation = BuildingImporter.validate(data);
    if (!validation.valid) {
      throw new Error(`Invalid BuildingModel: ${validation.errors.join(', ')}`);
    }

    return data;
  }

  static loadFromIFC(ifcPath) {
    throw new Error("IFC import: planned future work");
  }

  static validate(model) {
    const errors = [];
    const requiredFields = [
      'id', 'name', 'viewport', 'spaces', 'graph', 
      'exits', 'sensors', 'system_identifiers', 
      'sensor_baselines', 'scenario'
    ];

    if (!model || typeof model !== 'object') {
      return { valid: false, errors: ['Model must be a valid JSON object'] };
    }

    requiredFields.forEach(field => {
      if (!(field in model)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (model.spaces && !Array.isArray(model.spaces)) {
      errors.push('spaces must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
