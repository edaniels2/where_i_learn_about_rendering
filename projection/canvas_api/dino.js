import { SquareMatrix } from '../../matrix.js';
import { Vec3 } from '../../vector.js';
import { Geometry } from '../geometry.js'

/**
 * data from https://www.opengl.org/archives/resources/code/samples/glut_examples/examples/dinoshade.c
 * with some modification
 */
export class Dinosaur extends Geometry {
  define() {
    this.centerPointOffset = SquareMatrix.translate(-8, -8, 0);
    this.hitboxSize = 12;

    this.facets = [
      // has to go first for drawing
      [
        new Vec3(13, 13, 2),
        new Vec3(10, 13.5, 2),
        new Vec3(10, 13.5, -2),
        new Vec3(13, 13, -2),
      ],
      [
        new Vec3(10, 13.5, 2),
        new Vec3(13, 14, 2),
        new Vec3(13, 14, -2),
        new Vec3(10, 13.5, -2),
      ],
      [
        new Vec3(7, 13, 2),
        new Vec3(8, 12, 2),
        new Vec3(8, 12, -2),
        new Vec3(7, 13, -2),
      ],
      [
        new Vec3(8, 12, 2),
        new Vec3(7, 11, 2),
        new Vec3(7, 11, -2),
        new Vec3(8, 12, -2),
      ],
      [
        new Vec3(0, 3, 2),
        new Vec3(1, 1, 2),
        new Vec3(1, 1, -2),
        new Vec3(0, 3, -2),
      ],
      [
        new Vec3(5, 1, 2),
        new Vec3(8, 4, 2),
        new Vec3(8, 4, -2),
        new Vec3(5, 1, -2),
      ],
      [
        new Vec3(11, 11.5, 2),
        new Vec3(13, 12, 2),
        new Vec3(13, 12, -2),
        new Vec3(11, 11.5, -2),
      ],
      [
        new Vec3(13, 14, 2),
        new Vec3(13, 15, 2),
        new Vec3(13, 15, -2),
        new Vec3(13, 14, -2),
      ],
      [
        new Vec3(11, 16, 2),
        new Vec3(8, 16, 2),
        new Vec3(8, 16, -2),
        new Vec3(11, 16, -2),
      ],
      [
        new Vec3(7, 15, 2),
        new Vec3(7, 13, 2),
        new Vec3(7, 13, -2),
        new Vec3(7, 15, -2),
      ],
      [
        new Vec3(6, 6, 2),
        new Vec3(4, 3, 2),
        new Vec3(4, 3, -2),
        new Vec3(6, 6, -2),
      ],
      [
        new Vec3(3, 2, 2),
        new Vec3(1, 2, 2),
        new Vec3(1, 2, -2),
        new Vec3(3, 2, -2),
      ],
      [
        new Vec3(1, 1, 2),
        new Vec3(5, 1, 2),
        new Vec3(5, 1, -2),
        new Vec3(1, 1, -2),
      ],
      [
        new Vec3(8, 4, 2),
        new Vec3(10, 4, 2),
        new Vec3(10, 4, -2),
        new Vec3(8, 4, -2),
      ],
      [
        new Vec3(10, 4, 2),
        new Vec3(11, 5, 2),
        new Vec3(11, 5, -2),
        new Vec3(10, 4, -2),
      ],
      [
        new Vec3(11, 5, 2),
        new Vec3(11, 11.5, 2),
        new Vec3(11, 11.5, -2),
        new Vec3(11, 5, -2),
      ],
      [
        new Vec3(13, 12, 2),
        new Vec3(13, 13, 2),
        new Vec3(13, 13, -2),
        new Vec3(13, 12, -2),
      ],
      [
        new Vec3(13, 15, 2),
        new Vec3(11, 16, 2),
        new Vec3(11, 16, -2),
        new Vec3(13, 15, -2),
      ],
      [
        new Vec3(8, 16, 2),
        new Vec3(7, 15, 2),
        new Vec3(7, 15, -2),
        new Vec3(8, 16, -2),
      ],
      [
        new Vec3(7, 11, 2),
        new Vec3(6, 6, 2),
        new Vec3(6, 6, -2),
        new Vec3(7, 11, -2),
      ],
      [
        new Vec3(4, 3, 2),
        new Vec3(3, 2, 2),
        new Vec3(3, 2, -2),
        new Vec3(4, 3, -2),
      ],
      [
        new Vec3(1, 2, 2),
        new Vec3(0, 3, 2),
        new Vec3(0, 3, -2),
        new Vec3(1, 2, -2),
      ],

      [ // arm 'connecting' polygons
        new Vec3(11, 8.75, 1.5),
        new Vec3(13, 8, 1.5),
        new Vec3(13, 8, 2),
        new Vec3(11, 8.75, 2),
      ],
      [
        new Vec3(13, 8, 1.5),
        new Vec3(14, 9, 1.5),
        new Vec3(14, 9, 2),
        new Vec3(13, 8, 2),
      ],
      [
        new Vec3(14, 9, 1.5),
        new Vec3(16, 9, 1.5),
        new Vec3(16, 9, 2),
        new Vec3(14, 9, 2),
      ],
      [
        new Vec3(16, 9, 1.5),
        new Vec3(15, 9.5, 1.5),
        new Vec3(15, 9.5, 2),
        new Vec3(16, 9, 2),
      ],
      [
        new Vec3(15, 9.5, 1.5),
        new Vec3(16, 10, 1.5),
        new Vec3(16, 10, 2),
        new Vec3(15, 9.5, 2),
      ],
      [
        new Vec3(16, 10, 1.5),
        new Vec3(15, 10, 1.5),
        new Vec3(15, 10, 2),
        new Vec3(16, 10, 2),
      ],
      [
        new Vec3(15, 10, 1.5),
        new Vec3(15.5, 11, 1.5),
        new Vec3(15.5, 11, 2),
        new Vec3(15, 10, 2),
      ],
      [
        new Vec3(15.5, 11, 1.5),
        new Vec3(14.5, 10, 1.5),
        new Vec3(14.5, 10, 2),
        new Vec3(15.5, 11, 2),
      ],
      [
        new Vec3(14.5, 10, 1.5),
        new Vec3(14, 11, 1.5),
        new Vec3(14, 11, 2),
        new Vec3(14.5, 10, 2),
      ],
      [
        new Vec3(14, 11, 1.5),
        new Vec3(14, 10, 1.5),
        new Vec3(14, 10, 2),
        new Vec3(14, 11, 2),
      ],
      [
        new Vec3(14, 10, 1.5),
        new Vec3(13, 9, 1.5),
        new Vec3(13, 9, 2),
        new Vec3(14, 10, 2),
      ],
      [
        new Vec3(13, 9, 1.5),
        new Vec3(11, 11, 1.5),
        new Vec3(11, 11, 2),
        new Vec3(13, 9, 2),
      ],
      [
        new Vec3(11, 8.75, -1.5),
        new Vec3(13, 8, -1.5),
        new Vec3(13, 8, -2),
        new Vec3(11, 8.75, -2),
      ],
      [
        new Vec3(13, 8, -1.5),
        new Vec3(14, 9, -1.5),
        new Vec3(14, 9, -2),
        new Vec3(13, 8, -2),
      ],
      [
        new Vec3(14, 9, -1.5),
        new Vec3(16, 9, -1.5),
        new Vec3(16, 9, -2),
        new Vec3(14, 9, -2),
      ],
      [
        new Vec3(16, 9, -1.5),
        new Vec3(15, 9.5, -1.5),
        new Vec3(15, 9.5, -2),
        new Vec3(16, 9, -2),
      ],
      [
        new Vec3(15, 9.5, -1.5),
        new Vec3(16, 10, -1.5),
        new Vec3(16, 10, -2),
        new Vec3(15, 9.5, -2),
      ],
      [
        new Vec3(16, 10, -1.5),
        new Vec3(15, 10, -1.5),
        new Vec3(15, 10, -2),
        new Vec3(16, 10, -2),
      ],
      [
        new Vec3(15, 10, -1.5),
        new Vec3(15.5, 11, -1.5),
        new Vec3(15.5, 11, -2),
        new Vec3(15, 10, -2),
      ],
      [
        new Vec3(15.5, 11, -1.5),
        new Vec3(14.5, 10, -1.5),
        new Vec3(14.5, 10, -2),
        new Vec3(15.5, 11, -2),
      ],
      [
        new Vec3(14.5, 10, -1.5),
        new Vec3(14, 11, -1.5),
        new Vec3(14, 11, -2),
        new Vec3(14.5, 10, -2),
      ],
      [
        new Vec3(14, 11, -1.5),
        new Vec3(14, 10, -1.5),
        new Vec3(14, 10, -2),
        new Vec3(14, 11, -2),
      ],
      [
        new Vec3(14, 10, -1.5),
        new Vec3(13, 9, -1.5),
        new Vec3(13, 9, -2),
        new Vec3(14, 10, -2),
      ],
      [
        new Vec3(13, 9, -1.5),
        new Vec3(11, 11, -1.5),
        new Vec3(11, 11, -2),
        new Vec3(13, 9, -2),
      ],

// 46
      // leg 'connecting' polygons
      [
        new Vec3(8, 4, 1),
        new Vec3(9, 3, 1),
        new Vec3(9, 3, 2),
        new Vec3(8, 4, 2),
      ],
      [
        new Vec3(9, 3, 1),
        new Vec3(9, 2, 1),
        new Vec3(9, 2, 2),
        new Vec3(9, 3, 2),
      ],
      [
        new Vec3(9, 2, 1),
        new Vec3(8, 1, 1),
        new Vec3(8, 1, 2),
        new Vec3(9, 2, 2),
      ],
      [
        new Vec3(8, 1, 1),
        new Vec3(8, 0.5, 1),
        new Vec3(8, 0.5, 2),
        new Vec3(8, 1, 2),
      ],
      [
        new Vec3(8, 0.5, 1),
        new Vec3(9, 0, 1),
        new Vec3(9, 0, 2),
        new Vec3(8, 0.5, 2),
      ],
      [
        new Vec3(9, 0, 1),
        new Vec3(12, 0, 1),
        new Vec3(12, 0, 2),
        new Vec3(9, 0, 2),
      ],
      [
        new Vec3(12, 0, 1),
        new Vec3(10, 1, 1),
        new Vec3(10, 1, 2),
        new Vec3(12, 0, 2),
      ],
      [
        new Vec3(10, 1, 1),
        new Vec3(10, 2, 1),
        new Vec3(10, 2, 2),
        new Vec3(10, 1, 2),
      ],
      [
        new Vec3(10, 2, 1),
        new Vec3(12, 4, 1),
        new Vec3(12, 4, 2),
        new Vec3(10, 2, 2),
      ],
      [
        new Vec3(12, 4, 1),
        new Vec3(11, 6, 1),
        new Vec3(11, 6, 2),
        new Vec3(12, 4, 2),
      ],
      [
        new Vec3(8, 4, -1),
        new Vec3(9, 3, -1),
        new Vec3(9, 3, -2),
        new Vec3(8, 4, -2),
      ],
      [
        new Vec3(9, 3, -1),
        new Vec3(9, 2, -1),
        new Vec3(9, 2, -2),
        new Vec3(9, 3, -2),
      ],
      [
        new Vec3(9, 2, -1),
        new Vec3(8, 1, -1),
        new Vec3(8, 1, -2),
        new Vec3(9, 2, -2),
      ],
      [
        new Vec3(8, 1, -1),
        new Vec3(8, 0.5, -1),
        new Vec3(8, 0.5, -2),
        new Vec3(8, 1, -2),
      ],
      [
        new Vec3(8, 0.5, -1),
        new Vec3(9, 0, -1),
        new Vec3(9, 0, -2),
        new Vec3(8, 0.5, -2),
      ],
      [
        new Vec3(9, 0, -1),
        new Vec3(12, 0, -1),
        new Vec3(12, 0, -2),
        new Vec3(9, 0, -2),
      ],
      [
        new Vec3(12, 0, -1),
        new Vec3(10, 1, -1),
        new Vec3(10, 1, -2),
        new Vec3(12, 0, -2),
      ],
      [
        new Vec3(10, 1, -1),
        new Vec3(10, 2, -1),
        new Vec3(10, 2, -2),
        new Vec3(10, 1, -2),
      ],
      [
        new Vec3(10, 2, -1),
        new Vec3(12, 4, -1),
        new Vec3(12, 4, -2),
        new Vec3(10, 2, -2),
      ],
      [
        new Vec3(12, 4, -1),
        new Vec3(11, 6, -1),
        new Vec3(11, 6, -2),
        new Vec3(12, 4, -2),
      ],

      // body
      [
        new Vec3(0, 3, 2),
        new Vec3(1, 1, 2),
        new Vec3(5, 1, 2),
        new Vec3(8, 4, 2),
        new Vec3(10, 4, 2),
        new Vec3(11, 5, 2),
        new Vec3(11, 11.5, 2),
        new Vec3(13, 12, 2),
        new Vec3(13, 13, 2),
        new Vec3(10, 13.5, 2),
        new Vec3(13, 14, 2),
        new Vec3(13, 15, 2),
        new Vec3(11, 16, 2),
        new Vec3(8, 16, 2),
        new Vec3(7, 15, 2),
        new Vec3(7, 13, 2),
        new Vec3(8, 12, 2),
        new Vec3(7, 11, 2),
        new Vec3(6, 6, 2),
        new Vec3(4, 3, 2),
        new Vec3(3, 2, 2),
        new Vec3(1, 2, 2)
      ],
      // right inner arm
      [
        new Vec3(11, 8.75, 1.5),
        new Vec3(13, 8, 1.5),
        new Vec3(14, 9, 1.5),
        new Vec3(16, 9, 1.5),
        new Vec3(15, 9.5, 1.5),
        new Vec3(16, 10, 1.5),
        new Vec3(15, 10, 1.5),
        new Vec3(15.5, 11, 1.5),
        new Vec3(14.5, 10, 1.5),
        new Vec3(14, 11, 1.5),
        new Vec3(14, 10, 1.5),
        new Vec3(13, 9, 1.5),
        new Vec3(11, 11, 1.5),
      ],
      // left inner arm
      [
        new Vec3(11, 8.75, -1.5),
        new Vec3(13, 8, -1.5),
        new Vec3(14, 9, -1.5),
        new Vec3(16, 9, -1.5),
        new Vec3(15, 9.5, -1.5),
        new Vec3(16, 10, -1.5),
        new Vec3(15, 10, -1.5),
        new Vec3(15.5, 11, -1.5),
        new Vec3(14.5, 10, -1.5),
        new Vec3(14, 11, -1.5),
        new Vec3(14, 10, -1.5),
        new Vec3(13, 9, -1.5),
        new Vec3(11, 11, -1.5),
      ],
      // right inner leg
      [
        new Vec3(11, 6, 1),
        new Vec3(11, 5, 1),
        new Vec3(10, 4, 1),
        new Vec3(8, 4, 1),
        new Vec3(9, 3, 1),
        new Vec3(9, 2, 1),
        new Vec3(8, 1, 1),
        new Vec3(8, 0.5, 1),
        new Vec3(9, 0, 1),
        new Vec3(12, 0, 1),
        new Vec3(10, 1, 1),
        new Vec3(10, 2, 1),
        new Vec3(12, 4, 1),
        new Vec3(11, 6, 1),
      ],
      // left inner leg
      [
        new Vec3(11, 6, -1),
        new Vec3(11, 5, -1),
        new Vec3(10, 4, -1),
        new Vec3(8, 4, -1),
        new Vec3(9, 3, -1),
        new Vec3(9, 2, -1),
        new Vec3(8, 1, -1),
        new Vec3(8, 0.5, -1),
        new Vec3(9, 0, -1),
        new Vec3(12, 0, -1),
        new Vec3(10, 1, -1),
        new Vec3(10, 2, -1),
        new Vec3(12, 4, -1),
        new Vec3(11, 6, -1),
      ],
      // arm
      [
        new Vec3(8, 10, 2),
        new Vec3(9, 9, 2),
        new Vec3(10, 9, 2),
        new Vec3(13, 8, 2),
        new Vec3(14, 9, 2),
        new Vec3(16, 9, 2),
        new Vec3(15, 9.5, 2),
        new Vec3(16, 10, 2),
        new Vec3(15, 10, 2),
        new Vec3(15.5, 11, 2),
        new Vec3(14.5, 10, 2),
        new Vec3(14, 11, 2),
        new Vec3(14, 10, 2),
        new Vec3(13, 9, 2),
        new Vec3(11, 11, 2),
        new Vec3(9, 11, 2)
      ],
      // leg
      [
        new Vec3(8, 6, 2),
        new Vec3(8, 4, 2),
        new Vec3(9, 3, 2),
        new Vec3(9, 2, 2),
        new Vec3(8, 1, 2),
        new Vec3(8, 0.5, 2),
        new Vec3(9, 0, 2),
        new Vec3(12, 0, 2),
        new Vec3(10, 1, 2),
        new Vec3(10, 2, 2),
        new Vec3(12, 4, 2),
        new Vec3(11, 6, 2),
        new Vec3(10, 7, 2),
        new Vec3(9, 7, 2)
      ],

      
      // body
      [
        new Vec3(0, 3, -2),
        new Vec3(1, 1, -2),
        new Vec3(5, 1, -2),
        new Vec3(8, 4, -2),
        new Vec3(10, 4, -2),
        new Vec3(11, 5, -2),
        new Vec3(11, 11.5, -2),
        new Vec3(13, 12, -2),
        new Vec3(13, 13, -2),
        new Vec3(10, 13.5, -2),
        new Vec3(13, 14, -2),
        new Vec3(13, 15, -2),
        new Vec3(11, 16, -2),
        new Vec3(8, 16, -2),
        new Vec3(7, 15, -2),
        new Vec3(7, 13, -2),
        new Vec3(8, 12, -2),
        new Vec3(7, 11, -2),
        new Vec3(6, 6, -2),
        new Vec3(4, 3, -2),
        new Vec3(3, 2, -2),
        new Vec3(1, 2, -2)
      ],
      // arm
      [
        new Vec3(8, 10, -2),
        new Vec3(9, 9, -2),
        new Vec3(10, 9, -2),
        new Vec3(13, 8, -2),
        new Vec3(14, 9, -2),
        new Vec3(16, 9, -2),
        new Vec3(15, 9.5, -2),
        new Vec3(16, 10, -2),
        new Vec3(15, 10, -2),
        new Vec3(15.5, 11, -2),
        new Vec3(14.5, 10, -2),
        new Vec3(14, 11, -2),
        new Vec3(14, 10, -2),
        new Vec3(13, 9, -2),
        new Vec3(11, 11, -2),
        new Vec3(9, 11, -2)
      ],
      // leg
      [
        new Vec3(8, 6, -2),
        new Vec3(8, 4, -2),
        new Vec3(9, 3, -2),
        new Vec3(9, 2, -2),
        new Vec3(8, 1, -2),
        new Vec3(8, 0.5, -2),
        new Vec3(9, 0, -2),
        new Vec3(12, 0, -2),
        new Vec3(10, 1, -2),
        new Vec3(10, 2, -2),
        new Vec3(12, 4, -2),
        new Vec3(11, 6, -2),
        new Vec3(10, 7, -2),
        new Vec3(9, 7, -2)
      ],
      // eye
      [
        new Vec3(8.75, 15, 2),
        new Vec3(9, 14.7, 2),
        new Vec3(9.6, 14.7, 2),
        new Vec3(10.1, 15, 2),
        new Vec3(9.6, 15.25, 2),
        new Vec3(9, 15.25, 2),
      ],
      // eye
      [
        new Vec3(8.75, 15, -2),
        new Vec3(9, 14.7, -2),
        new Vec3(9.6, 14.7, -2),
        new Vec3(10.1, 15, -2),
        new Vec3(9.6, 15.25, -2),
        new Vec3(9, 15.25, -2),
      ]
    ];
    this.facets.forEach(facet => facet.color = new Vec3(0.1, 1.0, 0.2));
    this.facets[0].color = 'pink';
    this.facets[1].color = 'pink';
    this.facets.at(-1).color = new Vec3(1.0, 0.2, 0.2);
    this.facets.at(-2).color = new Vec3(1.0, 0.2, 0.2);

    // TODO: precalculate normals and get rid of the following
    this.facets[1].invertNorm = true;
    this.facets[2].invertNorm = true;
    this.facets[6].invertNorm = true;
    this.facets[11].invertNorm = true;
    this.facets[20].invertNorm = true;
    this.facets[21].invertNorm = true;
    this.facets[22].invertNorm = true;
    this.facets[24].invertNorm = true;
    this.facets[29].invertNorm = true;
    this.facets[31].invertNorm = true;
    this.facets[32].invertNorm = true;
    this.facets[34].invertNorm = true;
    this.facets[36].invertNorm = true;
    this.facets[41].invertNorm = true;
    this.facets[43].invertNorm = true;
    this.facets[44].invertNorm = true;
    this.facets[47].invertNorm = true;
    this.facets[48].invertNorm = true;
    this.facets[52].invertNorm = true;
    this.facets[62].invertNorm = true;
    this.facets[57].invertNorm = true;
    this.facets[58].invertNorm = true;
    this.facets[59].invertNorm = true;
    this.facets[67].invertNorm = true;
    this.facets[68].invertNorm = true;
    this.facets[69].invertNorm = true;
    this.facets[70].invertNorm = true;
  }

}