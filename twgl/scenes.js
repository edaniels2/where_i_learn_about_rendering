import { fromObjFile } from '../webgl/obj-file.js';

    // const models = [
    //   // fromObjFile('../models/desk/desk.obj', {position: [-1.4, -1.45, 2.3], scale: 0.2, rotateY: Math.PI / 2}),
    //   // fromObjFile('../models/living_room/living_room.obj', {position: [0, -1.5, -4], }),

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
        bgColor: [0.3, 0.9, 0.8],
        lighting: {
          d: [-0.707, -0.707, -0.1],
          di: 0.3,
          s: [
            [0.95, 1.5, -10, 30, 1, 0.8392, 0.6666],
            [-2.2, 1.5, -10, 30, 1, 0.8392, 0.6666],
          ],
          a: 0.2,
        },
      },
    };
  },


}

/**
 * @typedef {{
 *  models: Geometry|Promise<Geometry>[],
 *  options: {
 *    bgColor: [number, number, number],
 *    lighting: {
 *      d: [number, number, number],
 *      di: number,
 *      s: [number, number, number, number][],
 *    },
 *    unlockHeight: boolean,
 *    unlockUp: boolean,
 * }
 * }} Scene
 */
