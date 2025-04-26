export class MtlFile {
  constructor(/**@type{string}*/path) {
    const pathParts = path.split('/');
    this.path = path;
    this.name = pathParts.pop();
    this.dir = pathParts.join('/');
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
        // 'texMode' is a custom addition
        if (['Ka', 'Kd', 'Ks', 'd', 'Tr', 'Ns', 'illum', 'map_Ka', 'map_Kd', 'texMode'].includes(prop)) {
          if (['map_Ka', 'map_Kd'].includes(prop)) {
            values = values.filter(s => s.trim()).map(value => `${this.dir}/${value}`);
          } else if (['texMode'].includes(prop)) {
            values = values[0];
          } else {
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
*   map_Kd: string,
*   name: string,
* }} Material*/
