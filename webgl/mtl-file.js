export class MtlFile {
  constructor(/**@type{string}*/path) {
    this.path = path;
  }

  async parse() {
    const response = await fetch(this.path);
    if (response.status != 200) {
      return null;
    }
    const content = await response.text();
    /**@type{Object.<string, Material>}*/const materials = {};
    /**@type{Material}*/let currentMtl;

    for (const line of content.split(/\n/)) {
      if (line.startsWith('newmtl')) {
        const name = line.split(/\s+/)[1];
        currentMtl = { name };
        materials[name] = currentMtl;
      } else {
        let [prop, ...values] = line.split(/\s+/);
        if (['Ka', 'Kd', 'Ks', 'd', 'Tr', 'Ns', 'illum', 'map_Ka'].includes(prop)) {
          if (prop != 'map_Ka') {
            values = values.map(Number);
          }
          currentMtl[prop] = values.length == 1 ? values[0] : values;
        }
      }
    }
    return materials;
  }
}

/**
 * @typedef {{
*   Ka: [number, number, number],
*   Kd: [number, number, number],
*   Ks: [number, number, number],
*   d: number,
*   Tr: number,
*   Ns: number,
*   illum: number,
*   map_Ka: string,
*   name: string,
* }} Material*/
