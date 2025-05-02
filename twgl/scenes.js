import { fromObjFile } from '../webgl/obj-file.js';

    // const models = [

    //   // fromObjFile('../models/bmw/bmw.obj', {position: [0, -1.8, -4], scale: 0.3}),
    //   // fromObjFile('../models/InteriorTest/InteriorTest.obj', {position: [0, -1.8, 0]}),

    //   fromObjFile('../models/breakfast_room/breakfast_room.obj', {position: [0, -2, -8]}),
    //   // fromObjFile('../models/living_room/living_room.obj', {position: [0, -1.5, -8]}),
    //   // fromObjFile('../models/car.obj', {position: [0, -1.5, -10]}),
    //   // fromObjFile('../models/cessna_calc_normals.obj', {position: [0, 0, -10],  scale: 0.25, rotateY: 0.3}),
    // ];
    // const options = {
    //   lighting: {
    //     d: [-0.707, -0.707, -0.1],
    //     di: 0.5,
    //     s: [
    //       [0.9, 1.5, -10, 20],
    //     ],
    //     a: 0.1,
    //   },
    // }

export const Scenes = {
  BreakfastRoom() {
    return {
      models: [
        fromObjFile('../models/breakfast_room/breakfast_room.obj', {position: [0, -2, -8]}),
      ],
      options: {
        bgColor: [0.18, 0.30, 0.40],
        lighting: {
          d: [-0.707, -0.707, -0.1],
          di: 0.3,
          a: 0.3,
          outsideShadowMapCoef: 0.85,
          s: [
            {
              position: [0.95, 1.5, -10],
              brightness: 200,
              color: [1, 0.8392, 0.6666],
            },
            {
              position: [-2.2, 1.5, -10],
              brightness: 200,
              color: [1, 0.8392, 0.6666],
            },
          ],
        },
      },
    };
  },

  LivingRoom() {
    return {
      models: [
        fromObjFile('../models/living_room/living_room.obj', {position: [0, -1.5, -5], }),
        fromObjFile('../models/desk/desk.obj', {position: [-1.4, -1.45, 1.3], scale: 0.2, rotateY: Math.PI / 2}),
      ],
      options: {
        lighting: {
          d: [0, -0.5, 1],
          di: 0.8,
          a: 0.15,
          shadowCoef: 0.62,
          shadowBias: 2.6,
          diffuseAsAmbient: 0.6,
          s: [
            {
              position: [0.25, 0.65, -2],
              brightness: 140,
              color: [1, 0.8928, 0.7777],
            },
            {
              position: [2.5, 0.20, -3.3],
              brightness: 100,
              color: [1, 0.8928, 0.7777],
            },
          ],
        }
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
 *        position: [number, number, number],
 *        brightness: number,
 *        color: [number, number, number],
 *        upVec: [number, number, number],
 *      }[],
 *    },
 *    shadowCoef: number,
 *    outsideShadowMapCoef: number,
 *    unlockHeight: boolean,
 *    unlockUp: boolean,
 * }
 * }} Scene
 */
