const generateBayerIndex = (size: number): number[][] => {
  if (size <= 2) {
    return [
      [0, 2],
      [3, 1],
    ];
  }

  const half = size / 2;
  const subMatrix = generateBayerIndex(half);
  const matrix = Array.from({ length: size }, () => new Array<number>(size));

  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      const value = subMatrix[y][x] * 4;
      matrix[y][x] = value;
      matrix[y][half + x] = value + 2;
      matrix[half + y][x] = value + 3;
      matrix[half + y][half + x] = value + 1;
    }
  }

  return matrix;
};

const normalizeBayerSize = (value: number) => {
  if (value <= 2) return 2;
  if (value <= 4) return 4;
  if (value <= 8) return 8;
  return 16;
};

const reindexMatrixValues = (matrix: number[][]) => {
  const sortedValues = matrix
    .flat()
    .sort((left, right) => left - right);
  const valueIndex = new Map<number, number>();
  sortedValues.forEach((value, index) => valueIndex.set(value, index));

  return matrix.map((row) =>
    row.map((value) => valueIndex.get(value) ?? value)
  );
};

const createBayerMatrix = (size: [number, number] | number[]) => {
  const width = normalizeBayerSize(size[0] ?? 4);
  const height = normalizeBayerSize(size[1] ?? width);
  const matrixSize = Math.max(width, height);
  const matrix = generateBayerIndex(matrixSize);

  if (width === matrixSize && height === matrixSize) return matrix;

  return reindexMatrixValues(
    matrix.slice(0, height).map((row) => row.slice(0, width))
  );
};

export default createBayerMatrix;
