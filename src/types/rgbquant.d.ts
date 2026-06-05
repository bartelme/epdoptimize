declare module "rgbquant" {
  interface RgbQuantOptions {
    colors?: number;
    method?: number;
    boxSize?: [number, number];
    boxPxls?: number;
    initColors?: number;
    minHueCols?: number;
    dithKern?: string;
    dithDelta?: number;
    dithSerp?: boolean;
    palette?: number[][];
    reIndex?: boolean;
    useCache?: boolean;
    cacheFreq?: number;
    colorDist?: string;
  }

  export default class RgbQuant {
    constructor(options?: RgbQuantOptions);
    sample(image: CanvasImageSource | ImageData | Uint8Array | Uint8ClampedArray): void;
    palette(tuples?: boolean): number[][];
    reduce(
      image: CanvasImageSource | ImageData | Uint8Array | Uint8ClampedArray,
      retType?: number,
      dithKern?: string,
      dithSerp?: boolean
    ): Uint8Array | Uint8ClampedArray | number[];
  }
}
