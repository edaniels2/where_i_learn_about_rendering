import { fromObjFile } from '../webgl/obj-file.js';
import { Floor } from '../webgl/shapes.js';

export const Misc = {
  rayTest() {
    return {
      models: [
        fromObjFile('/models/icosahedron.obj'),
      ],
    };
  },
  testScene() {
    return {
      models: [

        // fromObjFile('/models/bmw/bmw.obj', {position: [0, -1.8, -4], scale: 0.3}),
        // fromObjFile('/models/InteriorTest/InteriorTest.obj', {position: [0, -1.8, 0]}),
        // fromObjFile('/models/IronMan/IronMan.obj', {position: [-1, -1.8, -2], scale: 0.01}),
        // fromObjFile('/models/breakfast_room/breakfast_room.obj', {position: [-1, -1.8, -2], scale: 0.8}),
        // fromObjFile('/models/living_room/living_room.obj', {position: [-0.15, -1.5, -5]}),

        // fromObjFile('/models/car.obj', {position: [0, -1.5, -10]}),
        // fromObjFile('/models/cessna_calc_normals.obj', {position: [0, 0.5, -8],  scale: 0.25, rotateY: 0.3}),
        // fromObjFile('/models/great_room/model.obj', {position: [0, -3.5, 0]})
        // fromObjFile('/models/al_calc_normals.obj', {position: [0, -0.1, -1], scale: 0.1})
        // fromObjFile('/models/airboat_calc_normals.obj', {position: [0, -0.1, -1], scale: 0.1})
        // fromObjFile('/models/shuttle_calc_normals.obj', {position: [0, 0, -3.7], rotateX: -Math.PI / 4, scale: 0.1}),
        fromObjFile('/models/icosahedron.obj', {position: [-0.5, -0.5, -3.7], scale: 0.5}),
        fromObjFile('/models/cube.obj', {position: [0.2, -1, -4], scale: 0.5, rotateY: Math.PI / 6}),
        // fromObjFile('/models/desk/desk.obj', {position: [0, -1, -2], scale: 0.18, rotateY: -Math.PI / 2}),
        new Floor({scale: 2, position: [0, -1, -4], color: [0.9, 0.9, 0.9]}),
        new Floor({scale: 2, position: [0, 1, -4], color: [0.9, 0.9, 0.9], rotateZ: Math.PI}),
        new Floor({scale: 2, position: [0, 0, -4.5], color: [0.9, 0.9, 0.9], rotateX: Math.PI / 2}),
        new Floor({scale: 2, position: [-1, 0, -4], color: [1, 0.2, 0.2], rotateZ: -Math.PI / 2}),
        new Floor({scale: 2, position: [1, 0, -4], color: [0.2, 1, 0.2], rotateZ: Math.PI / 2}),
        // fromObjFile('/models/violin_case_calc_normals.obj', {position: [0, 0, -1], scale: 0.2})
      ],
      ambient: 0.04,
      lights: [
        // {
        //   type: 'rectangle',
        //   v0: [0.2, -0.2, -2],
        //   v1: [-0.2, -0.2, -2],
        //   v2: [0.2, 0.2, -2],
        //   intensity: 5,
        // // },
        // {
        //   type: 'rectangle',
        //   v0: [-2, 0.4, -1.8],
        //   v1: [-2, 0, -2.2],
        //   v2: [-2, 0.8, -2.2],
        //   intensity: 5,
        // },
        {
          type: 'rectangle',
          v0: [-0.2, 0.99, -3.9],
          v1: [0.2, 0.99, -3.9],
          v2: [-0.2, 0.99, -3.5],
          intensity: 1.5,
        },
      ],
      options: {
        bgColor: [0.5, 0.5, 0.5],
        // lighting: {
        //   d: [0, 0, -1],
        //   di: 1,
        //   s: [
        //     {
        //       position: [0, 0.5, 0],
        //       brightness: 100,
        //       color: [1, 0.8392, 0.6666],
        //     },
        //   ],
        //   a: 0.8,
        // },
      }
    }
  }
}

export const Scenes = {
  BreakfastRoom() {
    return {
      models: [
        fromObjFile('/models/breakfast_room/breakfast_room.obj', { position: [0, -2, -8] }),
      ],
      options: {
        bgColor: [0.18, 0.30, 0.40],
        lighting: {
          d: [-0.707, -0.707, -0.45],
          di: 0.4,
          a: 0.15,
          s: [
            {
              name: 'Left',
              position: [-2.2, 1.5, -10],
              brightness: 45,
              color: [1, 0.8392, 0.6666],
              on: true,
            },
            {
              name: 'Right',
              position: [0.95, 1.5, -10],
              brightness: 45,
              color: [1, 0.8392, 0.6666],
              on: true,
            },
          ],
          antiWashout: 4,
        },
      },
    };
  },

  LivingRoom() {
    return {
      models: [
        fromObjFile('/models/living_room/living_room.obj', { position: [0, -1.5, -5], }),
        fromObjFile('/models/desk/desk.obj', { position: [-1.4, -1.45, 1.3], scale: 0.2, rotateY: Math.PI / 2, contrast: 0.1 }),
      ],
      options: {
        lighting: {
          shadowBias: 0.32,//.7,
          d: [0, -1, 0.7],
          di: 0.25,
          // diffuseAsAmbient: 0.2, // probably doesn't make much sense
          // omniDirectional: 0.2, // or this
          // a: 0.2,
          s: [
            {
              name: 'Ceiling',
              position: [0.385, 0.6, -2.12],
              brightness: 24,
              color: [1, 0.8928, 0.7777],
              on: true,
            },
            {
              name: 'Lamp',
              position: [2.63, 0.0, -3.3],
              brightness: 16,
              color: [1, 0.8928, 0.7777],
              on: true,
            },
          ],
          antiWashout: 18,
        }
      }
    }
  },

  Desk() {
    return {
      models: [
        fromObjFile('/models/desk/desk.obj', {position: [0, -1, -2], scale: 0.18, rotateY: -Math.PI / 2}),
        new Floor({scale: 5, position: [0, -1, -3], color: [0.9, 0.9, 0.9]})
      ],
      options: {
        bgColor: [0.2, 0.2, 0.2],
        lighting: {
          d: [0, 1, 0],
          di: 0.1,
          s: [
            {
              position: [0, 1, 0],
              brightness: 64,
              color: [1, 0.8928, 0.7777],
            },
          ],
          a: 0.04,
        },
      }
    }
  }
}

/**
 * @typedef {{
 *  models: Geometry|Promise<Geometry>[],
 *  options: {
 *    bgColor: [number, number, number],
 *    lighting: {
 *      d: [number, number, number],
 *      di: number,
 *      a: number,
 *      diffuseAsAmbient: number,
 *      s: {
 *        name: string,
 *        position: [number, number, number],
 *        brightness: number,
 *        color: [number, number, number],
 *        upVec: [number, number, number],
 *        on: boolean
 *      }[],
 *    },
 *    unlockHeight: boolean,
 *    unlockUp: boolean,
 * }
 * }} Scene
 */
